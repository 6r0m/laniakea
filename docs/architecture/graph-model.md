# Graph model

What graph schema v1 means. The shapes of graph, shard and manifest are owned by
[schema/graph.v1.schema.json](../../schema/graph.v1.schema.json); this page owns their meaning.

## Levels

A profile declares its levels in the manifest, and the viewer hardcodes none. The Unreal profile has `project`,
`folder`, `plugin` and `module`: the folders between `Plugins/` and a plugin, such as a project's plugin categories,
group its plugins. A Rust profile could have workspace, crate, module, type and function; a Python profile could have
project, package, module, class and function.

A scope is one owner's direct children, not a requirement that every child has the same kind. A project can own
both a source module and folders of plugins. The viewer names each kind and distinguishes collapsed containers
from leaves; it does not invent an extra owner to make them look uniform.

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

- `declared`: stated by a build tool or a descriptor. `graph.json` holds only declared edges; in the Unreal profile,
  `requires` and the `depends.*` types.
- `derived`: a summary a scope makes from declared edges (see Scopes). Summaries of different families are never
  merged: when `requires.rollup` and `depends.rollup` disagree, both are shown, because the disagreement is the
  finding.
- `resolved` and `partial` are reserved for symbol-level facts from a compiler-based index. Nothing is labelled
  `verified`: a static relationship is not a runtime call.

Each edge names, in `origin`, the manifest source that produced it, and the manifest records that source's version,
the target and the configuration. Edge type ids and labels come from the manifest's `edge_types`.

## Coverage

The manifest lists what was analysed, what was not (other targets, deeper hops, levels not built), and node and edge
counts. The viewer shows the list beside every view, so missing analysis never reads as absence.

## Continuous map

The viewer reads the canonical `graph.json` once per target and run. Containment and directed references are
independent: a group contains descendants but does not acquire their declared dependencies. Opening a group changes
only the visible projection, not graph facts or the surrounding arrangement.

Each reference endpoint maps to its first collapsed ancestor, or to itself when all its ancestors are expanded.
A projected reference retains the complete set of original reference ids. Projected references of different
families or directions remain separate. A reference with both endpoints hidden within one group contributes to
that group's internal-reference count and remains available in its exact-reference list. Explicit self-references
and references to ancestors remain represented. With no filters, every recorded reference belongs to exactly one
visible connection or internal-reference count.

Wheel zoom reveals a pointed group when its local contents have room on screen; zooming out folds groups at a
separate threshold to avoid flicker. Other constellations retain their positions. Hover temporarily emphasizes
connections to a star or a group's descendants. Inspecting a connection lists every original reference; following
one reveals its endpoints without closing other groups. The destination's direct references remain available,
with remote endpoints grouped until the operator approaches them.
Following an exact reference enables its type and boundary visibility if a current filter would hide it.
Optional click inspection keeps its marker through projection refreshes while that exact item remains visible.
Bundle details use the references in the current projection. Hiding an inspected item closes its details instead
of highlighting a different ancestor. Hover and wheel exploration do not require an inspected item.

Known boundary children can be revealed from recorded containment, including external endpoints of exact
references. This does not fetch or imply analysis of their own dependencies. Missing coverage remains unknown.
The project root appears as a separate star only when it is an actual reference endpoint, or when it has no children.

## Scope addresses and generated shards

Each non-boundary node has one shard file, built by `laniakea/shards.py`, including an entry for a project without
children. File names escape UTF-8 bytes and protect the reserved entry and index names.

- **Container scope** (a node with children) shows the children. Everything outside it appears as the siblings of the
  scope and of its ancestors:
  - an endpoint inside a child is drawn as that child;
  - an endpoint elsewhere in the same tree is drawn as the topmost node that holds it without holding the scope;
  - an endpoint in another tree, such as the engine, is drawn as that tree's root.

  An edge whose endpoints were not replaced is drawn as declared. All others become one `<family>.rollup` summary
  per pair of drawn nodes, where the family is the edge type before its first dot. A summary records how many edges
  it stands for, their types, and examples of the endpoints behind it.
- **Leaf scope** (a node with no children): the node and all its direct neighbours, exactly.

The project's scope is `entry.json`. Boundary nodes open no scope. `scopes/index.json` lists every openable node with
its file and direct child count. The index maps existing scope addresses to canonical nodes. Opening a scope address reveals that node in the
continuous map; the shard supplies address metadata rather than limiting the references available to the viewer.

## Runs and freshness

Each extraction writes `workspace/targets/<id>/runs/<utc>/` with the raw tool output, `graph.json`, `manifest.json`
and `scopes/`, then points `latest.json` at it. The manifest records a sha256 of every build input, hashed before the
export runs. At start the server rehashes them, and any difference marks the run stale, naming the changed files.
