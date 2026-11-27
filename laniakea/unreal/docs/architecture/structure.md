# Unreal profile structure

The Unreal adapter records evidence for a selected C++ build context. It defines Unreal-specific
acquisition and mapping. The [Python core](../../../docs/architecture/structure.md) validates and publishes
the resulting graph and evidence.

## Composition

| Part | Responsibility |
|---|---|
| [Profile entry point](../../__init__.py) | Acquisition orchestration and coverage |
| [Build selection](../../builds.py) and [descriptors](../../descriptors.py) | Project identities, receipts and build inputs |
| [UBT adapter](../../ubt.py) | Target queries, evaluated rules and guarded compile actions |
| [Module normalization](../../graph.py) | Module graph and dependency ownership |
| [Compiler analysis](../../compiler.py) and [symbol mapping](../../symbols.py) | Isolated indexing and native graph enrichment |
| [Source health](../../source_health.py) and [CPD adapter](../../cpd.py) | Optional duplication acquisition and run-bound observations |
| [Monitoring inputs](../../monitor.py) | Consumed inputs and watch boundaries |

## Relationships

The [Unreal profile diagram](diagrams/main.md) shows the acquisition components and their tool contracts.

## Invariants

- Project analysis reads through the recorded project and declared plugin boundaries.
- Unreal Build Tool owns permitted cache writes. Native compiler actions run against an isolated copy.
- The adapter records coverage for each acquired evidence source.
