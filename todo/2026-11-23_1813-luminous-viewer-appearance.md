# Luminous viewer appearance and navigation polish

**Status:** REVIEW REQUIRED  
**Implementation gate:** reviewer review and operator GO are required before any implementation task (D4).  
**Scope:** Viewer presentation: the static Cytoscape stylesheet, theme tokens, HTML surfaces, and required navigation motion.  
**Stable documentation owner:** [docs/architecture/viewer.md](../docs/architecture/viewer.md)

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

Make architecture exploration feel spatially deeper and more legible through a cohesive luminous appearance
and purposeful, interruptible navigation, using the existing Cytoscape renderer, without changing canonical graph
facts, recorded findings, saved positions, scene state, or user decisions.

## Authority register

### Operator decisions

- **D1** Investigate the supplied luminous-viewer change and produce one implementation todo; do not implement the change.
  - Effect: this task is read-only repository investigation plus one transient todo file. Implementation starts only after a
    separate operator approval.
  - Reason: not stated.
  - Date/source: 2026-11-23 operator request.
- **D2** Include navigation motion in the change and improve the visual experience fully.
  - Effect: step D is required scope, not a deferred follow-up. It must still pass every camera invariant; if it cannot,
    the task returns BLOCKER instead of silently shipping a reduced result.
  - Reason: not stated.
  - Date/source: 2026-11-23 operator answer to Q1.
- **D3** Use the drive-browser skill for real-project browser acceptance.
  - Effect: the live real-project visual check is required evidence and must use the configured drive-browser route.
    Do not substitute synthetic fixtures for the real-project claim.
  - Reason: not stated.
  - Date/source: 2026-11-23 operator answer to Q2.
- **D4** Wait for reviewer review and operator GO before implementation.
  - Effect: the todo remains REVIEW REQUIRED. No implementation, staging, commit, or push starts before both gates.
  - Reason: not stated.
  - Date/source: 2026-11-23 operator request.

### Operator gates

- **Q1 [CLOSED by D2]:** Is navigation motion (implementation step D) part of this change, or a separate follow-up?
- **Q2 [CLOSED by D3]:** Is a local real-project map plus the repository's manually configured Playwright harness
  available for visual acceptance?

### Working assumptions

- **A1 [RESOLVED by D2]:** Steps A-C are the primary scope. Step D is gated, deferred by default, and ships only if a
  small `setWorldViewport`-compatible helper proves every camera invariant in this todo.
  - Resolution: D2 makes D required; the deferral clause no longer applies.
- **A2 [ACTIVE]:** Keep `--bg` and the reference-type `PALETTE` values stable. Add atmosphere with nearby tints and change
  only the semantic selection role.
- **A3 [ACTIVE]:** Use solid translucent Cytoscape underlays for node glow and a CSS radial gradient for map atmosphere.
  Radial-gradient underlays are not available in the pinned renderer (see Refuted).
- **A4 [ACTIVE]:** Do not add Cytoscape style transitions unless they are scoped to the active hover/selection subset,
  reduced-motion-safe, and measured. Default is no transition.
- **A5 [ACTIVE]:** A small `setWorldViewport`-compatible motion helper can preserve renderer-scale threshold crossings,
  viewport culling, semantic navigation, interruption, and exact final camera state. Feasibility is not yet proven.
- **A6 [ACTIVE]:** A configured drive-browser endpoint and a locally served real-project viewer are available. If either
  is missing, report the missing integration instead of guessing an endpoint or substituting synthetic evidence.
  - Evidence: the ignored local drive-browser configuration loads; a browser endpoint and dedicated agent profile are
    configured, and the endpoint is loopback. The current real-project viewer serving state was not checked.

## Non-goals

- No new rendering library, graph engine, dependency, CDN asset, web font, icon pack, analytics, or update check.
- No decorative stars, particles, parallax, animated nebulae, second Canvas/WebGL layer, or idle animation.
- No new graph nodes, reference edges, inferred dependencies, or finding elements.
- No changes to layout algorithms, graph schema, canonical positions, pin storage, selection semantics, URL/scene state,
  live adoption, analysis, publication, source evidence, or Review evaluation.
- No HTML overlay text renderer or replacement of the native label-collision system.
- No recoloring of reference types or change to incoming/outgoing/within semantics.
- No theme manager, effects registry, plugin framework, global animation scheduler, or new user preference unless an
  existing accessibility requirement cannot otherwise be met.
