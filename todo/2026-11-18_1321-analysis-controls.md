# Automatic checks and clear exploration controls

**Status:** PARTIAL - implementation verified; final real-project runtime gate pending
**Scope:** first-opening analysis, existing monitor controls, progress and viewer information hierarchy  
**Stable owners:** [monitoring](../docs/architecture/monitoring.md), [viewer](../docs/architecture/viewer.md),
[Review](../docs/architecture/review.md), [guide](../docs/guide.md)

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

A developer opens an added project, sees useful checks start automatically, understands their coverage and progress, and can
skip or stop them without learning extraction flags. Analysis, findings and map controls form clear, stable visual blocks.

## Authority register

### Operator decisions

- **D1:** Make checking the project central to the ordinary user experience, with explanations of each check and its process.
  - Effect: source-check availability and actions cannot remain buried in policy diagnostics or require expert flags.
  - Reason: helping users understand their project is Laniakea's core purpose.
  - Date/source: operator request, 2026-11-18.
- **D2:** On a new project's first opening, start available source checks automatically in the background, including slower
  C++ indexing, and provide Skip/Stop controls.
  - Effect: supersedes the earlier native-opt-in default for this new-project first-opening path. It does not authorize
    silently overriding historical explicit opt-outs, mandatory CLI requests or saved-only viewing.
  - Reason: not stated separately from D1.
  - Date/source: explicit operator answer to the first-opening behavior question, 2026-11-18.
- **D3:** Review the control window with design skills and organize it into intuitive logical blocks.
  - Effect: address the demonstrated toolbar hierarchy and discoverability gaps together with check controls.
  - Reason: simple users should understand the application.
  - Date/source: operator request, 2026-11-18.

- **D4:** Implement this plan and apply valid reviewer corrections.
  - Effect: implementation authorization includes the F1-F3 clarifications below and their acceptance tests.
  - Reason: not stated.
  - Date/source: operator implementation request, 2026-11-18.

- **D5:** Finish the code and leave the final real-project runtime gate pending.
  - Effect: deliver the verified implementation without claiming real-project native completion/adoption or archiving this task.
  - Reason: concurrent source editing prevents a stable final proof within the current walkthrough.
  - Date/source: explicit operator answer to the runtime-gate question, 2026-11-18.

### Operator gates

No operator question remains. D4 authorizes implementation, D2 owns first-opening behavior, and D5 leaves the final
real-project gate pending. Archival still requires that gate; implementation completion is not its acceptance.

### Working assumptions

- **A1 [ACTIVE]:** Reuse the existing palette, typography, galaxy, renderer and panel behavior; change information hierarchy.
- **A2 [ACTIVE]:** Use one non-modal Analysis panel, opened automatically while initial source coverage needs attention,
  and accessible thereafter through a persistent Checks button. Review remains the findings list; Inspector remains contextual.
- **A3 [ACTIVE]:** Skip for now and Stop checks pause this target for the current viewer session. They do not silently write
  a permanent opt-out. Persistent check choices apply through validated snapshot publication.
- **A4 [ACTIVE]:** Store first-opening/check-selection intent in the existing versioned extraction request, separately from
  its resolved effective recipe. Keep pending edits in the existing monitor, not a second preferences database or JSON store.
- **A5 [ACTIVE]:** Existing runs without explicit new intent retain their recorded recipe. An obvious Run recommended checks
  action resolves legacy incomplete coverage; a missing field is not consent to change an existing project's settings.

## Non-goals

- No new analyzers, PMD optimization, Engine-internal indexing, parser, renderer, service, database or task framework.
- No automatic downloads, system-wide installs or browser installation wizard. Missing optional tools remain actionable setup
  states with the existing offline setup instructions; they cannot be presented as successful checks.
- No arbitrary project import wizard, source editing or automatic code fixes. Existing build/project registration remains.
- No inferred SOLID violations, overall architecture grade, runtime/linkage proof or promise to detect every code problem.
- No layout/pin migration, review-triage migration or reopening unrelated Gate 1-3 implementations.

