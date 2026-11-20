# Direct source-finding comparison

**Status:** DONE
**Owners:** [viewer](../../docs/architecture/viewer.md), [Review presentation](../../viewer/review.js).

## Goal and authority

- D1: The operator rejects nested source spoilers and requests a clearer comparison and action separation.
- D2: Keep evidence identity, physical source boundaries, user stores and the underlying galaxy unchanged.
- D3: The operator explicitly confirmed map-area comparison in the delayed placement reply.
- Placement preference was requested; absent a reply after an opportunity to answer, the announced working assumption
  is an explicit comparison in the existing map region. A reply supersedes that assumption.
- Architect/designer accepted that proposal: one ephemeral overlay over the mounted graph, no second scene store,
  renderer, editor, backend, parser or new dependency. Existing Inspector retains the selected finding and triage.

## Delivery

- [X] Source findings expose Compare matches and plain file/range rows with distinct preview/editor/copy actions.
  Remove nested source disclosures and the Inspector width-toggle mechanism. Ordinary reference evidence stays unchanged.
- [X] One range opens one pane; Compare opens at most two. Select/page further recorded occurrences on demand,
  including separate ranges in the same file. Keep the complete finding count and exact identities visible.
- [X] Back/Escape restores the untouched map and invoking focus. Selection/finding/tab/target/owner changes cancel
  comparison without taking new focus. Prevent hidden graph navigation and live adoption while reading.
- [X] Preserve hashes, explicit refusals, text bounds, read-only rendering, stale-response guards and clipboard fallback.
- [X] Prove the rejected interaction with a browser regression, then test the new flow on synthetic and actual evidence,
  narrow/wide themes, keyboard, paging, failures, cancellation and protected stores. Obtain visual design review.
- [X] Update stable documentation and archive after acceptance. Preserve all pre-existing changes and Git index.

## Verification record

- Baseline: focused source-preview/live Node checks pass (10). The current source view has three nested disclosures
  and requires widening to compare code; user rejection is a presentation finding, not a graph/extraction defect.
- Analysis costs, source acquisition, canonical references and Review decisions are outside this change.
- Browser red proof: selected duplication lacked a direct Compare matches action. The replaced interaction now exposes
  direct file rows and icon actions, with only the selected source bodies loaded on demand.
- Designer inspection found narrow source content painting past its pane after clipboard refusal. Bounded pane-content
  scrolling fixes it; narrow geometry, themes and fallback are covered in browser acceptance. The designer accepted
  corrected narrow screenshots and actual wide two-range/single-range views.
- Architect inspection found Compare opening only one range from a final one-item page. A 51-occurrence fixture reproduced
  it. Compare now loads the first evidence page only for that case and preserves the Inspector's current list page.
  The same regression passes. Existing Health pagination still exercises its separate 54-occurrence fixture.
- Verification: `node --test tests/*.test.cjs` (209 pass, no skips), `python -m unittest discover -s tests -p
  test_source_preview.py` (8 pass), `test_documentation.py` (3 pass), `test_privacy.py` (2 pass); `git diff --check` clean.
- Isolated Chrome source-preview, health, review, inspector, icons and live scenarios passed. Source acceptance includes
  selected-finding comparison, single-range preview, same-file occurrences, paging, last-page comparison, stale/missing/error
  text, invalid responses, clipboard fallback, narrow containment, keyboard isolation, drafts, late cancellation and pins.
  The first Review run timed out on a pointer lookup after a panel resize; an instrumented settled-camera check and the
  unchanged Review scenario passed on the replacement run. No unrelated production pointer change was made.
- The actual requested duplication opened through ordinary search/Review, with hash-matching ranges, no browser errors
  or write requests and unchanged camera, expanded hierarchy, selection and saved positions on Back.
- Final architect recheck accepted the corrected pagination and independently reran 11 Source Preview/Live checks.
  Designer final recheck accepted the corrected wide/narrow comparison. No further required findings remained.
- Existing layout files remained byte-identical. No analysed-project writes, backend/schema changes, editor dependency,
  new scene store, source acquisition changes, staging or commits were introduced. Stable guide/viewer/test routes updated.
- Follow-up: the operator could not distinguish four recorded locations from two displayed panes. Added explicit total
  locations, displayed ordinals, per-pane match numbers and Previous match / Next match actions. Inspector metadata says
  Locations rather than snapshot ranges. A new four-occurrence browser fixture proves all locations remain reachable;
  the larger fixture verifies match stepping across the page boundary and refusal at the last location. The missing
  displayed-count text failed the browser check before the correction. The requested live finding was also navigated
  through its recorded locations without writes, errors or map changes.