- No decorative motion; explicit navigation motion is required scope under D.
- No analysed-project data, names, paths, counts, screenshots, or receipts in tracked files.

## Verified evidence

### Verified facts

- `viewer/map.js:48-115` owns the complete static Cytoscape stylesheet as one `style()` function. `renderGraph()` at
  `viewer/map.js:118-129` installs it with `cytoscape({..., style: style()})`.
- `viewer/map.js:636-671` (`readableLabels()`) owns zoom-dependent label geometry, marker size, renderer-unit conversion,
  and label collision. It writes bypass styles for `underlay-padding` on leaves and expanded containers, and for review
  edge underlays. Those bypasses override stylesheet padding for the affected elements.
- `viewer/map.js:69` keeps expanded containers at `underlay-opacity: 0`. `viewer/map.js:114` gives selected nodes a
  selection border. `viewer/map.js:88-107` owns selected, traced, and review edge styling.
- `viewer/app.css:1-39` owns the light/dark theme tokens. Current dark values are `--selection: #f6c572` and
  `--review-candidate: #ffc16b` (RGB 246,197,114 and 255,193,107; HSL hue about 38 and 35 degrees). Current light values
  are `--selection: #bd6719` and `--review-candidate: #855600` (hue about 29 and 39 degrees). Both themes put selection
  in the same amber family as candidates.
- `--selection` is consumed only by `viewer/map.js:88` and `viewer/map.js:114`; it is not used by the HTML surfaces.
- `viewer/app.js:117-119` reapplies `style()` on `prefers-color-scheme` changes without recreating the graph. `css()` at
  `viewer/app.js:26` reads CSS custom properties. `PALETTE` at `viewer/app.js:5` owns reference-type colors.
- `viewer/index.html:119-135` owns script order: `icons.js`, then `map.js`, then the remaining components, then `app.js`.
  `app.css` is linked at `viewer/index.html:10`. `app.js` is intentionally last.
- `viewer/scene.js:157-198` owns `flyToNode()`, `followReference()`, and `resizeMap()`. `viewer/map.js:932-958` owns
  `setWorldViewport()`, including `renderScale` threshold changes and positions; `viewer/map.js:212-225` owns viewport
  culling refresh. `viewer/live.js:8-14` blocks live adoption while `state.framing`, `wheelFrame`, `zoomFrame`, or
  `viewportFrame` is active.
- The vendored renderer is Cytoscape.js 3.34.4. Its style property definitions type `underlay-color` as a color, not a
  gradient. Node `background-fill` supports `solid`, `linear-gradient`, and `radial-gradient`; gradient stop colors must
  be space-separated. `transition-property`, `transition-duration`, `transition-delay`, and
  `transition-timing-function` exist. A runtime probe rejected `underlay-color: radial-gradient(...)` and accepted a
  radial node background gradient with `#fff #000` stops.
- Cytoscape selector `:not(...)` is not supported by the pinned build; a runtime probe logged it as invalid and ignored
  the restriction. Attribute selectors such as `[reviewMark]` and `[reviewMark ^= "violation"]` work.
- `tests/viewer-support.cjs:16-31` is the Node fixture loader for the viewer. It loads `map.js` directly; no other test
  loader reads the viewer scripts.
- `tests/README.md` owns the documented Node and Python commands and states that browser files are Playwright functions
  with a manually configured harness, not standalone commands.
- The drive-browser skill was read. It requires project-owned or ignored local connection metadata, a dedicated Chrome
  agent profile, loopback CDP, background operation that leaves the operator's current window and tab unchanged, and no
  recording of endpoints, cookies, or storage state in tracked files.
- The ignored drive-browser local configuration loads successfully. A browser endpoint and agent profile are configured,
  and the endpoint is loopback. No page was attached to and no real-project viewer state was inspected.
- Explicit navigation currently calls `frameNode()`, `refreshMap()`, and `setWorldViewport()` directly; there is no
  intentional transition helper and no reduced-motion branch. This is a capability gap for step D, not a graph defect.
- Baseline verification before this todo: the documented lightweight Node suites passed (207 tests: 165 + 13 + 29), and
  `test_documentation.py` (3 tests) and `test_privacy.py` (2 tests) passed. No production file changed.

### Inferences

- Moving one self-contained stylesheet function to a dedicated script is behavior-neutral and keeps the visual diff
  reviewable. It adds one script load and one fixture load, not a runtime subsystem.