## Verified evidence

### Facts

1. [CLI](../laniakea/cli.py) ordinary build requests automatic CPD, while native indexing requires a flag. The saved request
   records actual symbols/health settings. [Unreal monitor recipe](../laniakea/unreal/monitor.py) reuses that request, including
   off settings; restarting or clicking Retry does not enable omitted analysis.
2. Live inspection found one evaluated cycle check, native evidence unavailable and duplication explicitly off. The actual
   recipe explained the shallow map. This is an installation-specific observation, not a claim about every target.
3. [Monitor control](../laniakea/server.py) permits only activate/pause/retry; the browser has no check-selection operation.
   [Status](../laniakea/monitor.py) reports scheduler state, not an operator-facing checklist or detailed source-check progress.
4. [Acquisition schema](../schema/graph.v1.schema.json) is currently CPD-shaped, including required token fields. Native
   acquisition cannot reuse it by fabricating token values. [Schema validation](../laniakea/schema.py) deliberately rejects
   unsupported keywords; schema evolution must remain executable by that validator.
5. [Compiler jobs](../laniakea/unreal/compiler.py) already record completed-unit progress. Its full progress document contains
   job details and is not an appropriate raw status response. CPD has no proved trustworthy overall percentage.
6. The live browser walkthrough covered the desktop toolbar, Live disclosure, Review availability, compact and narrow sizes.
   Primary and secondary tasks share one scrolling row. Compact widths hide reset/selection/Inspector controls; narrow widths
   also hide Review and Fit. The Live disclosure says freshness is good while source checking is disabled, with no enable action.
   Review explains that absence only after opening its policy disclosure.
7. [InspectorTabs](../viewer/inspector.js), native buttons/disclosures and current panels already cover keyboard/focus behavior.
   The actual dark/light colors and type scale are owned by [app.css](../viewer/app.css); no design dependency is necessary.

Private runtime evidence and responsive measurements: [browser observations](../workspace/tmp/analysis-controls-investigation/ui.json).
Screenshots of the real project remain outside this clone in ignored scratch; none belongs in public fixtures or this plan.

### Judgment and limits

- The current controls are functional, but their priority does not match D1-D3. This is a product/UX judgment supported by
  the walkthrough, not a claim established by a pixel count or an automated usability score.
- No prototype of this proposal, new default or recipe-control path has been implemented or verified yet.
- Existing baseline: 16 CLI/monitor Python checks and eight live JavaScript checks passed. These validate current owners,
  not the proposed experience. No source extraction or real user-state mutation was requested during investigation.

## Current architecture and source of truth

| owner | responsibility retained or extended |
|---|---|
| [CLI](../laniakea/cli.py) | command options, initial registration/build intent, explicit required overrides and saved-only startup |
| [Workspace](../laniakea/workspace.py) and [schema](../schema/graph.v1.schema.json) | validated run-bound request and one publication pointer |
| [Monitor](../laniakea/monitor.py) | selected-target scheduling, requested session work, coalescing, pause/cancellation and cached status |
| [Worker](../laniakea/monitor_worker.py) / [pipeline](../laniakea/pipeline.py) | source/tool work, isolated staging, validation and publication preparation |
| [Profiles](../laniakea/profiles.py) / [Unreal](../laniakea/unreal/__init__.py) | available check descriptions, eligibility, tool/build requirements and actual extraction |
| [Server](../laniakea/server.py) | bounded same-origin controls and small status responses; no compiler work in HTTP handlers |
| [Live coordinator](../viewer/live.js) | one status poll, gesture-safe adoption and generation-bound readers |
| [Review](../viewer/review.js) | findings, exact evidence and triage; it does not acquire source evidence |
| [App](../viewer/app.js) / [markup](../viewer/index.html) / [styles](../viewer/app.css) | control grouping, Analysis presentation and existing panels |

