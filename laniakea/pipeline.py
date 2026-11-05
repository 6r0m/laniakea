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
        written, found = shards.write(graph, run / "scopes")
        for shard in written.values():
            schema.validate(shard, "shard")
        schema.validate(found, "index")
        # Summaries are made per scope, so the manifest also names their source and any summary type the profile
        # did not label.
        labelled = {t["id"] for t in fields["edge_types"]}
        summary_types = [{"id": t, "label": f"{t.removesuffix('.rollup')} (summary)", "status": "derived"}
                         for t in shards.edge_types(written) if t not in labelled]
        manifest = {
            "schema": "laniakea.manifest/1",
            "run": run.name.removesuffix(".partial"),
            "created_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "tool": {"id": "laniakea", "name": "laniakea", "version": __version__},
            **fields,
            "edge_types": fields["edge_types"] + summary_types,
            "sources": fields["sources"] + [{"id": "rollup", "name": "laniakea scope summaries", "version": __version__}],
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
