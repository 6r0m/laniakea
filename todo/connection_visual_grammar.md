# Connection colors, direction and stable hover

**Status:** REVIEW REQUIRED
**Scope:** viewer presentation and inspection; no extraction or canonical graph changes
**Stable documentation owner:** [Graph meaning and interaction](../docs/architecture/graph-model.md)

## Contents

- [Goal and authority](#goal)
- [Evidence and architecture](#verified-evidence)
- [Recommended design](#decision)
- [Required invariants](#required-invariants)
- [Implementation](#implementation-tasks)
- [Verification](#test-first-and-verification-plan)
- [Documentation and completion](#documentation-plan)

## Goal

Let a developer immediately understand what references a star or constellation, what it references,
and what stays within it, without changing tools, selecting a node first, or guessing which overlapping line is under the pointer.

## Authority register

### Operator decisions

- **D1** Investigate coloring, richer hover information, and separate versus shared incoming/outgoing lines; produce a plan before implementation.
  - Effect: this investigation writes this todo only; the attached recommendation is input, not an approved implementation specification.
  - Reason: make colors and relationship direction quickly understandable, including when pointer movement changes the connection being shown.
  - Source: operator request, 2026-11-06.
- **D2** Preserve seamless galaxy exploration and optimized zoom, pan and dragging.
  - Effect: extend the existing continuous map; no required selection, galaxy switching or renderer replacement.
  - Reason: the operator values continuous mouse exploration and the optimized galaxy presentation.
  - Source: preceding operator requests and accepted current explorer behavior.
- **D3** Evaluate the review against actual code, architecture and project goals; apply valid in-scope code/documentation corrections and identify incorrect claims.
  - Effect: authorizes this follow-up correction; quoted reviewer instructions do not themselves approve the proposed feature.
  - Reason: not stated.
  - Source: operator review-follow-up request, 2026-11-06.
- **D4** Keep the task README as lifecycle explanation only, without task references or a router role.
  - Effect: no task-index entry to add, update or remove for this plan.
  - Reason: avoid drift when tasks are completed or moved.
  - Source: operator task-README clarification, 2026-11-06.

### Operator gates

No unresolved technical blocking question. Implementation requires operator approval of this proposal under D1.

### Working assumptions

- **A1 [ACTIVE]:** Keep idle type colors and node appearances; use a small direction palette only during a named trace.
- **A2 [REJECTED by evidence]:** Show paired directional lanes only for reciprocal connections currently being traced; keep stable native hit geometry.
  - The mandatory per-incident-pair interpretation allowed 2d extra curves on node hover; A5 replaces that design recommendation.
- **A3 [ACTIVE]:** Use a small docked readout for richer trace information, separating currently represented counts from all recorded facts.
- **A4 [ACTIVE]:** Keep click inspection optional; it opens the traced pair's two directions without freezing hover emphasis or changing graph ownership.
- **A5 [ACTIVE]:** Node hover creates no decorative edges. Connection hover may use at most two decorative lanes globally for one active reciprocal pair,
  only after native-pointer and performance acceptance. Omit them if those checks fail; the stable semantic readout remains the required result.

## Non-goals

- Unique edge colors per folder/plugin/constellation, new layout modes, community detection, architecture scoring or cycle warnings.
- Recoloring all stars, persistent selection-based exploration, animated traffic, or permanent doubled/curved overview wires.
- Changing extraction, compiler semantics, schemas, reference-page protocols, Engine coverage, layout persistence or analysis freshness.
- A new renderer, dependency, service, cache, worker, polling loop or custom graph hit-testing system.

## Verified evidence

### Facts

1. [Universe.project](../viewer/universe.js) groups by reference family **and ordered source/target**.
   The regression `parallel exact references share one connection without losing call sites or direction`
   in [universe.test.cjs](../tests/universe.test.cjs) already protects reverse references. Direction is not missing from the data.
2. [map.js: style, refreshMap, preview](../viewer/map.js) draws derived edges straight, with one pointer target's tooltip at a time.
   The current live loopback view contains reciprocal directed connections using that same straight geometry.
   Existing protection against a late mouse-out clearing a newer trace does not aggregate opposite directions or reference families.
3. [app.js: colorOf, connectionTypes, renderFilters](../viewer/app.js) assigns type colors from the manifest order;
   mixed-type bundles are neutral. The type key is in Browse & filters; [index.html](../viewer/index.html)'s map legend explains shapes, not colors.
4. `Universe.referenceStats` already partitions outgoing, incoming and within. `preview` adds `within` to both other totals.
   An in-memory synthetic diagnostic using [generic.graph.json](../fixtures/generic.graph.json) recorded
   7 outgoing, 2 incoming and 2 within references, while current hover reports 9 outgoing and 4 incoming.
   These inclusive totals are not disjoint counts of references crossing the chosen owner's boundary.
5. That synthetic pair contains forward `calls` and `uses.type`, plus reverse `calls`:
   three projected family/direction edges, although the user needs two directional totals.
   Its explicit recursive call remains visible and its owner-local type reference stays in internal accounting.
6. [map-tooltip styling](../viewer/app.css) is floating, non-interactive and pointer-events:none;
   [showTooltip](../viewer/map.js) has only a title and one text field. Richer content needs a stable reading surface.
7. The installed [Cytoscape bundle](../viewer/vendor/cytoscape.min.js) reports version 3.34.4.
   A disposable headless check accepted native `unbundled-bezier` and `events:no` styles.
8. Baseline command: `node --test tests/viewer.test.cjs tests/universe.test.cjs tests/references.test.cjs` -> 89 pass.
   No production code, tests, stable docs, positions or published graph were changed during this investigation.
9. A synthetic hub with 250 reciprocal neighbours projects 500 directed edges. The rejected per-incident-pair node-hover proposal could add
   another 500 decorative edges; the current `preview` only highlights existing edges. This is element-growth evidence, not a frame-time measurement.
10. At the follow-up review's start the working tree was clean. The self-type and renderer-scale fixes were already in HEAD;
    `preview` still had the original single-element hover, so the directional UI was not implemented. Follow-up checks passed 89 JavaScript tests
    and 11 LLVM-enabled native-symbol tests without skips. These validate the existing code, not the proposed feature or complete native coverage.

### External constraints

- [W3C color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html) supports pairing hues with labels/shapes.
- [W3C hover guidance](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html) requires predictable, readable and dismissible additional information.
- [Cytoscape curves](https://js.cytoscape.org/#style/unbundled-bezier-edges) provide native directional paths;
  [opacity and events](https://js.cytoscape.org/#style/visibility) distinguish transparent interactive edges from hidden non-interactive ones.
  [Performance guidance](https://js.cytoscape.org/#performance) cautions against unrestricted curves, labels, arrows and dashed/dotted edges.
  These support a bounded trace treatment, not another renderer or overview-wide styling expansion.

### Inferences and limits

- Coincident paths and per-element hover provide a concrete explanation for the reported direction switching.
  The exact user's pointer trajectory and switching frequency have not been reproduced in this investigation.
- A direction palette plus simultaneous pair information should improve interpretation; that remains a usability judgment requiring live acceptance.
- Overlay-lane hit tolerance and interaction cost must be verified in the installed renderer, not inferred from accepted style properties.
  Event-disabled curves are not hit targets. Transparent straight hit edges do not prove that a pointer on a visible offset curve will reach them.

### Corrections to the attached recommendation

- Do not merge reverse references in Universe: both directions already exist; their presentation overlaps.
- `within` does not mean generated. It also includes ordinary references between descendants and genuine recursion.
  Preserve the distinction from `internal_to_owner` and never hide all loops.
- A derived presentation bundle does not imply unresolved or uncertain compiler evidence. Compact map groups do not carry every canonical status/origin.
  Do not label all summaries as uncertain, or promise `resolved` in hover when only exact reference pages establish it.
- Do not impose dashed/dotted styles on every summary/configuration wire; retain cheap solid overview geometry and disclose nature/types in text.
- Optional inspection need not freeze trace emphasis; D2 is compatible with transient hover and independently accessible details.

## Current architecture and source of truth

- [Graph-model contract](../docs/architecture/graph-model.md#continuous-map): containment, directed facts, projection, filters, exact references and internal accounting.
- [Viewer ownership](../docs/architecture/structure.md#composition): Universe owns facts/projection/world positions; map.js owns native rendering and hover;
  app.js owns DOM controls and inspection; scene.js owns gestures; references.js owns bounded exact-page retention.
- [app.css](../viewer/app.css) owns theme styling; app.js owns the existing manifest-type palette mapping.
- Existing [positions.js](../viewer/positions.js) and [reference paging](../viewer/references.js) retain their separate lifetimes.

## Problem and root cause

Type hue, trace focus and relationship direction lack an explicit shared grammar. Opposite directions and different families can occupy
the same path, but pointer hover exposes just one of those elements. Global inclusive statistics are displayed without a separate within count.
Adding more arbitrary hues cannot fix those meanings or the shared hit target.

## Decision

Recommend A1, A3, A4 and A5. They are proposals awaiting review, not decisions already authorized by the operator.
The mandatory outcome is stable directional meaning, counts and inspection. Decorative curves are an optional, gated visual treatment.

### Premise / KISS gate

The existing viewer already owns the visible directed edges and their reference groups. Let it derive a trace from those objects.
Use native parallel-edge lookup or the current projection, not a second canonical graph/index or whole-graph scans on mouse movement.
Add three CSS roles and one small legend/readout first, reusing existing incident edges during node hover.
Remove the dependence on a single overlapping edge for pair hover, and replace the moving rich tooltip with the docked readout.
Add no service, protocol, persistent state, hover timer or custom hit-test engine.
Only connection-pair hover may subsequently add two native decorative curves total under A5, never two per neighbour of a hovered node.
The deliberate tradeoff is that separate lane geometry is not guaranteed: the simpler straight-path presentation is acceptable when native hit behavior
or measured cost makes curves unsuitable. Direction words, arrowheads and simultaneous counts must still work.

### Alternatives considered

| Option | Moving parts and deletion opportunity | Why not selected |
|---|---|---|
| Existing paths, directional arrows/colors and shared readout | No extra native edges; replace moving tooltip and single-element pair information | Required baseline and accepted final result if decorative lanes do not pass A5 |
| Permanent reciprocal curves | Native curve styling for every reciprocal pair; no temporary lanes | Stable geometry, but pays dense-map curve/clutter costs continuously rather than during the requested trace |
| Bend existing edges on hover | Hover styling plus trigger-retention/hit-zone policy | Moves the path under its own pointer and can cause enter/leave oscillation |
| Optional pair-only lanes under A5 | At most two native decorative edges globally; no custom hit engine | Keep only if real-pointer usability and measured performance justify them |

### Color and meaning

Idle: preserve muted manifest-type colors, neutral mixed bundles and current node/group colors. Make their key discoverable from the map legend.
Active node trace: cyan = references leaving the named star/subtree; amber = references entering it; muted violet = within/self.
Always pair colors with literal direction names and arrowheads. Do not use hue as proof of an architectural problem.
For reciprocal paths that overlap, use a neutral shared stroke with direction-colored arrowheads and the named readout rather than pretending
both coincident stroke colors can be read simultaneously. Node hover must not add edges to separate them.
Within counts do not create loops or other new edges: emphasize only already represented within relationships or explicit self-loops.

Suggested CSS-owned role values, under A1:

| Role | Dark | Light |
|---|---|---|
| Outgoing | `#62d9ed` | `#00677d` |
| Incoming | `#ffc16b` | `#8a4b00` |
| Within/self | `#b8a9d2` | `#625683` |

Opaque foreground/background calculations against the current map backgrounds exceed 5.7:1 for all six values.
This does not prove contrast after opacity/compositing: verify actual active wires and text in both themes.
Use the same CSS variables for renderer colors and DOM swatches; do not duplicate role hex values in JavaScript.

### Direction, scope and counts

- A node trace is anchored to its displayed name and full containment subtree, including the node itself.
- Classify each represented reference exactly once: source inside/target outside = outgoing; reverse = incoming; both inside = within.
  Use canonical group endpoints and weights, not only displayed endpoint names or renderer edge counts.
- Hover counts describe the current projection after type, configuration and boundary filters. Label them `In this view`.
  Do not silently substitute unfiltered global `referenceStats`; all recorded totals remain available in inspection with that scope labelled.
- A pair trace uses a deterministic endpoint A/B ordering with a displayed name/type key. Always name A and B in the readout;
  cyan is A -> B, amber B -> A. A node trace instead explicitly names its hovered node/subtree as the focus.
  Pointer movement between its original family/direction edges must not reverse that key or change the pair totals.
- Include all represented reference families between those visible endpoints; count each compact group once using its original weight.
  Show directional totals and a bounded type breakdown, with an explicit remaining-types count if abbreviated.
- Example pair readout: `SampleA -> SampleB: 7 refs (3 calls, 4 type refs)` / `SampleB -> SampleA: 2 refs (2 calls)`.
  Say `references`, not `calls`, for mixed relationships. Show zero reverse references when absent; never fabricate a reverse lane.
- Canonical status, origin, locations and exact owners remain in paged inspection. No HTTP reference fetch on hover.

### Lanes and stable pointer behavior

- Keep the current straight projected edges as native hit targets. Do not remove or bend that hit path on hover.
- Node hover only recolors/styles existing incident edges and arrowheads. It creates zero decorative edges regardless of degree.
- First implement and verify the shared pair readout on unchanged paths, including both directions and all types.
  A one-way pair and a self-loop never receive paired decorative lanes.
- Only the single actively hovered reciprocal connection pair is eligible for decorative lanes: at most two total across the entire renderer.
  A switch to another pair removes the previous pair's decorations; node hover, pointer exit or tracing end removes both.
- If the optional treatment is retained, use native decorative curves with events/text-events disabled; they are never selectable graph facts.
  Original straight edges remain native hit targets. Use opacity only if suppressing their visual stroke is necessary, preserving interaction.
- Prove trusted pointer travel along the full visible curves, both endpoints' accessible portions, the center and transitions between these paths.
  Test zoom/pan, renderer-scale boundaries and crossings with unrelated connections. No disappearing trace, oscillation, endpoint-key swap
  or repeated readout changes may occur merely because the pointer moves between family/direction members of that same pair.
- Retain curves only if those native-hit checks and before/after performance checks pass. If not, remove the decorative implementation and keep
  the shared readout, direction-colored arrows and semantic highlighting on the original paths. Do not add custom hit testing, arbitrary hit-zone
  enlargement, hover-retention timers, extra interaction states or a runtime feature switch to rescue curves. Omitting them can meet acceptance.
- For retained curves, place lanes on opposite physical sides in a canonical A/B coordinate frame. Translate to native source-relative control points;
  opposite numeric signs on reversed edges do not by themselves prove separation. Keep the screen-space gap inside the proven native hit corridor.
- Pair readout identity depends on the endpoint pair, not whichever family or direction native hit testing returns.
  Real pointer travel along either lane and the center must retain one summary without oscillation or direction flipping.
- During any trace, use only currently represented references; do not expand hidden branches or trace neighbours recursively.
- Decorative IDs must be collision-safe and excluded from connected-family queries, reference counts, selection resolution, layout input and fit bounds.
  Clear/rebuild them on trace change, pointer exit, Escape, gesture start, filtering, projection/target change and destruction.
- Retain the zoom-unit synchronization regression: screen-sized lane geometry must share the camera's renderer units.
  Gesture start removes transient decorations before camera motion; idle overview returns to its original edge count/styles.

### Rich information without a moving popup

Under A3, reuse the existing tooltip/readout concern as a compact docked two-row status area, with reserved space so updates do not resize the canvas.
Keep static map instructions separately accessible. The readout names the anchor/endpoints, direction totals and bounded type information;
the legend explains idle type color versus active direction color and shows arrows plus words.
When pointer emphasis ends, the readout may retain a labelled `Last traced` summary for reading/copying, without keeping highlights or selecting anything.
Clear stale information on Escape, filters, projection or target change. Do not announce every mouse coordinate through aria-live;
update on changed trace identity/content only. Provide the same information through existing keyboard browse/inspection routes.

Under A4, clicking a traced pair opens the existing details area with both named directions and their existing bounded reference pages.
It must not quietly inspect only the arbitrary native family hit at that point. Following an exact reference still uses existing navigation.
Keep existing inspected-item markers and clearing rules; no new persistent hover-selection model.

## Required invariants

1. Canonical facts, family/direction groups, exact IDs, provenance and count accounting are unchanged. Decorative lanes are not facts.
2. Internal owner-local records remain available without misleading loops; authored recursion remains an explicit loop.
3. Containment, world positions, saved modes and pins are unchanged by hover, theme, trace geometry or inspection.
4. No hover-time paging/network request, whole-canonical-graph scan, layout rerun or per-reference curve allocation.
5. Idle straight-line rendering, viewport eviction, gesture coalescing, scale synchronization and bounded page caches remain effective.
6. D2 remains true: no selection prerequisite, node expansion, camera flight or galaxy switching just to understand a connection.
7. Colors have a visible key and non-color alternatives; clipped names have existing full-name access. Unknown coverage remains unknown.
8. Runtime stays offline/Windows-only; private-project evidence stays ignored or outside this clone, per AGENTS.md.
9. Decorative edge count is zero during node hover, idle, one-way pair hover, self-loop hover and gestures; globally it never exceeds two.
   The optional lanes' acceptance failure does not block the core feature when its simpler native-path presentation passes all mandatory criteria.

## Implementation tasks

- [ ] Add the red cases below to existing test owners before production changes, including a trusted-pointer overlap acceptance check.
- [ ] Extend map.js's trace ownership with shared node/pair classification over current projected references; retain exact group IDs and weights.
      Prefer native parallel-edge lookup. Keep any necessary pair lookup derived from the current view and disposable on refresh.
- [ ] Apply A1 in the existing canvas adapter using existing native edges only; verify stable node/pair traces before considering any decoration.
- [ ] Update app.css/index.html and the existing tooltip/legend functions for A3, theme roles, bounded text, static instructions and keyboard-readable status.
- [ ] Extend app.js inspection under A4 to show the same pair/directions observed in the readout, using references.js paging without protocol changes.
      Maintain exact-reference navigation and invalidate inspection when its underlying represented group set no longer matches.
- [ ] Evaluate the optional A5 treatment on the isolated served sample only after the core behavior passes. Verify trusted pointer paths and cost;
      either retain at most two pair-only lanes or remove the decoration implementation and document why native paths were chosen.
      No new approval is needed to omit lanes once the operator approves this conditional plan.
- [ ] Verify synthetic and real-project routes, gesture performance, no layout writes and no decoration accumulation; update the existing stable owner.
- [ ] Review the final diff for privacy, ASCII, scope, documentation duplication and preservation of pre-existing uncommitted work.

## Test-first and verification plan

### Red evidence

Use the existing synthetic generic graph and served sample. Do not put private-project names, counts, paths or screenshots in tracked tests/docs.

| Case | Evidence type and owner | Required observed pre-fix failure |
|---|---|---|
| Shared reciprocal path with multiple families | Permanent guard in viewer.test.cjs; trusted-pointer acceptance in viewer.browser.js | Hovering either member shows only its direction/type rather than the same two-direction pair totals |
| Disjoint outgoing/incoming/within | Permanent guard using the synthetic 7/2/2 case above | Node hover reports inclusive 9/4 totals without a separate within count |
| Unequal compact weights, filters and viewport context | Permanent guard using compact groups and existing Universe fixtures | Trace totals do not follow represented weighted references and active exclusions, or label global totals as shown |
| Semantic legend and two themes | Reviewer-checked judgment plus browser contrast observation | Current map has no direction-color key or simultaneous direction treatment; color meaning cannot be read from the map |
| Same pair hover -> click inspection | Browser acceptance and an inspection regression | Pointer hit selects just one direction/family despite requested pair scope; both-direction pages unavailable together |
| Readable bounded trace status | Reviewer/browser acceptance | Current tooltip follows a moving canvas target, omits within/type breakdown and cannot be read independently of that target |

Add lifecycle/regression guards alongside the affected behavior, including a high-degree synthetic node that must create no decorative edges.
If optional lanes are retained, check their global limit with pair A/B -> pair C/D -> node hover -> clear/gesture/target refresh;
renderer counts must follow 2 -> 2 -> 0 -> 0, never accumulate. If lanes are omitted, verify zero decoration allocation throughout.
Demonstrate a known-bad variant for each new machine guard:
single-element pair resolution, adding within to both totals, counting groups instead of weights, stale filter totals,
decorations entering reference accounting, moving the hit target under its pointer, or decorations surviving clear/gesture/target refresh.
Do not turn palette taste into one assertion per hex value; test shared role ownership and rendered contrast instead.

### Green evidence

- Repeat the red cases unchanged. Retain existing color-family metadata, late mouse-out, internal-loop/recursion,
  inspected-item stability, zoom-scale atomicity and pin-isolation regressions.
- Run `node --test tests/viewer.test.cjs tests/universe.test.cjs tests/references.test.cjs` and syntax checks for each changed viewer script.
- Run the existing [served-sample browser acceptance](../tests/viewer.browser.js), extended with trusted movement across the reciprocal center and both lanes,
  same-direction mixed families, unrelated crossing lines, one-way and self-loop controls, Escape, filters, keyboard and narrow/light/dark views.
  The visible-lane path checks are conditional on retaining lanes; center-path/readout checks are mandatory in either outcome.
- Repeatedly enter/leave traces, pan/zoom across renderer scale boundaries, and change targets; native decorative edges must disappear and baseline counts return.
  Hover must issue no reference-page or layout write requests; synthetic pin-drag acceptance remains isolated from real positions.
- Capture before/after performance with [viewer.performance.js](../tests/viewer.performance.js) on identical scope, expansion and layout state;
  also measure node/pair-hover entry on sparse and dense real views. Record p95/max frame times and main-thread work.
  Reject repeatable materially worse interaction latency or idle/gesture curve growth; do not introduce a rigid percentage gate.
- Visually verify overview, folder, plugin, module, class and function views on the real local map, without pin writes.
  Confirm both directions remain understandable as detail unfolds, long/duplicate names remain distinguishable, and no stale counts survive projection changes.
- Compare saved position files byte-for-byte to a fresh pre-run baseline. No regeneration of the private native graph is needed for this viewer change.
- Python/Engine extraction is outside the changed boundary. Run its checks only if implementation evidence forces a backend/schema change;
  such a scope change requires renewed review rather than silently broadening this todo.

## Documentation plan

- **Authoritative stable owner:** update graph-model.md's existing continuous-map and viewport/memory sections with idle/trace grammar,
  pair scope, count scope, optional inspection and decoration lifetime. Replace the affected existing statements in place.
- **Other existing statements:** README.md owns quick usage; add only a short route/use instruction, not another palette specification.
  structure.md owns viewer component boundaries, not color semantics. CSS owns role values; do not reproduce those values in stable prose.
- **Router / TOC:** no new durable document or component. Reuse existing graph-model.md navigation; D4 governs the task README.
- **Duplication avoided:** keep canonical status/provenance in existing schema/profile/reference docs; do not redefine them as visual line styles.
- After acceptance, migrate durable content, then close or remove this transient plan. No task-index update is needed under D4.
  Stable docs, source, comments, configuration and tests must not depend on this todo.

## Rollout and rollback

Viewer assets only; no schema/data/layout migration. On implementation acceptance, reload the browser and restart serving through the documented
local entrypoint if required, preserving the published run and all position files. Roll back only this change's presentation edits,
without discarding pre-existing working-tree edits or restoring an older user layout.

## Completion criteria

- The operator has explicitly approved implementation of this todo; the investigation authorized by D1 is not implementation approval.
- A1, A3, A4 and A5, if approved, meet all mandatory invariant, red/green, pointer stability, performance and visual acceptance criteria.
- Either the optional two-lane treatment passes its native-pointer/performance gates, or the implementation omits it entirely.
  Record the evidence-based outcome; separate decorative lanes are not required for completion.
- A fresh developer can identify outgoing, incoming and within references using visible names, arrows, counts and legend without first selecting a node.
- The same pair readout and both-direction inspection survive movement between its native family/direction hits.
- No recorded reference or saved position is lost, and no new extraction/renderer/runtime dependency is introduced.
- Durable contracts reside in the existing stable owner and the final diff is focused and privacy-clean.

## Review record

### 2026-11-06 - Initial investigation

- **Trigger:** D1; attached coloring/hover recommendation considered as input.
- **Finding:** directed groups already exist; straight rendering and single-element hover obscure their combined meaning.
- **Verification:** installed native styles, current live-view geometry, synthetic 7/2/2 diagnostic and 89 baseline JavaScript tests checked.
- **Authority:** D1-D2 recorded; A1-A4 remain proposals. No production implementation performed.

### 2026-11-06 - Reviewer corrections

- **Trigger:** D3; reviewer challenged the cost of per-neighbour curves and the usability of event-disabled offset paths.
- **Finding:** accepted both concerns. The old recommendation could allocate 2d curves on node hover, and style support did not establish hit behavior.
- **Correction:** A2 rejected and A5 added; the current design and acceptance criteria use a globally bounded, optional pair-only treatment after core behavior.
- **Verification:** synthetic high-degree projection checked; existing JavaScript and LLVM-enabled native-symbol baselines rerun as recorded above.
  These do not establish that the proposed directional UI is implemented or accepted.
- **Scope:** earlier self-reference, renderer-scale and schema wording changes were already committed before this follow-up.
  They remain separate from this presentation plan. No factual reviewer finding required refutation; the scope/provenance concern is clarified.
- **Authority:** D3 recorded. Reviewer text did not grant implementation approval; status remains REVIEW REQUIRED.

### 2026-11-06 - Task lifecycle clarification

- **Authority:** D4 recorded; task-index maintenance removed from the documentation plan.
- **Scope:** no change to the proposed viewer behavior or its approval status.
