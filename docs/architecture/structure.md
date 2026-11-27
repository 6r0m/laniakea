# Laniakea system structure

## Purpose

Turn recorded facts from an Unreal C++ project into an explorable map with source evidence for architectural review.

## Boundaries

The analysed project and its build tools own project semantics. The Unreal profile defines the input boundary and
[permitted UBT cache writes](../../laniakea/unreal/docs/architecture/build-extraction.md#what-ubt-writes-into-the-project).
Recorded evidence supports findings for the selected build context. Runtime behavior and unanalysed contexts
remain outside its coverage.

## Composition

| Part | Responsibility |
|---|---|
| [Python core](../../laniakea/docs/architecture/structure.md) | Command line, run publication, local service and Review evidence |
| [Browser viewer](../../viewer/docs/architecture/structure.md) | Interactive projection, dependency tracing and evidence inspection |
| [Graph schema](../../schema/README.md) | Shapes of canonical graphs, manifests, shards and indexes |

## Relationships

The [main view](diagrams/main.md) shows the system boundary and the contracts between its runtime components.

## Invariants

- Analysed projects stay independent of Laniakea. Learned data belongs in the ignored workspace. The
  [repository rules](../../AGENTS.md#privacy-never-violate) govern privacy in this clone. The tool and project can
  be removed independently.
- The core data contract and viewer remain language-neutral. The
  [profile contract](../../laniakea/docs/architecture/structure.md#relationships) keeps ecosystem-specific facts with
  their adapter.
- Windows is the supported platform. The core uses the Python standard library and the viewer ships its resources
  locally. The [third-party notices](../../THIRD_PARTY.md) identify the bundled libraries.
- Build and compiler evidence comes from the existing local tools. The viewer uses a bundled renderer.
- The [AGPL-3.0-or-later license](../../LICENSE) keeps modified versions open to their users, including when served
  over a network.