- A static CSS radial gradient on the map surface plus solid underlays can produce the intended depth without a second
  rendering layer.
- Changing `--selection` is low-risk for the HTML because no HTML rule consumes it; the map paths are the only consumers.
- The existing trace contrast check in `tests/traces.browser.js` compares trace colors with `--bg`. If the atmosphere
  departs materially from `--bg`, that check must be updated to the worst-case atmosphere stop or the atmosphere must
  stay within the tested contrast envelope.

### Assumptions and unverified areas

- A5 and A6 remain unverified: motion feasibility and drive-browser availability are not proven by this todo.
- The performance cost of additional static selectors, active underlays, and motion is unknown until measured on a
  matching scene.
- "Luminous quality", atmosphere subtlety, and hierarchy readability are reviewer judgements; no universal numeric
  threshold is asserted here.
- The full Python suite, browser acceptance, and performance comparison were not run during this investigation. The
  drive-browser endpoint and real-project viewer were not attached to or inspected.

### Refuted

- **"Cytoscape.js supports native radial-gradient node underlays."** False for the pinned 3.34.4 build. `underlay-color`
  is typed as a color; a gradient value is rejected and falls back to the existing color. Gradients are available on
  node `background-fill`, not on underlays. Consequence: use solid translucent underlays and a CSS map gradient; do not
  plan an underlay gradient.
- **"The selection/candidate collision is dark-theme-only."** Not supported: both themes place selection in the amber
  family; dark is the most severe case. Fix both themes.
- **":not() selectors can exclude expanded nodes."** False in the pinned build. Use an explicit later `node.expanded`
  rule that resets `underlay-opacity`; do not rely on selector exclusion.

## Current architecture and source of truth

- `viewer/universe.js` owns canonical nodes, containment, reference projection, and world positions.
- `viewer/map.js` owns graph projection, the static Cytoscape stylesheet, pointer interaction, viewport culling, and
  zoom-dependent geometry through `readableLabels()`.
- `viewer/scene.js` owns camera, scope, and hierarchy navigation.
- `viewer/icons.js` owns cached type glyphs and warning SVGs on existing native nodes.
- `viewer/review.js` owns finding interpretation, projection, and triage; `NodeIcons` paints the existing badges.
- `viewer/app.js` owns startup, HTML controls, the theme-change listener, and the reference-type `PALETTE`.
- `viewer/app.css` owns theme tokens, layout, HTML surface styling, and responsive behavior.
- `viewer/index.html` owns script order and static controls.
- [docs/architecture/viewer.md](../docs/architecture/viewer.md) is the stable owner of viewer composition and behavior.
  The relevant existing sections are "Composition", "Tracing and inspection", "Viewport and memory lifetime", and
  "Review presentation".

## Problem and root cause

The viewer is architecturally accurate but visually flat. The map surface is a single `--bg` color, containers are
low-contrast, and selection uses the same amber family as review candidates, most severely in the dark theme
(`#f6c572` versus `#ffc16b`). A selected edge or node is therefore not reliably distinguishable from a candidate
warning by color, and ordinary architecture does not receive the intended luminous depth.

The root cause is presentation ownership, not graph extraction. Static Cytoscape appearance is mixed into a large
geometry module, and the theme palette has no distinct selection role or atmosphere. The pinned renderer already
supports the needed native styling, so this is a visual-design and ownership change, not a rendering-engine gap.

Explicit navigation is also abrupt: `flyToNode()`, `followReference()`, and intentional framing call `frameNode()`,
`refreshMap()`, and `setWorldViewport()` directly, with no interruptible transition helper and no reduced-motion
branch. That is a second capability gap, not a graph or camera-ownership defect.

## Decision

Implement steps A-D. Steps A-C deliver the luminous appearance; step D delivers the required, interruptible navigation
motion. Keep one Cytoscape stylesheet. Move the complete static `style()` function into `viewer/appearance.js` as one
behavior-neutral unit, leave geometry-sensitive styling in `readableLabels()`, and add the luminous system through
`app.css` tokens plus static Cytoscape rules. D must pass every camera invariant below; if it cannot, return BLOCKER
with evidence rather than silently deferring it or shipping a partial animation.

### Premise / KISS gate

