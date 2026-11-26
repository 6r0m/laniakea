# Viewer workspace hierarchy

**Status:** REVIEW REQUIRED  
**Scope:** Viewer workspace controls, status presentation and panel layout  
**Stable documentation owners:** [viewer architecture](../docs/architecture/viewer.md) and [user guide](../docs/guide.md)

## Contents

- [Authority register](#authority-register) and [verified evidence](#verified-evidence)
- [Current architecture](#current-architecture-and-source-of-truth) and [decision](#decision)
- [Implementation tasks](#implementation-tasks) and [verification plan](#test-first-and-verification-plan)
- [Documentation](#documentation-plan), [completion](#completion-criteria) and [review record](#review-record)

## Goal

A first-time developer can identify the displayed project, target and scope, distinguish recorded coverage from issues
that need attention, then explore a finding or symbol and return to the map.

## Authority register

### Operator decisions

- **D1** Check the supplied workspace-interface review using the investigation and approved-change workflows.
  - Effect: Prepare a plan from the implemented viewer and check for implementation authority.
  - Reason: not stated.
  - Date/source: 2026-11-26 operator request.
- **D2** Keep showcase stills and recording drafts out of tracked Git. Reserve a video for a future presentation.
  - Effect: Use the synthetic sample for local visual evidence and keep captures outside the checkout.
  - Reason: not stated.
  - Date/source: 2026-11-26 operator follow-up.
- **D3** Remove redundant floating Review marks from reference lines.
  - Effect: The design preserves star badges, wire glow and on-demand evidence.
  - Reason: Reduce map clutter.
  - Date/source: 2026-11-26 operator follow-up.

### Operator gates

- **Q1 [OPEN - BLOCKING]** Does the proposed workspace hierarchy and scope below have approval for implementation?
  This gates production changes. The supplied design is reviewer input and no approved workspace redesign TODO was found.
- **Q2 [OPEN - BLOCKING]** Does the implemented workspace meet the intended visual and interaction goal?
  This gates DONE after the candidate has been demonstrated.

### Working assumptions

- **A1 [ACTIVE]** Repositioning existing actions and clarifying status is sufficient for the first pass.
  Retain the quiet, explicit Inspector entry and its current selection-driven behavior.
- **A2 [ACTIVE]** A fixed map guide disclosure and a compact readout can recover usable canvas area at narrow widths.
  Confirm with equivalent views before and after, including keyboard inspection.

## Non-goals

- Graph rendering, galaxy styling, layout algorithms, camera motion, graph schema, evidence generation and engine behavior.
- A new dashboard, wizard, permanent navigation sidebar, severity scoring model, library, backend API or zoom toolbar.
- Publishing screenshots, a prototype or a video as part of this change under D2.

## Verified evidence

| Reviewer point | Repository and runtime evidence | Judgment |
|---|---|---|
| Identity repeats and target context is hard to find | The project picker labels each registration as project plus ID. The root breadcrumb repeats the project. The footer owns the full target, platform and configuration. [Startup and scope presentation](../viewer/app.js) | Confirmed. Put the selected build context with the project picker and use a scope label at the root. |
| Review should show violations and candidates separately | The sample showed `Review: 4 recorded findings`. The accessible button label and Review panel already reported 2 violations and 2 candidates. [Review status](../viewer/review.js) | Confirmed for visible text. Reuse existing active counts. |
| Checks and current work appear too similar | Checks already separates displayed results from attempts and ready updates inside its panel. Its toolbar label changes from coverage to phase when busy. [Checks presentation](../viewer/analysis.js) | Refine the summary so displayed evidence remains visible during work. Preserve the existing phase and progress semantics. |
| Filters and Fit map are hidden under View | Both are inside `#view-controls`. Up and search already have direct controls and keyboard actions. [Viewer markup](../viewer/index.html) and [camera actions](../viewer/scene.js) | Expose Filters and Fit map directly. Keep the existing search and Up entry points. |
| Legend and idle readout consume map space | The permanent key contains a type-icon disclosure and always-visible explanations. At 1440 x 900 the graph was 620 px high, with 44 px reserved for the key and 64 px for the readout. At 390 x 844 after resizing, the graph was 409 px high, with 76 px for the key and 64 px for the readout. Neither viewport had horizontal overflow. [Layout rules](../viewer/app.css) | Confirmed density concern. Treat the numbers as viewport measurements and assess legibility separately. |
| Selection should open the Inspector naturally | In Chrome, search for `CloseRound` opened the symbol's Inspector and deep breadcrumb. The empty Inspector appeared when its explicit button was clicked. [Selection route](../viewer/app.js) and [Inspector tabs](../viewer/inspector.js) | Selection already opens inspection. Apply A1 to the button hierarchy and preserve both entry paths. |

Chrome exercised the saved-only synthetic sample at loopback. The observed flow reached Checks, Review, native search,
deep source inspection and Fit map. The saved sample showed three recorded checks with unchecked freshness.
Runtime evidence covers desktop and narrow presentation in dark mode. Live acquisition, failure states, light mode,
real browser zoom and proposed-layout quality require candidate verification.

## Current architecture and source of truth

| Owner | Workspace responsibility |
|---|---|
| [index.html](../viewer/index.html) and [app.css](../viewer/app.css) | Native controls, layout, responsive sizing and theme tokens |
| [app.js](../viewer/app.js), [scene.js](../viewer/scene.js) and [map.js](../viewer/map.js) | Selected manifest and scope navigation, search, Fit map, counts, map help and focusable trace readout |
| [analysis.js](../viewer/analysis.js) and [review.js](../viewer/review.js) | Independent display of check acquisition and recorded findings, including each owner's own panel |
| [inspector.js](../viewer/inspector.js) and [source-preview.js](../viewer/source-preview.js) | Keyboard tabs, inspection presentation and source comparison |
| [live.js](../viewer/live.js) and [positions.js](../viewer/positions.js) | Generation adoption and rollback, reading focus, and saved arrangements |

The [viewer architecture](../docs/architecture/viewer.md#live-snapshots) describes existing adoption guards and progress
presentation. The [Review contract](../docs/architecture/review.md) owns evidence semantics.

## Problem and root cause

The shell gives similar weight to project metadata, findings, navigation and infrequent settings. The current
markup groups exploration actions inside View, duplicates identity at root, and uses persistent legend and readout space.
The status owners already hold the data needed to communicate a clearer hierarchy.

## Decision

### Premise / KISS gate

Rearrange existing controls and summarize their existing state. Give identity and search one masthead, Checks and Review
one status row, and put scope and exploration controls on one map bar. Place map vocabulary behind the existing disclosure.
Reordering the controls removes repeated identity and idle instructions. The existing handlers remain the integration points.
Detailed help requires opening Map guide. Each status remains a direct entry to its own panel.

### Proposed layout

```text
Laniakea  [Project / target picker]                [Find nodes and code /]
          Displayed target - platform / configuration
Checks: recorded coverage + current phase          Review: violations | candidates
[Up] Overview / current scope      [Browse & filters] [Fit map] [View] [Inspector]
+------------------------------------------------------------------------+
|                         Existing galaxy canvas                        |
+------------------------------------------------------------------------+
[Map guide]             Focusable trace readout when tracing
[Input changes / freshness]                              [Coverage details]
```

- Keep target selection native and keep Project details discoverable beside it. Use the displayed manifest for target,
  platform and configuration. The root breadcrumb reads Overview. Keep meaningful target aliases in the picker and
  full target metadata available when compact display truncates long values.
- Checks keeps recorded coverage visible alongside current work. The existing progress indicator stays inside a
  bounded slot. Review shows labeled active violation and candidate counts within one button. Use text and shape plus
  color. Show acknowledged counts in the queue. Off, checking, unavailable and failed each carry an explicit label.
  Use a neutral empty Review result. A completed-check accent applies to acquisition only.
- Use existing actions for Up, Browse & filters and Fit map. View groups layout, configuration marks, arrangement,
  reset and clear selection. Keep Inspector quiet in the toolbar and let selection open it as today.
- Fold the types, trace directions, configuration marks, Review cues and shortcuts into Map guide. Keep the graph's
  accessible description and a focusable, readable trace summary. Reserve stable chrome space so hover, progress
  and transient status changes leave the canvas bounds steady. Keep all view totals available through existing
  scope presentation and accessible text.
- Give Checks, Review, filters and Inspector the same heading, close-control, spacing and focus conventions. Preserve
  their roles, controls and exclusivity rules. At narrow widths let groups wrap at viewport breakpoints. Keep primary
  actions visible and maintain the current single-panel behavior. Errors and unsaved positions stay prominent, with
  ordinary freshness and coverage in a quiet footer.
- Use the current system typography and theme tokens. Rely on spacing, weight, borders and label hierarchy for the
  shell. Use the existing icon vocabulary where it improves recognition. Keep the galaxy dominant.

The interaction walkthrough opens a project, reads the displayed coverage, notices a violation, follows a
reference into Inspector, opens exact evidence and uses Fit map to return to Overview. Repeat the same route by
keyboard and repeat with a deep source view and an open panel.

### Alternatives considered

- A color and typography pass alone leaves navigation actions behind View and fails to expose severity counts.
- A unified sidebar adds a pane and shifts established acquisition, findings, filters and inspection responsibilities.
- Separate severity buttons add navigation semantics and controls without a validated need for separate queues.

Design references inform the organization and status vocabulary. The layouts and product imagery are illustrative.
[Neo4j Bloom scene and overlays](https://neo4j.com/docs/bloom-user-guide/current/bloom-visual-tour/bloom-overview/)
[VS Code interface](https://code.visualstudio.com/docs/editing/getting-started/userinterface)
[Carbon status indicators](https://www.carbondesignsystem.com/building-blocks/core/patterns/status-indicators)
[NN/g complex application usability](https://www.nngroup.com/articles/usability-heuristics-complex-applications/)

## Required invariants

1. Display identity, scope, coverage, freshness and Review counts for the applicable displayed generation. Maintain
   the distinct states for an active attempt, a ready update, limited input comparison and a completed result.
2. Preserve the existing camera entry points, shortcuts, map filtering, arrangement writes and source evidence routes.
   Keep D3 and the current trace colors, reduced-motion and reduced-transparency behavior.
3. Preserve native tab and disclosure interaction, visible focus, accessible names and announcements. Dismissing
   disclosures and side panels returns focus to a usable control. Auto-guidance continues to yield to active reading,
   edits and navigation.
4. Preserve live adoption, same-tab configurations, pins and Inspector intent. Include any new generation-dependent
   header/status DOM in the existing adoption checkpoint and rollback. Preserve inertness and deferral during comparison.
5. Keep the shell usable at narrow widths and increased browser zoom. Hover and status updates leave the graph camera
   and pins stable. Visual evidence follows D2.

## Implementation tasks

- [ ] Close Q1. Record equivalent baseline views and the primary interaction route on the synthetic sample.
- [ ] Adjust the masthead, map bar, footer and native controls in the existing markup and CSS. Reuse existing IDs and
  handlers, and put the displayed manifest's target context on the normal render and adoption paths.
- [ ] Adjust visible Checks and Review summaries inside their presentation owners. Reuse the existing progress,
  freshness and disclosure controls. Use the current phases and counts for keyboard and assistive-technology labels.
- [ ] Fold guide copy and streamline trace readout and panel styling. Check focus order, panel coordination, selection,
  readout legibility, narrow wrapping and the comparison modal's inert boundary.
- [ ] Extend the most relevant regression cases, verify the implemented interaction route, and update the stable owners.
  Demonstrate the candidate for Q2.

## Test-first and verification plan

| Baseline or guard | Pre-change evidence and expected candidate result |
|---|---|
| Identity and navigation | Browser overview currently repeats the project and has Fit and Filters inside View. Extend [viewer.browser.js](../tests/viewer.browser.js) to assert the displayed target context, Overview root label and direct actions. Capture the current and candidate overview and deep views at equivalent viewport sizes. |
| Independent status | The sample paints a combined finding count. Extend [review.test.cjs](../tests/review.test.cjs) and [analysis.test.cjs](../tests/analysis.test.cjs) for split counts, zero/acknowledged/unknown states, stable displayed coverage during active, failed and ready attempts, and accessible text. Run the new cases before the production edit. |
| Map help and panels | Extend [icons.browser.js](../tests/icons.browser.js) and [inspector.browser.js](../tests/inspector.browser.js) to check keyboard disclosure, readable trace text, panel close focus and selection-driven inspection. Compare idle canvas area and status-driven viewport stability. These are interaction and layout checks. |
| Live and source evidence | Use existing [live.browser.js](../tests/live.browser.js), [check-coverage.browser.js](../tests/check-coverage.browser.js), [analysis.browser.js](../tests/analysis.browser.js), [input-changes.browser.js](../tests/input-changes.browser.js), and [source-preview.browser.js](../tests/source-preview.browser.js). Cover a failed adoption, dirty drafts, latest displayed context, pin retention and a comparison open across a ready update. |
| Visual judgment | Inspect overview and deep maps with panels open and closed in dark and light modes, at 390, 760, 1024 and 1440 CSS px and 200% browser zoom. Include a long project or target name, no saved target, reduced motion, active progress and failed/unavailable states. Record canvas sizes, any horizontal overflow and the complete task route. Operator judgment is Q2. |

After approval, rerun the exact focused cases, `node --test tests/*.test.cjs`, and
`python -B -m unittest discover -s tests -p test_documentation.py`. Run browser functions with the disposable fixtures
and real sample described in [browser acceptance](../tests/README.md#browser-acceptance). The existing
[wheel](../tests/wheel.browser.js) and [explicit navigation](../tests/motion.browser.js) cases cover unchanged camera
behavior with the revised map chrome. Use trusted pointer and keyboard events for visual acceptance. Store captures
outside the checkout. Unreal rebuilding is needed only if the visual sample requires a fresh recorded run.

## Documentation plan

Update the [viewer architecture](../docs/architecture/viewer.md) for shell ownership, status semantics and adoption/focus
guarantees. Update the [user guide](../docs/guide.md) for changed control paths. Update the
[sample tour](../sample/SampleProject/docs/walkthrough.md) where it names moved controls. Existing documentation routes
are sufficient.

## Rollout and rollback

One local shell change and its documentation. Keep the current run and layout formats so the previous shell can read
the same snapshots and arrangements. Keep operator approval and review media separate from the public checkout.

## Completion criteria

- Q1 is closed and the approved design is reflected in the live workspace.
- The normal pointer and keyboard routes complete the walkthrough with readable status, direct exploration, and correct
  inspection and return behavior. The narrow viewport gains usable canvas area at equivalent settings.
- The unit and browser verification above passes. Displayed generation, saved positions, focus and restore paths are proven.
- Stable docs reflect the implemented controls. Q2 closes before DONE.

## Review record

### 2026-11-26 - Reviewer proposal checked against the viewer

- Added D1-D3 and Q1-Q2. The current workspace has no approved redesign TODO.
- The severity split, repeated context and hidden exploration actions were reproduced. Selected-object inspection already
  exists, and narrow overflow was absent on the observed sample.
- Baseline `node --test tests/analysis.test.cjs tests/review.test.cjs tests/live.test.cjs` passed all 42 tests.
- The saved-only Chrome sample run verified the baseline controls and walkthrough in dark mode.
