# SPDX-License-Identifier: AGPL-3.0-or-later
"""Re-record fixtures/sample.ubt.json from the sample with a real engine.

    python tests/record_fixture.py [--engine <engine root>]

Absolute roots become <project> and <engine>, and engine modules are pruned to the ones the sample uses, so the
fixture holds no machine path and no engine data beyond module names and locations.
"""

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from laniakea.unreal import engine, ubt  # noqa: E402

SAMPLE = ROOT / "sample" / "SampleProject"
FIXTURE = ROOT / "fixtures" / "sample.ubt.json"
TARGET = "SampleProjectEditor"


def tokenize(text, project_dir, engine_root):
    for root, token in ((project_dir, "<project>"), (engine_root, "<engine>")):
        for form in {str(root), str(root).replace("\\", "/"), str(root).replace("\\", "\\\\")}:
            text = text.replace(form, token)
    return text


def prune(exported, project_dir):
    project = str(project_dir).lower()
    modules = exported["Modules"]
    own = {name for name, m in modules.items() if m["Directory"].lower().startswith(project)}
    used = {dep for name in own for field in ("PublicDependencyModules", "PrivateDependencyModules",
                                              "PublicIncludePathModules", "PrivateIncludePathModules",
                                              "DynamicallyLoadedModules") for dep in modules[name].get(field, [])}
    kept = {}
    for name in sorted(own | used):
        entry = modules[name]
        if name in own:
            kept[name] = {key: entry[key] for key in ("Name", "Type", "Directory", "Rules", "PCHUsage",
                                                      "PublicDependencyModules", "PrivateDependencyModules",
                                                      "PublicIncludePathModules", "PrivateIncludePathModules",
                                                      "DynamicallyLoadedModules", "CircularlyReferencedModules")}
        else:
            kept[name] = {key: entry[key] for key in ("Name", "Type", "Directory", "Rules")}
    return {key: exported[key] for key in ("Name", "Configuration", "Platform", "ProjectFile")} | {"Modules": kept}


def main():
    options = argparse.ArgumentParser()
    options.add_argument("--engine")
    args = options.parse_args()
    with tempfile.TemporaryDirectory() as temporary:
        copy = Path(temporary) / "SampleProject"
        shutil.copytree(SAMPLE, copy)
        project_file = copy / "SampleProject.uproject"
        root = engine.resolve(project_file, args.engine)
        out = Path(temporary) / "out"
        out.mkdir()
        targets = ubt.query_targets(root, project_file, out)
        exported = ubt.export(root, project_file, TARGET, "Win64", "Development", out)
        text = json.dumps({"targets": targets, "export": prune(exported, copy)}, indent=1, sort_keys=True)
        text = tokenize(text, copy, root).replace("\\\\", "/")
    FIXTURE.parent.mkdir(exist_ok=True)
    FIXTURE.write_text(text + "\n", encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