## Problem and root cause

There is no convenient bridge from "these checks did not run" to "run them for this project." The UI primarily exposes
snapshot freshness and diagnostic availability, while requested acquisition lives in a committed recipe outside the browser.
A button alone cannot solve this: it needs a validated request to the same scheduler that already owns expensive work.
The single toolbar row also gives settings and housekeeping the same priority as analysis and discovery.

## Decision

### Premise / KISS gate

Extend Monitor/Workspace and their existing workers for D1-D2; give their status one Analysis presentation for D3. Reuse the
existing poll, source boundaries, caches, Job Object, writer lock, immutable publication and read contexts because responsive
exploration during expensive analysis and safe cancellation require them. Add no daemon, subprocess manager, global analyzer
registry, separate polling loop, settings database or second effective recipe owner. Give up a general job dashboard and
arbitrary tool installation UI: this panel controls only existing checks for the selected registered project.

### User-facing blocks

| block | visible controls and purpose |
|---|---|
| Project/navigation | Project context, selected project, Up, breadcrumbs and Find |
| Checks | Persistent Checks status and the Analysis panel: coverage, progress, choices, Stop/Skip/Run and automatic updates |
| Findings | Review count/coverage, findings list, evidence and existing triage |
| View | Browse/filters, layout, configuration markings, Fit, source arrangement and Reset layout |
| Selection | Inspector and Clear selection; existing contextual tabs and close behavior |

Keep Checks and Review visible without horizontal scrolling. Put secondary controls under View; move long topology counts
out of the action row into secondary map context. Preserve a stable row height so live counts do not move hover targets.
On narrow screens prioritize Checks, Review and View, with accessible Inspector access. Use one existing side-panel slot for
Analysis/Review/Browse at a time; do not stack competing left panels or replace the contextual right Inspector.

Illustrative layout; labels compress with width, not by hiding check failures:

```text
Laniakea   Project [Sample v]   Up   breadcrumbs             Find
Checks: incomplete   Review: 0 / limited   View v           Inspector
+---------------- Analysis ----------------+----------------------+
| Module dependencies     Done             |                      |
| C++ usage               Checking 8/20     |      galaxy          |
| Duplicated code         Waiting          |                      |
| [Stop checks]                            |                      |
| Automatic checks on source changes [on]  |                      |
+-----------------------------------------+----------------------+
```

The galaxy remains the visual focus. Retain current dark/light panel, accent, warning and violation tokens and Segoe UI type
scale. Use spacing/headings to distinguish purpose, not decorative cards or new color meanings. Acquisition failure appears
in Checks; it does not manufacture a red architecture wire. Ordinary completion is neutral, not an "architecture clean" seal.

### Explain the actual checks

| user title | short explanation | honest limit |
|---|---|---|
| Module architecture | Always collected as the map foundation; no Off control | One selected build context |
| Dependency cycles | Existing Review evaluation and configured policy; no acquisition selector | Red needs an applicable configured constraint |
| C++ usage | Records classes/functions and checks recorded calls against module access | Static compiler evidence, not complete runtime or link verification |
| Duplicated code | Finds exact repeated token sequences with source locations | Similar syntax can be intentional; does not prove a design violation |

Only optional C++ usage and duplication have Auto/On/Off selection. Foundation and Review rows show status/limitations
without implying mandatory graph collection can be disabled. Each row offers an appropriate next action. Keep provider/build IDs and detailed diagnostics in
an expandable technical section. "Needs LLVM setup" or "Not run: insufficient memory; retry when memory is available" is
clearer than a raw unavailable count. Do not imply automatic resource retry when the current policy requires explicit Retry.
Missing tools remain visible in requested coverage; never remove them from the denominator to make completion look better.

### Defaults, request and publication

