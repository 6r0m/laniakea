# Graph model

What graph schema v1 means. The shapes of graph, shard and manifest are owned by
[schema/graph.v1.schema.json](../../schema/graph.v1.schema.json); this page owns their meaning.

## Contents

- [Levels](#levels)
- [Nodes](#nodes)
- [Edges and statuses](#edges-and-statuses)
- [Coverage](#coverage)
- [Owner-local references](#owner-local-references)
- [Read index](#read-index)
- [Scope addresses and generated shards](#scope-addresses-and-generated-shards)
- [Runs and freshness](#runs-and-freshness)

## Levels

A profile declares its levels in the manifest; the viewer hardcodes none. Profile-specific levels and containment
are defined by the [Unreal adapter](unreal-profile.md#from-export-to-graph).

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
- `source` is a root name plus a path relative to it; the absolute root lives only in the workspace. Files are
  attributes of canonical declarations, not canonical ownership nodes. The viewer can derive source-file regions.

## Edges and statuses

- `declared`: stated by a build tool or a descriptor; in the Unreal profile,
  `requires` and the `depends.*` types.
- `derived`: a summary a scope makes from recorded references (see Scopes). Summaries of different families are never
  merged: when `requires.rollup` and `depends.rollup` disagree, both are shown, because the disagreement is the
  finding.
- `resolved` and `partial` describe symbol-level facts from a compiler-based index. Canonical graphs retain exact compiler
  references as well as build edges. Nothing is labelled
  `verified`: a static relationship is not a runtime call.

Each edge names, in `origin`, the manifest source that produced it, and the manifest records that source's version,
the target and the configuration. Edge type ids and labels come from the manifest's `edge_types`.

An exact reference can retain its original target declaration identity and location even when the displayed target
is an abstracted module or provider. The schema owns that metadata's shape. Referring-source coordinates and target
declaration coordinates describe different locations. Distinct declarations behind one visible connection stay
distinguishable in canonical data and exact pages; repeated observations of the same relationship remain deduplicated.

## Coverage

The manifest lists what was analysed, what was not (other targets, deeper hops, levels not built), and node and edge
counts. Missing analysis never establishes absence or proves that configuration disabled a node.
Presentation is defined by the [viewer contract](viewer.md).

## Owner-local references

A profile can classify an owner-local reference as internal to its normalized owner, including references whose endpoints
collapse through abstraction. This classification does not assert a class self-dependency or recursion. Exact reference
pages retain status, location and classification. Compact groups keep internal and explicit references separate. The schema validates
the classification, including its identical-endpoint constraint. Unmarked older runs retain their original meaning.
Presentation must not infer classification from names, levels, implicit-reference flags or generated-code spellings.

## Read index

The canonical `graph.json` remains the exhaustive extraction authority. Its disposable read index supplies compact
topology, weighted endpoint/type groups and exact canonical reference pages. Recorded file membership and provenance
are derived by [source_files.py](../../laniakea/source_files.py) without parsing source files.

The server's SQLite read index uses only Python's standard library and is regenerated from graph content and generator
identity. A validated staging directory is promoted before serving; corruption fails visibly without changing the run.
Canonical runs, the read index and user positions have separate lifetimes. Cache files under `targets/<id>/views/` are
disposable; positions under `layouts/` are user-owned and must not be evicted with presentation data.

## Scope addresses and generated shards

Each non-boundary node has one shard file, built by `laniakea/shards.py`, including an entry for a project without
children. File names escape UTF-8 bytes and protect the reserved entry and index names.

- **Container scope** (a node with children) shows the children. Everything outside it appears as the siblings of the
  scope and of its ancestors:
  - an endpoint inside a child is drawn as that child;
  - an endpoint elsewhere in the same tree is drawn as the topmost node that holds it without holding the scope;
  - an endpoint in another tree, such as the engine, is drawn as that tree's root.

  An edge whose endpoints were not replaced retains its original status and internal classification; explicit self-edges
  remain available when their owner is a direct member. Abstracted internal edges do not become container-scope loops.
  All other visible edges become one `<family>.rollup` summary
  per pair of drawn nodes, where the family is the edge type before its first dot. A summary records how many edges
  it stands for, their types, and examples of the endpoints behind it.
- **Leaf scope** (a node with no children): the node and all its direct neighbours, exactly.

The project's scope is `entry.json`. Boundary nodes open no scope. `scopes/index.json` lists every openable node with
its file and direct child count. The index maps existing scope addresses to canonical nodes. Opening a scope address reveals that node in the
continuous map; the index supplies address metadata without downloading that shard's reference payload. Shards remain
available to other consumers and do not limit the references available to the viewer.

## Runs and freshness

Each extraction writes `workspace/targets/<id>/runs/<utc>/` with the raw tool output, `graph.json`, `manifest.json`
and `scopes/`, then points `latest.json` at it. The manifest records profile-defined sha256 input fingerprints before
the export runs. At start the server recomputes them, and any difference marks the run stale, naming the changed inputs.
The Unreal profile owns [which file contents and selection metadata participate](unreal-profile.md#build-context).

The manifest's optional `timings_seconds` records elapsed phases. The profile supplies its extraction phases;
the pipeline supplies profile execution, shard writing/validation and total time through graph serialization, before
manifest validation/serialization and promotion. Parent phases contain their subphases, so values are not additive.
