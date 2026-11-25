# Luminous viewer appearance and navigation polish

**Status** REVIEW REQUIRED - reopened 2026-11-25  
**Baseline** `c2d88cc` on develop  
**Stable owner** [Viewer architecture](../docs/architecture/viewer.md#visual-appearance-and-motion)

## Contents

- [Goal](#goal)
- [Authority register](#authority-register)
- [Evidence](#evidence)
- [Design](#design)
- [Required invariants](#required-invariants)
- [Implementation tasks](#implementation-tasks)
- [Verification](#verification)
- [Documentation plan](#documentation-plan)
- [Completion criteria](#completion-criteria)
- [Review record](#review-record)

## Goal

Make the architecture map feel like a luminous, navigable star field. Give architectural families distinct color,
keep the underlying type glyphs legible, and let the operator wheel into detail without losing their place.
[Sky of Sound](https://skyofsound.com/) is the reference for depth, luminosity and perceived fluidity.
Use Laniakea's own hierarchy, shapes and semantics to express that direction.

## Authority register

### Prior-round decisions

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
- **D3 [SUPERSEDED IN PART by D7 - configured-route clause]:** Use the drive-browser skill for real-project browser
  acceptance.
  - Effect: the live real-project visual check is required evidence and must use the configured drive-browser route.
    Do not substitute synthetic fixtures for the real-project claim.
  - Reason: not stated.
  - Date/source: 2026-11-23 operator answer to Q2.
- **D4** Wait for reviewer review and operator GO before implementation.
  - Effect: the todo remains REVIEW REQUIRED. No implementation, staging, commit, or push starts before both gates.
  - Reason: not stated.
  - Date/source: 2026-11-23 operator request.
- **D5** Implement the approved todo.
  - Effect: implementation starts now. D4's reviewer and operator gates are satisfied; no staging, commit, or push is
    authorized.
  - Reason: not stated.
  - Date/source: 2026-11-23 operator request.
- **D6** Keep the local Laniakea viewer running between change iterations; rebuild and run it again after each change
  instead of stopping it as routine cleanup.
  - Effect: do not run `python laniakea.py down` after acceptance or iteration work. Leave the viewer running locally.
  - Reason: operator workflow preference.
  - Date/source: 2026-11-23 operator request.
- **D7** Approve the isolated Chrome session driven through `playwright-cli` as acceptable evidence for D3 real-project
  visual acceptance.
  - Supersedes in part: D3's configured-route clause.
  - Effect: the isolated drive-browser session satisfies D3. The real project remains mandatory, and synthetic fixtures
    still cannot substitute for real-project visual evidence.
  - Reason: operator approved the isolated route as their proposal.
  - Date/source: 2026-11-23 operator approval.

### Prior-round gates

- **Q1 [CLOSED by D2]:** Is navigation motion (implementation step D) part of this change, or a separate follow-up?
- **Q2 [CLOSED by D3]:** Is a local real-project map plus the repository's manually configured Playwright harness
  available for visual acceptance?
- **Q3 [CLOSED by D7]:** Does the isolated Chrome session used for the four-view visual evidence satisfy D3, or must
  the configured drive-browser endpoint be used?

### Prior-round assumptions

- **A1 [RESOLVED by D2]:** Steps A-C are the primary scope. Step D is gated, deferred by default, and ships only if a
  small `setWorldViewport`-compatible helper proves every camera invariant in this todo.
  - Resolution: D2 makes D required; the deferral clause no longer applies.
- **A2 [SUPERSEDED BY D9]:** Keep `--bg` and the reference-type `PALETTE` values stable. Add atmosphere with nearby tints and change
  only the semantic selection role.
- **A3 [SUPERSEDED BY D9]:** Use solid translucent Cytoscape underlays for node glow and a CSS radial gradient for map atmosphere.
  Radial-gradient underlays are not available in the pinned renderer (see current renderer evidence).
- **A4 [ACTIVE]:** Do not add Cytoscape style transitions unless they are scoped to the active hover/selection subset,
  reduced-motion-safe, and measured. Default is no transition.
- **A5 [ACTIVE]:** A small `setWorldViewport`-compatible motion helper can preserve renderer-scale threshold crossings,
  viewport culling, semantic navigation, interruption, and exact final camera state. Feasibility is not yet proven.
- **A6 [ACTIVE]:** A configured drive-browser endpoint and a locally served real-project viewer are available. If either
  is missing, report the missing integration instead of guessing an endpoint or substituting synthetic evidence.
  - Evidence: the ignored local drive-browser configuration loads; a browser endpoint and dedicated agent profile are
    configured, and the endpoint is loopback. The current real-project viewer serving state was not checked.

### Decisions for this round

- **D8** Reopen the luminous viewer TODO. Engineering acceptance passed and operator visual and interaction acceptance failed.
  - Effect - clears DONE and reopens review for the revised scope. D1 and D5 describe the prior round.
  - Reason - the viewer still looks like a conventional dependency diagram and routine wheel exploration remained discrete.
  - Source - 2026-11-25 operator request.
- **D9** P0 requires bright-core architectural nodes with true radial light falloff and continuous, pointer-anchored
  wheel zoom through semantic changes. P1 requires richer family colors, atmospheric depth, softer constellation
  surfaces with luminous boundaries, cleaner labels and quieter idle connections.
  - Effect - supersedes the visual and wheel targets behind A2 and A3. Covers inward reveal, outward fold and file navigation.
  - Reason - a restrained background change, solid node underlays and explicit flights did not deliver the original experience.
  - Source - 2026-11-25 operator request.
- **D10** Preserve the existing architecture, camera lifecycle, reference-accounting fixes and test coverage. Investigate
  the pinned renderer, cached local SVG path and existing world-coordinate authority. Keep one renderer.
  - Effect - extends the appearance and camera owners already in use. Start with native styling and local assets.
  - Reason - the operator accepts the engineering foundation and sees no justification for a second renderer.
  - Source - 2026-11-25 operator request.
- **D11** Capture comparable before and after views and demonstrate actual wheel interaction. Obtain operator approval
  of the visible result before DONE.
  - Effect - visual appearance and perceived wheel smoothness remain open after technical verification.
  - Reason - the previous technical acceptance failed to establish the intended experience.
  - Source - 2026-11-25 operator request.

### Current gate and assumptions

- **Q4 [OPEN - BLOCKING FOR DONE]** Does the operator approve the before and after views and the wheel behavior shown
  in the interactive build and recording under D11?
- **A7 [ACTIVE]** Use build units, source organization, data types and callables as the first palette families. Keep
  external, selection, trace and Review cues independent. Derive both themes from the same family assignments.
- **A8 [ACTIVE]** Use the fully expanded sample scenes as reproducible comparison views. Repeat the paired visual
  and interaction checks on the approved real-project route under D3 and D7 before closing Q4.

## Evidence

- Wheel input is captured on the graph. `zoomWithWheel()` accumulates deltas for one animation frame and applies the
  entire exponential factor in `zoomAt()`. Pointer anchoring is already implemented in `zoomAt()`.
  `setWorldViewport()` converts world scale and pan to renderer coordinates. [Scene input](../viewer/scene.js)
  [Canvas camera](../viewer/map.js)
- `semanticZoom()` schedules a separate callback. `Universe.zoomStep()` opens one eligible nearby group at
  300 rendered pixels and folds the deepest eligible group below 190. Ordinary changes update the projection at the
  current camera. `enterWheelScope()` can change the world scale and pan in one call to align a distinct destination
  with the source marker's former screen position and footprint. It preserves recorded file routing and symbol identity.
  [Semantic selection](../viewer/universe.js) [File navigation contract](../docs/architecture/viewer.md#source-organization)
- Trusted Chrome wheel input on the [synthetic source surface](../fixtures/source-surface.graph.json) gave the
  following pre-change sequence for one `deltaY=-120` event per case. The trace samples distinct camera/projection
  states per frame. [Local trace and scene settings](../workspace/tmp/luminous-baseline.json)

  | Case | Observed world zoom | Observed handoff |
  |---|---|---|
  | Empty canvas | 1.000000 to 1.241102 in one update | Pointer world coordinate stayed fixed |
  | Renderer scale boundary | 1.950000 to 2.420150 in one update | Renderer scale changed from 1 to 4 with a fixed world anchor |
  | Ordinary expansion | 1.080000 to 1.340391 in one update | Module replaced its collapsed projection on a later frame at the same camera |
  | Definition portal | 10.600000 to 13.155685 to 11.506430 | Pointer world Y rebased from 87.75 to -65 when the method scope appeared |

  These samples establish the ordinary step, the separate projection swap and the portal rebase. The scale-boundary
  sample establishes camera-coordinate continuity to the trace's precision. Rendered alignment and perceived frame
  quality across scale changes still need browser comparison.
- The pinned Cytoscape 3.34.4 parser rejects a gradient as `underlay-color` and accepts `background-fill:
  radial-gradient`, gradient stops, per-image clipping/containment and `bounds-expansion`. `NodeIcons.paint()`
  already supplies local SVG glyphs and warning badges in ordered native image layers. The existing bounds contain
  glyphs and badges. A temporary Chrome probe rendered a radial SVG under the existing file glyph. For a 44 px
  body, samples at 28, 38 and 48 px from the center approached the underlying surface color in order and matched
  it at 58 px. This proves native falloff beyond the body in one sample scene. Badge stacking, pan redraw and
  dense-scene performance remain implementation checks.
  [Local pixel trace](../workspace/tmp/luminous-native-svg-probe.json)
  [Renderer pin](../THIRD_PARTY.md) [Image composition](../viewer/icons.js) [Appearance rules](../viewer/appearance.js)
- The sample baseline contains overview, expanded module, expanded source file and expanded symbol in both themes
  at 1440x1000 with fixed layout and recorded camera settings. PNGs and a trusted-wheel WebM are outside the clone.
  The screenshot and recording recipes are `workspace/tmp/luminous-baseline.js` and `workspace/tmp/luminous-wheel-video.js`.
  The capture reported zero page errors. The 44 focused appearance, glyph, flight and universe unit tests passed.
  Their assertions cover contracts and do not measure the requested visual quality.
- `startNavigationFlight()` already establishes a bounded projection and keeps live adoption blocked until
  completion or cancellation. `c2d88cc` recomputes represented references after the staging cut and removes
  a redundant flight render. Retain that behavior. [Flight lifecycle](../docs/architecture/viewer.md#visual-appearance-and-motion)
  [Adoption gate](../viewer/live.js) [Projection regression](../tests/universe.test.cjs)

## Design

**Proposal under D9-D10.** Let [appearance.js](../viewer/appearance.js) own family assignments, light roles,
label hierarchy and emphasis. Let [app.css](../viewer/app.css) supply theme colors and broad atmospheric gradients.
Use the existing glyph kind or recorded presentation metadata for family membership. Keep node shape and glyph as
readable cues alongside color. Start in dark mode with a deep blue-violet field, teal build units, indigo source
regions, lilac data types and coral callables. Tune corresponding light-mode colors against the pale field. These are
starting roles for the visual pass and may change after contrast and density checks.

Compose the leaf as an illuminated core, a soft transparent radial falloff and a crisp glyph. Prototype native radial
fill for the core and a cached local SVG halo for the falloff beyond the silhouette. Extend the existing native image
composition in [icons.js](../viewer/icons.js) so the halo draws below the glyph and warning badge. Key reuse on
bounded style values such as family and theme. Size the halo in screen pixels and account for its drawing bounds at
each renderer scale. Check rendered clipping, redraw and hit behavior in Chrome. Expanded groups get a softly tinted
surface and an illuminated contour with a subdued interior for nested regions. Keep body and title geometry with
[map.js](../viewer/map.js). Use CSS atmosphere behind the existing canvas and quieter label backplates and idle wires.
Leave selected, traced, warning and Review states legible at dense and narrow views.

Keep wheel input and semantic handoffs in [scene.js](../viewer/scene.js) and camera application in
`setWorldViewport()`. Give one wheel burst a bounded log-zoom target and one frame owner. Retarget from the displayed
camera on subsequent input and apply each frame from the current pointer anchor. A stationary pointer keeps its world
point across ordinary zoom and renderer scale changes. Preserve the settled notch scale away from portals and the
reversibility of equal opposite input. Keep immediate reduced-motion behavior. Use the applied zoom for threshold
decisions and coordinate camera and projection ordering so an obsolete callback cannot apply a later semantic change.
Keep the existing thresholds and route policy. A local reveal or fold should stay spatially coherent as the visible
representatives change. Try ordering the swap with the camera update first. If a matched recording still shows a pop,
use a brief native entrance treatment for the affected frontier.

For a file portal, define the anchor as a handoff from the source representation to its recorded destination. Compute
the destination alignment and remap the outstanding zoom target at that boundary. Use the existing camera and projection
path to carry that adjustment through the visible transition. The same canonical symbol must appear once. A local
coordinate rebase may be invisible at the handoff while the surrounding view jumps, so judge both the pointer target and
nearby landmarks in the recording. Verify direct and contextual file routes, including reverse wheel input during the handoff.

### Premise and KISS

The viewer already owns the camera, semantic projection and native image layers needed for this goal. Replace the
one-shot wheel update with a retargetable gesture and reuse existing projection and cancellation boundaries. Add a
bounded set of local halo image variants. The scope covers illumination and camera motion driven by the map's own data
and input. Procedural scenery, parallax, per-node clocks, a second renderer and added dependencies are outside this round.

## Required invariants

- D10 covers projection reference accounting, canonical graph identity, world positions, saved pins, inspection and
  the existing explicit-flight lifecycle. Preserve the bounded staging cut and its accounting of omitted owners.
- One active camera intent drives each frame. A newer wheel burst, map pointer action, keyboard camera action, flight,
  renderer/target replacement or restore takes precedence over stale work. Size changes use the current canvas
  geometry. Errors release outstanding frames and adoption guards. Live updates wait through active wheel motion and settle.
- Maintain direction, clamp, browser modifier-wheel zoom, trackpad deltas, native drag and pinch behavior, selection,
  breadcrumb and history behavior. Persist the settled world camera and committed scope through the existing history path.
- Preserve hysteresis, one-layer reveal/fold, file context disambiguation, native pointer targets, label collision
  handling, and accessible shape, glyph and text cues. Distinguish idle, trace, selection, warning and Review states.
- Keep all runtime assets local. Source data, tests and tracked captures use synthetic sample material. Keep private
  receipts and observations out of tracked files, and screenshot/video artifacts outside the clone.

## Implementation tasks

- [ ] Re-run the trusted wheel baseline cases and save the matched comparison scene metadata. Add red browser assertions
  for intermediate notch frames and portal handoff continuity before changing camera behavior. Extend image and geometry
  guards only where they detect a concrete regression.
- [ ] Deliver P0 wheel interpolation through the scene owner. Coordinate semantic thresholds, projection refresh,
  rescaling, portal alignment, cancellation and live deferral. Test ordinary motion and the portal as independent cases.
- [ ] Deliver P0 native radial illumination, then tune P1 family colors, atmosphere, boundaries, labels and idle wires
  on the same before and after scenes. Check both themes, dense overlap and foreground emphasis as part of tuning.
- [ ] Compare input latency, frame deltas, long frames and visible retention on equivalent scenes under moderate and
  dense workloads. Check drawing bounds, image reuse and projection bounds after repeated gestures.
- [ ] Run the verification matrix, review the diff, update stable docs and present paired views, a trusted-wheel
  recording and a live viewer for Q4. Keep the local viewer running per D6.

## Verification

| Case | Baseline to reject | Required evidence |
|---|---|---|
| Isolated notch and continuous input | One complete scale jump per input frame | Trusted `page.mouse.wheel` and manual wheel/trackpad checks. Sample rendered frames across an isolated notch, bursts, moving pointer, reversals and zoom limits. Show intermediate scales, prompt response, finite settlement, the expected final scale and stable pointer anchor. |
| Ordinary semantic thresholds | The projection swaps abruptly on a later frame | Repeat the same zoom path over a container, file and symbol, then fold out. Verify one-layer hysteresis, steady reference accounting and continuity of near landmarks. Include an actual wheel recording because a fixed camera does not prove projection smoothness. |
| File and namespace portal | One-frame world-scale and anchor rebase after the zoom step | Use the source-surface and namespace fixtures with trusted input. Measure source-to-destination pointer alignment and the visible camera path. Include near landmarks, reverse input, scope/history, and exactly one canonical destination. |
| Renderer scale changes | Internal zoom changes units at world-scale boundaries | Cross 2 and higher power-of-two boundaries in both directions. Check actual projected positions, label/icon dimensions, bounds, hit targets, stable world anchor and frame pacing. |
| Interruption and reduced motion | New wheel state could outlive its renderer or intent | Interrupt wheel with drag, fit, keyboard zoom, explicit navigation, restore and target change, and interrupt a flight with wheel. Include resize, pending live adoption and an injected frame failure. Check immediate reduced motion, no stale effects, settlement and no pin writes. |
| Radial light and hierarchy | Solid underlay and near-uniform family treatment | Confirm real rendered falloff beyond the core with visible glyph and badge. Compare matched overview, expanded module, file and symbol in both themes, plus a narrow view and dense scene. Demonstrate quiet idle wiring and readable labels, focus and warning states. |

Run the [documented Node suites](../tests/README.md#automated-checks) and
`python -m unittest discover -s tests -p test_documentation.py` from the repository root. Extend
[appearance browser acceptance](../tests/appearance.browser.js) and [motion browser acceptance](../tests/motion.browser.js)
where their real-route checks cover the new behavior. Use the [documented browser harness](../tests/README.md#browser-acceptance)
for icons, traces, readability, endpoints, health, sections, source surface, namespace files, viewer, live, inspector,
Review and source-navigation comparisons on their disposable targets. Preserve the full focused-projection and
explicit-flight regressions. Run the [gesture probe](../tests/viewer.performance.js) and
[flight probe](../tests/viewer.flight-performance.js) on the same scene and workload across versions. Review representative
painted frames and uncut wheel input footage alongside timings. A reproducible increase in long frames, lag,
scene blanking or retained elements blocks acceptance until explained and resolved.

## Documentation plan

Update [Viewer architecture](../docs/architecture/viewer.md#visual-appearance-and-motion) for the durable appearance
and shared camera contracts. Update [navigation guidance](../docs/guide.md#read-and-navigate-the-map) if observable
controls change, and [verification](../tests/README.md#browser-acceptance) for revised executable checks.
Keep experiments, comparison settings and review decisions here.

## Completion criteria

- D9 is visible in paired screenshots at matching data, layout, expansion, viewport, theme and camera position.
  Compare the synthetic baseline and the approved real-project route under D3/D7. Reproduce the pre-change real-project
  route at the recorded baseline commit when a fresh matched pair is needed.
- A live wheel demonstration and a matched before and after recording show inward and outward zoom, a moving pointer,
  reversal, ordinary expansion/fold, and a file portal. Rendered-frame traces support continuity and anchor claims.
- Technical checks support D10 and the verification matrix. Review camera ownership, reference accounting, contrast
  and runtime behavior before asking the operator to inspect the result.
- Record Q4's approval explicitly before marking DONE. Record the verdict and observations without private project
  data or screenshot paths in tracked files.

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

### 2026-11-23 - reviewer PATCH F1: motion lifecycle

- **Trigger:** Reviewer accepted the direction but required an explicit cross-frame motion lifecycle contract before
  operator GO.
- **Root cause:** The todo named the camera invariants but did not assign a flight-level owner. The existing
  `state.framing` flag is synchronous, `setWorldViewport(..., false)` does not schedule culling, and `renderGraph()`
  replaces the Cytoscape instance. The KISS paragraph also overclaimed that motion adds no transient state.
- **Fix:** Added D.1 with single-flight ownership, full-lifetime `state.flight` visibility to `liveBlockReason()`,
  frame generation/scene checks, culling through `scheduleViewport()`, cancellation before interrupting input or
  renderer replacement, one-shot history, interruption without snap-back, and reduced-motion behavior. Corrected the
  KISS wording to allow one transient flight record, RAF handle, and generation guard. Added lifecycle rows and browser
  checks to the verification matrix. No production code changed.
- **Verification:** The F1 evidence was rechecked against `viewer/map.js`, `viewer/live.js`, and `viewer/scene.js`; the
  synchronous framing window, missing intermediate culling, and renderer replacement are real. Documentation and
  privacy checks were re-run (3 + 2 tests pass). No browser, real-project, performance, or implementation work was
  performed. The reviewer's underlay conclusion matches the pinned-bundle probe; the 60-degree hue check remains a
  labeled proxy, so no change was needed there.
- **Authority:** No new operator decision. Reviewer feedback is input, not authority; D4 still gates implementation.

### 2026-11-23 - implementation

- **Trigger:** Operator requested implementation of the approved todo (D5) after the reviewer's F1 contract was added.
- **Implementation:** Extracted the static stylesheet to `viewer/appearance.js`; added light/dark atmosphere and
  selection tokens, luminous hover/selection/review states, conservative HTML surface polish, and the single cancellable
  camera flight in `viewer/scene.js` with destination inspection, live-adoption blocking, renderer cancellation,
  selection revalidation, exception-safe flight release and reduced-motion handling. Clear, Escape, graph arrow and
  Review-list selection cancel an active flight so newer selection intent wins. Updated the stable viewer document,
  guide, test README, and browser pacing helpers. Added the local Playwright CLI scratch directories to `.gitignore`
  as an accidental-disclosure safeguard; this reduces staging risk but cannot prevent an explicit force-add.
- **Verification:**
  - Node: 177 tests in the appearance/motion/icons/sections/viewer/universe/references/traces group, 13 review tests,
    and 29 live/analysis tests passed (219 total). The motion group includes injected frame/render failures, stale
    cleanup, and clear/Escape/arrow/Review cancellation.
  - Python: the full suite passed (352 tests, 38 skipped); the server suite passed 28 tests; documentation and privacy
    checks passed (3 + 2).
  - Browser on the disposable sample: `appearance.browser.js`, `motion.browser.js`, `icons.browser.js`,
    `traces.browser.js` and `readability.browser.js` passed in an isolated Chrome session. `viewer.browser.js` could
    not be validated against this workspace's saved sample because its configuration-default check expects a different
    disposable sample state. Fixture-only browser suites were not run.
  - Real-project smoke: atmosphere, separated selection, flight start/completion, live blocking, destination inspection
    and absence of page errors passed; screenshots and browser state remained outside the clone. Four-view both-theme
    visual evidence was captured through an isolated Chrome session; D7 accepts that route.
  - Performance: `tests/viewer.performance.js` on the sample recorded p50 4.2 ms, p95 4.3 ms, no long tasks and
    unchanged pins; no pre-change baseline was captured, so this is not a comparative claim.
- **Remaining findings:** fixture-only browser suites and `viewer.browser.js` against its intended fixture remain
  acceptance gaps, not known code defects.
- **Authority:** D5 added; D4 satisfied; no staging, commit, or push.


### 2026-11-23 - visual acceptance

- **Trigger:** Operator requested visual acceptance using the drive-browser skill.
- **Method:** A fresh isolated Chrome session via `playwright-cli` at 1440x1000 against the locally served real project.
  The configured authenticated endpoint was not used because it exposed unrelated tabs; no operator tab was touched.
  Screenshots were written outside the clone.
- **Views reviewed:** Full project overview; a top-level hierarchy folder; a representative world module's source
  structure; a dense private-implementation source region. Both light and dark themes were captured. The world module
  also covered a selected file and a hovered source group.
- **Result:** The atmosphere adds depth without decorative nodes or idle motion. Ordinary nodes stay quiet; selection is
  visibly blue and distinct from warning hues; hover tracing and the hover card remain readable; interface and
  implementation section surfaces and file markers remain distinguishable. The dense region is still busy, but glow does not hide the
  container, labels or warning legend. The light theme remains readable and the narrow overview does not overflow.
  No visual defect requiring a code patch was found.
- **Route provenance:** The configured authenticated endpoint exposed unrelated tabs, so the session was isolated.
  D7 accepts that isolated `playwright-cli` route as satisfying D3; the real project and both themes were still required.
- **Follow-up:** Motion start/mid frames exposed an empty intermediate projection; fixed by union start/destination
  pre-projection in the flight helper, with a browser regression. See the next entry.
- **Remaining:** fixture-specific browser suites and `viewer.browser.js` against its intended fixture.


### 2026-11-23 - reviewer acceptance-route finding

- **Trigger:** Reviewer accepted the visual observations but found the isolated Chrome session was not authorized by D3.
- **Evaluation:** The finding is procedurally correct against the current register. D3 says the configured drive-browser
  route is required; the visual session used a fresh isolated Chrome instance. The observations remain valid evidence,
  but cannot be marked as a D3-compliant acceptance result. Reviewer approval of the alternative is not operator
  authority.
- **Action:** Added Q3 as a blocking operator gate and left the four-view acceptance task unchecked. The visual findings
  and narrow containment are recorded as provisional evidence only. No production code or visual implementation changed.
- **Authority:** No new decision recorded; Q3 awaits the operator.


### 2026-11-23 - isolated acceptance route approved

- **Trigger:** Operator explicitly approved the isolated Chrome session as acceptable evidence for D3.
- **Fix:** Added D7 accepting the isolated `playwright-cli` route; marked D3's configured-route clause superseded in part and
  closed Q3. The four-view both-theme evidence and narrow overview are now accepted. No production code changed.
- **Remaining:** semantic zoom and motion visual coverage, fixture-only browser suites, `viewer.browser.js` against its
  intended fixture, and comparative performance.
- **Authority:** D7 added; D3 superseded in part; Q3 closed by D7.


### 2026-11-23 - semantic zoom, motion and comparative acceptance

- **Trigger:** The four-view visual acceptance exposed an empty intermediate projection at the start of a flight from
  the overview into a deep target.
- **Fix:** The flight now pre-projects the union of the current and destination viewports before animation, with the
  destination projection committed on arrival. Pre-projection failure is exception-safe. Added a browser regression
  asserting a non-empty flight start projection. No further visual-system changes were made.
- **Visual checks:** Four representative semantic zoom levels were reviewed in both themes. Motion start/mid/end frames
  were captured and inspected in both themes after the fix; the path stayed populated and no visual glitches appeared.
  The narrow overview remained contained.
- **Comparative performance:** `tests/viewer.performance.js` ran against an isolated source export of the pre-change
  revision, using the same saved target and matching overview and dense native scenes. Current overview p50/p95 was
  4.2/4.3 ms versus baseline 4.2/4.3 ms; dense p50/p95 was 4.2/129.2 ms versus baseline 4.2/154.1 ms. Main-thread
  work was 0.124 vs 0.128 s overview and 2.276 vs 2.477 s dense. No long tasks or pin movement appeared. Scene
  identity, expansion and camera were matched before both runs; heap is not compared because reference-page caches
  differed.
- **Verification:** Node suites remain at 219 passing tests; the motion browser test includes the new non-empty
  projection regression. Documentation and privacy checks pass.
- **Remaining:** fixture-specific browser suites and `viewer.browser.js` against their intended disposable fixtures.
- **Operational:** D6 was respected: the main viewer remained running; the isolated baseline server was separate.


### 2026-11-23 - fixture acceptance progress

- **Trigger:** Remaining mandatory fixture suites after the visual and performance gates were accepted.
- **Harness:** A temporary launcher under ignored `workspace/tmp/` reused the existing Python fixture builders, started
  dedicated loopback servers, and drove an isolated Chrome session. `source-preview.browser.js` received a temporary
  source-edit control endpoint for its `change('edit'/'missing'/'restore')` phases.
- **Passed:** `source-preview.browser.js`, `source-match-navigation.browser.js` (four-occurrence fixture),
  `health.browser.js` (54-occurrence fixture), `sections.browser.js` and `source-surface.browser.js` on fresh
  disposable samples returned all acceptance booleans with no page errors.
- **Not run/blocked:** `namespace-files`, `review`, `inspector`, and `live` still need their dedicated saved layouts,
  Review policy/native data, or live publishing fixture. `viewer.browser.js` was attempted with moved sample overlay
  nodes; its map-tooltip configuration-subset assertion failed in the headless fixture. These remain UNVERIFIED, not
  code defects.
- **Code changes:** None from this fixture pass. The viewer remained running at the default local endpoint.


### 2026-11-23 - full fixture acceptance and closeout

- **Trigger:** Operator required a final, truly complete acceptance pass rather than leaving fixture suites unverified.
- **Harness:** Temporary launchers under ignored `workspace/tmp/` started dedicated loopback servers for each fixture.
  Each suite ran in a fresh isolated Chrome context through the existing Playwright package; dialogs, multiple pages
  and live publishing worked without attaching to operator tabs. The main viewer stayed on its normal local endpoint.
- **Browser suites passed:** `source-preview.browser.js`, `source-match-navigation.browser.js`, `health.browser.js`,
  `sections.browser.js`, `source-surface.browser.js`, `namespace-files.browser.js`, `review.browser.js`,
  `inspector.browser.js`, `live.browser.js` and `viewer.browser.js`. `appearance.browser.js`, `motion.browser.js`,
  `icons.browser.js`, `traces.browser.js` and `readability.browser.js` remain passing from the earlier acceptance run.
- **Final fixture results:** source-surface returned all map, source-arrangement, reload and narrow checks; namespace
  returned file-first, namespace context, weighted counts, paging, recursion, canonical owners, wheel, keyboard,
  double-click, reload and overlap checks; review returned readable symbols, independent list, warning wires, finding
  choice, off-screen partner, opposite endpoint, exact evidence, triage, refusal, late close and unchanged pins;
  inspector returned tabs, focus, separation, lazy references, retained content, draft, late response, refusal, narrow,
  close focus and unchanged pins; live returned adoption, camera, deep scope, filters, immutable URLs, drag/save
  deferral, drafts, closed inspector, removed focus, narrow map, Review isolation, multiple tabs, render rollback and
  reading-focus checks; viewer returned all navigation, hover, exact-reference, pins, reload, narrow, keyboard and
  configuration-subset checks with no page errors.
- **Product patches exposed by the final acceptance:** hover tracing resumes after a viewport gesture; a spurious
  renderer node `mouseout` no longer clears a trace while the pointer remains inside the node footprint; live adoption
  restores the displayed camera after a projection refresh. Test pacing now waits for the owned flight and for a
  completed live poll instead of relying on one animation frame; these are harness timing corrections, not weakened
  assertions.
- **Final regression matrix:** Node 219 passing (177 group, 13 review, 29 live/analysis); Python full suite 352 passing,
  38 skipped; documentation 3 passing and privacy 2 passing. `git diff --check` is clean. No analysed-project data
  entered tracked files.
- **Limitations:** All browser evidence uses disposable synthetic fixtures except the accepted D7 real-project visual
  session. No new performance run was made after the final hover/camera fixes; the accepted comparative performance
  record above remains the latest measurement.
- **Result:** PASS. The viewer remains running locally for operator checking. No staging, commit, or push was performed.


### 2026-11-23 - reviewer flight-projection findings

- **Trigger:** Reviewer reviewed the DONE closeout and challenged the pre-projected flight implementation.
- **F1 (accepted):** Linear pan plus logarithmic zoom moves the world-space centre outside the endpoint union. The flight must interpolate the centre and logarithmic zoom, not pan. The TODO is reopened.
- **F2 (accepted):** `releaseNavigationFlight()` did not settle the enlarged pre-projection after stationary cancellation. The ordinary projection must be restored through the existing owner; renderer replacement must not trigger an unnecessary refresh.
- **F3 (accepted as a verification gap):** The existing performance probe measured wheel input only. Explicit flights need pre-projection cost, peak renderer retention, final retention and a repeat of the comparative check. The projection's use of the maximum endpoint zoom is a scalability risk until measured.
- **Checklist:** The previously unchecked remaining-fixture task is marked complete; fixture evidence was already recorded in the closeout entry.
- **Result:** PATCH/REOPENED. No visual redesign or new navigation owner.


### 2026-11-23 - reviewer F1-F3 correction

- **F1 (accepted):** The camera interpolated pan linearly while zooming logarithmically, so the world-space centre could leave the endpoint projection. The flight now interpolates the world-space centre and logarithmic zoom, deriving pan from the renderer centre. The projection remains the union of the current and destination viewports; with the corrected path, every intermediate centre and extent remains inside that union. A regression asserts an intermediate camera remains inside the projected cut.
- **F2 (accepted):** `releaseNavigationFlight()` cleared the flight but left the enlarged staging projection. It now settles through `refreshMap()` after restoring framing. Renderer replacement and flight completion skip the refresh; Clear and Escape refresh again after clearing inspection so the ordinary selection-free viewport survives. Regressions cover stationary cancellation plus Clear and Escape projection restoration.
- **F3 (accepted as a verification gap, with a bounded staging correction):** The old probe measured wheel only. Added `tests/viewer.flight-performance.js` for explicit flights and a focused staging projection limited to the visible start scene and destination path, so a large flight rectangle cannot pull every sibling source region into the renderer. The final dense-native probe returned peak 27 nodes / 251 edges, final 16 nodes / 6 edges, and unchanged pins; pre-projection was 494 ms in the latest representative run (range 347-754 ms under host/load variance) and remains the dominant one-time flight cost. This is recorded as a residual cost, not an unbounded retention regression. The wheel probe was rerun current vs pre-change baseline (p95 45.8 vs 41.6 ms on the same served scene; the previously accepted dense-native comparison remains in the record).
- **Fixture checklist:** The archived closeout had an unchecked remaining-fixture task despite the recorded passes; it is now checked.
- **Verification:** Node suites pass (180 group, 13 review, 29 live/analysis; 10 motion tests plus the new focused-projection test); Python 352 pass/38 skip; documentation 3 and privacy 2 pass. Browser `motion`, `viewer`, `live`, `review` and `inspector` pass after the correction; `source-surface` and `namespace-files` also pass on their disposable fixtures.
- **Result:** PASS for the reviewer findings. Visual design, single-flight ownership, dependencies, graph facts, pins, Review semantics and live adoption remain unchanged. No staging, commit, or push.


### 2026-11-23 - focused-projection reference accounting and performance comparison

- **Reference-accounting fix:** The focused staging branch in `Universe.project()` now removes internal owners that are no longer visible and recomputes `represented` from the retained edges and internal references. `outside` therefore remains `total - hidden - represented`; omitted staging references move to outside-view rather than disappearing. The Universe regression uses `difficultGraph()`, calls `place()` to exercise the spatial cut, and asserts `displayed + internal + hidden + outside === total` plus visible internal owners.
- **Performance comparison:** Equivalent explicit navigation on the same target/run was measured against the pre-change export. Baseline: 170.9 ms call, 190.1 ms first visible frame, 268.7 ms total. Final: 138.8-146.6 ms call, 157.7-169.8 ms first visible frame, 431.2-478.7 ms total. Preparation and time-to-visible improved; the longer total is the intentional 180-300 ms flight, not blocking preparation. Final flight probe: 169-243 ms call/preparation, 27 peak nodes / 251 edges, 16 final nodes / 6 edges, 172-247 ms long task, unchanged pins. The final wheel probe was p95 45.8 ms versus 41.6 ms baseline on the same served scene; the difference is within observed host variance and does not establish a material regression. The earlier accepted dense-native comparison remains the comparative record.
- **Optimization:** `flyToNode()` no longer performs a redundant ordinary `refreshMap()` immediately before the flight's pre-projection; the flight start owns that render. This removed a duplicate destination refresh and improved preparation/visible response.
- **Result:** Reviewer reference-accounting defect fixed; performance verdict complete. No new workers, layers, caches or animation infrastructure.

### 2026-11-25 - visual and interaction acceptance reopened

- **Trigger** D8 reopened after the operator rejected the visible result and ordinary wheel interaction.
- **Evidence** Synthetic Chrome captures cover four matched scenes in both themes. Trusted wheel traces distinguish
  the ordinary step, world-to-renderer unit conversion, local projection swap and portal rebase.
- **Authority** D8-D11 added. A2 and A3 superseded by D9. Q4 holds DONE pending operator acceptance.
- **History** The prior implementation plan and its original evidence remain in Git at
  `c2d88cc:todo/done/2026-11-23_1813-luminous-viewer-appearance.md`.
