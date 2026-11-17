# Structure

## Purpose

Connect recorded Unreal C++ facts to a progressively explorable map and optional architecture review. The analysed
project needs no Laniakea installation or integration.

## Owns

- Validated publication of extracted facts and explicit coverage.
- Independent lifetimes for immutable runs, disposable views and local user decisions.
- The local exploration and review application.

## Does not own

- Project semantics or build rules: these belong to the analysed project and its tools. The
  [Unreal profile](unreal-profile.md) defines the read boundary and permitted tool-side effects.
- Runtime behavior or an overall architecture grade: recorded evidence cannot establish either.
- Publishing safety of an analysed project: its repository owns that process. Laniakea's own
  [privacy rules](../../AGENTS.md#privacy-never-violate) govern this clone.

## Composition

| part | responsibility |
|---|---|
| [CLI](../../laniakea/cli.py) | command parsing and dispatch; [Makefile](../../Makefile) supplies shortcuts |
| [Viewer lifecycle](../../laniakea/service.py) | workspace ownership and authenticated graceful stop |
| [Pipeline](../../laniakea/pipeline.py) | validate and publish runs, coordinate optional analysis and freshness |
| [Workspace](../../laniakea/workspace.py) | target registration, run storage and extraction-writer coordination |
| [Profile registry](../../laniakea/profiles.py) | select the language adapter |
| [Unreal profile](unreal-profile.md) | engine/tool integration and normalization |
| [Graph contract](graph-model.md) | canonical meaning, coverage and generated scope semantics |
| [Schema](../../schema/graph.v1.schema.json) | graph, shard and manifest shapes |
| [Shards](../../laniakea/shards.py) | generated scope summaries and address index |
| [Read index](../../laniakea/map_index.py) | disposable compact topology and exact-reference queries |
| [Server](../../laniakea/server.py) | loopback delivery of pinned data and validated local writes |
| [Viewer](viewer.md) | continuous projection, navigation, tracing and inspection |
| [Layout store](../../laniakea/layouts.py) | validated positions independent of extracted runs |
| [Source observations](../../laniakea/health.py) | immutable evidence validation and loading |
| [Review](review.md) | rules, findings, report caching and durable triage |
| [Verification](../../tests/README.md) | synthetic regressions, native checks and browser acceptance |

## Relationships

The [main view](diagrams/main.md) owns the component relationships. Adapter interfaces are owned by the
[registry](../../laniakea/profiles.py), [pipeline consumer](../../laniakea/pipeline.py) and
[implemented profile](../../laniakea/unreal/__init__.py).

Through the profile contract, extraction remains language-specific while validation and publication stay generic.
Installing an optional tool does not authorize analysis. Required collection failures retain the publication;
explicit automatic source-health requests may publish a valid graph with failed coverage under the
[profile acquisition contract](unreal-profile.md#source-duplication).

**Decision:** language profiles, with only the Unreal adapter built.
**Why:** other languages can reuse the graph and viewer without importing Unreal semantics.

Through the tool contracts, evaluated build rules and compiler observations remain evidence from their original owners.

**Decision:** reuse existing build/compiler tools and the renderer; keep canonical JSON authoritative.
**Why:** Laniakea joins facts rather than maintaining another parser or authoritative database.

Through local HTTP, serving pins data to its advertised runs. Publishing a new run cannot mix old and new artifacts;
a viewer restart adopts the new snapshot. Same-origin validation protects local writes.
The viewer lifetime has one workspace owner. A stop request verifies that instance, preserves saved state and never
kills an unrelated process based on its port or PID. Startup failure and cancellation release ownership.

## Invariants

- The [schema](../../schema/graph.v1.schema.json) owns shapes; raw tool output cannot bypass validation.
- A run is published only after every required artifact validates. Failed runs remain available for diagnosis.
- Canonical facts, disposable read/presentation caches, positions and review decisions have separate owners.
- Core, schema, shards and viewer remain language-neutral. Coverage limits remain observable.
- Source locations are root-relative; machine-specific roots and raw provenance stay in the ignored workspace.
- Runtime resources stay local; host/origin checks protect the loopback boundary.

**Decision:** treat the analysed project as a black box and retain learned data only in the ignored workspace.
**Why:** the tool and project remain independently usable and removable. The
[repository rules](../../AGENTS.md) enforce privacy and unsafe-tool restrictions.

**Decision:** Windows only, Python standard library core and vendored viewer dependencies.
**Why:** this is the supported platform and avoids additional core packages or runtime downloads.

**Decision:** [AGPL-3.0-or-later](../../LICENSE).
**Why:** modified versions remain open, including when offered over a network.

## Risks and technical debt

- **Partial analysis.** One selected build context and recorded static evidence cannot prove global conformance.
  Scope and unsupported facts are defined by the [Unreal profile](unreal-profile.md) and [Review](review.md).
- **Dense views.** A very wide local scope remains harder to read and more expensive to render; the
  [viewer contract](viewer.md#viewport-and-memory-lifetime) bounds retained detail without claiming constant draw cost.
- **Native cost.** Compiler analysis can be expensive; its isolation and reuse belong to the
  [native-analysis contract](unreal-profile.md#native-symbol-analysis).
- **Export scale.** Generated shard artifacts grow with hierarchy size even though the read index avoids full-reference
  downloads during exploration.