The component that already owns the lifecycle and data for this outcome is the existing static stylesheet plus the
existing theme-token block. The chosen design adds one code file and one script load, and removes the mixing of static
appearance with camera geometry in `map.js`. It adds no service, process, port, protocol, callback, cache, state
machine, dependency, or user preference. The simpler one-file alternative gives up a dedicated appearance owner; this
design gives up one extra script load and one fixture line. No requested user-facing capability is knowingly dropped:
navigation motion is required scope (D2). Gradient underlays are unsupported by the pinned renderer, and decorative
animation is excluded by design. If D cannot be made safe, the task stops with a blocker rather than claiming a
complete visual experience. The map remains a native Cytoscape scene; `appearance.js` is a code-ownership split, not a
second graphics layer.

### Alternatives considered

- **Keep `style()` in `map.js` and add the new rules there.** Fewest files, but it keeps static appearance mixed with
  camera geometry and makes the large module harder to review. Not recommended once the stylesheet grows.
- **Style the map only through HTML/CSS.** Cannot style native Cytoscape nodes or edges; insufficient for node
  lighting, selection, or reference emphasis.
- **Add a second Canvas/WebGL layer for atmosphere and glow.** Rejected: duplicates renderer ownership, adds a
  dependency or lifecycle, and cannot preserve native hit testing and label geometry.
- **Use Cytoscape radial-gradient underlays.** Rejected by the pinned renderer's property types; the technical premise
  was refuted.
- **Use `cy.animate()` for navigation.** Rejected as a blind replacement: Laniakea's `renderScale`, viewport culling,
  and `setWorldViewport()` are not equivalent to ordinary Cytoscape zoom. D uses a small compatible helper.

## Required invariants

1. `Universe` remains the sole owner of canonical nodes, edges, containment, reference groups, and world positions.
   Appearance adds no graph elements, no reference edges, and no canonical data.
2. `refreshMap()` projection semantics and counts remain unchanged for equivalent views: same node identities, edge
   identities, reference groups, and visible counts.
3. Review ownership is unchanged. Findings remain data badges and edge classes on existing entities; the warning SVG
   shapes, counts, severity, and triage semantics are preserved. No finding stars or synthetic dependencies.
4. The reference-type `PALETTE` values and incoming/outgoing/within trace semantics remain unchanged. Dependency types
   are not recolored for decoration.
5. Saved pins, selection, navigation history, URL/scene state, live adoption, rollback, and reading-panel state remain
   intact. A theme or appearance change never recreates the graph.
6. `readableLabels()` remains the sole owner of zoom-dependent label geometry, collision, marker size, renderer-unit
   conversion, and pixel-sized underlay padding. Appearance must not bypass or duplicate it.
7. No new dependency, CDN, external asset, web font, analytics, network request, or non-loopback binding. The viewer
   remains Windows-only and Python standard-library-only at the product level.
8. Both light and dark themes expose distinct selection, candidate, and violation roles. Selection also differs from
   ordinary accent and direction colors by at least one non-color cue (border width, underlay, badge shape, or legend).
9. Expanded containers do not receive large circular underlays. Their emphasis uses their own fill, border, and title
   badge. Selected expanded containers keep `underlay-opacity: 0`.
10. Atmosphere is static, pointer-transparent, and visually quiet enough that labels, reference edges, warning badges,
    and focus indicators remain readable. No idle animation.
11. Any new transition or camera motion respects `prefers-reduced-motion: reduce`; the default is no motion if that
    cannot be proven.
12. No analysed-project data is written into tracked files. Real-project screenshots and receipts stay outside this
    clone; only neutral verification results may be recorded in the task.
13. Explicit navigation remains interruptible by wheel, drag, pointer, or newer navigation. Motion never queues, the
    final camera matches the exact non-animated destination, and reduced-motion users navigate immediately.
14. Motion preserves renderer-scale threshold crossings, intermediate viewport culling, semantic expansion/collapse,
    selection and panel resizing, browser history, saved pins, and the live-adoption gate.

## Implementation tasks

### A. Behavior-neutral extraction

- [ ] Capture the current `style()` result as deterministic JSON before editing, and record the current graph identities,
      node/edge counts, positions, and pins for a representative scene. Store diagnostics under
      `workspace/tmp/luminous-appearance/`, not in tracked files.
- [ ] Add `viewer/appearance.js` and move the complete existing `style()` function into it verbatim. Preserve selector
      order, property values, `css()` calls, and numeric literals exactly.
- [ ] Remove `style()` from `viewer/map.js`; do not split individual selectors between the two files and do not move
      `readableLabels()`.
