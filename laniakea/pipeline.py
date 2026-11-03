# SPDX-License-Identifier: AGPL-3.0-or-later
"""Extraction into a new run folder, and the freshness of the last good run."""

from datetime import datetime, timezone

from . import __version__, profiles, schema, shards
from .workspace import read_json, write_json


def extract(workspace, target):
    """Run the target's profile into a new run. latest.json moves only after every file validated and was written."""
    profile = profiles.get(target["profile"])
    run = workspace.begin_run(target["id"])
    try:
        graph, fields = profile.extract(target, run)
        schema.validate(graph)
        written = shards.write(graph, run / "scopes")
        for shard in written.values():
            schema.validate(shard, "shard")
        manifest = {
            "schema": "laniakea.manifest/1",
            "run": run.name.removesuffix(".partial"),
            "created_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "tool": {"id": "laniakea", "name": "laniakea", "version": __version__},
            **fields,
            "entry": shards.ENTRY,
        }
        schema.validate(manifest, "manifest")
        write_json(run / "graph.json", graph)
        write_json(run / "manifest.json", manifest)
    except BaseException:
        workspace.fail_run(run)
        raise
    return workspace.commit_run(target["id"], run), manifest


def freshness(workspace, target):
    """(run folder or None, changed build inputs). A run is stale when any recorded input hash differs."""
    run = workspace.latest(target["id"])
    if run is None:
        return None, []
    recorded = read_json(run / "manifest.json")["inputs"]
    current = profiles.get(target["profile"]).inputs(target)
    changed = sorted(path for path in recorded.keys() | current.keys() if recorded.get(path) != current.get(path))
    return run, changed
