# Python core structure

## Purpose

Publish validated graph evidence and serve it locally with stable run and decision lifetimes.

## Owns

- Validated publication of extracted facts and explicit coverage.
- Independent lifetimes for immutable runs, disposable views and local user decisions.
- Local delivery of graph evidence and evaluation of Review rules.

## Boundaries

Tool-specific acquisition belongs to the [Unreal profile](../../unreal/docs/architecture/structure.md).
Projection and interaction belong to the [browser viewer](../../../viewer/docs/architecture/structure.md).

## Composition

| part | responsibility |
|---|---|
| [CLI](../../cli.py) | command parsing and dispatch |
| [Viewer lifecycle](../../service.py) | workspace ownership and authenticated graceful stop |
| [Background analysis](monitoring.md) | session scheduling, contained workers and immutable read contexts |
| [Pipeline](../../pipeline.py) | validate and publish runs, coordinate optional analysis and freshness |
| [Workspace](../../workspace.py) | target registration, run storage and extraction-writer coordination |
| [Profile registry](../../profiles.py) | select the language adapter |
| [Unreal profile](../../unreal/docs/architecture/structure.md) | engine/tool integration and normalization |
| [Graph contract](graph-model.md) | canonical meaning, coverage and generated scope semantics |
| [Read contexts](../../snapshots.py) | versioned run and cache leases for local reads and writes |
| [Shards](../../shards.py) | generated scope summaries and address index |
| [Read index](../../map_index.py) | disposable compact topology and exact-reference queries |
| [Server](../../server.py) | loopback delivery of pinned data and validated local writes |
| [Source preview](../../source_preview.py) | bounded current-text reads authorized by recorded source evidence |
| [Layout store](../../layouts.py) | validated positions independent of extracted runs |
| [Source observations](../../health.py) | immutable evidence validation and loading |
| [Review](review.md) | rules, findings, report caching and durable triage |

## Relationships

The [core view](diagrams/main.md) shows publication, serving and the lifetimes of local data. The
[registry](../../profiles.py), [pipeline](../../pipeline.py) and [Unreal adapter](../../unreal/__init__.py)
define the profile interface.

Through the profile contract, extraction remains language-specific while validation and publication stay generic.
New-project checks use the [recommended background modes](monitoring.md#requested-checks); historical choices remain
authoritative. Ordinary builds use automatic source-health collection. Required collection failures
retain the publication; automatic source-health requests may publish a valid graph with failed coverage under the
[profile acquisition contract](../../unreal/docs/architecture/source-duplication.md#source-duplication).

**Decision:** language profiles, with only the Unreal adapter built.
**Why:** other languages can reuse the graph and viewer without importing Unreal semantics.

Canonical JSON owns the recorded facts. The disposable read index and scope summaries can be rebuilt from it.

## Local service

Through local HTTP, serving pins data to its advertised runs. Publishing a new run cannot mix old and new artifacts;
versioned contexts make newer snapshots available without changing old URLs. Each tab adopts ready data through its viewer.
Same-origin validation protects local writes. Session monitoring follows the [background-analysis contract](monitoring.md).
The viewer lifetime has one workspace owner. A stop request verifies that instance, preserves saved state and never
kills an unrelated process based on its port or PID. Startup failure and cancellation release ownership.

## Source preview

Source preview resolves a recorded finding occurrence through that pinned context; clients cannot supply source paths.
The reader validates the recorded project root, resolved path and Windows opened handle before returning bounded text.
Only a matching recorded file hash permits a highlighted preview. Changed, missing, unreadable, oversized and unsupported
text remains explicit. The matching range takes the line/text budget before optional context: a successful preview contains
matching lines; an oversized first matching line produces a preview-limit state. Omitted context or match tails are marked
as truncated. External junctions without a pinned physical binding are refused. This on-demand read starts no
analysis and writes no source; the viewer owns its presentation and cancellation.

## Invariants

- The [schema](../../../schema/graph.v1.schema.json) owns shapes; raw tool output cannot bypass validation.
- A run is published only after every required artifact validates. Failed runs remain available for diagnosis.
- Canonical facts, disposable read/presentation caches, positions and review decisions have separate owners.
- Coverage limits remain observable.
- Source locations are root-relative; machine-specific roots and raw provenance stay in the ignored workspace.
- Runtime resources stay local; host/origin checks protect the loopback boundary.

## Risks and technical debt

- **Partial analysis.** One selected build context and recorded static evidence cannot prove global conformance.
  Scope and unsupported facts are defined by [Unreal acquisition](../../unreal/docs/architecture/README.md) and [Review](review.md).
- **Export scale.** Generated shard artifacts grow with hierarchy size even though the read index avoids full-reference
  downloads during exploration.
