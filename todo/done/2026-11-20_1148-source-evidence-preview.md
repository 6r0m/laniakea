# Read-only source evidence preview

**Status:** DONE
**Stable owners:** [viewer](../../docs/architecture/viewer.md), [server](../../laniakea/server.py)

## Goal and authority

- D1: The operator approves implementing the reviewed in-app source preview, 2026-11-20.
- D2: Preserve the analysed-project read boundary, immutable evidence, user positions and Review decisions.
- Accepted scope: filename/range opens a numbered read-only snippet inside Exact evidence; editor and copy-path actions
  remain secondary. No editor dependency, source writes, process-launch API or new panel.
- The architect confirmed that recorded source paths do not retain physical external-plugin mount bindings. Initial preview
  therefore refuses physical reads outside the pinned project root rather than rediscovering/admitting mounts on HTTP requests.

## Contracts and implementation

- [X] Bind requests to the existing run/index context and report/finding/occurrence identity. Reject arbitrary paths,
  unsupported queries, foreign requests and expired contexts before reading source.
- [X] Bound file bytes, preview lines and text. Validate the opened physical file against the recorded project boundary.
  Compare its hash with recorded evidence; changed, missing, unreadable and unsupported files never become exact previews.
- [X] Add the source-preview presentation through existing Inspector/Review lifecycle. Highlight matching lines, retain
  full-path context, expose editor/copy-path actions and cancel obsolete or closed requests without reopening inspection.
- [X] Prove matching source, changed/missing files, bounds, physical redirection, hostile source text, paging and cancellation
  with synthetic tests before the real walkthrough. Check narrow/desktop themes, focus and protected user stores.
- [X] Update existing durable owners, verify the live route and archive this task only after acceptance passes.

## Verification and limits

The preview reads current project text, not a guaranteed historical source archive. Some cold CPD runs retain tool copies,
but these are not the authority for this implementation. A hash match establishes correspondence to the recorded bytes;
otherwise the recorded match is not highlighted in current text. File ranges do not establish function ownership.

Use targeted reader/server and viewer/browser checks, then the existing affected regression suites. No new native extraction
is required solely to prove this read/presentation feature. Diagnostics stay in ignored workspace; real screenshots stay
outside the clone. Do not change source-check settings, pins, policy, triage, staged files or commits.

## Execution record

- Existing source actions are external VS Code links; no embedded source reader or editor library exists.
- The operator approved the architect/designer recommendation directly. This record captures that scope without adding
  another approval round or changing the accepted analysis architecture.
- The baseline browser test rejected the external-link-only UI; HTTP regressions rejected the absent preview route.
- Reader/server regressions cover hashes, byte/line/text limits, encoding, Windows opened handles, redirected links,
  arbitrary queries, foreign origins and expired snapshots. Browser regressions cover text-only rendering, keyboard opening,
  changed/missing/error states, clipboard refusal, delayed paging/closing and protected positions.
- Real-code screenshots demonstrated a readability gap in the ordinary Inspector width. Added an explicit desktop
  Expand preview/Restore width control to that same Inspector, removed source-list indentation and verified unchanged
  camera center/zoom. Escape, changed subject and closing inspection restore normal width. Narrow layouts retain scrolling.
  The new browser assertion failed before this correction and passed afterward.
- Windows verification: `python -m unittest discover -s tests -p test_source_preview.py` (8), `test_server.py` (28),
  `test_health.py` (8), `test_documentation.py` (3) and `test_privacy.py` (2); all passed without skips.
  `py -3.11 -m unittest discover -s tests -p test_source_preview.py` and `test_server.py` also passed (36).
  `node --test tests/*.test.cjs`: 208 passed, no skips.
- Isolated Chrome acceptance passed source-preview, health, review, inspector, icons and live scenarios. This includes
  desktop/narrow dark/light views, width restoration, no camera drift, stale response cancellation, triage and adoption
  recovery. The actual requested duplication ranges opened through normal search/Review, matched recorded hashes and
  rendered without browser errors or write requests. No fresh native extraction was needed for this read-only feature.
- The architect independently accepted the recorded-root/read-boundary design and reran the reader/server regressions.
  The designer independently inspected the real-code expanded screenshots and accepted their readability.
- Existing layouts remained byte-identical; saved check recipes and target activation remained unchanged. The main viewer
  was restarted on its established local address to load the server route, with monitoring restored. Synthetic servers
  were disposable. No source writes, new dependencies, Git staging or commits were introduced.
- Stable contracts live in the existing architecture structure/viewer/diagram documents, user guide and test routing.
  The preview remains current, hash-verified text only; external mounts without recorded physical bindings use the
  existing editor route. No historical source store or fabricated symbol ownership was added.
- Review follow-up F1: large preceding context could exhaust the text budget before reaching the selected match.
  Windows regressions reproduced context-only success, including a small text budget. The reader reserves the budget
  for the matching prefix, adds context only after the full match fits and marks omitted leading context as truncated.
  An oversized first matching line returns the existing explicit text-limit state. The 10 reader/server tests pass on
  current Python and Python 3.11; source-preview validation checks also pass. Completed acceptance statuses stay unchanged.