1. First opening means the existing two-command route: initial build creates a valid map, may already collect foreground
   CPD, and records new-project recommended intent; first up starts remaining eligible native work. Completed CPD evidence
   is reused. Browser Skip/Stop controls subsequent monitored work, not the earlier foreground build. D2 applies to newly registered project intent. Normal up opens the saved map immediately, then the existing controller
   resolves available recommended checks in background. Before such work starts, its state is observable as queued/checking;
   Analysis opens on first use and Stop/Skip is available. Do not wait for slow checks before displaying the saved map.
2. Keep three meanings distinct: requested check policy, resolved acquisition recipe, and evidence in the currently displayed
   immutable run. Extend the existing versioned extraction request for the first, rather than overloading a false symbols
   flag or creating another settings file. Profile-owned defaults support auto/on/off intent; explicit required CLI requests
   keep their failure semantics. No frontend guessing from project names or module labels.
3. The first fast baseline may record recommended native intent without claiming native evidence exists. Where no native
   facts have yet been published, obtain the base/duplication result before native augmentation so missing or failing native
   preparation does not conceal otherwise useful results. A native augmentation failure retains that last good map.
   Never automatically replace an existing native map with a lower-detail baseline merely to show newer partial results.
4. Existing requests without new intent follow A5. Incomplete legacy coverage gets a prominent Run recommended checks action
   and an explanation of the recorded choices. Existing opt-outs and mandatory CLI options cannot be inferred away.
5. Control submissions carry the selected target and expected applied generation/settings identity. Validate check IDs/modes
   against the profile, reject stale conflicting edits and coalesce identical requests from multiple tabs under the existing
   monitor condition. A browser cannot submit arbitrary flags, paths or executables. Target browsing alone never activates it.
6. Pending user choices live in the existing controller until the validated run/request commits through latest.json. Failed or
   cancelled attempts retain the previous applied recipe; the UI must show the attempted change separately, not say Saved.
   Skip for now/Stop pauses this target for the session, cancels owned work and leaves the saved recipe unchanged. Permanent
   check choices are recorded through successful publication. A server restart discards uncommitted edits honestly.
7. Keep native/build acquisition fail-closed and automatic CPD's explicit degraded coverage semantics. For new automatic native
   attempts, retain validated input/tool/intent identity and outcome with existing owned-task/failed-run diagnostics so the
   same deterministic failure does not launch expensive analysis on every session restart. Use a bounded cache of such outcomes,
   not another preference authority; invalid/missing cache cannot be mistaken for completed analysis. Changed inputs/tools/
   intent or explicit Retry permits a new attempt. Preserve CPD's existing identical-failure reuse.
8. Evolve acquisition coverage through its current schema/validator owner without giving native outcomes fake CPD token fields
   or weakening required CPD artifact/input/tool validation. Cached results count as completed only when their guards validate.
9. Saved-only startup remains scan-free and starts no new checks. Its panel explains why running is unavailable in that mode;
   it does not silently create a monitoring lifecycle the CLI will fail to shut down. No tool downloads/install work occurs.

### Native acquisition acceptance contract

| requested situation | required result |
|---|---|
| Auto, valid local tools and usable completed-build receipt | Background native augmentation |
| Auto, missing or invalid local tools | Setup/unavailable state; base map retained |
| Auto, no usable successful-build receipt | Prerequisite unavailable; no automatic project build |
| Automatic attempt fails | Previous map retained; attempt failure separate from immutable completed evidence |
| Same inputs/tools/intent after failure and restart | Reuse failed-attempt evidence; no repeated expensive work |
| On / explicit --symbols | Existing required, fail-closed publication semantics |
| Historical symbols=False without new intent | Preserve; offer Run recommended checks |
| --no-watch | Saved-only, no automatic analysis |

### Progress and cancellation

Expose a small worker-owned phase summary through the existing Monitor status response and live poll. Reuse completed-unit
counts where real; show indeterminate progress with elapsed time where there is no truthful total. Do not scrape unbounded
logs or return the full native jobs document from an HTTP handler. Associate progress with the current target/job/generation,
so obsolete callbacks cannot update another attempt. Source and tool work stays in the contained worker.

