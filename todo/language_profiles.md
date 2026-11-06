# Deferred - Rust and Python profiles

**Status:** DEFERRED. Run investigate-change for each concrete language use case before implementation.
**Owner:** profile registry. [Language-neutral boundary](../docs/architecture/structure.md#relationships).

## Authority register

- **D1** The operator deferred Rust/Python support to future todos requiring investigate-change. Reason: not stated.
- **D2** Windows remains the supported platform. Reason: not stated.

## Goal

Explore another language through the existing graph and viewer when a real project requires it.

## Required investigation

1. Pick the language and a synthetic fixture plus a private proof path; do not implement both adapters speculatively.
2. Identify native metadata/indexing tools and verify their Windows and offline behavior, licenses and installation cost.
3. Define the precise meaning and coverage of containment and references, including dynamic or unresolved calls.
4. Test the existing profile contract and generic graph fixture before proposing any core/schema/viewer change.
5. Measure extraction, memory, serialized graph size and navigation cost. Determine dependency/input identities before caching.
6. Produce an implementation todo with red cases, source-link behavior, privacy, provenance and acceptance gates.

## Acceptance before implementation

The operator approves the investigated scope. Language-specific extraction remains in its adapter, graph facts retain honest
coverage, the analysed project remains untouched, and existing Unreal behavior and saved layouts retain regression coverage.
