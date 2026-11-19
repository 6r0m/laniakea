# First-opening analysis guidance

**Status:** REVIEW REQUIRED  
**Scope:** viewer guidance, first-opening lifecycle and evidence labels  
**Stable owners:** [viewer](../docs/architecture/viewer.md), [guide](../docs/guide.md)

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

### Operator gates

No unresolved technical question blocks this investigation. The supplied recommendation is planning input; implementation
requires approval of this plan. No production change or activation of an existing project's Off checks is authorized here.

### Working assumptions

- **A1 [ACTIVE]:** Use the existing Checks panel as the non-modal guide; reuse its actions and status data.
- **A2 [ACTIVE]:** Remember actual presentation or explicit dismissal per project in browser preferences, preventing poll and
  reload prompts. Do not consume the opening opportunity before useful guidance or attention exists.
- **A3 [ACTIVE]:** Replace ambiguous idle ratios and zero-findings labels with explicit recorded/Off/availability wording,
  using compact wording at narrow widths and full descriptions in Checks.
- **A4 [ACTIVE]:** Keep scoped input-change semantics and expose their limits more clearly; do not change comparison data.

## Non-goals

- No Monitor, extraction, caching, publication, API or canonical schema changes; no new source check or quality score.
- No automatic enabling of existing Off choices, tool installation or successful-build requirement changes.
- No blocking modal, wizard, notification framework, new font, animation system or galaxy redesign.
- No workspace onboarding store, cross-browser sync, telemetry, history or migration of pins, policy or triage.
- No completion or reopening of the separate Analysis Controls D6 native/runtime gate.

## Verified evidence

1. [Analysis summary](../viewer/analysis.js), `checksSummary()`, excludes `disabled` from missing-coverage attention and
   reports completion as an idle ratio. A completed foundation with two disabled checks produces `Checks: 1/3` and
   `attention: false`. That classification intentionally avoids treating Off as failure; the missing part is guidance.
2. `AnalysisControls.render()` adds a target to `opened` before checking attention. Executing the actual render method
   against a synthetic viewer first without attention and then with a later error produced zero automatic openings.
   [Diagnostic](../workspace/tmp/first-opening-guidance/probe.cjs), [result](../workspace/tmp/first-opening-guidance/probe.json).
3. `dismissed` and `opened` are memory-only. `panel(false)` records dismissal even when called through panel coordination;
   it does not persist across reload. Existing [browser preference helpers](../viewer/app.js), `recall()` and `remember()`,
   already tolerate unavailable local storage. They can own this small preference without a backend store.
4. [Checks markup](../viewer/index.html) already contains Run recommended checks, Run/Apply, Retry, Stop and detailed
   availability/setup information. The recommended action sets optional choices to Auto through the normal request path.
   It is not merely an instruction to resume the current choices.
5. [Review status](../viewer/review.js), `status()`, displays a bare count in the button. Its title already qualifies
   findings as recorded evidence and includes coverage states. The qualification is less visible than the count.
6. `inputChangeSummary()` already says "compared inputs" and exposes unmonitored scopes in its detail. The fixed-width
   [context strip](../viewer/app.css) can truncate the label. The finding is about visibility, not an incorrect freshness calculation.
