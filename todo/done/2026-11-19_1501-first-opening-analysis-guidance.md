# First-opening analysis guidance

**Status:** DONE
**Scope:** viewer guidance, first-opening lifecycle and evidence labels  
**Stable owners:** [viewer](../../viewer/docs/architecture/structure.md), [guide](../../docs/guide.md)

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

On first opening a project, a developer understands which analysis is recorded, which coverage is absent and what the
existing action will do, while remaining free to explore the map. Recorded coverage and findings never resemble a quality score.

## Authority register

### Operator decisions

- **D1:** Start available source checks automatically on a new project's first opening, with Skip/Stop available.
  - Effect: preserve the accepted new-project Auto policy. This UI slice does not redefine acquisition or legacy choices.
  - Reason: not stated.
  - Date/source: operator's explicit first-opening answer in the Analysis Controls conversation, 2026-11-18.
- **D2:** Implement this approved plan using implement-approved-change.
  - Effect: authorize the bounded viewer change and its synthetic/browser acceptance, preserving D1 and the separate D6 gate.
  - Date/source: operator's explicit implementation request, 2026-11-19.

### Operator gates

No unresolved technical question blocks implementation. D2 authorizes this plan; viewing guidance does not authorize
activation of an existing project's Off checks.

### Working assumptions

- **A1 [ADOPTED]:** Use the existing Checks panel as the non-modal guide; reuse its actions and status data.
- **A2 [ADOPTED]:** Remember actual presentation or explicit dismissal per project in browser preferences, preventing poll and
  reload prompts. Do not consume the opening opportunity before useful guidance or attention exists.
- **A3 [ADOPTED]:** Replace ambiguous idle ratios and zero-findings labels with explicit recorded/Off/availability wording,
  using compact wording at narrow widths and full descriptions in Checks.
- **A4 [ADOPTED]:** Keep scoped input-change semantics and expose their limits more clearly; do not change comparison data.

## Non-goals

- No Monitor, extraction, caching, publication, API or canonical schema changes; no new source check or quality score.
- No automatic enabling of existing Off choices, tool installation or successful-build requirement changes.
- No blocking modal, wizard, notification framework, new font, animation system or galaxy redesign.
- No workspace onboarding store, cross-browser sync, telemetry, history or migration of pins, policy or triage.
- No completion or reopening of the separate Analysis Controls D6 native/runtime gate.

## Verified evidence

1. [Analysis summary](../../viewer/analysis.js), `checksSummary()`, excludes `disabled` from missing-coverage attention and
   reports completion as an idle ratio. A completed foundation with two disabled checks produces `Checks: 1/3` and
   `attention: false`. That classification intentionally avoids treating Off as failure; the missing part is guidance.
2. `AnalysisControls.render()` adds a target to `opened` before checking attention. Executing the actual render method
   against a synthetic viewer first without attention and then with a later error produced zero automatic openings.
   [Diagnostic](../../workspace/tmp/first-opening-guidance/probe.cjs), [result](../../workspace/tmp/first-opening-guidance/probe.json).
3. `dismissed` and `opened` are memory-only. `panel(false)` records dismissal even when called through panel coordination;
   it does not persist across reload. Existing [browser preference helpers](../../viewer/app.js), `recall()` and `remember()`,
   already tolerate unavailable local storage. They can own this small preference without a backend store.
4. [Checks markup](../../viewer/index.html) already contains Run recommended checks, Run/Apply, Retry, Stop and detailed
   availability/setup information. The recommended action sets optional choices to Auto through the normal request path.
   It is not merely an instruction to resume the current choices.
5. [Review status](../../viewer/review.js), `status()`, displays a bare count in the button. Its title already qualifies
   findings as recorded evidence and includes coverage states. The qualification is less visible than the count.
6. `inputChangeSummary()` already says "compared inputs" and exposes unmonitored scopes in its detail. The fixed-width
   [context strip](../../viewer/app.css) can truncate the label. The finding is about visibility, not an incorrect freshness calculation.
