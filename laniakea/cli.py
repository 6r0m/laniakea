# SPDX-License-Identifier: AGPL-3.0-or-later
"""Command line: extract, serve, up."""

import argparse
import sys
import webbrowser
from pathlib import Path
from time import perf_counter

from . import LaniakeaError, __version__, pipeline, profiles
from .server import DEFAULT_PORT, HOST, make_server
from .workspace import DEFAULT_ROOT, Workspace


def _target(workspace, reference, engine, name, target):
    """The stored target for a project path or id, or the newest one when reference is None.
    A new project is registered first, and options given for a stored one update it."""
    if reference is None:
        newest = workspace.last()
        if newest is None:
            raise LaniakeaError("nothing extracted yet; pass a .uproject, its folder, or a target id")
        reference = newest["project_file"]
    profile, project = profiles.detect(reference)
    if project is None:
        existing = workspace.load(reference)
        if not existing:
            raise LaniakeaError(f"{reference} is neither a project nor an extracted target id")
        profile, project = profiles.get(existing["profile"]), Path(existing["project_file"])
    stored = workspace.find_project(project)
    target_id = name or (stored["id"] if stored else profile.default_id(project))
    if stored and not (engine or target or name):
        return stored
    kept = stored or {}
    fields = profile.target_fields(project, engine or kept.get("engine_root"), target or kept.get("target"))
    return workspace.register(target_id, fields)


def _extract(args, workspace):
    target = _target(workspace, args.project, args.engine, args.name, args.target)
    print(f"laniakea: extracting {target['project_file']}")
    print(f"laniakea: engine {target['engine_root']}")
    run, manifest = pipeline.extract(workspace, target)
    counts = manifest["coverage"]["counts"]
    summary = ", ".join(f"{key.split('.', 1)[1]} {value}" for key, value in counts.items() if key.startswith("nodes."))
    print(f"laniakea: {target['id']}: target {manifest['target']['name']}, run {run.name}")
    print(f"laniakea: {summary}")
    print("laniakea: timings (s): " + ", ".join(f"{name}={seconds:.3f}"
          for name, seconds in manifest["timings_seconds"].items()))
    for line in manifest["coverage"]["not_analysed"]:
        print(f"laniakea: not analysed: {line}")


def _serve(args, workspace):
    started = perf_counter()
    print('laniakea: checking freshness and preparing map views...', flush=True)
    server = make_server(workspace, args.port)
    print(f'laniakea: serve preparation: {perf_counter()-started:.3f}s')
    url = f"http://{HOST}:{server.server_address[1]}/"
    for entry in server.index:
        state = f"STALE, {entry['changed_count']} build input(s) changed" if entry["stale"] else "fresh"
        print(f"laniakea: {entry['id']}: run {entry['run']} ({state})")
    print(f"laniakea: serving {url} (Ctrl+C stops)")
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def parser():
    top = argparse.ArgumentParser(prog="laniakea", description="Architecture graphs from source and build rules.")
    top.add_argument("--version", action="version", version=f"laniakea {__version__}")
    top.add_argument("--workspace", default=str(DEFAULT_ROOT), help=argparse.SUPPRESS)
    commands = top.add_subparsers(dest="command", required=True)

    def project_options(command):
        command.add_argument("project", nargs="?",
                             help="a .uproject file, its folder, or an extracted target id; the newest when omitted")
        command.add_argument("--engine", help="engine root, when EngineAssociation does not resolve")
        command.add_argument("--name", help="target id in the workspace; defaults to the project name")
        command.add_argument("--target", help="build target to export; defaults to the latest usable build receipt, then Editor")

    def serve_options(command):
        command.add_argument("--port", type=int, default=DEFAULT_PORT,
                             help=f"port on 127.0.0.1; default {DEFAULT_PORT}, 0 picks a free one")
        command.add_argument("--no-browser", action="store_true", help="do not open a browser")

    project_options(commands.add_parser("extract", help="export a project into a new run"))
    serve_options(commands.add_parser("serve", help="serve every extracted project on 127.0.0.1"))
    up = commands.add_parser("up", help="extract, then serve")
    project_options(up)
    serve_options(up)
    setup = commands.add_parser("setup-symbols", help="install the pinned local symbol compiler into the workspace (offline)")
    setup.add_argument("--libclang", required=True, help="LLVM 21.1.8 libclang.dll")
    setup.add_argument("--resources", required=True, help="LLVM's lib/clang/21 resource directory")
    setup.add_argument("--compiler", help="matching clang-cl.exe, for compiler-validated reuse between extractions")
    return top


def main(argv=None):
    args = parser().parse_args(argv)
    workspace = Workspace(args.workspace)
    try:
        if args.command == "setup-symbols":
            from .unreal import tools
            tools.install(workspace.root / "tools" / "unreal", args.libclang, args.resources, args.compiler)
            print(f"laniakea: installed local symbol tools {tools.VERSION}")
        if args.command in ("extract", "up"):
            _extract(args, workspace)
        if args.command in ("serve", "up"):
            _serve(args, workspace)
    except LaniakeaError as error:
        print(f"laniakea: error: {error}", file=sys.stderr)
        return 2
    return 0
