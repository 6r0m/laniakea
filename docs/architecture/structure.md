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
  there.

## Composition

- **CLI** (`laniakea/cli.py`): the `extract`, `serve` and `up` commands; resolves a path or id to a target.
- **Pipeline** (`laniakea/pipeline.py`): runs a profile into a new run folder, validates every output, then switches
  `latest.json`; computes freshness.
- **Workspace** (`laniakea/workspace.py`): target registration and run folders under `workspace/`.
- **Profiles** (`laniakea/profiles.py`): the one registry of language profiles.
- **Unreal profile** (`laniakea/unreal/`): engine resolution, the UBT calls, descriptors, and the graph builder. See
  [unreal-profile.md](unreal-profile.md).
- **Shards** (`laniakea/shards.py`): the drill-down scopes, language-neutral.
- **Schema** (`schema/graph.v1.schema.json`, validated by `laniakea/schema.py`): the shapes of graph, shard and
  manifest.
- **Server** (`laniakea/server.py`) and **viewer** (`viewer/`, Cytoscape.js): read-only presentation.
- **Privacy guard** (`.githooks/pre-push`): see [publishing.md](../publishing.md).
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

Through HTTP on 127.0.0.1: the viewer reads `/data/targets.json` and the latest run's files; nothing else is served
and nothing is written.

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
**Why:** full decoupling in both directions; one visible folder is simple to inspect and delete. Ignore rules alone
are not trusted for privacy, so pushes pass the guard in [publishing.md](../publishing.md).

**Decision:** Python standard library only, and Cytoscape.js vendored, not fetched.
**Why:** a machine with Unreal installed already has Python, and the viewer must work offline (invariant 10).

**Decision:** GNU AGPL-3.0-or-later.
**Why:** the maintainer's choice, so that modified versions stay open, including when offered over a network.

## Accepted decisions

- Language profiles, `unreal` only - see [Relationships](#relationships)
- Reuse UBT's module graph; no parser, renderer or database - see [Relationships](#relationships)
- Black box analysed project; all data in `workspace/` - see [Invariants](#invariants)
- Standard library only; vendored viewer library - see [Invariants](#invariants)
- AGPL-3.0-or-later - see [Invariants](#invariants)

## Risks and technical debt

- **One target per run.** The default is the Editor target; other targets are named as not analysed. A launcher
  engine refuses Client and Server targets, so their graphs need a source-built engine.
- **Plugin-level dependencies are summaries.** `depends.rollup` aggregates module edges; it can disagree with the
  declared `requires` edges, and both are shown rather than reconciled.
- **Large flat scopes.** A project scope of a few hundred nodes lays out in under a second with the force layout; a
  scope of 2,000 nodes takes over a second. Larger scopes would need precomputed positions.
- **Linux and Mac are unverified.** The engine and .NET lookups follow the engine's own rules there, but nothing has
  been run on them.
- **No classes or functions yet.** Their extraction is planned separately and has an unresolved parse-quality gate.