- [ ] Load `appearance.js` after `icons.js` and before `map.js` in `viewer/index.html`.
- [ ] Keep `css()` token resolution inside `style()` so `appearance.js` can load before `app.js` defines `css()`. Do not
      create a top-level stylesheet constant that evaluates theme tokens at script load time.
- [ ] Load `appearance.js` in `tests/viewer-support.cjs` before `map.js`; verify no other fixture loader needs updating.
- [ ] Prove neutrality: diff the pre/post JSON stylesheet, graph identities, counts, positions, and pins. If the diff is
      not empty, stop and report the exact change before proceeding.
- [ ] Run the existing lightweight Node suites after the extraction and record the result.

### B. Luminous visual system

- [ ] Add semantic theme tokens in `viewer/app.css` for map atmosphere, selection, hover/selection glow, and any container
      surface tint actually used. Keep `--bg` and `PALETTE` stable. Use light/dark values with verified contrast; do not
      duplicate theme colors as hard-coded JS values.
- [ ] Apply a static radial gradient to the map surface (`#map`), not to the graph canvas element, so the legend and
      readout bands do not show a rectangular seam. Keep it behind all controls, pointer-transparent, and free of
      apparent nodes, clusters, hotspots, or directional cues.
- [ ] Move the static stylesheet into the luminous system in `viewer/appearance.js`:
      - ordinary nodes keep their existing shape, type icon, and quiet fill;
      - hovered elements receive a soft, localized underlay using the existing `.hovered` state;
      - selected elements receive the new selection border plus a stronger underlay;
      - review candidates and violations keep their existing amber/red badges and wire symbols, with optional
        severity-colored underlay only on the actual hovered candidate/violation;
      - boundary, source-region, organizational, expanded, unavailable, and overlapping-context meanings remain distinct;
      - expanded containers keep `underlay-opacity: 0` and use fill/border/title emphasis instead;
      - use solid underlay colors, not gradients, and use `underlay-shape: ellipse` for circular markers where useful;
      - keep underlays below icons, labels, and warning marks, with no new pointer targets or hit-area changes;
      - do not light every `.focus` member; bright effects belong to the actual hovered, selected, or trace-anchor
        elements.
- [ ] Keep `readableLabels()` untouched unless a concrete conflict appears. If underlay padding must change, update the
      geometry owner and its `labelGeometry` invalidation deliberately; do not add state-dependent geometry that is
      stale on selection.
- [ ] Adjust label backgrounds only if the atmosphere materially reduces readability. Preserve native text hit testing,
      collision bounds, and the existing text renderer.
- [ ] Refine HTML surfaces conservatively in `viewer/app.css`: header and scope-bar separation, controls, search and
      result surfaces, panels, hover card, focus and selected-tab indicators. Keep responsive layouts and keyboard
      behavior unchanged.
- [ ] Verify that no new graph elements, reference edges, pointer targets, or review elements appear, and that the
      existing warning SVG output is unchanged.

### C. Interaction refinement

- [ ] Evaluate native Cytoscape transitions for hover and selection. If used, scope them to `.hovered` and `:selected`
      only, transition color/opacity rather than geometry, keep duration short, and honor reduced motion. Otherwise
      record the no-transition decision and leave the static system.
- [ ] Verify the existing `preview()`, `focus()`, `unfocus()`, `clearTrace()`, and Review projection owners remain the
      only hover/selection state machines. Do not add a parallel state path.
- [ ] Verify clear selection, Escape, gestures, projection refresh, theme change, and live adoption return the ordinary
      presentation without leaked underlays, classes, or selection marks.

### D. Required navigation motion

- [ ] Implement one small helper in `viewer/scene.js` for explicit navigation (`flyToNode`, `followReference`, and
      intentional framing). It must step through `setWorldViewport()` rather than `cy.animate()`, cancel immediately on
      wheel, drag, pointer, or newer navigation, and never queue work.
- [ ] Before shipping, verify all of the following: renderer-scale threshold crossings, intermediate viewport culling and
      newly revealed elements, semantic expansion/collapse, selection and panel resizing, live adoption blocking,
      camera/history/pin restoration, exact final camera state, and reduced-motion behavior.
- [ ] If any invariant cannot be preserved with a small local change, return BLOCKER with the concrete blocker and
      evidence. Do not silently defer D or ship a partial animation. A-C may be reported as partial evidence, but the
      requested scope is not complete without D.

