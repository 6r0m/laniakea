# Deferred - Engine-internal exploration

**Status:** DEFERRED. Run investigate-change before proposing an implementation; implementation is not authorized.
**Owner:** Unreal profile. [Current architecture](../docs/architecture/unreal-profile.md).

## Authority register

- **D1** The operator deferred Engine internals. Project-facing Engine plugin usage is sufficient for current work.
  Reason: Engine internals are not needed now.

## Goal

If a demonstrated use case needs it, explore beyond the Engine modules/plugins directly used by the project without
obscuring project references or making ordinary extraction expensive.

## Required investigation

1. Establish a concrete navigation question that existing Engine boundary nodes cannot answer.
2. Inspect the installed engine's native build/index artifacts and licensing constraints. Keep data in ignored workspace.
3. Compare bounded, on-demand exploration with full Engine indexing. Measure time, memory, storage and reference fidelity.
4. Keep the viewer and graph contract language-neutral; identify the actual extraction owner and coverage contract.
5. Produce one reviewable todo with failure cases and acceptance evidence. Do not select a parser, cache or storage redesign
   before the measurements establish a need.

## Acceptance before implementation

An approved investigate-change result defines the exact depth, evidence provenance, performance budget, offline behavior,
project privacy and handling of missing Engine inputs. Existing project navigation and saved positions remain covered.