7. [Viewer lifecycle](../docs/architecture/viewer.md#live-snapshots) distinguishes displayed coverage, pending choices and ready
   updates. [Check policy](../docs/architecture/monitoring.md#requested-checks) preserves legacy intent and makes missing
   tools/prerequisites explicit. Neither boundary needs a behavior change for A1-A4.

The code-level findings are verified; the proposed guide, its layout and persistent dismissal have not been implemented or
browser-tested. The supplied screenshot interpretation is consistent with the code, not proof of full analysis or its absence.

## Current architecture and source of truth

| owner | responsibility |
|---|---|
| [Analysis](../viewer/analysis.js) | displayed check summary, form state, guide eligibility and panel presentation |
| [App](../viewer/app.js) | existing browser preferences, keyboard and panel coordination |
| [Review](../viewer/review.js) | finding count/severity/coverage presentation; no source acquisition |
| [Markup](../viewer/index.html) and [styles](../viewer/app.css) | accessible layout, action order and responsive labels |
| [Live](../viewer/live.js) | adoption guards, generation ownership and render rollback; reuse without a new lifecycle |
| [Analysis tests](../tests/analysis.test.cjs), [browser acceptance](../tests/analysis.browser.js) | coverage, choices, focus and control regressions |
| [Review tests](../tests/review.test.cjs), [input-change acceptance](../tests/input-changes.browser.js) | honest findings and scoped freshness |

## Problem and root cause

The current panel explains checks after it is opened, but idle Off projects never qualify for attention. A quiet early poll
also consumes the one-time opening flag. Ratios and bare zero counts then carry more visual weight than their qualifications.
Session-only dismissal cannot provide a quiet first-visit experience across reloads.

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
- Yield automatic opening during gestures, pending form submissions or active interaction drafts; keep the opportunity pending
  rather than steal focus or replace inspection. Reuse current guards and panel coordination; no new timer or modal.
- Preference access failure preserves exploration and the existing in-memory session guard. Manual Checks access always
  works; browser preferences are best-effort, not canonical state or an acquisition decision.

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
4. Dismissal survives reload when storage works, remains per project, and does not affect backend policy/triage or check intent.
5. Preserve offline operation, escaped text, keyboard access and current themes. No temporary-plan links from living artifacts.

## Implementation tasks

- [ ] Add failing summary and lifecycle regressions using the existing viewer fixture; extend Analysis browser acceptance
  for an existing project with both optional modes Off and for delayed attention.
- [ ] Implement contextual coverage/action presentation and guidance eligibility in Analysis; persist handled state through
  the current preference helpers. Reuse the recommended request handler and existing panel/keyboard paths.
- [ ] Clarify Checks, Review and input-change labels, retaining availability/severity semantics and responsive action access.
- [ ] Prove dismissal/reload, project isolation, storage refusal, drafts, adoption, keyboard focus and no unintended control requests.
- [ ] Update the stable owners below, inspect the diff and archive this task only after its acceptance passes.

## Test-first and verification plan

### Red evidence

| case / evidence kind | wrong behavior the pre-change guard must reject |
|---|---|
| Existing Off project / Analysis unit + browser regression | No guide despite absent optional evidence; idle ratio hides Off |
| Quiet first poll then attention / lifecycle regression | Opening consumed before any panel is shown |
| Close, Escape, Explore, reload / browser regression | Repeated prompting, wrong focus, or acquisition on dismissal |
| Hidden programmatic close and separate projects / lifecycle regression | Unseen guide acknowledged or one project's preference suppresses another |
| Ready/displayed mismatch and submitting choices / existing guards plus focused assertions | New coverage leaks into old map or the guide overwrites a draft |
| Running, missing tools, failed and completed cases / summary guards | All states collapse into Off, not completed or zero findings |
| Storage unavailable / lifecycle regression | Map fails or the same session prompts on every poll |
| No-change partial scope / summary + browser regression | Compact wording implies all C++ files were checked |
| Keyboard, themes, widths and actual readable hierarchy / browser acceptance + design judgment | Hidden actions, excessive copy or lost map context |

Use synthetic Sample data and the existing Analysis/coverage/live harness patterns. Assert no `/monitor/control` request before
the explicit recommended action; then verify the ordinary request, existing Skip/Stop and retained Off settings on dismissal.
Readability is a human review of screenshots, not a string allowlist or a fabricated quality metric.

### Green evidence

```text
node --test tests/analysis.test.cjs tests/review.test.cjs tests/live.test.cjs
python -m unittest discover -s tests -p test_documentation.py
python -m unittest discover -s tests -p test_privacy.py
```

Run the extended [Analysis scenario](../tests/analysis.browser.js), [displayed-coverage scenario](../tests/check-coverage.browser.js),
[input-change scenario](../tests/input-changes.browser.js) and affected [live rollback scenario](../tests/live.browser.js).
Use trusted pointer/keyboard actions, reload the same browser context, and test both themes at the listed widths. Preserve
camera/pins and protected-store hashes; test source/control requests independently of graph inspection. Existing choices
and D6 remain unchanged. This UI-only scope does not require expensive Engine/native/CPD re-extraction.

## Documentation plan

- [Viewer](../docs/architecture/viewer.md#live-snapshots) owns first-opening eligibility, handled preferences, focus and
  displayed evidence. Update its existing session-dismissal statement; do not create a second onboarding document.
- [Guide](../docs/guide.md#open-a-project) owns the short operator workflow and exact action name. It already explains Auto,
  Off and zero findings; edit those paragraphs rather than append a duplicate tutorial.
- [Verification](../tests/README.md#browser-acceptance) lists the extended scenario. Existing routes remain sufficient.
- [Monitoring](../docs/architecture/monitoring.md#requested-checks) and [Review](../docs/architecture/review.md) retain policy
  and evidence semantics; change them only if implementation demonstrates a direct contract correction is needed.

## Rollout and rollback

The sole persistent addition is a disposable browser presentation preference. No workspace migration is needed. Removing
the guidance restores the existing manual Checks route without changing saved recipes, maps, caches or user decisions.

## Completion criteria

An existing Off-mode project gets a clear, non-blocking first guide and remains usable without starting deeper checks.
Actual presentation/dismissal stays quiet across reload; later eligible attention is not lost to an earlier quiet render.
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
