# Checks progress and real-result experience

**Status:** DONE
**Scope:** existing Analysis/Review viewer presentation and live acceptance
**Stable owners:** [viewer](../../docs/architecture/viewer.md), [guide](../../docs/guide.md)

## Goal

Make source checks the obvious task: start available analysis, see honest progress and blockers, then open exact findings.
The recorded map remains usable throughout. A duplication candidate is evidence to inspect, not a proven defect.

## Authority register

- **D1:** The operator requests autonomous implementation with fresh UI and design agents, live checks and clear progress.
  - Effect: implement the bounded viewer improvements and run available checks on the selected real project.
  - Source/date: explicit operator request, 2026-11-19.
- **D2:** Preserve accepted analysis/publication, privacy and user-state contracts.
  - Effect: no source edits in analysed projects, no fabricated findings, no lowering clone quality or bypassing input validation.
  - Source: standing project and operator agreements.

The explicit current request permits selecting recommended Auto modes for the selected live project. It does not change
other targets or the default rule that older Off choices require an explicit action. No new approval gate is introduced.

## Verified problem and owners

Independent fresh UI and senior design passes agree that the task hierarchy remains passive:

- The overview emphasizes old Off coverage while the current worker can already be running.
- Progress is plain text, below introductory copy and invisible with the panel closed.
- Recommended analysis and rechecking current choices have equal visual weight, although the latter preserves Off choices.
- Automatic monitoring can be checked while source checks are Off, obscuring its actual scope.
- Completed source checks do not lead directly to the existing Review results.

[Analysis](../../viewer/analysis.js) owns these projections. Existing [worker progress](../../laniakea/progress.py) and
[Monitor status](../../laniakea/monitor.py) already provide phase, job elapsed time and optional completed/total counts.
Review owns findings, paging and decisions. No second analysis pipeline, progress service, timer or persistence store is needed.

## Implementation

- [x] Add regression-first proof for current-versus-recorded work, indeterminate/determinate progress, terminal clearing,
  settings drafts, zero/missing findings and persistent closed-panel visibility.
- [x] Show current work first with a state-specific title and native progress. Use real C++ unit counts only for a valid
  denominator; preparation, duplication and validation remain indeterminate. Job elapsed time is not an ETA or phase time.
- [x] Give the current task one primary action. Keep custom modes and rechecking current choices under Check settings;
  retain explicit Explore, Stop/Retry, setup diagnostics and dirty/submitting safeguards.
- [x] Keep displayed evidence distinct, explain automatic monitoring scope, and navigate to generation-bound Review results.
- [x] Run the real available analysis, inspect representative exact source evidence, and verify the live UI and browser suites.
- [x] Update existing stable owners and record verified results before archiving.

## Acceptance

- Quiet Off, requesting/queued, CPD, native counts, validation, ready-but-not-adopted, failed/unavailable, stopped and completed
  states have distinct truthful presentations. No invented overall percentage or successful zero findings.
- Panel-open and panel-closed progress remain visible; count changes do not resize the map. Both themes and narrow widths
  preserve keyboard access, camera, saved pins and Review decisions.
- Source analysis uses the existing controller, strict clone threshold, tools, cache and immutable publication. Actual
  source changes remain supersession, not a reason to weaken validation or silently publish stale native results.
- Existing first-opening visibility, graph-focus, drafts, tab isolation and rollback regressions remain green.
- Protected layouts, policy and triage remain byte-identical. Requested check settings may change only through D1's
  explicit run. All analysed-project receipts stay in ignored workspace; screenshots stay outside this clone.
- The separate Analysis Controls D6 task can close only if its own real native completion/adoption gates are proved.

## Verification and closure

Use affected unit/browser checks, documentation/privacy checks, live source-evidence inspection and recorded resource costs.
Native and source acquisition are already running through the normal live action; do not duplicate expensive jobs.
No commit, staging or remote operation is authorized.

## Execution record

- Initial code/status inspection confirms the screenshot's two Off source checks; the earlier guide preserved those choices.
- D1's normal recommended action was accepted by the live controller. Source duplication published evidence; native work
  followed through the existing staged upgrade. Current-attempt rows can still carry prior Off coverage, so the UI must use
  worker phase/requested choices for activity and retain displayed coverage separately.
- Fresh agents own UI implementation and independent design review. The coordinating agent owns live evidence, operational
  blockers and durable documentation. The committed visibility/focus corrections remain protected.

### 2026-11-19 - Implementation and acceptance

- Fresh UI implementation and independent senior design review passed. Current work leads the panel; measured native units
  and indeterminate acquisition/publication remain distinct. One contextual primary action, collapsed settings, displayed
  evidence and direct Review navigation replace competing controls. The fixed-height toolbar retains running progress.
- Regression-first cases cover prior failed coverage during retry, missing catalogs/prerequisites, queued earlier work,
  typed automatic waits, real versus invalid denominators, displayed-generation counts and terminal clearing. Bounded
  earlier-work status reads existing controller state without changing scheduling or borrowing obsolete unit counts.
- The delayed-status browser walkthrough exposed a separate successful-adoption focus loss. A focused regression failed
  before correction; adoption now restores equivalent surviving fixed controls without stealing newer focus or rerendering
  recovery. Existing hidden-tab, graph-focus, reading-panel, draft, storage-refusal and rollback protections passed.
- Verification: 202 JavaScript checks; 21 Monitor and 28 server Python checks; 21 Monitor checks under Python 3.11;
  three real-Engine integration checks. Documentation/privacy checks passed. Analysis guidance/activity, Controls, coverage,
  input-change and Live browser scenarios passed, including both themes and narrow/desktop layouts.
- Real source acquisition completed through the ordinary recommended-check action. Trusted Stop cancelled owned native
  work and all recorded descendants exited; the previous map remained available. Normal owned restart/resume succeeded.
  External source/build changes correctly superseded earlier candidates. The controller then selected the newest valid
  successful-build context, completed native and strict duplication acquisition, validated publication and adopted it in
  an already open browser. Earlier-generation counts remained hidden; queued work and actual phases stayed visible.
- Exact duplication evidence was manually inspected, including shared implementation logic and intentional boilerplate.
  Final source links and module/header/class navigation worked without browser runtime errors. Findings remain review
  candidates, not a clean-project score or confirmed defects. The selected target excludes other target-specific code.
- Final cold native acquisition took about 16 minutes; total extraction about 18 minutes. The observed peak worker was
  about 1.6 GiB, not an aggregate process-tree measurement. Final duplication took about 13 seconds. Two real overview
  wheel samples had frame p95 below 34 ms and maxima below 46 ms; this is bounded scene evidence, not dense-view coverage.
- Browser adoption preserved the camera. All protected layout/policy/triage stores stayed byte-identical; other targets
  remained inactive. Requested Auto choices are the only intentional check-setting change. Private receipts remain in
  ignored workspace; real-project screenshots remain outside this clone. Disposable harnesses were stopped; the normal
  viewer stays running. Nothing was staged, committed or pushed.
- Durable contracts are in the existing guide, viewer and monitoring owners. The separate Analysis Controls runtime gate
  is now proved by this walkthrough; its historical decision and acceptance record is archived separately.
