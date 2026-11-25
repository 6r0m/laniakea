# Verification

Run these synthetic regression checks from the repository root. Native/Engine checks are conditional; a skip does
not verify that path.

## First checks

These use synthetic data and need no Unreal Engine, LLVM or Java:

```text
python -m unittest discover -s tests -p test_documentation.py
python -m unittest discover -s tests -p test_shards.py
```

## Automated checks

```text
python -m unittest discover -s tests
node --test tests/icons.test.cjs tests/sections.test.cjs tests/viewer.test.cjs tests/universe.test.cjs tests/references.test.cjs tests/traces.test.cjs tests/appearance.test.cjs tests/motion.test.cjs
node --test tests/review.test.cjs
node --test tests/live.test.cjs tests/analysis.test.cjs
```

Python 3.9+ needs no extra packages. Viewer unit tests need Node.js 18+; Node is not a runtime requirement for Laniakea.
`test_commands.py` exercises CLI dispatch and, when Make is installed, its aliases and argument forwarding. `test_service.py` verifies owned shutdown,
foreign-instance refusal, startup/cancellation cleanup and saved-map preservation using loopback synthetic servers.
Documentation-only edits can use `python -m unittest discover -s tests -p test_documentation.py` for local link/anchor
and durable/transient dependency checks. Run the privacy checks before publishing; follow [repository rules](../AGENTS.md).
`test_cpd_contract.py` verifies mandatory-input preservation, provider-local refusal, precise coverage states, memory
admission and cache reuse. With real CPD configured it also checks CLI default/override behavior through published evidence.
`test_native_health.py`, enabled by both native and CPD inputs, runs real compiler workers and CPD through one CLI
publication using synthetic Unreal receipts/actions. It proves combined reuse and rejection of edits after native indexing.
It also stages newly discovered native external headers and rejects subsequent drift. The real CPD suite verifies that a
manual completed-health run still reconciles configuration edits made before monitoring starts.
It also verifies that restarting an automatic failed-CPD snapshot launches neither extraction nor Java until an input change
or explicit Retry, while preserving the failed coverage.
`test_analysis_controls.py` checks first-opening intent, legacy settings, native prerequisites and failed-attempt reuse.
It also rejects unrelated/superseded negative-cache entries and injects optional progress-output failure during valid extraction.
Permission fault injection covers native negative-cache reads, writes and cleanup, preserving primary outcomes and preferring
published native success over a stale refusal. The scheduler exposes cleanup warnings without blocking publication.
`test_source_preview.py` checks recorded-occurrence authorization, current-file hashes, Windows opened-handle boundaries,
redirected links, bounded text and distinct refusal states. It supplies the disposable source-preview browser fixture.
Its final one-item occurrence page verifies that Compare still obtains two recorded ranges without changing the list page.
`test_monitor.py` checks coalescing, contention, supersession, activation, fairness and bounded automatic history.
`test_monitor_inputs.py` checks profile-selected inputs, changed receipt/product sets, comparison scopes and unpublished staging.
The Monitor suite checks generation-bound comparison paging, truthful limits and advisory failure isolation. The server
refuses mismatched observation tokens and arbitrary path parameters without scanning source files. Receipt timestamp-only
changes remain build evidence. The server suite refuses a valid read index from another graph before context admission.
It also pins two indexes for one run through
independent tab heartbeats, checks their exact pages after further replacements and verifies independent release.
`test_notifications.py` and
`test_owned_process.py` exercise real Windows directory replacement, cancellation, controller death and pre-execution
containment refusal. The lifecycle suite verifies authenticated shutdown during blocked owned work and foreign-process survival.
It also injects polling failure with a real worker descendant and verifies process, notification and lease cleanup without
calling down first.

