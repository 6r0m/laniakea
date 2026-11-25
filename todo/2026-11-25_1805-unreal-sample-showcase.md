# Unreal sample architecture showcase

**Status:** REVIEW REQUIRED  
**Scope:** Existing synthetic Unreal project, its evaluated fixture, and a public walkthrough  
**Stable documentation owner:** Proposed `docs/sample-showcase.md`

## Contents

- [Goal](#goal) and [authority register](#authority-register)
- [Non-goals](#non-goals), [evidence](#verified-evidence) and [current architecture](#current-architecture-and-source-of-truth)
- [Capability gap](#problem-and-root-cause), [decision](#decision) and [invariants](#required-invariants)
- [Implementation tasks](#implementation-tasks) and [verification plan](#test-first-and-verification-plan)
- [Documentation](#documentation-plan), [rollout](#rollout-and-rollback), [completion](#completion-criteria) and [review record](#review-record)

## Goal

Give a first-time user one small Unreal C++ project they can build, map and understand. The walkthrough starts with a healthy
architecture, then lets the user trace cross-branch dependencies, distinguish reciprocal references from a real build cycle,
inspect policy violations and source duplication, and see how findings and coverage change after an edit. Each stop should
ask a question the user can answer from evidence in the viewer and point to the source behind that answer.

## Authority register

### Operator decisions

- **D1** Investigate the change and consider the supplied reviewer feedback using `investigate-change`.
  - Effect: Produce one implementation TODO for review. Repository implementation requires a subsequent instruction.
  - Reason: Not stated.
  - Date/source: 2026-11-25 operator request.
- **D2** Improve the current Unreal sample so it stays simple and shows Laniakea's capabilities, including cross dependencies
  and what it can expose in a flawed architecture.
  - Effect: Extend the existing project and use deliberate, observable examples to exercise the supported product workflows.
  - Reason: Give users a comprehensive demonstration they can understand.
  - Date/source: 2026-11-25 operator request.

### Operator gates

- **Q1 [OPEN - BLOCKING]** Which license should apply to the expanded sample, and does the operator have and authorize any
  rights needed to change existing sample source headers? This gates adding or relicensing sample source intended for public
  distribution. The existing tool license is outside this change.

### Working assumptions

- **A1 [ACTIVE]** An original relay-scoring scenario gives the sample a coherent purpose with no map, assets or playable loop.
- **A2 [ACTIVE]** One HUD module and one isolated legacy plugin with two modules are enough to tell the main story.
- **A3 [ACTIVE]** A short public preview plus the documented local build serves readers without Unreal. An interactive
  prebuilt download can wait for a supported distribution workflow.
- **A4 [ACTIVE]** The current 5.8 association is the first environment to verify. Real build, native indexing and CPD
  acceptance depend on their actual prerequisites and observed results.
- **A5 [ACTIVE]** A genuine unsupported native access note may be difficult to produce in a clean Unreal build. Try a small
  sample reproduction first. A labelled synthetic fixture can explain the check if the operator accepts that coverage gap.

## Non-goals

- A second sample project, a playable game, a content pack, or copied Lyra code or assets.
- New viewer rules, graph schema, check provider, replay importer or sample-specific styling.
- Blueprint or runtime tracing, dead-code detection, semantic clone detection, or an overall architecture score.

## Verified evidence

### Verified facts

- [SampleProject](../sample/SampleProject/SampleProject.uproject) associates with UE 5.8 and already includes runtime and
  Editor modules. `SampleDisabled` supplies an out-of-target example. [The current guide](../docs/guide.md#trace-a-dependency-to-its-cause)
  already walks `SampleGameplay -> SampleCore` through its rule and native call. Retain that working path.
- [`tests/support.py`](../tests/support.py) shares the sample and recorded export across tests. The real-engine suite
  compares exact structural edges with [the recorded fixture](../fixtures/sample.ubt.json), tests a removed dependency
  including its `folder:Sample` roll-up, and checks project writes. [`tests/record_fixture.py`](../tests/record_fixture.py)
  obtains UBT output on a disposable copy, prunes it and tokenizes roots. [Engine tests](../tests/test_engine_integration.py)
- Real build cycles use evaluated public/private module edges. Policy context and selectors control which recorded evidence
  becomes a violation. Native unsupported access and strict token matches can be Review candidates. An include-only static
  call or incomplete access closure stays unverified. [Review](../docs/architecture/review.md), [Unreal access analysis](../laniakea/unreal/dependency_access.py)
- The viewer groups canonical references at visible endpoints, and its trace code detects reciprocal visible wires.
  The Review evaluator checks canonical module adjacency. These are different levels of evidence. [Viewer trace](../viewer/map.js), [Review evaluator](../laniakea/review.py)
- The viewer opens a locally registered run in saved-map mode and reads the relevant project files for authorized source
  previews. A fresh run for native depth requires a usable successful Unreal build receipt. [CLI](../laniakea/cli.py), [User guide](../docs/guide.md#open-a-project), [Preview checks](../tests/test_source_preview.py)
- Local engine resolution succeeded for the current sample. Sixty fixture-based tests passed across graph, Review,
  dependency access, preview, privacy and docs. Actual Unreal builds, native extraction, CPD and browser capture were outside
  this investigation's checks.

### Inferences

- Preserving the existing names, paths and relationships avoids reworking established contracts. Additions still change
  the fixture's evaluated edge set, so use the current recorder and re-run the comparisons.
- A two-way signal between top-level branches is a useful first lesson. It can guide a user to one configured direction
  violation, while an isolated pair can demonstrate what qualifies as a real module cycle.

### Assumptions and unverified areas

- Epic documents `CircularlyReferencedDependentModules` for legacy use. A buildable positive with the selected Unreal
  toolchain and genuine recorded edges still needs proof. The same applies to A5. [Epic module properties](https://dev.epicgames.com/documentation/unreal-engine/module-properties-in-unreal-engine)
- The sample currently uses AGPL headers. The reviewer proposes MIT for a new independent sample. The EULA places conditions
  on combining licensed technology with certain other licenses. The exact distribution and licensing choice for the expanded
  project remains Q1. [Current sample rules](../sample/SampleProject/Source/SampleProject/SampleProject.Build.cs), [Unreal Engine EULA](https://www.unrealengine.com/eula/unreal)

### Refuted

- `up --no-watch` cannot import the proposed downloadable snapshot. It opens an already registered local target, and the
  tracked UBT export is a test input. Neither provides a public interactive replay workflow. [CLI](../laniakea/cli.py), [Recorded fixture consumer](../tests/support.py)
- Reciprocal overview wires alone cannot establish a circular module dependency. Folder roll-ups can combine edges from
  different module pairs. Review proves a build cycle from the underlying directed relations. [Unreal graph projection](../laniakea/unreal/graph.py), [Review adapter](../laniakea/unreal/review.py)
- In-place additions already fall inside the existing sample tree scanned for absolute paths. A second path scanner adds no
  coverage for that tree. Tracked binary, generated-output and licensing checks still require separate evidence. [Privacy test](../tests/test_privacy.py)

## Current architecture and source of truth

Original `.uproject`, `.uplugin`, target rules and C++ live below `sample/SampleProject`. UBT evaluates the build context.
The Unreal profile owns graph and optional source observations, and publishes through the existing pipeline and workspace.
Review interprets the selected run and its local policy. Viewer exploration and source preview use that run's canonical
references and validated evidence. The recorded fixture tests reproducibility of the evaluated structure.
[Unreal profile](../docs/architecture/unreal-profile.md), [Architecture index](../docs/architecture/README.md), [Review policy](../docs/architecture/review.md#policy)

## Problem and root cause

The current example teaches one short dependency chain. It lacks a connected architecture exercise that shows how to derive a
finding from evidence, tell healthy and unhealthy patterns apart, and see what improves or becomes unknown when inputs change.
The missing material belongs in sample source, scoped policy and a walkthrough. The existing analysis and viewer contracts
cover those operations.

## Decision

Extend D2 in place. Keep Core, Gameplay and Editor under the existing `Sample` folder, preserve the root project and both
target names, and keep the Experimental plugin out of target. Use A1 and A2 as the initial design.

| Direction or scope | Lesson and expected evidence |
|---|---|
| `SampleProject -> SampleGameplay -> SampleCore` | Keep the Composition-to-Gameplay private rule and Gameplay-to-Core public rule. Demonstrate an actual transitive call with a complete access path, alongside the existing healthy direct call and override. |
| `SampleGameplay -> SampleHUD -> SampleCore` | `Presentation/SampleHUD` can display Core contracts. Gameplay privately importing HUD formatting exposes a configured forbidden direction. At folder level `Sample` and `Presentation` have reciprocal arrows. Exact rows show different module pairs, and there is no build cycle through these three modules. |
| `SampleLegacySession <-> SampleLegacyStats` | Two runtime modules in one isolated legacy plugin, with genuine evaluated build edges in both directions. Show the default candidate and then the violation under an explicit acyclic policy. Check the actual builds before making this a walkthrough stop. |
| Gameplay and HUD source | Demonstrate real strict duplication with a meaningful copied scoring/display normalizer and a changed-token control. Compare both matching ranges, then change one copy and regenerate. |
| Editor, Game, Experimental and Engine | Show selected target context, Editor-only membership, excluded code and the external boundary. Supply native control examples only when their types and ownership are observed. |

Gameplay-to-HUD is deliberately wrong according to the example policy. A safe correction on a disposable copy removes the
upward module and descriptor dependency after moving the formatting call back to Presentation, then rechecks the evidence.
Keep the policy local to this sample's registered target and scope its rules to the documented build context and exact module
IDs. Test default behavior before installing it.

Use the existing processor hierarchy and shared value types for C++ navigation. Add a reopened namespace, a small reflected
Unreal type, and a named function reference next to a direct call where the relay code naturally needs them. Prefer one useful
example per recorded relationship. Compare a self-recursive call with the legacy module cycle and verify which targets and
symbols the analyzer actually records. [Native symbol tests](../tests/test_native_symbols.py)

### Premise / KISS gate

The existing Unreal profile, workspace and viewer already own analysis, publication and navigation. Reuse them end to end.
This adds original sample source, a sample policy and a guided tour, with no new service, port, format or load path. The
capability given up for this delivery is a prebuilt interactive map for someone without Unreal. A3 gives that reader a static
preview and gives installed users the supported, reproducible route.

### Alternatives considered

- **Separate Relay Arena project.** Preserves exact fixture content and gives the showcase independent size and licensing
  boundaries. It duplicates the sample entry point and departs from D2. Revisit only if an operator decision changes scope.
- **Expanded in-place project with interactive replay.** Could make onboarding independent of Unreal, but requires a
  relocatable, versioned published run, a verified local registration path, and provenance for any redistributed data.
  A3 avoids making that additional distribution problem a prerequisite for this showcase.

## Required invariants

1. Preserve existing sample identities, healthy paths, the dependency-removal sentinel and workspace/runtime contracts.
2. Each showcased claim has a real supporting rule, canonical edge, build context or current source range. Missing checks
   remain visible, and cross-branch reciprocity alone never implies a policy violation.
3. Required native and CPD runs fail visibly when prerequisites or evidence fail. The saved module map remains explorable.
4. Use only original synthetic source and sample-derived evidence. Keep Build receipts, caches, raw exports and logs local.
   No engine or private material enters tracked files or public screenshots. Keep analysis writes within existing boundaries.
5. Keep the sample legible at overview and code depth. Add a module only where an existing module cannot demonstrate a
   distinct ownership or dependency pattern.

## Implementation tasks

- [ ] Confirm Q1 and plan review. Record baseline module-map screenshots, timings, verified paths, and fixture edge IDs.
- [ ] Build the clean sample shape on a disposable copy. Extend the original project with minimal relay examples using
  existing value types, interfaces and processor paths. Confirm actual Editor and Game builds and exports before layering
  in the intentional flaws.
- [ ] Add the audited direction, legacy pair, strict clone and their clean controls. Validate exported module edges and
  successful builds. Probe A5 separately and take any unverified showcase route back to the operator before calling it covered.
- [ ] Add a sample-owned `review.rules.json` beside the sample instructions and document copying it to the viewer-displayed
  local policy path. Verify scoping for both matching and nonmatching targets. Retain the generic fixture policy and tests.
- [ ] Re-record `fixtures/sample.ubt.json` through the existing recorder. Inspect additive graph changes and sanitized paths.
  Keep existing semantic expectations and add only the focused contract checks from the verification plan.
- [ ] Write the guided tour and capture genuine public-sample views. Demonstrate motion and change adoption in the live viewer
  on the disposable sample, then present the result for operator acceptance.

## Test-first and verification plan

### Red evidence

| Case | Kind | Baseline evidence |
|---|---|---|
| Build graph and target context | Acceptance | The current project resolves its established chain and disabled plugin. Capture its actual baseline, graph extraction time and overview. The new branch, legacy pair and expected contextual rule witnesses are absent. |
| Canonical reciprocity and policy | Permanent regression guard | In the existing sample graph/Review suites, prove the expected reciprocal folder edges and their distinct module endpoints, a single intended forbidden direction, and legacy-only cycle evidence. Before sample changes, assertions fail on missing intended witnesses. Existing controls still pass. |
| Native depth and access | Acceptance | Trace the existing direct call and override. Record the proposed transitive and unsupported-access examples as absent before authoring them. Use the existing dependency-access tests for complete, include-only and incomplete cases. See `test_candidate_cycle_and_native_note_have_current_exact_witnesses` in [the synthetic Review tests](../tests/test_review.py) for the A5 fallback. |
| Strict duplication and repair | Acceptance | The existing sample has no authored matching normalization pair. Capture the baseline outcome of the proposed ranges, coverage state and current preview/Compare route. After collection and repair, record the matching ranges and their removal. |
| First guided tour and saved changes | Acceptance | Run the existing guide against the baseline. Record the stops it cannot complete, including following a cross-branch issue, interpreting coverage, using Compare and observing adoption after an edit with pins surviving. |
| Comprehension and visual quality | Reviewer-checked judgment | A user can identify which module owns a reference, what a two-way trace establishes and what the selected check can prove. Compare equivalent views and observe actual wheel, hover, inspect and return interaction. |

### Green evidence

1. Run `python -m unittest discover -s tests` and the viewer Node suites documented in [verification](../tests/README.md).
   With a resolved engine or `LANIAKEA_TEST_ENGINE`, require the real engine tests to run. Verify exact edges against the
   regenerated fixture, removal of the existing dependency on a copy, and permitted project writes. Refresh the fixture via
   `python tests/record_fixture.py --engine "$EngineRoot"` only after real rules export. Check privacy and documentation links.
2. Use a disposable copy of the public sample under `workspace/tmp/`. Set `$Project` to its `.uproject`, `$Run` to a
   separate ignored workspace, and `$EngineRoot` to the resolved root. Verify both real Win64 Development builds and
   module-only extraction. Then register local LLVM and CPD with `setup-symbols` and `setup-health` in `$Run`, following
   the [user guide](../docs/guide.md#open-a-project) and [CPD setup](../docs/guide.md#collect-source-duplication).

   ```powershell
   & "$EngineRoot/Engine/Build/BatchFiles/Build.bat" SampleProjectEditor Win64 Development "-Project=$Project" -WaitMutex
   & "$EngineRoot/Engine/Build/BatchFiles/Build.bat" SampleProject Win64 Development "-Project=$Project" -WaitMutex
   python laniakea.py --workspace "$Run" build "$Project" --engine "$EngineRoot" --name showcase-editor --target SampleProjectEditor --health off
   python laniakea.py --workspace "$Run" build "$Project" --engine "$EngineRoot" --name showcase-game --target SampleProject --health off
   python laniakea.py --workspace "$Run" build "$Project" --engine "$EngineRoot" --name showcase-editor --target SampleProjectEditor --symbols --health duplication --health-minimum-tokens 100
   python laniakea.py --workspace "$Run" up showcase-editor --no-watch --port 0
   ```

3. Inspect the actual published graph and coverage. Verify Editor membership across contexts, external and disabled
   presentation, public/private edges, ownership of native calls, type references and overrides, the selected policy's
   resolved modules, absence of extra build cycles, matching clone ranges and visibility of unavailable checks. Run
   [native/health checks](../tests/test_native_health.py) with their documented prerequisites when available. Report any skip.
4. Use the real loopback viewer to run the following tour and compare against the red evidence. Use applicable
   [browser checks and performance probes](../tests/README.md#browser-acceptance). Record module extraction, native/CPD
   timing and saved-map startup on the same machine, plus wheel responsiveness and pin retention against the baseline.

   | Stop | What the operator should be able to do |
   |---|---|
   | Read the galaxy | Explore architectural families, external boundaries, target configuration and out-of-target source. Wheel into depth, follow breadcrumbs back, find a named function by search, and confirm saved positions after reload. |
   | Follow and inspect | Hover both directions on the cross-branch connection, watch the directional flow, inspect a named pair, filter and follow exact references to rules, declarations and a native call. Check two directions against canonical rows, including the legacy build pair. |
   | Read findings | Observe default candidates, then enable the sample policy. Find the intended red violations, inspect witnesses and the affected star, acknowledge and reopen a finding, and check policy availability on the other target. |
   | Read and compare source | Follow the healthy public API into its private implementation. Open both recorded clone ranges through Compare and verify current highlights. Demonstrate the stale-source state after the edit and the corrected findings after regeneration. |
   | Observe a change | Restart the disposable viewer in normal watch mode. Capture the changed-input summary, recheck enabled options and adopt the new run. Rebuild Unreal first when a native edit invalidates the usable build evidence. Prove removed edges/findings disappear and surviving focus, filters and pins persist. Contrast module-only availability with the complete run. |
   | Check presentation modes | Show overview and detailed captures in light and dark, inspect at narrow width, and check motion under reduced-motion preference. Capture actual hover and wheel interaction for acceptance. |

## Documentation plan

- **Authoritative stable owner** `docs/sample-showcase.md` for the fictional architecture, normal build route, expected
  findings and controls, prerequisites and coverage limits, explained alongside the sample policy.
- **Router** Add the walkthrough to [the docs index](../docs/README.md) and surface the route from the root README. Keep
  general instructions and contracts in [the guide](../docs/guide.md), the Unreal profile and Review docs.
- Use the current run path and real observed evidence for all examples. Any screenshots or recording use synthetic sample
  source only. Keep raw outputs local and stable docs independent of task files.

## Rollout and rollback

Package source, the matching tokenized fixture and the walkthrough as one local change. The sample rules opt in for one
target. Keep rechecks and example repairs in disposable state, so trying the tour needs no changes to another registered
target. Any later rollback should restore the matched source and fixture together.

## Completion criteria

- The existing sample builds in both documented contexts and its real published map supports the tour. Required native and
  CPD runs show measured coverage. Any fallback for A5 or other missing positive is explicitly accepted and labelled.
- The evidence distinguishes a clean transitive call, a forbidden direction, reciprocal aggregate wires, a real legacy
  build cycle and genuine strict clones. The tour includes a reproducible correction and a clean control for each finding it claims.
- Existing tests and new focused guards pass. Source, fixture, docs and screenshots pass privacy and licensing review.
  The operator sees the running result and approves the educational flow, appearance and interaction before DONE.

## Review record

### 2026-11-25 - Reviewer proposal evaluated against the repository

- Retained the original relay domain, real Unreal and source evidence, scoped policy, clean controls, walkthrough and
  operator acceptance. The separate project and module-count target are reviewer preferences. D2 and the existing sample
  contracts favor the smaller in-place design. An interactive replay and native unsupported access remain unverified.
- Targeted graph, Review, dependency access, source preview, privacy and documentation run passed 60 tests. Engine resolution
  succeeded. D1 and D2 recorded, Q1 open.