### E. Acceptance and documentation

- [ ] Run the full affected Node and Python matrix and the relevant browser acceptance functions.
- [ ] Run `tests/viewer.performance.js` on matching data, scope, expansion, and camera state before and after. Record
      frame times, long tasks, heap, scene differences, and pin stability; reject a repeatable material regression.
      The existing scenario covers wheel zoom and mouse pan; measure explicit navigation after D. If hover/tracing, dense
      native views, or expanded source folders are not covered, measure them with a bounded probe or record them
      UNVERIFIED rather than inferring them from the wheel/pan result.
- [ ] Use the drive-browser skill for representative real-project acceptance: overview, world hierarchy, source
      structure, and a dense folder; both themes; no selection, hovered, and selected states; overview/mid/deep zoom;
      desktop and narrow viewport; explicit navigation and interruption. Keep screenshots and snapshots outside the
      clone and record only neutral outcomes. Do not print or record the CDP endpoint, cookies, or storage state.
- [ ] Update the stable viewer documentation as described below.
- [ ] Review the final diff against this todo and the stable sources of truth. Report changed files, behavioral changes,
      verification results, performance impact, and remaining limitations. Do not stage, commit, or push.

## Test-first and verification plan

### Red evidence

The change is a feature plus a behavior-neutral refactor: luminous appearance, required navigation motion, and one
extraction. The following matrix names each case and the wrong behavior it captures today.

| case | today's wrong behavior | layer |
|---|---|---|
| Dark and light selection roles | Dark selection and candidate have nearly the same hue (about 38 vs 35 degrees); light selection and candidate share the amber family. Selection is not reliably distinguishable by color. | New Node token test + browser computed-style check |
| Static stylesheet ownership | `style()` is mixed into `map.js`; no `appearance.js` exists, and the fixture loads only `map.js`. | New Node ownership/load-order test |
| Expanded-container underlay | A naive selected/hovered glow would override the existing `node.expanded { underlay-opacity: 0 }` rule. | New style guard with a known-bad control |
| Style property validity | A typo or unsupported property is rejected with a console message and leaves the previous value. A known-bad `underlay-color: radial-gradient(...)` must be rejected by the validator. | New Node style-property test |
| Theme change stability | A careless implementation could rebuild the renderer or lose selection/pins when the theme changes. | Existing `icons.browser.js` theme loop plus an identity/state check |
| Clear-selection cleanup | A new underlay or transition could remain after deselection, Escape, or a gesture. | Browser acceptance check |
| Explicit navigation motion | `flyToNode()`, `followReference()`, and intentional framing jump directly through `frameNode()`/`setWorldViewport()`; there is no interruptible transition or reduced-motion branch. | Browser acceptance + reviewer |
| Motion cancellation | A naive tween could continue after wheel, drag, pointer, or newer navigation, or fail to settle at the exact destination. | New browser scenario |
| Warning semantics | New lighting could obscure the amber/red SVG badges or wire symbols, or add finding nodes. | Existing `review.browser.js`, `health.browser.js`, `review.test.cjs` |
| Graph facts and pins | Visual work could add graph elements or move saved positions. | Existing `viewer.browser.js`, `icons.browser.js`, Node suites |

The token test parses the light and dark `:root` blocks, requires the named tokens, and asserts that the selection hue
differs from candidate and violation by at least 60 degrees. That threshold is a starting proxy for color-family
distinction; Chromium computed styles and the reviewer's visual check are the authoritative evidence. The
expanded-underlay and style-property guards must be shown failing against a temporary known-bad stylesheet before the
production stylesheet passes them.

### Green evidence

Run the documented commands from `tests/README.md`, not an invented aggregate:

```text
node --test tests/icons.test.cjs tests/sections.test.cjs tests/viewer.test.cjs tests/universe.test.cjs tests/references.test.cjs tests/traces.test.cjs
node --test tests/review.test.cjs
node --test tests/live.test.cjs tests/analysis.test.cjs
python -m unittest discover -s tests -p test_documentation.py
python -m unittest discover -s tests -p test_privacy.py
```

Add the new appearance test to the first Node command and to `tests/README.md`:

```text
node --test tests/appearance.test.cjs
```

The style-property test can read the vendored definitions from
`cytoscape({headless:true,styleEnabled:true}).style().properties` and walk the `style()` rules; keep a temporary
known-bad stylesheet control that proves the validator rejects an unsupported property.

