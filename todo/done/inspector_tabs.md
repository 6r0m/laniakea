# Inspector tabs

Status: DONE.

## Authority register

- D1: The operator approved the two-tab right inspector proposed in the preceding design review and requested
  implementation with architectural ownership and reusable, standard controls.

## Accepted scope

- Architecture contains findings, original affected endpoints, exact witnesses and triage. Details contains selected
  entity/source information and ordinary reference pages. The existing optional project-wide queue stays separate.
- Marked inspection and queue choices open Architecture; ordinary inspection opens Details. Hover and late responses
  never switch tabs or reopen inspection. Project context continues to open source/configuration details.
- Native accessible tabs share selection and camera. Switching retains scroll, reference pagination and draft reasons.
  The close button, Escape and Clear keep existing cancellation. Narrow layouts show only one side-panel task at once.
- Existing graph, extraction, review semantics, paging and saved-position owners remain unchanged. No new dependency.

## Owners and verification

- A small viewer inspector component owns tab presentation and keyboard interaction; app selection/paging and Review
  retain their existing responsibilities. Stable contracts belong in
  [graph semantics](../../docs/architecture/graph-model.md) and [operator guide](../../docs/guide.md).
- Run current viewer/review unit baselines; add executable tab, preservation, routing, failure/late-response and narrow
  browser acceptance before production changes. Prove the initial failure, then run affected browser paths and the
  complete inexpensive JavaScript suite. Check docs/privacy, real map interaction and unchanged layout checksums.
- Native extraction and Engine integration are outside this presentation change; do not rerun expensive gates.
- No staging, commit or push. Archive this record in done after acceptance, preserving its execution history.

## Execution and acceptance

- Added a reusable native tab presenter, independent of graph data and selection. App retains selection, close/cancel
  and lazy ordinary-reference rendering; Review retains findings, exact witnesses, caching and decisions. Mounted pages
  preserve draft reasons, evidence, pagination and independent scroll. Queue choices focus Architecture; hover and late
  responses cannot switch pages or reopen inspection. Narrow panels share the space without discarding selection.
- Feature-first browser acceptance failed because the tabs did not exist. The independent architectural review exposed
  same-star reinspection remaining hidden after opening the narrow queue. Its focused Node regression failed before the
  explicit/background distinction and passed afterward, preserving the existing reference epoch and DOM. The regression
  also covers changed-filter revalidation, which must not steal the active filters/queue panel.
- A focused browser check exposed a failed finding request being relabelled as healthy during an unchanged refresh.
  The cache guard now preserves its failure presentation. That check failed before the correction and passes afterward.
- Final JavaScript suite: 170 passed. All eleven browser scenarios passed; the three affected Review/inspector cases
  passed again after the failure-state correction; the complete matrix passed after the visibility correction.
  Browser consumers use the real tab page and scroll region, retaining their existing assertions. The close action and
  finding heading levels were updated together. The presenter regression also rejects stealing modified browser shortcuts.
- Live project verification exercised exact witnesses, real reference pagination, retained drafts/scroll/camera and
  wide/narrow views. No browser runtime errors or writes occurred; real layout files remained byte-identical. Screenshots
  remain outside the clone. A screenshot capture required foregrounding the dedicated browser; comparison uses DOM text
  rather than rendered innerText, which omits virtualized off-screen rows. No product change was made for those probe issues.
- Independent architecture review passed after its findings were corrected. Stable graph semantics, component ownership,
  operator guidance and browser-test routing were updated. Documentation, syntax, whitespace and local privacy checks pass.
- No extraction, backend/schema changes, saved-position migrations, staging, commit or push were performed in this increment.
- The local server was restarted on its usual port and advertises the same fresh snapshot with the updated viewer assets.