Show one phase-appropriate action: Skip for now while queued, Stop checks while running, then Resume checks or Retry.
Do not show equivalent Skip and Stop buttons together. Reuse the existing pause/cancellation path rather than another job
stop mechanism. Stop cancels only the selected target's owned work, pauses that session and invalidates pending publication.
Use the current bounded process-tree cancellation contract; never kill an unrelated UBT process. Show Stopping until cleanup
is confirmed, then Stopped/showing previous results. Missing prerequisites, cancelled work, errors, incomplete coverage,
completed-with-findings and completed-with-no-findings are distinct states.

Review's current Recheck reevaluates rules against recorded data; present it as Refresh findings with that explanation.
It must not be confused with Run checks, which can acquire source evidence. Analysis selection never becomes a second Review
policy editor. Reuse existing close/Escape/focus behavior, and never reopen a dismissed panel on each status poll or adoption.

### Alternatives considered

- Add flags to the Live popup only: fewer UI changes, but no clear checklist, explanations or primary analysis priority.
- One Review checkbox starts everything: confuses evaluation, overlay visibility and source acquisition; rejects honest limits.
- Browser calls extraction directly: violates the single writer, responsiveness, cancellation and publication contracts.
- Replace the scheduler/settings system: adds machinery without addressing a missing control path.
- Autostart every historical target or override legacy off settings: consumes unexpected resources and violates existing intent.

## Required invariants

1. Preserve canonical graph facts, exact references and profile-specific meaning; the control panel does not invent evidence.
2. Keep caches, saved positions and triage with their existing owners. Opening or changing control panels writes no pins.
3. Last-good-map recovery, index-specific tab leases, protected reader lifetime and Review failure isolation remain intact.
4. Only the selected/explicitly activated target runs; deduplication and one owned background job avoid tab-driven duplicates.
5. Stop, Skip, stale requests, failures and publication refusal cannot claim applied settings or leak owned descendants.
6. No new source-boundary permissions, runtime network dependencies, automatic installs or writes to authored source.
7. Schema evolution accepts existing saved runs without silently manufacturing consent or coverage. Python 3.9+ remains valid.
8. Checks/Review actions remain visible at compact widths; keyboard focus, Escape, contrast and reduced motion remain supported.
9. No fake progress percentage, broad clean-project verdict or source-error marker derived solely from unavailable analysis.

## Implementation tasks

- [x] Add failing acceptance/regression cases below before production changes. Keep legacy fixtures and existing pin/triage
  baselines; use Sample fixtures for public proof and the real project only in ignored/private runtime evidence.
- [x] Extend existing request/schema/profile ownership for recommended first-opening intent, resolved recipes and meaningful
  native acquisition states. Implement and prove existing-run preservation and required-CLI behavior first.
- [x] Extend Monitor controls for requested checks, expected-generation rejection, identical-request coalescing and session
  Skip/Stop. Reuse workers, lease, contained cancellation and atomic publication. Add bounded native-failure reuse where needed.
- [x] Expose bounded current-attempt progress/capability summaries without source work on HTTP threads or a new UI poll loop.
- [x] Implement the Analysis presentation and regroup navigation, Checks, Review, View and selection actions. Explain setup,
  missing evidence and requested-versus-applied settings. Reuse existing native UI primitives and Inspector behavior.
- [ ] Verify each delivery boundary independently: request/default behavior; worker/cancellation/publication; responsive UI
  and live adoption. Do not mark the whole feature ready on fixture/unit tests alone.
- [ ] Update stable owners, run the verification matrix and complete the real first-opening/Skip/Stop/recovery walkthrough.

## Test-first and verification plan

### Red evidence