Run the full Python suite when the change is ready for final review, including the existing source, review, monitor,
privacy, and documentation checks.

Browser acceptance uses the existing manually configured Playwright harness:

- `icons.browser.js` for themes, graph stability, glyph geometry, and pointer hits;
- `traces.browser.js` for direction colors, overlap, and theme contrast;
- `viewer.browser.js` for selection, clearing, navigation, saved positions, and narrow viewports;
- `readability.browser.js` for labels and semantic zoom;
- `source-surface.browser.js`, `namespace-files.browser.js`, `review.browser.js`, `inspector.browser.js`,
  `health.browser.js`, and `live.browser.js` for the affected presentation and adoption paths;
- a new appearance acceptance scenario for computed selection/candidate/violation colors, hover/selection underlays,
  expanded-container underlay suppression, theme identity, clear-selection cleanup, and narrow containment.

Do not invent a browser launcher. If the harness is unavailable, mark those results UNVERIFIED rather than passing them
by assertion.

Real-project visual acceptance uses the drive-browser skill against the locally served viewer. Resolve the configured
CDP endpoint and dedicated agent profile through the existing ignored local setup; never print, copy, or record the
endpoint, profile paths, cookies, or storage state. Keep the operator's current window and active tab unchanged and use
a background tab. Drive the ordinary viewer controls and read computed styles or bounded screenshots; keep all evidence
outside this clone. If the setup is missing or unconfigured, report the missing integration, do not guess a port or
launch a second browser, and mark the real-project result UNVERIFIED. Synthetic fixtures cannot stand in for the
real-project acceptance claim.

### Reviewer-checked judgements

- The atmosphere reads as depth, not as stars, clusters, dependencies, or hotspots.
- Ordinary elements remain quiet; only the actual active element and its real trace receive strong light.
- Selection, candidate, violation, external, and direction cues remain distinguishable in both themes without relying
  on glow or color alone.
- Expanded containers, source regions, organizational backgrounds, and overlapping saved-position contexts remain
  readable and do not become progressively brighter with nesting.
- Labels remain readable over the atmosphere, and warning badges remain visible on expanded titles and file markers.
- The HTML surface polish is coherent, not a broader redesign, and does not change panel behavior or keyboard access.
- D is required scope: motion explains navigation, is immediately interruptible, never queues, and reduced-motion
  users get no transitional movement.

## Documentation plan

- **Authoritative stable owner:** [docs/architecture/viewer.md](../docs/architecture/viewer.md)
- **Router / TOC update:** add a "Visual appearance" entry to the viewer document's Contents.
- **Composition table:** add `appearance.js` as the owner of the static Cytoscape stylesheet and `app.css` as the owner
  of theme tokens and HTML surface styling; adjust the `map.js` row to name canvas geometry, projection, and pointer
  interaction rather than all rendering.
- **Content to add:** the appearance ownership split, the static atmosphere and solid-underlay constraint, selection
  versus candidate/violation semantics, expanded-container underlay suppression, theme-change behavior without graph
  recreation, and reduced-motion/no-idle-animation rules. Add the navigation-motion contract: interruptibility, no
  queued motion, exact final camera, renderer-scale/culling/semantic-navigation preservation, and reduced-motion
  behavior. Keep it to durable contracts and invariants.
- **Duplication avoided:** link to the existing "Tracing and inspection", "Viewport and memory lifetime", and "Review
  presentation" sections instead of restating trace colors, label collision, or review badge behavior. Do not repeat
  reference-type palette values that `app.js` owns.
- **Tests documentation:** add the new appearance test file to `tests/README.md` and, if a new browser scenario is
  added, add its one-line acceptance scope to the browser table.
- Do not link stable documentation to this todo. Do not record analysed-project data, real paths, or screenshots.

## Rollout and rollback

This is a local viewer presentation change with no data migration, no schema change, and no persisted state change.
Rollback is a code revert. The extraction is independently reversible from the visual rules: if the extraction causes a
fixture or load-order problem, revert it without reverting the visual work, and vice versa. If the luminous rules cause
a repeatable performance or readability regression, revert the appearance rules first; the behavior-neutral extraction
can remain. Navigation motion is independently revertible; if D fails its invariants, remove the helper and return a
blocker rather than leaving a partial tween. No deployment, shared environment, or production operation is involved.

## Completion criteria

Return PASS only when all of the following are supported by direct evidence:

