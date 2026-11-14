# Verification

Run these synthetic regression checks from the repository root. Native/Engine checks are conditional; a skip does
not verify that path.

## Automated checks

```text
python -m unittest discover -s tests
node --test tests/icons.test.cjs tests/sections.test.cjs tests/viewer.test.cjs tests/universe.test.cjs tests/references.test.cjs tests/traces.test.cjs
node --test tests/review.test.cjs
```

Python 3.9+ needs no extra packages. Viewer unit tests need Node.js 18+; Node is not a runtime requirement for Laniakea.
Documentation-only edits can use `python -m unittest discover -s tests -p test_documentation.py` for local link/anchor
and durable/transient dependency checks. Run the privacy checks before publishing; follow [repository rules](../AGENTS.md).

| optional input | check enabled |
|---|---|
| `LANIAKEA_TEST_ENGINE=<engine root>` | Real-engine integration when the sample's engine does not otherwise resolve |
| `LANIAKEA_TEST_LIBCLANG=<libclang.dll>` | Pinned LLVM 21.1.8 class/function, call-role, inheritance, override, ownership and edit regressions |
| `LANIAKEA_TEST_CLANGD_INDEXER=<clangd-indexer.exe>` | Pinned 21.1.8 compiler-argument/adjacent-PCH regression; not the production symbol extractor |
| `LANIAKEA_TEST_CPD=<workspace>/tools/health/cpd` | Real pinned CPD matches/ranges, token identity, scoped scans, corpus edits, reuse, lexical failure and timeout refusal after offline setup |

`python tests/record_fixture.py [--engine <engine root>]` regenerates the sample's recorded UBT export when the sample
changes. Review the tokenized fixture before publishing; analysed-project data never belongs in tracked tests.

## Browser acceptance

Browser files are Playwright functions accepting a `page`, not standalone commands. Harness setup is manual;
there is no committed one-command launcher. Run them against disposable synthetic targets: they can change layouts.
Source-file fixtures must use the normal pipeline/read index/server and real exact-reference paging.

| function | acceptance scope |
|---|---|
| [viewer.browser.js](viewer.browser.js) | Navigation, inspection, configuration, paging, saved positions and narrow viewports |
| [traces.browser.js](traces.browser.js) | Direction, overlapping wires, stable hover, pair inspection, pointer routing and contrast |
| [readability.browser.js](readability.browser.js) | Search, signatures, data-only types, deep wheel and breadcrumbs |
| [sections.browser.js](sections.browser.js) | Source/header navigation, paging, source links, reload and real-symbol pin dragging |
| [endpoints.browser.js](endpoints.browser.js) | Boundary-anchored references across expanded layers and trusted wire interaction |
| [icons.browser.js](icons.browser.js) | Type glyphs, themes, pointer hits, title geometry and the keyboard-accessible key |
| [source-surface.browser.js](source-surface.browser.js) | [Source-surface fixture](../fixtures/source-surface.graph.json): files, symbol identity, gradual/reversible zoom and local arrangement |
| [namespace-files.browser.js](namespace-files.browser.js) | [Namespace fixture](../fixtures/namespace-files.graph.json): file contexts, exact references, navigation and pins |
| [review.browser.js](review.browser.js) | [Review fixture](test_review.py): direct explanation, exact evidence, triage, refused writes, late close and pins |
| [inspector.browser.js](inspector.browser.js) | Review fixture: accessible tabs, separate findings/details, retained drafts/evidence/scroll, lazy references, late responses and narrow panels |
| [health.browser.js](health.browser.js) | `test_health.browser_fixture`: source evidence paging, file badges, triage/reopen, late-close, narrow layout and pin preservation |

Other functions use the served [sample](../sample/SampleProject/SampleProject.uproject), with synthetic overlays.
Keep real-project screenshots outside the clone and other observations in the ignored workspace.

[viewer.performance.js](viewer.performance.js) measures mouse/wheel input, frames, main-thread work and heap through
Playwright/CDP, restores the camera and checks that positions/pins did not move. Compare matching data, scope,
expansion and camera state; record scene differences and hardware/load. Reject repeatable, materially worse interaction.
