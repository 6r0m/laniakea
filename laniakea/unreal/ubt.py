# SPDX-License-Identifier: AGPL-3.0-or-later
"""The two read-only Unreal Build Tool modes the profile runs. All output goes to the run folder."""

import json
import subprocess
from pathlib import Path

from .. import LaniakeaError
from ..workspace import same_file
from . import engine

CONFLICTING_INSTANCE = 10  # EpicGames.Core CompilationResult.ConflictingInstance
TIMEOUT_SECONDS = 900


def _run(engine_root, args, out_dir, name):
    """Run UBT with its log in out_dir. The log name differs from every output name: UBT writes a
    structured <log>.json beside <log>.log, which would clobber an output of the same stem."""
    command, env = engine.dotnet(engine_root)
    log = Path(out_dir) / f"{name}.ubt.log"
    with open(Path(out_dir) / f"{name}.ubt.stdout.txt", "wb") as stdout:
        try:
            result = subprocess.run(command + args + [f"-Log={log}"], env=env, stdout=stdout,
                                    stderr=subprocess.STDOUT, timeout=TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired as error:
            raise LaniakeaError(f"UnrealBuildTool {name} did not finish within {TIMEOUT_SECONDS} s; see {log}") from error
    if result.returncode == CONFLICTING_INSTANCE:
        raise LaniakeaError("another UnrealBuildTool is running (a build or the editor); run extract again when it ends")
    if result.returncode != 0:
        raise LaniakeaError(f"UnrealBuildTool {name} failed with exit code {result.returncode}; see {log}")


def _read(output, name, out_dir):
    if not output.is_file():
        raise LaniakeaError(f"UnrealBuildTool {name} exited 0 but wrote no {output.name}; see {out_dir}")
    return json.loads(output.read_text(encoding="utf-8-sig"))


def query_targets(engine_root, project_file, out_dir):
    """The project's own targets with their types, from -Mode=QueryTargets."""
    output = Path(out_dir) / "targets.json"
    _run(engine_root, ["-Mode=QueryTargets", f"-Project={project_file}", f"-Output={output}",
                       "-DontIncludeParentAssembly"], out_dir, "query-targets")
    targets = _read(output, "query-targets", out_dir)["Targets"]
    return [{"name": t["Name"], "type": t["Type"], "default": t.get("DefaultTarget", False)} for t in targets]


def export(engine_root, project_file, target, platform, configuration, out_dir):
    """The evaluated module graph of one target, from -Mode=JsonExport."""
    output = Path(out_dir) / f"{target}.json"
    _run(engine_root, ["-Mode=JsonExport", target, platform, configuration, f"-Project={project_file}",
                       f"-OutputFile={output}"], out_dir, f"export-{target}")
    exported = _read(output, f"export-{target}", out_dir)
    check_project(exported, project_file)
    return exported


def check_project(exported, project_file):
    """An export that names another project is refused: it would describe the wrong code."""
    named = exported.get("ProjectFile")
    if not named or not same_file(named, project_file):
        raise LaniakeaError(f"the export names project {named!r}, not {project_file}")