| case | evidence type | wrong behavior to reproduce before changes |
|---|---|---|
| New project with installed tools | Permanent default/scheduler guard + CLI/browser acceptance | First opening retains module-only symbols setting and never starts native checks |
| Missing/broken tools or resource refusal | Permanent coverage/refusal guard | No actionable per-check setup/resource state; zero findings can dominate unavailable source checks |
| Change checks without source edit | Permanent request/identity guard | HTTP controls cannot request a changed analysis recipe |
| Two tabs / stale form | Permanent concurrency guard | No check-setting operation with expected-generation validation/coalescing exists |
| Stop during real owned native/Java work | Browser acceptance + lifecycle guard | Existing Pause can cancel work, but exposes paused before cleanup confirmation; no explicit stopping/result-retention explanation |
| Native deterministic failure and restart | Permanent repeat-suppression guard | New automatic native path could repeat expensive failed work without a matching outcome cache |
| New native attempt fails after baseline | Permanent publication/coverage guard | Source checks must retain usable base/health evidence and never silently downgrade an existing native map |
| Progress and late callbacks | Permanent state guard | Status lacks truthful per-check progress and current-attempt discrimination |
| Compact/narrow action access | Browser acceptance | Current toolbar hides core controls behind horizontal scrolling |
| First-user explanation | Reviewer-checked judgment + walkthrough | User cannot identify what ran, why missing checks did not run and how to start/stop them without terminal flags |

Existing opt-out preservation, inactive historical browsing, required-analysis refusal and protected-state cancellation are
already green invariants. Reuse those guards; do not invent baseline failures for behavior that currently works. New request/
UI contracts need failing acceptance evidence before implementation, and changed guards must reject a relevant known-bad case.

Use existing [command](../tests/test_commands.py), [monitor](../tests/test_monitor.py),
[worker/input](../tests/test_monitor_inputs.py), [server](../tests/test_server.py),
[native/health](../tests/test_native_health.py), [owned-process](../tests/test_owned_process.py),
[live](../tests/live.test.cjs) and [browser verification](../tests/README.md) owners. The table specifies new contracts;
its unimplemented cases are not claimed failing test executions yet.

### Green evidence

- Rerun the same regressions, affected command/schema/workspace/monitor/server/native/health checks and all JavaScript tests.
  Run affected Python tests with Python 3.11 as well as current; preserve the documented 3.9 syntax/runtime boundary.
- Existing live, monitor, Review, Inspector, source/namespace and pointer browser scenarios must still pass. Add first-opening
  and change-check scenarios with real contained workers and controlled tool availability, plus stale two-tab submissions.
- At desktop, compact and narrow widths, use trusted pointer and keyboard interactions. Checks/Review are discoverable without
  scrolling the toolbar; panel changes do not fit/reset the map, move targets during hover or erase Inspector/Review drafts.
- Real approved-project walkthrough: new/default intent starts available native and CPD checks, exposes actual progress, allows
  Stop/Skip, retains the last good map on cancellation/failure, resumes safely and adopts validated results with pins/triage intact.
  Capture costs and responsiveness; use repeatable material regression as the criterion, not a speculative percentage budget.
- Prove unchanged-input cache reuse and no repeated deterministic-failure work; verify refusal paths leave protected files
  byte-identical. Tool setup, missing prerequisites and memory refusal remain explicit, never successful zero findings.
- Documentation links, ASCII, privacy and diff checks pass. Report executed versus unavailable expensive gates separately.

## Documentation plan

- [Monitoring](../docs/architecture/monitoring.md): requested/default intent, active-target rules, progress, Stop/Skip and failed
  attempt reuse. [Structure](../docs/architecture/structure.md): narrowly revise native-opt-in wording for D2's path.
- [Viewer](../docs/architecture/viewer.md): Analysis/Review/View/selection hierarchy, honest status, responsive and focus behavior.
- [Review](../docs/architecture/review.md): retain evaluation ownership and distinguish Refresh findings from acquiring evidence.
- [Guide](../docs/guide.md): a short first-use and recovery workflow. CLI owns exact setup flags; do not copy a large flag list
  or provider implementation details into each UI/document. [Verification](../tests/README.md) owns test routes.
