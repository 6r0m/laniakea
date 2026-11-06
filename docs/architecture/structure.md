# Structure

## Purpose

Let a developer explore an Unreal C++ project progressively, project -> plugins -> modules -> classes -> functions, with typed dependency
edges and jump to source. Every view is regenerated from source and build rules, and the analysed project needs
nothing installed, configured or committed for it.

## Owns

- Joining the facts other tools already own into one graph, and saying how complete it is.
- The graph schema v1 and its meaning ([graph-model.md](graph-model.md)).
- The ignored workspace, the only place anything learned about an analysed project is written.
- The viewer, and the loopback server that feeds it.

## Does not own

- Any fact about the analysed project. Module dependencies belong to Unreal Build Tool's evaluation of `Build.cs` and
  `Target.cs`, and plugin ownership to the `.uplugin` and `.uproject` descriptors. Laniakea reads them; it never
  edits, infers or overrides them.
- The engine and its tools. Their behaviour that matters here is recorded in [unreal-profile.md](unreal-profile.md).
- Publishing safety of the analysed project. Its own repository owns that; Laniakea only guarantees it writes nothing
  there itself. Unreal Build Tool's own cache refreshes are listed in [unreal-profile.md](unreal-profile.md).

## Composition

- **CLI** (`laniakea/cli.py`): the `extract`, `serve` and `up` commands; resolves a path or id to a target.
- **Pipeline** (`laniakea/pipeline.py`): runs a profile into a new run folder, validates every output, then switches
  `latest.json`; computes freshness.
- **Workspace** (`laniakea/workspace.py`): target registration and run folders under `workspace/`.
  An operating-system lock permits one extraction writer per target's mutable compiler copy.
- **Profiles** (`laniakea/profiles.py`): the one registry of language profiles.
- **Unreal profile** (`laniakea/unreal/`): engine resolution, the UBT calls, descriptors, and the graph builder. See
  [unreal-profile.md](unreal-profile.md).
- **Shards** (`laniakea/shards.py`): the drill-down scopes and their summaries, plus the index used to find nodes;
  language-neutral.
- **Map read index** (`laniakea/map_index.py`): regenerable compact topology and indexed canonical reference pages;
  language-neutral, separate from extraction authority and user positions.
- **Schema** (`schema/graph.v1.schema.json`, validated by `laniakea/schema.py`): the shapes of graph, shard and
  manifest.
