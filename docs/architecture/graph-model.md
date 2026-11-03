# Graph model

What graph schema v1 means. The shapes of graph, shard and manifest are owned by
[schema/graph.v1.schema.json](../../schema/graph.v1.schema.json); this page owns their meaning.

## Levels

A profile declares its levels in the manifest, and the viewer hardcodes none. The Unreal profile has `project`,
`plugin` and `module`. A Rust profile could have workspace, crate, module, type and function; a Python profile could
have project, package, module, class and function.

## Nodes

- Containment is the node's `parent`. There is no separate containment edge.
- A graph has exactly one non-boundary root, the analysed project, plus boundary roots such as the engine.
- `boundary` marks a node outside the analysed project. It appears only because a project node touches it, and it
  has no edges of its own.
- `status`:
  - `in-target`: present in the analysed target;
  - `not-in-target`: declared on disk but absent from the target;
  - `not-analysed`: the analysis cannot tell, for example a plugin with no modules.
- `source` is a root name plus a path relative to it; the absolute root lives only in the workspace. A file is an
  attribute, never a node.

## Edges and statuses

- `declared`: stated by a build tool or a descriptor. In the Unreal profile, `requires` and every `depends.*` type
  except `depends.rollup`.
- `derived`: computed by Laniakea from declared edges, such as `depends.rollup`. A derived edge is never merged with a
  declared one: when they disagree, both are shown, because the disagreement is the finding.
- `resolved` and `partial` are reserved for symbol-level facts from a compiler-based index. Nothing is labelled
  `verified`: a static relationship is not a runtime call.

Each edge names, in `origin`, the manifest source that produced it, and the manifest records that source's version,
the target and the configuration. Edge type ids and labels come from the manifest's `edge_types`.

## Coverage

The manifest lists what was analysed, what was not (other targets, deeper hops, levels not built), and node and edge
counts. The viewer shows the list beside every view, so missing analysis never reads as absence.

## Scopes

Each openable node has one shard file, built by `laniakea/shards.py`.

- **Container scope** (a node with children): the children, and their edges to each other and to outside nodes no
  deeper than the children. Deeper edges are left out, because a derived edge at the children's level summarises
  them.
- **Leaf scope** (a node with no children): the node and all its direct neighbours.

The project's scope is `entry.json`. Boundary nodes open no scope.

## Runs and freshness

Each extraction writes `workspace/targets/<id>/runs/<utc>/` with the raw tool output, `graph.json`, `manifest.json`
and `scopes/`, then points `latest.json` at it. The manifest records a sha256 of every build input, hashed before the
export runs. At start the server rehashes them, and any difference marks the run stale, naming the changed files.