- Existing architecture/documentation routers suffice unless a genuinely new stable owner is necessary. Keep todo/README
  lifecycle-only. No stable file, code comment or test may link to this transient task.

## Rollout and rollback

Apply new defaults only to new intent; preserve old runs/readers and opt-outs. Introduce the request boundary before exposing
UI mutations. Cancelling or reverting an attempt leaves the published run/settings unchanged. A requested settings change is
not applied until publication. Saved-only viewing remains the recovery route. The work introduces no pin or triage migration.

## Completion criteria

D1-D3 and the required invariants are demonstrated through the stated gates. A first-time developer can name the checks,
see what is running/missing, stop/skip/resume, inspect findings and adjust the view without terminal flags or hidden scrolling.
Available checks actually execute; UI copy alone is insufficient. Missing tools and evidence remain honest. Protected state,
old readers and previous recipes survive refusal/cancellation. Durable contracts are migrated, this record is archived with
real acceptance evidence, and no unrelated or operator-staged work is altered.

## Review record

### 2026-11-18 - Investigation and design pass

- D1-D3 recorded; D2 resolves the automatic-start question. A1-A5 are proposed implementation choices, not extra consent.
- Read actual request/schema, profile, worker, scheduler, HTTP and viewer owners. Inspected current Live and Review controls
  with trusted mouse input at multiple widths and reviewed rendered screenshots. No analyzer, setup or policy mutation was run.
- Verified the toolbar access and coverage/control gaps; selected existing owners rather than a replacement subsystem.
- Baseline CLI/monitor and live JavaScript checks passed. Final documentation/privacy checks concern this plan only;
  future implementation, performance and new automatic native behavior remain unverified.


### 2026-11-18 - Reviewer clarification and implementation authorization

- F1-F3 are valid. First-opening scope, mandatory foundation versus optional source checks, and native-mode refusal/reuse
  contracts are explicit above. No architecture replacement or new project import is included.
- D4 records the operator's implementation authorization. Existing saved-user-state hashes and session status were captured
  privately before work; active background analysis was paused while changing its controller/worker contract.

### 2026-11-18 - Implementation verification

- Implemented requested/default check intent, profile eligibility, bounded failed-native-attempt reuse, current-task progress
  and expected-generation controls through the existing Monitor/pipeline. No source acquisition runs on HTTP threads.
- Separated Checks, Review, View and Inspector. Read-only foundation and rule evaluation cannot be disabled as acquisitions.
  Late target responses, dirty forms, stale two-tab changes, deferred updates and degraded watches remain observable.
- Red receipts under `workspace/tmp/analysis-controls/`: default/control/browser failures reproduced before implementation;
  the progress regression rejected frozen elapsed time; legacy-build regressions rejected resetting historical choices.
- Current full non-Engine run: 314 tests, no failures, one optional legacy indexer skip, with real LLVM and CPD enabled.
  Focused follow-up covers resource explanations and negative acquisition validation. Three real-Engine tests passed.
  Python 3.11 affected checks passed; changed Python also parses with the 3.9 grammar.
- All 186 JavaScript checks passed. Thirteen isolated Chrome regression scenarios plus Analysis and Live adoption passed;
  Analysis includes trusted controls, Stop, stale-tab conflicts and draft retention. The headed agent Chrome walkthrough
  passed both themes and narrow widths. Headless Chrome owns repeatable suites; no daily-profile tab was manipulated.
- Main positions remained byte-identical and the local viewer was restarted through authenticated lifecycle commands.
- Final real-project gate remains running: default duplication collection completed and native started automatically;
  Stop retained the prior map. A deep scratch path exceeded Unreal's path limit and was replaced by a shorter ignored
  workspace. Concurrent authored-source edits are genuinely superseding native work. Completion/adoption and final costs
  remain unclaimed until that run and its safely reused replacement settle. Evidence is private in the ignored workspace.

### 2026-11-18 - Bounded implementation handoff