| optional input | check enabled |
|---|---|
| `LANIAKEA_TEST_ENGINE=<engine root>` | Real-engine integration when the sample's engine does not otherwise resolve |
| `LANIAKEA_TEST_LIBCLANG=<libclang.dll>` | Pinned LLVM 21.1.8 class/function, call-role, inheritance, override, ownership and edit regressions |
| `LANIAKEA_TEST_CLANG_COMPILER=<clang-cl.exe>` | Native preprocessing cache, negative header probes and Windows response-file regressions |
| `LANIAKEA_TEST_CLANGD_INDEXER=<clangd-indexer.exe>` | Pinned 21.1.8 compiler-argument/adjacent-PCH regression; not the production symbol extractor |
| `LANIAKEA_TEST_CPD=<workspace>/tools/health/cpd` | Real pinned CPD matches/ranges, token identity, scope, corpus edits, reuse and refusal; offline reinstall also runs when the registered JDK compiler is available |

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
| [appearance.browser.js](appearance.browser.js) | Theme atmosphere, painted SVG falloff, selection/warning semantics, graph identity and clear-selection cleanup |
| [motion.browser.js](motion.browser.js) | Explicit navigation flight: exact destination, centre/log-zoom interpolation, projected-region coverage, inter-frame live blocking, interruption, stationary cancellation restoration and reduced motion |
| [wheel.browser.js](wheel.browser.js) | Source-surface fixture: trusted wheel frames, accumulated input, scale crossings, definition portal, reversal and reduced motion |
| [source-surface.browser.js](source-surface.browser.js) | [Source-surface fixture](../fixtures/source-surface.graph.json): files, symbol identity, gradual/reversible zoom and local arrangement |
| [namespace-files.browser.js](namespace-files.browser.js) | [Namespace fixture](../fixtures/namespace-files.graph.json): file contexts, exact references, navigation and pins |
| [review.browser.js](review.browser.js) | [Review fixture](test_review.py): direct explanation, exact evidence, triage, refused writes, late close and pins |
| [inspector.browser.js](inspector.browser.js) | Review fixture: accessible tabs, separate findings/details, retained drafts/evidence/scroll, lazy references, late responses and narrow panels |
| [health.browser.js](health.browser.js) | `test_health.browser_fixture`: folded folder/file warning trail, wheel exploration, clean siblings, source paging, triage/reopen, late-close, narrow layout and pins |
| [source-preview.browser.js](source-preview.browser.js) | `test_source_preview.browser_fixture`: direct one/two-pane comparison, exact occurrence paging, read-only hashes, editor/copy actions, cancellation, retained scene/draft, live deferral, themes and narrow containment |
| [source-match-navigation.browser.js](source-match-navigation.browser.js) | `test_source_preview.browser_fixture(base, occurrences=4)`: explicit total/displayed match counts, reaching all four locations, navigation bounds and retained map |
| [analysis.browser.js](analysis.browser.js) | Source-check actions, Apply/Stop, retained maps; `guidance` covers first opening and focus, `activity` covers phase/earlier-work progress, responsive themes, settings and displayed evidence |
| [input-changes.browser.js](input-changes.browser.js) | Cached path paging, Off scopes, removed-file links, focus, drafts, late close/target responses, displayed baseline, adoption and legacy stale paths |
| [check-coverage.browser.js](check-coverage.browser.js) | Module-only to synthetic native publication: displayed/ready coverage, failed-save deferral, adoption and pin preservation |
| [monitor.browser.js](monitor.browser.js) | Two registered sample targets: launch/deep-link precedence, inactive browsing and same-origin session controls |
| [live.browser.js](live.browser.js) | Namespace fixture: adoption, layout/partial-render recovery, camera, references, drag/save/draft deferral, Review isolation, independent tabs, removed focus and surviving reading controls |

Other functions use the served [sample](../sample/SampleProject/SampleProject.uproject), with synthetic overlays.
Keep real-project screenshots outside the clone and other observations in the ignored workspace.

[viewer.performance.js](viewer.performance.js) measures mouse/wheel input, frames, main-thread work and heap through
Playwright/CDP, restores the camera and checks that positions/pins did not move. [viewer.flight-performance.js](viewer.flight-performance.js)
measures an explicit deep flight: call/pre-projection time, first visible frame, total completion, cut bounds/zoom,
peak rendered nodes/edges, final retention, long tasks and pins. Compare matching data, scope, expansion and camera state; record scene differences and
hardware/load. Reject repeatable, materially worse interaction or unbounded flight retention.
