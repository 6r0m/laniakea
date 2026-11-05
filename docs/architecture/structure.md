# Structure

## Purpose

Let a developer explore an Unreal C++ project progressively, project -> plugins -> modules, with typed dependency
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
- **Profiles** (`laniakea/profiles.py`): the one registry of language profiles.
- **Unreal profile** (`laniakea/unreal/`): engine resolution, the UBT calls, descriptors, and the graph builder. See
  [unreal-profile.md](unreal-profile.md).
- **Shards** (`laniakea/shards.py`): the drill-down scopes and their summaries, plus the index used to find nodes;
  language-neutral.
- **Schema** (`schema/graph.v1.schema.json`, validated by `laniakea/schema.py`): the shapes of graph, shard and
  manifest.
- **Server** (`laniakea/server.py`) and **viewer** (`viewer/`, Cytoscape.js): presentation and saved user positions.
  The viewer's `app.js` owns navigation and HTML controls; `map.js` owns canvas styling, layout and selection;
  `positions.js` owns loading and ordered saves of dragged positions.
- **Layout store** (`laniakea/layouts.py`): validated user positions under each target's `layouts/` directory in the
  ignored workspace, separate from immutable runs. Updates merge moved pins; resetting affects one scope and mode.
- **Sample, fixtures, tests** (`sample/`, `fixtures/`, `tests/`): a synthetic project with no engine code, its recorded
  UBT export, a hand-written non-Unreal graph, and the test suite.

## Relationships

They are drawn once, in [the main view](diagrams/main.md).

Through the profile contract: a profile is a module with `NAME`, `project_file`, `target_fields`, `default_id`,
`inputs` and `extract`. Adding a language is one adapter and one registry line; the core and the viewer change
nothing.

**Decision:** language profiles, with only the `unreal` profile built.
**Why:** the operator wants Rust, Python or similar later; the seam is proven by `fixtures/generic.graph.json`, not
by a second extractor nobody needs yet.

Through Unreal Build Tool's command line: the profile runs `-Mode=QueryTargets` and `-Mode=JsonExport` with every
output and log in the run folder.

**Decision:** reuse UBT's evaluated module graph, and build no parser, renderer or database.
**Why:** UBT already owns the evaluated rules; no mature free tool joins plugins, modules and code on Windows
([prior-art.md](../prior-art.md)).

Through HTTP on 127.0.0.1, port 8737 unless `--port` says otherwise: the viewer reads `/data/targets.json` and run
files. The `/layout/<target>/<scope file>` endpoint reads user positions; same-origin JSON POST requests update or
reset them. Only targets and scope nodes in the server's advertised run can be written. Foreign origins, forms,
unknown nodes and non-finite coordinates are refused without changing saved data.
The server pins data requests to the runs advertised by its startup index, so a new extraction cannot mix a
manifest and shards from different runs. Restart serving to load newly extracted runs.

Dragged positions use stable node ids, scoped by project and layout mode. Both a star and its visible label accept
dragging; hidden labels cannot intercept pointer input. Only a released pin is sent; request
threads serialize merge and atomic JSON replacement. There is no polling or write per drag frame. Fit, filtering
and viewport resizing preserve positions. Missing nodes are ignored after regeneration; new nodes use automatic
positions. Each scope opening reads the workspace with HTTP caching disabled after outstanding saves finish;
only unsaved changes are retained in memory. A failed save stays visible and pending/failed saves trigger the browser's leave-page guard. The cache
does not change graph facts, extraction inputs, runs, or the analysed project.

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
9. Graph, shards and manifest hold root-relative paths; absolute roots live only in `target.json`.
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
- Reuse UBT's module graph; no parser, renderer or database - see [Relationships](#relationships)
- Black box analysed project; all data in `workspace/` - see [Invariants](#invariants)
- Windows only - see [Invariants](#invariants)
- Standard library only; vendored viewer library - see [Invariants](#invariants)
- AGPL-3.0-or-later - see [Invariants](#invariants)

## Risks and technical debt

- **One target per run.** The default is the Editor target; other targets are named as not analysed. A launcher
  engine refuses Client and Server targets, so their graphs need a source-built engine.
- **Summaries hide detail by design.** Above the module level, edges are summaries; the exact edges behind one are
  listed in its details, and fully in the leaf scope of each module. A summary of module use can disagree with the
  declared `requires`, and both are shown rather than reconciled.
- **Wide scopes.** A project without plugin folders puts every plugin in one scope, and a flat scope of a few
  hundred nodes is hard to read in any layout. The galaxy layout separates members from context; overlapping names
  are hidden at the fitted zoom without hiding nodes or edges. Zoom, hover, search and selection reveal names;
  Browse and relationship lists provide text navigation. Very large scopes still need a narrower query or scope.
- **No classes or functions yet.** Their extraction is planned separately and has an unresolved parse-quality gate.
