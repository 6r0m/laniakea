# Unreal sample architecture showcase

**Status:** IMPLEMENTED - OPERATOR VISUAL ACCEPTANCE PENDING

**Scope:** Existing synthetic Unreal project, its evaluated fixture, and a public walkthrough  
**Stable documentation owner:** [Unreal sample walkthrough](../sample/SampleProject/docs/walkthrough.md)

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
- **D3** Evaluate the latest reviewer feedback and implement valid changes within the approved scope.
  - Effect: Authorizes local implementation work consistent with D2 and the open gates.
  - Reason: Fix issues that affect functionality or future scalability.
  - Date/source: 2026-11-25 operator follow-up.
- **D4** Use MIT for the Unreal sample.
  - Effect: License the original source in `sample/SampleProject` under MIT. The Laniakea tool stays AGPL-3.0-or-later.
  - Reason: Not stated.
  - Date/source: 2026-11-25 operator approval.
- **D5** Enable checks in the sample's normal workflow, add depth to its first layer and a complex plugin, and explain
  the demonstration purpose in a sample README.
  - Effect: Expand the in-place sample and its walkthrough with intentional, traceable module relationships.
  - Reason: Show what Laniakea can reveal in a richer map.
  - Date/source: 2026-11-25 operator visual feedback.
- **D6** Connect Experimental and make the first-layer dependency web denser using the fictional sample.
  - Effect: Add a real cross-branch experiment. All source, output and captures use public sample material only.
  - Reason: Demonstrate a more representative dependency map and keep public material independent of private projects.
  - Date/source: 2026-11-25 operator visual feedback.
- **D7** Keep generated Unreal output out of Git at the sample boundary and route the walkthrough through the sample owner.
  - Effect: Use sample-local ignore rules, a source-only copy for the tour and fixture recorder, and sample-owned documents.
  - Reason: Close the public repository and onboarding gaps found in the architecture review.
  - Date/source: 2026-11-25 operator follow-up.

### Operator gates

- **Q1 [CLOSED by D4]** Which license should apply to the expanded sample, and does the operator have and authorize any
  rights needed to change existing sample source headers? This gates adding or relicensing sample source intended for public
  distribution. The existing tool license is outside this change.

### Working assumptions

- **A1 [ACTIVE]** An original relay-scoring scenario gives the sample a coherent purpose with no map, assets or playable loop.
- **A2 [RESOLVED by D5]** One HUD module and one isolated legacy plugin with two modules are enough to tell the main story.
- **A3 [ACTIVE]** A short public preview plus the documented local build serves readers without Unreal. An interactive
  prebuilt download can wait for a supported distribution workflow.
- **A4 [ACTIVE]** The current 5.8 association is the first environment to verify. Real build, native indexing and CPD
  acceptance depend on their actual prerequisites and observed results.
- **A5 [VERIFIED]** A genuine unsupported native access note may be difficult to produce in a clean Unreal build. Try a small
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