- **Server** (`laniakea/server.py`) and **viewer** (`viewer/`, Cytoscape.js): presentation and saved user positions.
  The viewer's `app.js` owns startup and HTML controls; `universe.js` owns the canonical hierarchy, reference
  projection and world positions; `map.js` owns canvas rendering and hover; `scene.js` owns camera gestures and
  navigation; `positions.js` owns loading and ordered saves of released pins; `references.js` owns bounded reference-page
  retention and cancellation. See [viewport and memory lifetime](graph-model.md#viewport-and-memory-lifetime).
- **Layout store** (`laniakea/layouts.py`): validated user positions under each target's `layouts/` directory in the
  ignored workspace, separate from immutable runs. Updates merge moved pins; resetting affects one scope and mode.
- **Sample, fixtures, tests** (`sample/`, `fixtures/`, `tests/`): a synthetic project with no engine code, its recorded
  UBT export, a hand-written non-Unreal graph, and the test suite.

## Relationships

They are drawn once, in [the main view](diagrams/main.md).

Through the profile contract: a profile is a module with `NAME`, `project_file`, `target_fields`, `default_id`,
`inputs(target, manifest=None)` and `extract(target, run_dir, previous_manifest=None, tools_dir=None)`. The previous successfully published manifest is
read-only context; retention and optional local-tool policy belong to its profile. Adding a language is one adapter and one registry line; the core and the viewer change
nothing.
The CLI's per-run `--symbols` request enables the pipeline to supply a tool directory. Ordinary extraction supplies none;
installing a tool does not opt future extractions into compiler analysis.

The manifest's optional `timings_seconds` records elapsed phases. The profile supplies its extraction phases;
the pipeline supplies profile execution, shard writing/validation and total time through graph serialization, before
manifest validation/serialization and promotion. Parent phases contain their subphases, so values are not additive.

**Decision:** language profiles, with only the `unreal` profile built.
**Why:** the operator wants Rust, Python or similar later; the seam is proven by `fixtures/generic.graph.json`, not
by a second extractor nobody needs yet.

Through Unreal Build Tool's command line and LLVM's native indexing API: the Unreal profile owns compiler-facing preparation
and normalization, with every learned output in the workspace. The viewer only consumes the language-neutral graph contract.

**Decision:** reuse UBT's evaluated module graph and native compiler facts; build no custom parser, renderer or authoritative database.
**Why:** UBT already owns the evaluated rules; no mature free tool joins plugins, modules and code on Windows
([prior-art.md](../prior-art.md)). A disposable SQLite presentation index accelerates reads of the canonical JSON graph;
it does not own graph facts.

Through HTTP on 127.0.0.1, port 8737 unless `--port` says otherwise: the viewer reads `/data/targets.json` and run
files. Content-bound `/map/` endpoints provide compact topology and bounded exact-reference queries. The
`/layout/<target>/<scope file>` endpoint reads user positions; same-origin JSON POST requests update or
reset them. Only targets and nodes in the server's advertised run can be written. The entry layout accepts the complete
canonical graph for the continuous map; other scope layouts accept only nodes in that shard. Foreign origins, forms,
unknown nodes and non-finite coordinates are refused without changing saved data.
The server pins data requests to the runs advertised by its startup index, so a new extraction cannot mix a
manifest and shards from different runs. Restart serving to load newly extracted runs. Entry-layout validation reuses
the advertised run's node-id set; released drags do not reread the complete reference graph.

Dragged positions use stable node ids, scoped by project and layout mode, in the entry layout. Both a star and
its visible label accept dragging; hidden labels cannot intercept pointer input. A constellation drag translates
its complete subtree and saves the moved pins on release. Large patches use bounded sequential UTF-8 requests with
consumed responses and small acknowledgements, avoiding the browser's keepalive quota. Renderer positions are copies, so a live drag
cannot mutate the saved arrangement before release. Request threads serialize merge and atomic JSON replacement.
There is no polling or write per drag frame or wheel gesture. Fit, filtering, expansion and viewport resizing
preserve positions. Missing nodes are ignored after regeneration; new nodes use automatic positions. Opening the
map reads the workspace with HTTP caching disabled after outstanding saves finish. A failed save stays visible and
pending/failed saves trigger the browser's leave-page guard. Saved positions do not change graph facts, extraction
inputs, runs, or the analysed project.

The viewer retains one scene while groups expand or fold. Universe owns containment and viewport detail;
Cytoscape renders the resulting shapes and connections. Mouse
wheel input is normalized by pixel, line or page units and changes zoom around the pointer; Ctrl+wheel remains
browser zoom. Keyboard zoom and explicit group controls provide alternatives. The URL retains a scope address;
browser history retains the camera and expansion state for navigation and reload. Graph data stays pinned to the
advertised run. A fresh page reads saved pins from the server rather than treating browser storage as their owner.

## Invariants

1. The analysed project gains no file, configuration, hook, link or ignore rule from Laniakea. The only writes there
   are Unreal Build Tool's own caches, listed in [unreal-profile.md](unreal-profile.md); the engine integration test
   fails on any other change.
2. `-Mode=GenerateClangDatabase` is never run against an analysed project.
3. Every edge carries its status and the manifest source that produced it.
4. Absence is never rendered as proof: targets, levels and hops that were not analysed are named in the manifest and
   shown by the viewer.
5. Engine modules and plugins appear only as boundary nodes that a project node touches.
6. The schema is the contract; raw tool output is not, and stays in the run folder.
7. A run becomes `latest` only after its graph, every shard and the manifest validated and were written; a failed run
   is kept as `.failed` for diagnosis.
8. A run stays fresh only while its recorded build-input hashes match the project; the server marks a stale run. An
   export naming another project is refused.
9. Graph and shard source locations hold root-relative paths. Absolute source-link roots live in `target.json`;
   external compiler-input fingerprint keys and raw compiler provenance retain host paths in the ignored workspace.
10. No network at run time. The server binds 127.0.0.1 and answers only requests addressed to it.
11. Tracked files never hold data from an analysed project; examples and fixtures come from the synthetic sample.
12. Core, shards, schema and viewer contain no language-specific logic.

**Decision:** the analysed project is a black box, and all project data lives in the clone's ignored `workspace/`.
**Why:** full decoupling in both directions; one visible folder is simple to inspect and delete.

**Decision:** Windows only.
**Why:** the maintainer's target platform; Linux and Mac are not targets, so no code path serves them.

**Decision:** Python standard library only, and Cytoscape.js vendored, not fetched.
**Why:** a machine with Unreal installed already has Python, and the viewer must work offline (invariant 10).

**Decision:** GNU AGPL-3.0-or-later.
**Why:** the maintainer's choice, so that modified versions stay open, including when offered over a network.

## Accepted decisions

- Language profiles, `unreal` only - see [Relationships](#relationships)
- Reuse evaluated build/compiler facts; no custom parser, renderer or authoritative database - see [Relationships](#relationships)
- Black box analysed project; all data in `workspace/` - see [Invariants](#invariants)
- Windows only - see [Invariants](#invariants)
- Standard library only; vendored viewer library - see [Invariants](#invariants)
- AGPL-3.0-or-later - see [Invariants](#invariants)

## Risks and technical debt

- **One target per run.** The Unreal profile selects receipt-backed build context when available, as specified in
  [unreal-profile.md](unreal-profile.md#build-context); other targets are named as not analysed. A launcher
  engine refuses Client and Server targets, so their graphs need a source-built engine.
- **Summaries hide detail by design.** Above the module level, edges are summaries; the exact edges behind one are
  listed completely in its details, including references internal to a collapsed group. A summary of module use can disagree with the
  declared `requires`, and both are shown rather than reconciled.
- **Wide scopes.** A project without plugin folders puts every plugin in one scope, and a flat scope of a few
  hundred nodes is hard to read in any layout. The continuous map reveals local detail while keeping other groups collapsed. Overlapping names
  are hidden without hiding stars or references; hover, zoom, search and the accessible node list reveal them.
  Very wide groups may still require more zoom or a name search to distinguish their contents.
  The viewport evicts distant detail without forgetting expansion. Unchanged projections retain their renderer elements;
  exact reference pages have bounded retention. A single exceptionally dense local view still costs more to draw than a sparse one.
- **Native extraction cost.** Class/function analysis parses current compilation units with optional local LLVM tools.
  Preparing native unity/PCH actions avoids reparsing each source separately. Serving an existing run does not start a compiler.
- **Export scale.** Leaf and container scopes reuse reference indexes. Serialized scope artifacts still grow with the
  hierarchy; the continuous map folds unrelated branches and retains exact references behind their visible summaries.
