# External dependencies under their evidenced owners

**Status:** REVIEW REQUIRED
**Scope:** Unreal normalization and bounded external-dependency inspection; existing continuous-map presentation.
**Stable documentation owners:** [Unreal profile](../docs/architecture/unreal-profile.md),
[graph model](../docs/architecture/graph-model.md).

## Contents

- [Goal](#goal)
- [Authority register](#authority-register)
- [Non-goals](#non-goals)
- [Verified evidence](#verified-evidence)
- [Current architecture and source of truth](#current-architecture-and-source-of-truth)
- [Problem and root cause](#problem-and-root-cause)
- [Decision](#decision)
- [Required invariants](#required-invariants)
- [Implementation tasks](#implementation-tasks)
- [Test-first and verification plan](#test-first-and-verification-plan)
- [Documentation plan](#documentation-plan)
- [Rollout and rollback](#rollout-and-rollback)
- [Completion criteria](#completion-criteria)
- [Review record](#review-record)

## Goal

Understand which external facility a constellation depends on and why. Dependencies should appear within their
evidenced provider's constellation, with exact declarations accessible through hover and inspection. The overview
must distinguish project, Engine-supplied and other external dependencies without inventing ownership.

## Authority register

### Operator decisions

- **D1** Improve external-dependency observability and show dependencies beneath their owning constellations;
  the operator identifies Unreal ThirdParty as the requested example.
  - Effect: ownership must inform presentation, not just the external aggregate's name or color.
  - Reason: the operator considers the external dependency part of its owning constellation.
  - Source: current operator request.
- **D2** Engine-internal indexing is deferred; project-facing plugin usage is sufficient for current work.
  - Effect: this change may identify already referenced external providers, but does not index their implementation.
  - Reason: operator previously stated Engine internals are not needed now.
- **D3** Preserve seamless zoom/hover exploration, existing saved arrangements and clean canvas names.
  - Effect: reuse the current renderer, projection, inspection and position lifetimes.
  - Reason: operator's established galaxy interaction and saved-position requirements.

### Operator gates

No unresolved technical question prevents investigation. This proposed data/presentation contract remains reviewable
before implementation; earlier viewer-only approval does not describe these new normalization changes.

### Working assumptions

- **A1 [ACTIVE]** "Beneath the owner" means contained in the provider constellation when revealed, with normal
  layout placement. It does not require fixed vertical coordinates or a copy beneath each consumer.
- **A2 [ACTIVE]** Preserve one shared provider identity with several incoming references. Keep external ownership
  explicitly unclassified when the recorded evidence cannot identify its provider.
- **A3 [ACTIVE]** Use existing build/module ownership and recorded declaration provenance before considering
  additional provider categories. Compiler, SDK and other-library labels require corresponding evidence.

## Non-goals

- Full Engine, standard-library, SDK or vendor-library indexing; external dependency traversal beyond recorded facts.
- Treating every external declaration as Unreal-owned, or renaming an unknown aggregate to imply proven ownership.
- New renderers, databases, services, dependencies, a second graph, or manual per-project ownership configuration.
- Changing ordinary module-only extraction into native extraction, changing build-context policy, or moving user pins.
- Runtime tracing, performance attribution or architectural violation claims from static reference volume alone.

## Verified evidence

1. [symbols.merge](../laniakea/unreal/symbols.py), `owner` and `endpoint`, first resolve retained project symbols and
   exported module ownership. An unmatched declaration physically under the Engine goes to the Engine boundary.
   The `external:cpp` fallback is for a known declaration file outside the project and Engine with no resolved module.
   **Refuted premise:** the existing external aggregate is not evidence that its contents are UE ThirdParty.
2. [graph._Builder.boundary_module](../laniakea/unreal/graph.py) places known external modules under their Engine
   plugin when discovered, otherwise defaults to the Engine. This existing default needs explicit scrutiny when
   describing providers outside both project and Engine; a missing plugin descriptor alone does not prove Engine ownership.
3. [native_index.metadata](../laniakea/unreal/native_index.py) records declaration identity, qualified context,
   file and coordinates before normalization. Reference edges retain referring-project location and target spelling,
   but not the target-header location. External semantic relations retain neither target spelling nor location.
4. `symbols.merge` normalizes semantic relations through `_Builder.edge`, whose key is type/source/target.
   Different external base classes can collapse to one boundary edge before their identity is preserved.
5. A read-only synthetic diagnostic supplied three inheritance relations: one target under an Engine ThirdParty
   directory and two targets under separate external SDK/compiler directories. It published two edges, targeting
   `engine` and `external:cpp`, with empty relation metadata and no unknown-endpoint count. This demonstrates both
   the Engine/external distinction and lost exact relationship evidence without requiring LLVM or a private fixture.
6. [Existing native regressions](../tests/test_native_symbols.py) cover generated/module ownership, compiler semantics
   and bounded ownership lookup. [Map/index tests](../tests/test_map_index.py) and
   [viewer regressions](../tests/viewer.test.cjs) cover downstream exact-reference delivery and inspection.

**Unverified:** reliable provider names for all external files, the best external-root provenance representation,
and whether retained native facts from an existing run are sufficient for safe normalization-only regeneration.
Do not infer these from an aggregate label, namespace, include spelling or compiler success.

## Current architecture and source of truth

- [Unreal profile](../docs/architecture/unreal-profile.md): native inputs, module/plugin ownership, normalization,
  first-hop boundaries and publication failure behavior.
- [Graph model](../docs/architecture/graph-model.md): containment versus dependency, exact references, projection
  counts, coverage, navigation and user-position lifetime.
- [Composition](../docs/architecture/structure.md#composition): profile produces facts; core and viewer are language-neutral.
- [Map read index](../laniakea/map_index.py): disposable projection over canonical facts, with bounded exact-reference pages.
- [Viewer topology](../viewer/universe.js), [inspection](../viewer/app.js), [position store](../viewer/positions.js):
  existing consumers; no second external-specific navigation or persistence lifecycle is needed.

## Problem and root cause

An opaque external star mixes distinguishable dependency evidence and prevents the operator from understanding
provider ownership. Relocating that star would preserve the ambiguity while attributing all its contents to one owner.
Normalization also discards the evidence needed to explain some collapsed relationships. Presentation must consume
preserved provenance and evidenced ownership, rather than reconstructing either from labels.

## Decision

Recommend A1-A3 under D1-D3. Resolve provider ownership in the Unreal adapter, preserving the information needed for
exact inspection before projecting dependencies into provider constellations.

### Premise / KISS gate

The normalizer already has declaration provenance and build-module ownership; the continuous map already renders
nested owners and pages exact references. Extend those owners. Add no process, protocol, ownership registry in the
viewer, decorative region or duplicate provider per consumer. Give up speculative categorization of every external
file: uncertainty remains visible rather than triggering a new parser or filesystem-wide scan.

### Recommended behavior

1. Keep existing plugin/module owners wherever they are evidenced. Represent a UE-supplied ThirdParty dependency
   inside the relevant Engine/plugin constellation; introduce only containment justified by actual provider structure.
   Preserve the distinction between project plugin folders and Engine-supplied dependencies with similar names.
2. External standard-library/compiler or SDK declarations remain external to UE when the evidence says so.
   Provider classification must bind to recorded build/toolchain roots or declaration ownership, not basename/namespace
   guesses. Preserve an explicit unclassified boundary for the remainder; explain what is known and unknown.
3. Preserve qualified target identity and declaring-header provenance for references and semantic relations before
   collapsing endpoints. Distinct base/override targets must remain distinguishable after collapse. Keep duplicate
   translation-unit observations deduplicated, without deduplicating different relationships by normalized endpoints alone.
4. Hover stays compact: provider/ownership explanation, typed reference breakdown and coverage. Use existing Details
   pages to answer which project owners reference it and show source -> external declaration with location/provenance.
   Reuse existing source-root handling for links; absent or unregistered provenance must remain explicit and unlinked.
5. Let containment and normal zoom reveal provider detail. Shared providers have one identity and several incoming
   references. Reuse names-only canvas labels and existing direction colors. No automatic relocation of saved nodes.
6. New evidence requires a validated new run. Existing immutable runs retain their known semantics and missing-provenance
   explanation; no viewer-side reclassification of old snapshots. Normalization-only reuse is allowed only if retained
   facts and their input/tool identity prove fidelity; otherwise use the existing explicit native extraction path.

### Alternatives considered

| Option | Moving parts | Assessment |
|---|---|---|
| Move the whole external aggregate under UE | One parent change | Reject: contradicts the existing Engine-versus-external classification |
| Copy external dependencies beneath each consumer | Multiple presentation identities and deduplication rules | Reject: confuses containment, ownership and reference counts |
| Preserve provenance and reuse provider containment | Adapter normalization plus existing projection/inspection | Recommended; directly answers ownership and dependency questions |
| Index entire external libraries | More compiler work, coverage and retention lifetimes | Outside D2 and unnecessary for identifying referenced providers |

## Required invariants

1. Provider ownership is evidenced; unknown is neither Engine ownership nor a missing dependency.
2. Containment does not assert that a consumer owns its dependency. Shared targets remain shared.
3. Engine boundary depth remains first-hop/project-facing; no external implementation graph is inferred.
4. Original declaration identity and source/reference evidence survive normalization, compact indexing and exact paging.
5. Distinct semantic relations remain distinct; repeated observations of the same fact remain deduplicated.
6. Existing authored recursion, generated-owner classification and configuration-context rules remain unchanged.
7. Core/schema/viewer stay language-neutral. Prefer existing metadata/provenance shapes; a genuinely required contract
   extension must include its validators and consumers, not an unvalidated attribute shortcut.
8. Module-only extraction stays independent of LLVM. Failed normalization or provenance validation cannot replace the
   last good run. External paths are metadata from recorded inputs, not authorization to traverse new source roots.
9. Existing node ids and saved coordinates remain intact where identity is unchanged. Retain unavailable old pins;
   new provider nodes get ordinary initial positions, with no pin migration or reset.
10. No graph-wide hover scan, per-reference renderer element, network download, analysed-project write or private data
    in tracked artifacts. Exact details remain paged and browser input remains bounded.

## Implementation tasks

- [ ] Add synthetic ownership/provenance and collapsed-relation regressions before modifying normalization.
- [ ] Establish the minimum provider evidence available in current build/native inputs; document unsupported cases.
- [ ] Preserve exact external target provenance and relation identity, then assign only evidenced provider containment.
- [ ] Audit the existing Engine-default boundary placement for foreign module roots against that evidence.
- [ ] Verify canonical graph, schemas, shards, compact index and reference pages preserve the enhanced facts.
- [ ] Add bounded hover/inspection explanations through existing generic viewer owners; verify source-link refusal when
      its root is unavailable and compatibility with older runs.
- [ ] Verify current native regression semantics, module-only behavior, saved layouts and real browser exploration.
- [ ] Migrate the accepted contracts to the stable owners below; remove this todo after final acceptance.

## Test-first and verification plan

### Red evidence

| Behavior | Evidence kind | Required failure/control |
|---|---|---|
| UE ThirdParty versus external SDK/compiler ownership | Permanent adapter regression | Only proven UE ownership may place a target under Engine; include an exported foreign-module control |
| Two external bases of one class | Permanent normalization regression | Two original relations currently collapse to one unnamed external edge |
| Exact target provenance | Permanent normalization/index/page regression | Current canonical rows omit external declaration locations; relations also omit target names |
| Repeated versus distinct observations | Permanent normalization regression | Repeated identical observations deduplicate; distinct targets at one source remain inspectable |
| Provider detail and shared consumers | Viewer/browser acceptance | Hover explains ownership and usage; expansion preserves one provider with several incoming references |
| Unknown/older-run provenance | Permanent consumer guard plus copy review | No fabricated provider, ownership or source link; old immutable facts stay readable |
| Ownership meaning and visual clarity | Reviewer judgement on sample and private map | Provider structure is understandable without confusing consumers with containers |

Use synthetic paths under the test scratch directory: a project module, a real-shaped Engine ThirdParty module/plugin,
an outside-Engine exported module, SDK/compiler roots, equal header basenames, two external bases and a shared provider.
Use recorded native facts first; a native compiler test must separately establish that relevant declarations/relations
reach normalization. Passing normalization tests alone does not prove compiler coverage or new live-map behavior.

### Green evidence

- `python -m unittest discover -s tests -p test_native_symbols.py`: normalization guards; native tests require the
  documented optional LLVM environment. Record actual passes and skips separately.
- `python -m unittest discover -s tests -p test_unreal_graph.py`: structural/module ownership and first-hop boundaries.
- `python -m unittest discover -s tests -p test_map_index.py`: compact/read-index identity and exact payload retention.
- `node --test tests/viewer.test.cjs tests/universe.test.cjs tests/references.test.cjs tests/traces.test.cjs`:
  generic containment, disjoint counts, configuration context and bounded inspection.
- Existing `tests/viewer.browser.js` and `tests/traces.browser.js`, extended only for the new evidenced provider cases:
  trusted zoom/hover/exact follow, multiple consumers, external coverage, themes and narrow screens.
- Existing `tests/viewer.performance.js` on matched scenes: record p95/max, renderer cardinality and memory behavior;
  reject repeatable materially worse latency. Compare saved-layout files byte-for-byte around extraction, browsing,
  reload and server restart. Do not drag/reset private pins for acceptance.
- A selected real-project path proves the provider/header/symbol correspondence in the newly published run. Keep
  identifying names, counts, timings, screenshots and compiler paths in ignored/private evidence locations.
- Documentation links, ASCII, syntax, privacy patterns and final diff review. Whole Python acceptance only after the
  focused adapter/index gates are green; no full private extraction as a discovery loop.

## Documentation plan

- **Authoritative owners:** update [Unreal profile](../docs/architecture/unreal-profile.md) for provider evidence,
  normalization and extraction limits; [graph model](../docs/architecture/graph-model.md) for generic boundary,
  exact-provenance and inspection semantics.
- **Other affected statements:** [composition](../docs/architecture/structure.md#composition) and README usage only
  where the implemented contract changes them. Shapes belong to schema, not copied documentation tables.
- **Router/TOC:** reuse existing owners and their routes. Keep `todo/README.md` lifecycle-only.
- Stable docs, code, comments, schemas and tests must not refer back to this todo.

## Rollout and rollback

Publish only through the existing validated-run mechanism, preserving the last good run on failure. Do not edit a
published graph or disposable SQLite database in place. Existing runs remain readable without new provenance. Rollback
changes the selected run/presentation, not user layouts or analysed-project files.

## Completion criteria

- The reviewed implementation retains D1-D3 and proves provider containment from actual source/build evidence.
- Operators can distinguish project, UE-supplied and other external dependencies and inspect exact target provenance.
- Distinct collapsed external semantic relations remain available through canonical data and paged inspection.
- Native and module-only paths, publication refusal, existing pins, generic profiles and browser behavior are verified.
- Stable documentation owns the accepted facts, privacy checks pass and this transient task can be removed.

## Review record

### 2026-11-09 - Ownership investigation

- **Trigger:** D1; the operator requested owner-relative presentation of external dependencies.
- **Finding:** blanket UE reparenting contradicts the normalizer's external fallback. A synthetic boundary diagnostic
  also demonstrated lost external relation identity, making provenance preservation necessary before richer grouping.
- **Scope:** only this investigation todo is added; prior viewer implementation changes remain untouched.
- **Verification:** source/consumer inspection and the synthetic normalization diagnostic. No native extraction,
  modified published run, implementation acceptance or new visual behavior is claimed.
- **Authority:** D1-D3 recorded; A1-A3 remain reviewable assumptions.
