# Project configuration as context

**Status:** REVIEW REQUIRED
**Scope:** Viewer presentation, navigation and inspection; no extraction or stored-graph changes.
**Stable documentation owner:** [Graph model](../docs/architecture/graph-model.md).

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

Understand the architecture inside the selected project without mistaking project configuration or whole-project
statistics for dependencies of another source module. Configuration declarations remain discoverable and exact.

## Authority register

### Operator decisions

- **D1** Investigate why the project root needs separate reference lines and how configuration could instead be
  represented with a background/grouping or similar marking.
  - Effect: investigate and propose; implementation is not authorized by this request.
  - Reason: the root and its lines look like noise when the project is already selected.
  - Source: current operator request.
- **D2** Keep seamless galaxy exploration with minimal mouse actions and references understandable in place.
  - Effect: preserve continuous containment, zoom and hover exploration.
  - Reason: operator's earlier space-routing and brain-atlas exploration requests.
- **D3** Keep canvas titles clean and explain references through hover.
  - Effect: configuration annotations must not restore multiline labels on every star.
  - Reason: operator's earlier clean-title and hover-card request.

### Operator gates

No open technical gate prevents this investigation. The recommendation below requires operator approval before implementation.

### Working assumptions

- **A1 [ACTIVE]** Replace root-configuration wires with optional native node outlines, off by default in every layout.
  This is a proposal, not an approved rendering choice.
- **A2 [ACTIVE]** Preserve existing all-recorded hover totals and explicitly disclose included project declarations;
  do not silently redefine them as code-only usage counts.
- **A3 [SUPERSEDED by A4]** Use the existing Details panel for project context and configuration inspection when no graph item
  is selected. Reuse the existing Configuration control for annotation visibility.
- **A4 [ACTIVE]** Open Project details only through an explicit project breadcrumb/header action, using the existing
  Details panel. No selection is not a request to inspect the project. Keep the existing close behavior and reuse the
  Configuration control only for annotation visibility.
- **A5 [ACTIVE]** Keep all-recorded totals unchanged, use recorded-reference labels, and show the numerical project
  configuration subset for each affected direction. Keep weighted declaration counts separate from distinct marked targets.

## Non-goals

- Changing project settings, enabled plugins, build context, extraction, native coverage, schema or canonical edges.
- Inferring effective enablement, runtime use, unused code or missing dependencies from descriptor lists.
- A synthetic configuration owner, shared membership region, extra renderer, database, service or layout mode.
- Connecting every configured item to a new hub, recoloring dependency directions, or moving existing pins.
- Resolving disabled-name metadata to node identities by label matching. Display recorded metadata without guessing.

## Verified evidence

### Facts