- D5 closes this implementation session with the final real-project runtime gate explicitly pending. The browser observer
  reached its time limit while the native scan was incomplete; no final native-completion or adoption claim is made.
  Authored-source notifications independently confirmed concurrent edits. The last good map remained available.
- Stopped disposable real/synthetic servers through their owned lifecycles and confirmed clean process exits. The normal
  viewer remains running at its documented address, with original check opt-outs and protected user stores preserved.
- All three reviewer corrections were valid and implemented. Durable contracts are in the guide and architecture owners;
  this active task retains only execution/acceptance history. No commit, staging or remote operation was performed.
- Additional focused acquisition guards passed after the broad run: native evidence cannot be fabricated as completed,
  CPD scope fields remain mandatory, and memory refusal has a plain-language explanation. The final Analysis browser
  scenario also proves a delayed response cannot erase a new draft after leaving and returning to the same target.
- Before archival: complete the real default native/CPD Stop/resume/adoption walkthrough during a stable input window,
  record actual costs/responsiveness, and recheck protected stores. Keep this file active until then.

### 2026-11-18 - Focused implementation review corrections

- F1-F4 are valid. Native refusal requires an explicit compiler diagnostic classification, preprocessing proof, known
  consumed inputs and an unchanged identity; unrelated providers/resources and superseded input cannot create that cache.
  Older unclassified negative entries are not trusted. Optional progress-output I/O is logged once and isolated from
  extraction. Displayed coverage and ready-to-adopt evidence remain separate, and selectors are locked during Apply.
- Red proof reproduced required CPD poisoning, progress PermissionError propagation, ready counts replacing displayed
  evidence, and enabled selectors during delayed Apply. Browser baseline controls used the matching committed viewer,
  not a fabricated renderer. Green results are recorded after the focused acceptance run below.
- D5 remains binding: the final private-project completion/adoption gate stays pending; these corrections do not reopen
  the accepted earlier delivery gates or authorize claiming full real-project acceptance. No archival is performed.

- Focused correction acceptance: 320 non-Engine Python checks with real LLVM/CPD enabled, zero failures/errors and one
  optional legacy indexer skip; 72 affected Python 3.11 checks without skips; 187 JavaScript checks. Analysis, coverage
  transition and Live Chromium scenarios passed. The delayed-Apply and ready-coverage scenarios reject the committed
  baseline for the reported defects. Diagnostic category probes used the pinned local LLVM rather than message guessing.
- Documentation/privacy checks passed. Main saved stores are checked byte-for-byte, temporary servers are stopped, and the
  normal viewer is restarted through its owned lifecycle. D5's full real-project runtime gate is still pending.

### 2026-11-18 - Native negative-cache I/O isolation

- F5 is valid. Three red fault-injection tests reproduced cache read refusal, replacement of the primary compiler error
  during cache write, and rejection of a validated candidate during cache cleanup. Cache failures return bounded diagnostics;
  the primary error type and diagnostic survive, and successful staging/publication remains authoritative.
- The profile receives the worker's existing published manifest and automatic identity. A completed native snapshot with
  that identity takes precedence over a stale negative entry without reading it. Module-only baselines and changed identities
  do not bypass valid failure reuse. The scheduler exposes cleanup warnings through its existing degraded status.
- Acceptance: 134 affected Python checks passed without skips, including real LLVM/CPD on synthetic sources, server/lifecycle
  and publication checks. The 44 cache/control/monitor/documentation/privacy checks also passed under Python 3.11.
  Evidence remains under `workspace/tmp/native-cache-isolation/`. No new subsystem or cache authority was introduced.
- D5 remains unchanged: final real-project native Stop/resume/adoption acceptance is pending. This task stays PARTIAL.
- The normal viewer restarted through its owned lifecycle and answered HTTP 200. Protected layouts and Review stores
  remained byte-identical. Documentation/privacy and Python 3.9 grammar checks passed; nothing was staged or committed.