- The `style()` extraction is proven behavior-neutral by the pre/post stylesheet JSON and graph identity/count/position/
  pin comparison, and all existing lightweight Node suites pass.
- The luminous appearance is visibly improved across the representative views in both themes, with ordinary, hovered,
  selected, candidate, and violation states reviewed at overview, middle, and deep zoom.
- Selection, candidate, and violation roles are distinguishable in both themes by computed styles plus at least one
  non-color cue; warning SVG shapes, wire symbols, counts, and Review semantics are unchanged.
- Expanded containers receive no large circular underlay; selected expanded containers keep underlay opacity zero.
- No graph elements, reference edges, finding elements, positions, pins, layout modes, scene state, or analysis/
  publication behavior changed. Theme changes do not recreate the graph.
- Explicit navigation motion is implemented and verified: interruptible by wheel, drag, pointer, or newer navigation;
  never queued; exact final camera; renderer-scale thresholds, viewport culling, semantic expansion/collapse, selection
  and panel resizing, history, pins, live-adoption blocking, and reduced-motion behavior all pass. If D cannot be made
  safe, the task returns BLOCKER; a partial A-C result is not PASS.
- The existing Node suites, documentation/privacy checks, and affected browser acceptance pass. All required browser and
  drive-browser scenarios were executed; any scenario that could not be executed is explicitly UNVERIFIED, and the task
  does not claim PASS for that scope.
- `tests/viewer.performance.js` shows no repeatable material regression on a matching scene, including explicit
  navigation after D; performance is not claimed to improve merely because the appearance changed.
- Keyboard focus, narrow layouts, both themes, and reduced motion remain correct. There is no idle animation or
  continuous main-thread work.
- `docs/architecture/viewer.md` accurately describes the resulting ownership and motion contract, and `tests/README.md`
  lists the new test.
- No analysed-project data entered tracked files; no staging, commit, or push occurred.
- The drive-browser real-project acceptance was executed against the local viewer: representative views, both themes,
  ordinary/hovered/selected states, overview/mid/deep zoom, desktop and narrow widths, and explicit navigation and
  interruption. Only neutral outcomes were recorded and all screenshots or snapshots stayed outside the clone. If the
  configured drive-browser setup is unavailable, report the missing integration and return UNVERIFIED for that
  acceptance; the task does not claim a full visual PASS.

If a requirement fails, return PATCH with the exact evidence, consequence, and smallest necessary fix. Do not mark the
todo complete because code compiles or a synthetic unit suite passes.

## Review record

### 2026-11-23 - investigation of the luminous appearance brief

- **Trigger:** Operator asked for an investigate-change todo using the supplied architect verdict and implementation
  brief.
- **Root cause:** The viewer has no dedicated static appearance owner and no distinct selection role or atmosphere.
  The supplied brief's "native radial-gradient underlays" premise is false for the pinned renderer; gradients are
  available on node backgrounds, not underlays.
- **Fix:** No production code changed. This todo records the corrected design, the gated motion decision, the
  ownership split, and the verification matrix.
- **Verification:** Baseline lightweight Node suites passed (207 tests), documentation and privacy checks passed (5
  tests), and the vendored Cytoscape property types and runtime behavior were inspected. Browser, real-project, and
  performance acceptance were not run.
- **Authority:** D1 added; Q1 and Q2 opened as non-blocking; A1-A4 recorded. The architect brief remains input and
  recommendation, not operator authority.

### 2026-11-23 - operator scope answers and implementation gate

- **Trigger:** Operator answered Q1 (include navigation motion and improve the visual experience fully) and Q2 (use the
  drive-browser skill), and required reviewer review plus operator GO before implementation.
- **Root cause:** No new code defect. The scope changed: D is now required, the real-project acceptance route is the
  configured drive-browser setup, and implementation is explicitly gated.
- **Fix:** Todo updated. Q1 and Q2 closed; A1 resolved; D2-D4 recorded; D tasks, motion invariants, browser acceptance,
  documentation content, and completion criteria now require motion and live drive-browser evidence. No production code
  changed.
- **Verification:** Documentation and privacy checks were re-run after the update (3 + 2 tests pass). The ignored
  drive-browser configuration loads with a configured agent profile and a loopback endpoint; no page was attached to.
  No real-project, performance, or implementation work was performed.
- **Authority:** D2, D3, D4 added; Q1 closed by D2; Q2 closed by D3; A1 resolved by D2; A5 and A6 active.