7. [Viewer lifecycle](../../viewer/docs/architecture/live-updates.md#live-snapshots) distinguishes displayed coverage, pending choices and ready
   updates. [Check policy](../../laniakea/docs/architecture/monitoring.md#requested-checks) preserves legacy intent and makes missing
   tools/prerequisites explicit. Neither boundary needs a behavior change for A1-A4.
8. `AnalysisControls.panel(true)` closes Review and filters, and closes Inspector at narrow widths. The existing
   `liveBlockReason()` guards gestures and drafts, but not reading an open panel. A synthetic execution of those actual
   methods returned no block reason before Checks hid all three panels at a narrow width. This verifies the coordination
   gap, not future browser focus behavior: [probe](../../workspace/tmp/first-opening-guidance/panel-priority.cjs),
   [result](../../workspace/tmp/first-opening-guidance/panel-priority.json).

The code-level findings are verified; the proposed guide, its layout and persistent dismissal have not been implemented or
browser-tested. The supplied screenshot interpretation is consistent with the code, not proof of full analysis or its absence.

## Current architecture and source of truth

| owner | responsibility |
|---|---|
| [Analysis](../../viewer/analysis.js) | displayed check summary, form state, guide eligibility and panel presentation |
| [App](../../viewer/app.js) | existing browser preferences, keyboard and panel coordination |
| [Review](../../viewer/review.js) | finding count/severity/coverage presentation; no source acquisition |
| [Markup](../../viewer/index.html) and [styles](../../viewer/app.css) | accessible layout, action order and responsive labels |
| [Live](../../viewer/live.js) | adoption guards, generation ownership and render rollback; reuse without a new lifecycle |
| [Analysis tests](../../tests/analysis.test.cjs), [browser acceptance](../../tests/analysis.browser.js) | coverage, choices, focus and control regressions |
| [Review tests](../../tests/review.test.cjs), [input-change acceptance](../../tests/input-changes.browser.js) | honest findings and scoped freshness |

## Problem and root cause

The current panel explains checks after it is opened, but idle Off projects never qualify for attention. A quiet early poll
also consumes the one-time opening flag. Ratios and bare zero counts then carry more visual weight than their qualifications.
Session-only dismissal cannot provide a quiet first-visit experience across reloads.
Manual panel coordination also cannot be used unconditionally for automatic guidance: a reading user may have no draft or
gesture while Review, Inspector or browsing is open.

## Decision

Implement A1-A4 as a presentation change, retaining D1 and the existing acquisition policy.

### Premise / KISS

Checks already owns coverage, actions and the panel lifecycle. Extend it directly, retaining its necessary distinction
between recorded results and current attempts. Add only a small browser preference through the existing helpers. Give up
cross-browser acknowledgement and automatic reminders after the guide has been handled. Explicit Checks access always remains.

### Proposed information order

1. **What is recorded:** a short heading and profile-provided check labels/statuses from the displayed map. For a module-only
   Sample project: map ready; module dependencies recorded; C++ references Off; duplication Off. Do not hardcode three checks
   or Unreal labels into the generic viewer. Show actual failed, pending, incomplete and unavailable states distinctly.
2. **What can help:** reuse the existing Run recommended checks action beside a short explanation that it applies Auto to
   optional checks. Use that same action name rather than introduce a second ambiguous Enable action. Keep setup requirements,
   time/resource expectations and continued map availability clear. When checks are already running, explain progress and
   retain Skip/Stop; do not offer redundant acquisition. Saved-only mode explains disabled actions. Off is informational.
   Say explicitly that Auto uses available prerequisites: this action does not install tools, build the project or guarantee
   successful completion. Prerequisites not inspected while Off remain unknown, not missing or ready.
3. **Continue exploring:** Explore current map closes the panel and returns keyboard focus to the graph. Close/Escape retain
   their existing toolbar-focus behavior. Detailed controls, changes and setup disclosures remain available without duplicate cards.

Integrate this context with the existing status/action area, not alongside another paragraph repeating the same explanation.
Reuse the palette, type scale, neutral Off treatment and native controls. Avoid decorative banners and automatic animation.
While check choices are dirty or submitting, guidance cannot reset them or run a different recipe; retain Apply/Reload semantics.

### First-opening lifecycle

- Determine guidance eligibility separately from failure attention. Missing optional completion, including Off, can justify
  information without becoming a warning/error. Completed coverage needs no missing-coverage introduction.
- Wait for actual target/check data. A quiet or loading-only render does not mark the target opened. Mark it only after
  the panel is actually presented or the user explicitly handles it. Late attention must still get its first opportunity.
- Persist handled presentation/dismissal through the existing browser preference helpers. Scope the key to target identity
  and the available project-root identity, not run/index, avoiding resets on adoption or collisions between different projects
  sharing a short ID. Never include all changing external roots or create a workspace identity service.
- Actual presentation is remembered, so refreshing an already-seen guide does not prompt again. Explicit Close/Escape/Explore
  also suppress repeat prompts. Programmatic hiding of an already-hidden panel must not acknowledge unseen guidance.
- Automatic guidance must not replace an already-open user-selected Review, Inspector or browsing panel, including View
  controls. Reading without a gesture or draft is sufficient to defer it, at desktop and narrow widths. Do not call the
  manual panel-opening path while it would close those panels. Manual opening of Checks keeps its existing coordination.
- Also yield during gestures, pending form submissions, active interaction drafts or keyboard interaction. Preserve the
  focused element, the reader's scroll position and visible focused content; no automatic focus or scroll jump is allowed.
  A deferred guide stays eligible and unacknowledged, with its status accessible through the existing Checks control.
  Re-evaluate through the existing render/status lifecycle when the user finishes; add no timer or modal.
- Preference access failure preserves exploration and the existing in-memory session guard. Manual Checks access always
  works; browser preferences are best-effort, not canonical state or an acquisition decision.
- Handled guidance suppresses repeat introductions only. Operational progress, failure labels, coverage and failure details
  continue updating. A later real failure must still show `Checks: failed` and explain the failed attempt on manual opening;
  it does not require another introductory popup.

### Persistent labels and change scope

- Idle Checks describes recorded completion and relevant non-completion states instead of a quality-looking fraction.
  Example desktop copy: `Checks: 1 recorded / 2 off`. Preserve running, stopping, failed and update-waiting priority.
- Findings use recorded-evidence wording, including zero. Preserve Review off, loading, unavailable, failed and severity;
  do not turn absent data into zero. Checks still describes acquisition; Review still describes evaluated recorded evidence.
- Keep primary actions visible at 390, 1080 and 1440 pixels. Full counts need not all fit into one narrow button: use a short
  meaningful state such as `Checks: 2 off` or `Checks: incomplete`, with the full breakdown in Checks and its accessible label.
  Do not introduce horizontal scrolling, repeated row wrapping or count-driven map jumps to force the example wording.
- For partial comparison, make the compact label indicate limited scope, not just a clipped "No changes". The Checks section
  states which domains are compared/not monitored and whether context is unknown. Retain paused/degraded/older-observation
  distinctions, displayed-run binding and the existing scan-enabled legacy banner fallback. No new input inference is permitted.

### Alternatives considered

| option | parts added / removed | judgment |
|---|---|---|
| Context inside Checks plus existing preferences | small presentation/eligibility change; removes passive ratio-only entry | Recommended |
| Toolbar wording alone | no panel lifecycle change | Leaves first-time users without the next action |
| Modal/wizard/notification framework | new interaction and dismissal lifecycle | Blocks exploration or duplicates Checks |
| Automatically override Off on opening | changes acquisition policy and resource use | Conflicts with explicit existing choices |

## Required invariants

1. Preserve D1, legacy choices, mode semantics, Stop/Retry, prerequisites and source boundaries. Viewing/dismissing guidance
   sends no control request. Existing projects enable recommended checks only through an explicit action.
2. Counts and guidance describe displayed evidence; ready results, requested choices and current failures remain separate.
   Completed checks and zero recorded findings never certify the architecture or all source freshness.
3. Preserve camera, zoom, expanded layers, pins, selection, Inspector, Review decisions and dirty forms. A user-opened side
   panel can resize the viewport normally, but no action in this slice fits or resets the map.
   Automatic guidance never closes a user-selected panel or moves focus/scroll to displace current reading.
4. Dismissal survives reload when storage works, remains per project, and does not affect backend policy/triage or check intent.
5. Preserve offline operation, escaped text, keyboard access and current themes. No temporary-plan links from living artifacts.

## Implementation tasks

- [x] Add failing summary and lifecycle regressions using the existing viewer fixture; extend Analysis browser acceptance
  for an existing project with both optional modes Off and for delayed attention.
- [x] Implement contextual coverage/action presentation and guidance eligibility in Analysis; persist handled state through
  the current preference helpers. Gate automatic opening on active panels and focus before invoking manual coordination or
  recording handled state. Reuse the recommended request handler and existing panel/keyboard paths.
- [x] Clarify Checks, Review and input-change labels, retaining availability/severity semantics and responsive action access.
- [x] Prove delayed guidance preserves a reading panel and focus, alongside dismissal/reload, project isolation, storage
  refusal, drafts, adoption and no unintended control requests. Verify later failures remain visible after dismissal.
- [x] Update the stable owners below, inspect the diff and archive this task only after its acceptance passes.

## Test-first and verification plan

### Red evidence

| case / evidence kind | wrong behavior the pre-change guard must reject |
|---|---|
| Existing Off project / Analysis unit + browser regression | No guide despite absent optional evidence; idle ratio hides Off |
| Quiet first poll then attention / lifecycle regression | Opening consumed before any panel is shown |
| Delayed status while reading Review, Inspector or browsing / browser regression | Automatic Checks closes an open panel or changes focus/scroll without a draft or gesture |
| Close, Escape, Explore, reload / browser regression | Repeated prompting, wrong focus, or acquisition on dismissal |
| Hidden programmatic close and separate projects / lifecycle regression | Unseen guide acknowledged or one project's preference suppresses another |
| Ready/displayed mismatch and submitting choices / existing guards plus focused assertions | New coverage leaks into old map or the guide overwrites a draft |
| Running, missing tools, failed and completed cases / summary guards | All states collapse into Off, not completed or zero findings |
| Recommended action with unknown prerequisites / acceptance assertion | Copy promises installation, a project build or successful completion merely by selecting Auto |
| Actual failure after guidance dismissal / summary + browser regression | The handled preference suppresses `Checks: failed` or its explanation along with the introduction |
| Storage unavailable / lifecycle regression | Map fails or the same session prompts on every poll |
| No-change partial scope / summary + browser regression | Compact wording implies all C++ files were checked |
| Keyboard, themes, widths and actual readable hierarchy / browser acceptance + design judgment | Hidden actions, excessive copy or lost map context |

Use synthetic Sample data and the existing Analysis/coverage/live harness patterns. Assert no `/monitor/control` request before
the explicit recommended action; then verify the ordinary request, existing Skip/Stop and retained Off settings on dismissal.
Readability is a human review of screenshots, not a string allowlist or a fabricated quality metric.

For the delayed-status regression, hold the initial Monitor response for a module-only Sample project with optional checks
Off. Open Review through its real control and focus a control in that panel, with no draft and no gesture. Release the
response and assert Review stays open, Checks stays closed, focus and scroll remain unchanged, guidance is not marked handled
and no `/monitor/control` request occurs. Repeat for Inspector and browsing at desktop and narrow widths. Then manually open
Checks and verify its normal coordination still works. Separately dismiss the guide, deliver an actual later failed-attempt
status, and assert a visible failure label and explanation without repeating the introduction.

### Green evidence

```text
node --test tests/analysis.test.cjs tests/review.test.cjs tests/live.test.cjs
python -m unittest discover -s tests -p test_documentation.py
python -m unittest discover -s tests -p test_privacy.py
```

Run the extended [Analysis scenario](../../tests/analysis.browser.js), [displayed-coverage scenario](../../tests/check-coverage.browser.js),
[input-change scenario](../../tests/input-changes.browser.js) and affected [live rollback scenario](../../tests/live.browser.js).
Use trusted pointer/keyboard actions, reload the same browser context, and test both themes at the listed widths. Preserve
camera/pins and protected-store hashes; test source/control requests independently of graph inspection. Existing choices
and D6 remain unchanged. This UI-only scope does not require expensive Engine/native/CPD re-extraction.

## Documentation plan

- [Viewer](../../viewer/docs/architecture/live-updates.md#live-snapshots) owns first-opening eligibility, handled preferences, focus and
  displayed evidence. Update its existing session-dismissal statement with automatic-versus-manual panel priority and
  independent operational status; do not create a second onboarding document.
- [Guide](../../docs/guide.md#open-a-project) owns the short operator workflow and exact action name. It already explains Auto,
  Off and zero findings; edit those paragraphs rather than append a duplicate tutorial.
- [Verification](../../tests/verification.md#browser-acceptance) lists the extended scenario. Existing routes remain sufficient.
- [Monitoring](../../laniakea/docs/architecture/monitoring.md#requested-checks) and [Review](../../laniakea/docs/architecture/review.md) retain policy
  and evidence semantics; change them only if implementation demonstrates a direct contract correction is needed.

## Rollout and rollback

The sole persistent addition is a disposable browser presentation preference. No workspace migration is needed. Removing
the guidance restores the existing manual Checks route without changing saved recipes, maps, caches or user decisions.

## Completion criteria

An existing Off-mode project gets a clear, non-blocking first guide and remains usable without starting deeper checks.
Actual presentation/dismissal stays quiet across reload; later eligible attention is not lost to an earlier quiet render.
Delayed guidance preserves active reading panels and focus without requiring a draft. Dismissing introductions does not hide
later failure status or its explanation, and the recommended action makes no promise beyond applying Auto and requesting checks.
An explicit existing action requests analysis, while coverage, findings and source-change scope remain truthful. Acceptance,
stable documentation and privacy checks pass; D6 and unrelated work are untouched.

## Review record

### 2026-11-19 - Investigation

- The supplied UX feedback is supported by the code and a synthetic execution probe. Qualification: Off is correctly not
  treated as failed attention; add informational eligibility instead of converting intentional opt-outs into warnings.
- A1-A4 are implementation recommendations awaiting review. Only this task is an intended repository edit. No production
  code, tests, stable docs, server settings or analysed sources were changed, and no source checks were started.
- Baseline: 25 Analysis/Review/Live JavaScript checks passed. They verify existing behavior, not the proposed UX. Probe
  evidence is under `workspace/tmp/first-opening-guidance/`. Future browser acceptance and persistence remain unverified.
- Plan validation: five documentation/privacy checks passed; the file is ASCII and its local links/anchors resolve.
  The working tree contains only this new task; no staging or commit was performed.

### 2026-11-19 - Active-panel interaction review

- F1 is valid. The earlier gesture/draft rule did not explicitly protect reading an open panel. The code-level probe
  confirms that existing manual coordination can close Review, Inspector and filters with no draft or interaction guard.
- The lifecycle, invariants, implementation tasks and acceptance matrix now require automatic guidance to yield to those
  panels and preserve focus/scroll. Deferred eligibility stays visible through Checks; manual opening remains unchanged.
- The two non-blocking refinements are also valid: the action promise now explicitly excludes tool installation, project
  builds and guaranteed completion, and handled introductions cannot suppress later operational failures. Acceptance covers both.
- No reviewer claim required refutation, and no new operator decision was inferred from the reviewer's approval language.
  This task remains REVIEW REQUIRED; only the plan changes. Production behavior and the separate D6 gate are untouched.
- Validation: 25 existing Analysis/Review/Live JavaScript checks and five documentation/privacy checks passed. The revised
  plan is ASCII and passes link/anchor and whitespace checks. These are baseline/plan checks; the new browser regression
  and future implementation are still unverified. No staging or commit was performed.


### 2026-11-19 - Approved implementation and acceptance

- D2 authorized implementation. A1-A4 were adopted within the existing Analysis, browser preference, Review and markup owners.
  The reviewer's reading-panel correction is valid: automatic guidance now yields without closing panels or moving focus/scroll.
  Manual Checks coordination remains unchanged. No reviewer point required refutation.
- Contextual displayed coverage and existing recommended actions are visible together. Off remains informational; viewing or
  dismissing guidance sends no control request. Dirty, submitting or already-running checks cannot be overwritten by the
  recommended action. Later failures continue updating after the introduction is handled.
- Test-first: `node --test tests/analysis.test.cjs tests/review.test.cjs` produced eight expected assertion failures for the
  old lifecycle, labels and absent Off guidance, then passed all 22 after implementation. The fixture's initial DOM stub
  omission was corrected before red evidence was accepted; it was not counted as a product defect.
- Green: `node --test tests/*.test.cjs` passed all 194 checks. Documentation and privacy discovery passed three and two checks.
  `git diff --check` passed. No backend, extraction or schema change required Engine/native/CPD re-extraction.
- Chrome: the extended Analysis scenario's guidance branch passed eight delayed reading-panel cases at desktop/narrow widths,
  dismissal/reload, denied storage, draft protection, later failure visibility, explicit recommended Auto and Stop. No implicit
  control request or runtime error occurred. Trusted interaction and screenshots covered both themes at 390/1080/1440 widths;
  primary actions fit, the guide remained readable and status-label changes kept the toolbar height fixed.
- Existing Analysis, displayed-coverage, input-change and live browser scenarios passed. These retain stale-tab/Apply guards,
  exact paging, adoption deferral, render-error rollback, independent tabs and camera assertions. Disposable harness setup now
  acknowledges the introductory guide before isolated live-adoption checks, and uses an independent fresh target for the
  pre-existing Analysis scenario. Existing camera assertions were not weakened.
- The ordinary live project route displayed guidance and returned to exploration with no control requests or browser errors.
  All protected layout/policy/triage files remained byte-identical, and live activation/check choices were unchanged. Private
  receipts are in ignored `workspace/tmp/guidance-implementation/`; screenshots remain outside this clone.
- The interface checklist and screenshot review found no remaining issue in the changed scope. Durable behavior moved to the
  existing viewer and guide sections; verification documents the extended scenario. No staging or commit was performed.
- This task is complete and archived. The separate Analysis Controls D6 runtime acceptance remains PARTIAL and is unchanged.

### 2026-11-19 - Visibility and keyboard-focus review correction

- F1 and F2 are valid. Status polling still renders while the document is hidden, and the former focus selector omitted
  the keyboard-focusable graph. The automatic-opening guard now defers for both conditions through the existing lifecycle.
  The acknowledgement owner also refuses hidden writes, covering a manually opened panel whose coverage arrives later.
- Qualification to F1: an already-open panel can become visible on the same tab's activation. Absence on that visit is not
  guaranteed by the code. The actual defect is acknowledgement before visible presentation, which can suppress later openings.
- Red: both added Analysis unit regressions failed on the unmodified implementation with the expected unseen-opening and
  graph-focus assertions. The Chrome scenario also rejected the old Analysis source for delayed hidden status; a separate
  replay caught focused-graph interruption. Checks that no other reading/navigation guard masks these cases are explicit.
- The first keyboard browser stimulus selected a node and opened Inspector, so its later-opening assertion was invalid.
  The fixture now uses keyboard zoom and waits for gestures to finish, isolating graph focus without another panel.
- Green: all 196 JavaScript checks passed. The extended guidance, existing Analysis controls and live-adoption Chrome
  scenarios passed, including manual access, deferred eligibility, focus/camera preservation and rendering rollback.
  Headless Chrome retains visible tabs, so the hidden case injects only its Page Visibility input and dispatches the ordinary
  visibility event; real status requests, rendering and preference writes remain intact. This is not an OS tab-switch test.
- Stable visibility/focus behavior is documented in the existing viewer owner. No scheduling, acquisition, persistence store,
  timer or backend changed. Protected layout/policy/triage files remained byte-identical. The task remains archived after
  this correction; separate Analysis Controls D6 remains pending. No staging or commit was performed.