- Epic documents `CircularlyReferencedDependentModules` for legacy use. The shipped sample has built with the genuine
  two-module cycle in both Win64 Development targets. [Epic module properties](https://dev.epicgames.com/documentation/unreal-engine/module-properties-in-unreal-engine)
- D4 scopes the current sample's MIT grant to original authored content. Keep Epic technology outside the sample distribution.
  [Sample license](../sample/SampleProject/LICENSE), [Unreal Engine EULA](https://www.unrealengine.com/eula/unreal)

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

Extend D2, D5 and D6 in place. Keep Core, Gameplay and Editor under the existing `Sample` folder and preserve the root
project and both target names. Keep the disabled plugin under Experimental/Off and add an active scoring trial alongside it.
Add Match and Telemetry neighborhoods. The Match plugin owns a workflow across coordination, qualification and replay
modules. The normal sample route uses Auto checks
through the existing CLI and monitor. The initial walkthrough installs the local teaching policy for the new target.

| Direction or scope | Lesson and expected evidence |
|---|---|
| `SampleProject -> SampleGameplay -> SampleCore` | Keep the Composition-to-Gameplay private rule and Gameplay-to-Core public rule. Demonstrate an actual transitive call with a complete access path, alongside the existing healthy direct call and override. |
| `SampleGameplay -> SampleHUD -> SampleCore` | `Presentation/SampleHUD` can display Core contracts. Gameplay privately importing HUD formatting exposes a configured forbidden direction. At folder level `Sample` and `Presentation` have reciprocal arrows. Exact rows show different module pairs, and there is no build cycle through these three modules. |
| `SampleLegacySession <-> SampleLegacyStats` | Two runtime modules in one isolated legacy plugin, with genuine evaluated build edges in both directions. Show the default candidate and then the violation under an explicit acyclic policy. Check the actual builds before making this a walkthrough stop. |
| Gameplay and HUD source | Demonstrate real strict duplication with a meaningful copied scoring/display normalizer and a changed-token control. Compare both matching ranges, then change one copy and regenerate. |
| Editor, Game, Experimental and Engine | Show selected target context, Editor-only membership, excluded code and the external boundary. Supply native control examples only when their types and ownership are observed. |
| `Match -> Sample`, `Match -> Telemetry`, `Telemetry -> Sample` | Round closure calls scoring, qualification and replay through distinct modules. Replay crosses a second top-level boundary for a metric derived from the shared round input. The chain stays acyclic. |
| `Sample -> Experimental`, `Experimental -> Sample`, `Experimental -> Match`, `Experimental -> Telemetry` | Editor compares a streak trial that consumes the match baseline, gameplay scoring and telemetry. Folder reciprocity groups distinct module pairs. The disabled sample remains visible below Off. |

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

- [x] Confirm Q1 and plan review. Record baseline module-map screenshots, timings, verified paths, and fixture edge IDs.
- [x] Build the clean sample shape on a disposable copy. Extend the original project with minimal relay examples using
  existing value types, interfaces and processor paths. Confirm actual Editor and Game builds and exports before layering
  in the intentional flaws.
- [x] Add the audited direction, legacy pair, strict clone and their clean controls. Validate exported module edges and
  successful builds. Probe A5 separately and take any unverified showcase route back to the operator before calling it covered.
- [x] Add a sample-owned `review.rules.json` beside the sample instructions and document copying it to the viewer-displayed
  local policy path. Verify scoping for both matching and nonmatching targets. Retain the generic fixture policy and tests.
- [x] Re-record `fixtures/sample.ubt.json` through the existing recorder. Inspect additive graph changes and sanitized paths.
  Keep existing semantic expectations and add only the focused contract checks from the verification plan.
- [x] Write the guided tour, capture genuine public-sample views, and verify wheel interaction and a repaired publication.
- [ ] Present the result for operator visual acceptance.

## Test-first and verification plan

### Red evidence

| Case | Kind | Baseline evidence |
|---|---|---|
| Build graph and target context | Acceptance | The current project resolves its established chain and disabled plugin. Capture its actual baseline, graph extraction time and overview. The new branch, legacy pair and expected contextual rule witnesses are absent. |
| Canonical reciprocity and policy | Permanent regression guard | In the existing sample graph/Review suites, prove the expected reciprocal folder edges and their distinct module endpoints, a single intended forbidden direction, and legacy-only cycle evidence. Before sample changes, assertions fail on missing intended witnesses. Existing controls still pass. |
| Native depth and access | Acceptance | Trace the existing direct call and override. Record the proposed transitive and unsupported-access examples as absent before authoring them. Use the existing dependency-access tests for complete, include-only and incomplete cases. See `test_candidate_cycle_and_native_note_have_current_exact_witnesses` in [the synthetic Review tests](../tests/test_review.py) for the A5 fallback. |
| Strict duplication and repair | Acceptance | The existing sample has no authored matching normalization pair. Capture the baseline outcome of the proposed ranges, coverage state and current preview/Compare route. After collection and repair, record the matching ranges and their removal. |
| First guided tour and saved changes | Acceptance | Run the existing guide against the baseline. Record the stops it cannot complete, including following a cross-branch issue, interpreting coverage, using Compare and observing adoption after an edit with pins surviving. |
| Comprehension and visual quality | Reviewer-checked judgment | Compare equivalent overview and expanded views. The current overview has four visible stars and four wires in the captured Editor view. In the showcase, a user can recognize distinct architectural responsibilities at a glance, follow one wire through intermediate ownership and source layers to a real call, and tell the reciprocal overview trace from the legacy cycle. Observe actual wheel, hover, inspect and return interaction. |

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

   For D5, compare equivalent overview views, then expand Match and verify its real module and call relationships through
   Telemetry. Open a fresh sample with ordinary commands and verify the Auto modes, scoped policy and acquired evidence.

## Documentation plan

- **Authoritative stable owner** `sample/SampleProject/docs/walkthrough.md` for the fictional architecture, normal build route, expected
  findings and controls, prerequisites and coverage limits, explained alongside the sample policy.
- **Router** Route the root README through [sample](../sample/README.md), the project and its local documentation.
  Keep general instructions and contracts in [the guide](../docs/guide.md), the Unreal profile and Review docs.
- Use the current run path and real observed evidence for all examples. Any screenshots or recording use synthetic sample
  source only. Keep raw outputs local and stable docs independent of task files.

## Rollout and rollback

Package source, the matching tokenized fixture and the walkthrough as one local change. The sample rules opt in for one
target. Keep rechecks and example repairs in disposable state, so trying the tour needs no changes to another registered
target. Any later rollback should restore the matched source and fixture together.

## Completion criteria

- The existing sample builds in both documented contexts and its real published map supports the tour. Required native and
  CPD runs show measured coverage. Any fallback for A5 or other missing positive is explicitly accepted and labelled.
- The overview and expanded views make the ownership and cross-branch story clear. The public preview and walkthrough use
  the real viewer and give users enough detail to repeat the tour.
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

### 2026-11-25 - Implementation review and baseline

- The reviewer accepted the in-place design and proposed a stronger educational and visual check. The acceptance matrix
  now tests whether people can read architectural neighborhoods and follow real source hierarchies. A2 remains the starting
  design. Q1 remains open. The reviewer's MIT recommendation supplies no relicensing authority.
- A module-only `SampleProjectEditor` baseline published through `laniakea.py build --health off` on a disposable copy in
  7.44 seconds of pipeline time. All 26 real structural edge IDs matched the recorded fixture, including the public Gameplay
  and private Editor edges to Core. A 1440 x 900 light-theme screenshot of the real saved-map viewer captured four visible
  stars and four wires. Native and duplication evidence were outside that baseline run.
- `python -B -m unittest test_engine_integration test_unreal_graph test_review test_dependency_access test_source_preview
  test_privacy test_documentation` ran with `tests` on `PYTHONPATH`. The 60 fixture-based checks passed. The three engine tests
  hit UBT's conflicting-instance result during the parallel attempt and again on a sequential run while an Editor process
  was active. The standalone export verifies baseline parity. The engine suite still needs a contention-free run.
- D3 recorded. Q1 gates sample source, fixture regeneration, and the final real-build and visual acceptance sequence.

### 2026-11-25 - Operator license decision and regression guard

- D4 recorded and Q1 closed. The new focused showcase graph test failed against the original sample because both expected
  cross-folder rollups and the legacy cycle candidate were absent.

### 2026-11-25 - Implemented and exercised the relay showcase

- Built the clean and intentional-issue projects on disposable copies with Win64 Development Editor and Game targets.
  The first clean Editor attempt found unresolved Core DLL imports through the public compile path. The corrected sample
  uses an inline Core helper across that path and constructs the reflected round in Gameplay. Both corrected targets link.
- Recorded the Editor graph with `python -B tests/record_fixture.py --engine <engine-root>`. The exact reciprocity and
  policy test passed. The real outputs identify distinct module pairs behind reciprocal folder arrows and the legacy-only
  build cycle. Game leaves `SampleEditor` outside the target.
- Real `--symbols --health duplication --health-minimum-tokens 100` runs recorded nine compiler units with zero errors.
  The final Editor run proved the supported inline call and named function reference, forbidden-direction call, bounded
  recursion and one genuine unsupported-access candidate from the raw Legacy include path. CPD found a 147-token clone in
  the scoring and display implementations. Opt-in Editor policy reports two violations and two candidates.
- `python -B -m unittest discover -s tests` passed all 353 tests with the installed engine, LLVM, CPD and clangd-indexer.
  The first broad run exposed an exact overview expectation and two CPD test assertions that counted all project clones.
  The revised checks preserve exact scope and assert the test snippets by their own evidence. All 232 Node tests passed.
- Browser acceptance confirmed trusted reciprocal hover, wheel zoom, two-pane Compare and return to the map. The
  [walkthrough](../sample/SampleProject/docs/walkthrough.md) includes a public-sample capture. Compare marked only the edited scoring
  file stale after the repair. The watched project then published a new native and CPD run where the Gameplay-to-HUD
  build edge, descriptor reference and function disappeared. The legacy cycle, unsupported access and duplication findings
  survived. Same-tab pin retention in this particular run was not observed. The existing position and live-adoption tests
  passed. Operator acceptance remains pending.

### 2026-11-25 - D5 default checks and deeper Match workflow

- D5 added. The original published sample lacked a Match neighborhood. The new focused graph guard failed on that
  missing plugin, then passed with the regenerated UBT fixture. Match and Telemetry appear at the first level. The Match
  plugin exposes coordination, qualification and replay as three real modules.
- Both Win64 Development targets built on the disposable sample. A fresh `build` without check overrides recorded CPD
  with both optional modes set to Auto. Normal `up` started native indexing without a manual check selection and the
  viewer reached three recorded checks. The installed sample policy produced two violations and two candidates. Recorded
  calls prove `PreviewMatchReplay -> CloseRound`, the three outgoing `CloseRound` calls and `Signature -> MeasureRound`.
- The [sample README](../sample/SampleProject/README.md) gives the teaching intent. The [walkthrough](../sample/SampleProject/docs/walkthrough.md)
  documents the normal startup with policy and includes actual overview and plugin captures. The default browser check
  observed eight overview stars and wheel zoom into the expanded Match plugin.
- All 354 Python tests passed with the engine and optional LLVM, CPD and clangd-indexer inputs. Visual acceptance remains
  open for the updated captures.

### 2026-11-25 - D6 connected Experimental

- The regression guard failed because Experimental was entirely out of target. Both Win64 Development targets then built
  with the active streak trial. The guard passed against a freshly recorded export. Its Off subgroup and disabled module
  remain out of target.
- The default analysis recorded 14 compiler units without errors. Verified calls from Project and Editor into the trial
  and from the trial to Match, Gameplay scoring and Telemetry. The normal browser showed all three recorded checks, four
  Review findings, and 204 overview references compared with 173 in the preceding capture. The walkthrough uses updated
  captures of the actual fictional sample.
- All 355 Python tests and 232 viewer tests passed. The first Python suite run hit a Windows access denial while the
  monitor test renamed its temporary run. The isolated test and full suite rerun passed. Visual acceptance remains open.

### 2026-11-25 - D7 sample publication and documentation boundaries

- Before the fix, Git missed nested plugin outputs, the sample copy retained an ignored build artifact, and the link checker
  missed a broken sample-owned image link. All three focused regressions now pass. The sample copy command also refuses
  destinations inside the checkout that Git would include.
- The public command, fixture recorder and regression setup share the authored sample copy. The walkthrough and both
  captures follow the sample README chain and their links resolve inside the copy. The documentation explains how the
  viewer's startup target list affects the Editor and Game comparison.
- Real Editor and Game exports confirmed the target difference, a viewer restart exposed both maps, and the fixture recorder
  reproduced the existing export byte for byte. All 359 Python tests and 232 viewer tests passed. Standalone documentation
  and privacy checks passed with the updated test support imports.