1. [The Unreal profile](../laniakea/unreal/graph.py), `build`, records positive descriptor declarations as `requires`.
   Explicit disable entries remain descriptor metadata. Plugin defaults and evaluated target membership are different
   evidence; [the profile contract](../docs/architecture/unreal-profile.md#from-export-to-graph) explicitly limits inference.
2. [Universe](../viewer/universe.js), `isConfiguration`, recognizes only the profile-declared types from the original
   project root. The same reference type from another plugin remains a dependency declaration.
3. `Universe.referenceStats` aggregates descendants, while `directReferences` records original endpoints.
   [traceSummary](../viewer/map.js) uses the aggregated statistics for every node, including the root.
   The root card therefore answers a whole-project question using the same Uses/Used by grammar as an individual star.
4. [configurationVisible](../viewer/app.js) defaults off only in galaxy and on in other layouts.
   The current Configuration control restores ordinary root wires when enabled.
5. `Universe.project` retains a root with actual endpoints or internal facts; `fitMap` also includes its position when
   declarations are visible. CoSE receives `map.project()` with configuration included. Changing the default alone
   would leave toggle, layout and navigation routes that restore the same misleading presentation.
6. [flyToNode and followReference](../viewer/scene.js) currently enable configuration before revealing root declarations.
   [renderDetails](../viewer/app.js) currently requires a rendered graph item. A hidden project context cannot simply
   use that path without handling its inspection lifetime and marker rules.
7. [Existing browser acceptance](../tests/viewer.browser.js) explicitly expects the root to reappear on Configuration
   and exact-declaration follow. Those expectations need deliberate replacement, not deletion of reference coverage.
8. A diagnostic built from [the generic fixture](../fixtures/generic.graph.json) with two root declarations, a non-root
   declaration and 100 external call references produced two direct root facts but 101 outgoing subtree references.
   Filtering configuration removed the root, preserved the non-root declaration and retained complete accounting.
   A configured item and an unlisted sibling mapped to the same collapsed owner; another declaration mapped into
   the external boundary. One filled membership region cannot express those cases without additional semantics.
9. The installed [Cytoscape bundle](../viewer/vendor/cytoscape.min.js), version 3.34.4, defines native node outline
   width, color, opacity and offset. A headless check accepted them. This establishes style support, not browser
   visibility, hit behavior or performance.
10. Baseline: the documented four JavaScript test files pass 101 tests; documentation checks pass 2 tests.
    Diagnostics are under ignored `workspace/tmp/project-context/`. The working tree was clean before this investigation.
11. `renderDetails(null)` closes Details, and Escape, Clear selection and empty-space clicks invoke it. A3's implicit
    project fallback would change that contract; this is a plan risk, not a defect in the current close behavior.
12. `referenceStats` weights original references and partitions each node's subtree into outgoing, incoming and within.
    Configuration classification is available, but the hover card and docked readout do not expose its numerical subset.
    The subset must follow the same containment and weighting rules, rather than treating every declaration as incoming
    at every level. A declaration to a project descendant is within for the project and incoming for its target.

### Inferences and unverified areas

- A whole-region fill risks reading as containment because expanded backgrounds already encode real ownership.
  This is a design judgment grounded in the existing grammar, not a measured rejection of every possible background design.
- Native outlines should cost less than extra nodes, edges or DOM badges, but their real visual quality and hit behavior
  remain acceptance work. Live Chrome was unavailable during this investigation; no new visual treatment was tested.
- Explicit descriptor declarations are useful provenance. They are not a complete set of enabled, compiled or used plugins.

## Current architecture and source of truth

- [Graph model](../docs/architecture/graph-model.md): independent containment/references, projection accounting,
  configuration subset, exact navigation and hover count scopes.
- [Viewer composition](../docs/architecture/structure.md#composition): Universe owns topology/projection;
  map.js owns canvas/hover, app.js owns controls/inspection, scene.js owns navigation.
- [Unreal profile](../docs/architecture/unreal-profile.md): descriptor meaning and limitations.
- [Reference pages](../viewer/references.js) and [read index](../laniakea/map_index.py): existing group queries,
  exact payloads, cancellation and bounded page retention. No protocol extension is needed for a declaration list.
- [Position store](../viewer/positions.js): independent pin loading/saves; configuration is scene presentation state.

## Problem and root cause

The viewer treats the project both as the containing context and as an ordinary graph actor whenever its descriptor
declarations are visible. Its hover card then reports subtree totals, visually attributing all descendant references
to that extra star. Configuration visibility also depends on layout mode and is restored by navigation.
The data is useful; its default rendering and the meaning of the root card are the problem.

## Decision

Recommend A1, A2, A4 and A5, subject to operator approval. A4 supersedes A3; A5 tightens A2's count disclosure.

### Premise / KISS gate

The viewer already owns the configuration classification, selected project, projected representatives, Details panel
and scene toggle. Use those owners directly. Architecture projection can keep configuration wires excluded through
the existing classification/filter path, while annotations derive from those retained canonical declarations.
Remove the root-configuration hub and its wires from this presentation; add no synthetic owner or presentation graph.
The capability knowingly given up is viewing project configuration as a star-to-star dependency diagram. Exact records
and their source remain available in Project details. Non-configuration root facts remain ordinary graph facts.

### Recommended behavior

1. **Project is context.** In the ordinary architecture view, root configuration does not create a root star or wires,
   even if annotations are enabled. Preserve roots with genuine non-configuration facts and the degenerate leaf-root
   case; never blanket-delete root edges from a language-neutral graph.
2. **Optional marks.** Reuse Configuration as `Project config marks`, off by default in all layouts. Its state controls
   annotations rather than dependency-wire visibility. Old explicit scene booleans may restore marks, never old wires.
3. **One meaning for a mark.** A subtle neutral outer outline means the visible representative contains one or more
   explicitly listed configuration targets. Hover says either `Listed by project configuration` for an exact target,
   or `N listed targets inside` for a collapsed owner. Count distinct original target ids, independently of weighted
   declaration/reference totals. It does not mean every descendant is listed or enabled.
   Resolve targets with the projection's effective expanded set, not only the requested expansion set. On expansion,
   marks follow the original declaration targets to their current representatives. Do not propagate a declaration to
   every child module. Do not force distant nodes into the viewport solely to display a mark.
4. **Preserve the existing visual grammar.** Use native outlines independently of the border/status, selection and
   trace colors. No enclosing region, renamed ownership, background reparenting, extra edges or moving coordinates.
   Keep names-only titles under D3, with a small legend and hover explanation for the outline.
5. **Explicit Project details.** Through A4, clicking the project-name breadcrumb/header action opens project context:
   project source, current analysed target, a paged list of exact configuration declarations, and other recorded root metadata.
   Make that action keyboard accessible at root and nested scopes, independently of a rendered project star. Preserve
   project switching and existing navigation; merely inspecting Project must not move the camera or change the map scope.
   Clicking a star replaces that inspection. Escape, Clear selection, an empty-space click and `renderDetails(null)` close
   inspection; never fall back to Project details because selection is absent. Hover, redraw and late page responses must
   not reopen a closed panel. An explicitly opened, still-valid inspection may survive projection refreshes.
   Existing disable metadata can be displayed as recorded text, with no inferred node links or colored disabled states.
   Label any whole-project totals as project/subtree statistics, never as direct Uses of a separate root star.
6. **Count scopes remain explicit.** Annotation toggles do not change the architecture edges or their reference counts.
   Configuration remains accounted for separately from ordinary hidden-type/boundary facts in summary copy. Reuse the
   existing excluded-reference accounting rather than adding canonical duplicates. Under A2/A5, declarations remain in
   all-recorded totals. In the hover card, accessible docked readout and relevant inspection summaries, use neutral labels
   such as `Outgoing references recorded`, `Incoming references recorded` and `Within / self references recorded`.
   Beneath an affected total, show `Of which: project configuration` with its numerical count, including a configuration-only
   total. For example, 8 incoming references with 1 project declaration remains 8 incoming, of which 1 is configuration.
   Explain: `Configuration means explicitly listed, not necessarily compiled or used at runtime.` Do not present a vague
   note or a raw `Used by` total as sufficient disclosure. Keep zero-incoming wording limited to recorded evidence.
   Derive each directional subset from `isConfiguration` and the same original endpoints, subtree membership and weights
   as its total. The subset is included, not additive. A non-root declaration of the same type stays an ordinary dependency.
   These all-recorded totals/subsets do not change with dependency filters, boundary visibility or annotation toggles;
   separately label current-view counts. Marks count distinct original targets: 3 declaration references to one target
   mean a configuration subset of 3 and one listed target, not three marked targets.
   Dependency-type filters do not toggle these separate annotations; boundary visibility and the spatial projection
   still determine which representatives can be marked.
7. **Exact navigation remains useful.** Following a configuration record reveals the actual target and retains the exact
   declaration and project-source information in Details, without creating a root wire. Extend the existing inspection
   request/selection lifetime for context-only records; do not add a second inspector or persistent hover selection.
   Do not unhide a dependency type merely to inspect configuration. Such rows must identify configuration scope rather
   than suggesting a missing architecture wire is a rendering failure.
   Normal plugin dependencies, exact calls and owner-local reference handling retain their current navigation.
8. **Generic classification.** Use the existing manifest hint and original endpoints. No hardcoded Unreal ids, file
   extensions, plugin names or level names in the viewer. Runs without classification hints keep their known semantics;
   do not guess which of their root facts are configuration.

### Alternatives considered

| Option | Moving parts / deletion | Assessment |
|---|---|---|
| Only default Configuration off everywhere | One default change; retains all restoration routes | Smaller diff, but does not resolve the root/card ambiguity when configuration is inspected |
| One filled circle around configured constellations | New overlapping membership geometry and partial-group semantics | Not recommended: declarations cross ownership and external boundaries; conflicts with containment grammar |
| Permanent halos on everything considered enabled | New semantic inference from incomplete inputs | Reject: defaults, disable entries, module presence and direct declarations are not interchangeable |
| Existing-node outlines plus Project details | Derived annotations and an existing inspector context; removes hub/wires | Recommended; exact evidence remains accessible without changing graph ownership |
| Delete declarations from extraction | Backend/data change; removes provenance and exact references | Reject: hides useful facts rather than fixing their presentation |

## Required invariants

1. Canonical nodes/edges, group ids, provenance and exact payloads stay unchanged; configuration is not discarded.
2. Only original root references classified by the profile receive this treatment. Non-root descriptor dependencies survive.
3. All-recorded counters stay truthful; numerical directional configuration subsets never exceed or add to their totals.
   Recorded-reference labels and distinct listed-target counts cannot imply compiled or runtime usage.
4. Project context and exact configuration inspection work without a rendered root marker; invalid/stale records still clear.
   Project inspection requires an explicit action. Existing close paths cancel pending pages and close without a fallback;
   stale asynchronous work cannot reopen the panel or replace a newer project/star inspection.
5. Configuration marks neither prove effective enablement nor imply that unmarked nodes are unused or disabled.
6. Outline state is bounded by the current projection; no graph-wide hover scan, per-reference DOM or new renderer elements.
7. Annotation toggles do not relayout, move/save pins, affect graph hit targets, or break native selection/dragging.
   Native outline width/offset stay in screen-pixel units through the existing atomic renderer-scale transition.
8. Existing boundary shapes, availability styling, direction colors, recursion and exact-reference pages remain legible.
9. Metadata from analysed projects remains in the ignored workspace; no extraction or analysed-project edits are required.

## Implementation tasks

- [ ] Add the regression and acceptance cases below before production changes; capture valid red evidence.
- [ ] Extend Universe's existing configuration derivation with the minimum reusable declaration/representative lookup.
      Derive weighted directional configuration subsets alongside existing reference totals and distinct target membership.
      Keep canonical facts and projection accounting authoritative; avoid a parallel graph or repeated hover scans.
- [ ] Apply architecture-only configuration projection consistently in refresh, layout input and Fit; replace mode-dependent
      defaults with annotation state. Preserve genuine non-configuration root facts and absent-hint behavior.
- [ ] Add native outline classes and a compact legend/hover explanation. Recompute marks only with the current projection.
      Extend existing pixel-size synchronization for the outline; do not add a second zoom callback or scheduler.
- [ ] Extend the existing Details/selection path for project context and exact configuration records without a canvas root.
      Add the explicit accessible project breadcrumb/header action; retain null-selection and all existing close semantics.
      Reuse existing group-based paging, cancellation, retry and provenance rows, including stale-response protection.
- [ ] Update hover, accessible readout and relevant inspection summaries with neutral recorded-reference labels and numerical
      configuration subsets. Keep all-recorded totals, current-view counts and distinct listed-target counts separate.
- [ ] Update root search, breadcrumbs, bookmarks, exact follow, Back/Forward and reload so none resurrect configuration wires.
- [ ] Verify synthetic/real routes, pointer behavior, bounded renderer state and byte-identical saved layouts.
- [ ] Migrate accepted contracts into the stable owners below; review privacy, ASCII, scope and final diff, then remove this todo.

## Test-first and verification plan

### Red evidence

Use the existing generic fixture and served synthetic sample, including a listed child beside an unlisted sibling,
an external target, a non-root declaration of the same type, an explicit disable entry, and an unlisted in-target module.

| Behavior | Evidence kind / owner | Expected current failure |
|---|---|---|
| No configuration hub/wires in every layout | Permanent guard: viewer/universe tests; trusted browser acceptance | Default or toggle restores a root star and wires |
| Mark exact targets and collapsed representatives | Permanent guard: Universe/viewer tests | No annotation exists; mixed owner/external cases cannot report declared membership separately |
| Multiple declarations of one original target | Permanent guard: compact/synthetic groups | Distinct listed-target counts cannot be derived from weighted reference totals alone |
| Toggle affects marks only | Permanent guard: viewer tests plus browser | Renderer edge set/counts change rather than just annotation state |
| Explicit Project inspection at root and nested scopes without a graph node | Permanent guard: viewer/browser tests | No explicit context action exists; renderDetails rejects the unrendered context |
| Clear closes inspection, with no project fallback | Permanent guard: viewer/browser tests | Current close behavior passes; protects it against the proposed context extension |
| Numerical configuration subset in recorded counts | Permanent guard: Universe/viewer tests; browser checks visible/accessibility copy | Totals exist but no numerical subset is exposed |
| Exact declaration follow preserves record and target | Permanent guard: viewer/browser tests | Existing route enables configuration and restores the source star/wire |
| Root statistics have project scope | Regression guard for direct/subtree count source; reviewer checks wording | Current Uses card presents descendant statistics as an ordinary root actor |
| Marks do not imply enablement or whole-owner membership | Reviewer-checked meaning plus mixed-fixture annotation data | Full membership/effective enablement cannot be supported by recorded declarations |

Preserve the existing root-internal-fact, generic root-reference, count partition, filtered/all-recorded, hover, paging,
privacy and saved-position regressions. Do not replace them with assertions that simply hide every root.

Exercise Project -> star -> Escape, Project -> Clear, Project -> empty space and direct `renderDetails(null)`.
Assert the panel stays closed across redraw/hover and delayed reference-page completion; a project switch must invalidate
old requests. Separately verify a still-valid, explicitly opened inspection survives projection refresh without reopening
a previously closed panel. Inspecting Project alone must preserve camera/scope and require no root marker.

Use synthetic incoming cases: 8 references including 1 root configuration declaration; configuration-only 1 of 1;
and 3 declaration references to one target alongside 5 ordinary references. Expect totals/subsets of 8/1, 1/1 and 8/3,
with one distinct listed target in the last case. Include a non-root declaration of the same type among ordinary facts.
Check outgoing/within classification at ancestor scopes, weighted groups, filters, boundary visibility and marks on/off.
Verify every configuration subset stays included in its unchanged all-recorded total and all surfaces explain its meaning.

### Green evidence

- `node --test tests/viewer.test.cjs tests/universe.test.cjs tests/references.test.cjs tests/traces.test.cjs`.
- `python -m unittest discover -s tests -p test_documentation.py`; syntax checks for changed viewer scripts.
- Extend [served-sample acceptance](../tests/viewer.browser.js) for every layout, toggle, root search, project Details,
  explicit open/replace/close behavior, paged declaration follow, hidden boundaries, annotation movement on zoom/fold,
  history and bare-address reload. Assert numerical subsets and neutral labels in the hover card and accessible readout.
- Run [connection hover acceptance](../tests/traces.browser.js) unchanged except deliberate new annotation assertions.
- With drive-browser, inspect overview, mixed folder, plugin, module and external boundary in light/dark and narrow views.
  Verify neutral outlines differ from target status, selection and trace emphasis, and exact source/target provenance remains clear.
- Verify native glyph/label hover, click, group expansion, pan and isolated sample dragging with marks both on and off.
  Same scene/pins must retain coordinates and renderer node/edge counts across the annotation toggle. No layout writes on toggles.
- Extend the existing renderer-scale paint regression to outline width/offset. An unscaled outline control must expose
  inconsistent screen-pixel geometry across the same wheel scale boundaries already covered for stars and fonts.
- Compare the existing [performance probe](../tests/viewer.performance.js) on identical scope/layout/expansion before/after;
  record p95/max and main-thread work. Reject repeatable material latency regressions, not a rigid percentage.
- Compare real saved-position files to a fresh baseline; no pin migration, reset or source re-extraction is needed.

## Documentation plan

- **Authoritative stable owner:** update [graph-model.md](../docs/architecture/graph-model.md): root/context distinction,
  configuration presentation, mark predicate, numerical subset versus distinct-target counts, explicit inspection lifecycle
  and exact navigation.
- **Other affected statements:** update [README quick usage](../README.md) and only affected contracts in
  [structure.md](../docs/architecture/structure.md). Profile meaning stays owned by the existing Unreal-profile document.
- **Router/TOC:** no new owner/document. Keep `todo/README.md` lifecycle-only; add no task routing.
- **Duplication avoided:** CSS owns visual values; schema/profile own classification semantics; graph-model owns generic behavior.
- No stable artifact may link back to this task. Close/remove it after durable knowledge is migrated.

## Rollout and rollback

Viewer-only change, loaded against existing immutable runs. Preserve layout files and scene/history compatibility as specified
above; no new analysis run or schema migration. Rollback restores only this presentation change, never an older user layout.

## Completion criteria

- The operator explicitly approves the recommendation for implementation in a subsequent decision; D1 authorizes
  investigation only, and this file alone grants no implementation authority.
- An ordinary overview contains architecture stars and actual dependency/reference edges without a root-configuration hub.
- Configuration can be understood through optional marks and exact Project details without fabricated containment or enablement.
- The explicit Project action opens context; star inspection replaces it; Escape, Clear and empty-space clicks close it
  without fallback or stale-response reopening. Inspection alone does not change camera or map scope.
- Recorded-reference totals stay unchanged and expose numerical directional configuration subsets; distinct marked-target
  counts remain separate. Copy never equates a configuration declaration with compiled or runtime usage.
- Exact configuration navigation remains actionable without a root wire, including paged and filtered routes.
- Source facts, reference accounting, generic-root cases, performance safeguards and saved positions remain verified.
- Stable docs describe the final accepted behavior, with no temporary dependencies or private evidence in tracked files.

## Review record

### 2026-11-09 - Investigation

- **Trigger:** D1; the operator suggested a shared background/group marking as an alternative to root-reference noise.
- **Finding:** preserve declaration evidence while separating its presentation from ordinary architecture dependencies.
  Shared-region grouping needs additional semantics for mixed owners and external targets; native outlines are the smaller proposal.
- **Verification:** source/consumer inspection, a synthetic direct-versus-subtree and mixed-group diagnostic, installed style support,
  and the baseline checks recorded above. No production, test or stable-document changes were made.
- **Authority:** D1-D3 recorded; A1-A3 remain proposals. Live visual and implementation acceptance are still outstanding.

### 2026-11-09 - Review corrections

- **Trigger:** operator request to evaluate the review and correct valid issues against current code and accepted behavior.
- **Finding 1:** valid. A3 could introduce an implicit inspector fallback contrary to the existing close contract.
  A4 supersedes it with an explicit Project action and preserves closing, replacement and asynchronous cancellation.
  No current close-behavior bug was demonstrated.
- **Finding 2:** valid. A2's vague subset note would not distinguish configuration declarations from ordinary usage clearly.
  A5 requires neutral recorded-reference labels and numerical weighted subsets, separately from distinct listed targets.
- **Scope:** only this todo is corrected. Reviewer approval does not authorize implementation; no production behavior,
  graph facts, saved positions or stable documentation is changed. Existing baseline tests do not validate the proposed UI.
- **Acceptance outstanding:** implementation regressions, real-browser interaction/performance and saved-layout preservation
  remain the implementation gate; the reviewer supplied no incorrect architectural point requiring refutation.
