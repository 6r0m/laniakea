# Working-tree changes beside recorded architecture

**Status:** DONE
**Scope:** input-change visibility and contextual recheck guidance through existing monitoring and Checks  
**Stable owners:** [monitoring](../../docs/architecture/monitoring.md), [Unreal inputs](../../docs/architecture/unreal-profile.md),
[viewer](../../docs/architecture/viewer.md), [guide](../../docs/guide.md)

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

A developer can keep exploring recorded architecture while editing, see which comparable inputs changed and which checks
may need refreshing, and use existing controls to request analysis without confusing file changes with architectural defects.

## Authority register

### Operator decisions

- **D1:** Investigate the attached hybrid-analysis proposal and produce an implementation todo for review, without implementation.
  - Effect: investigate existing behavior and recommend a bounded delivery; the attachment is design input, not approved code.
  - Reason: not stated separately.
  - Date/source: operator's investigate-change request, 2026-11-19.
- **D2:** Start available source checks automatically on a new project's first opening, with Skip/Stop available.
  - Effect: this feature must preserve accepted Auto behavior, existing explicit choices and cancellation controls.
  - Reason: not stated separately.
  - Date/source: explicit operator answer to the first-opening question, 2026-11-18.
- **D3:** Implement this reviewed plan through implement-approved-change.
  - Effect: supersedes D1's investigation-only boundary. Implement A1-A4 and verify their acceptance gates.
  - Reason: the operator approved the advisory comparison and existing-owner design.
  - Date/source: operator's implementation request and supplied PASS review, 2026-11-19.

### Operator gates

No blocking design question is open. D3 authorizes implementation of the reviewed defaults below.

### Working assumptions

- **A1 [ADOPTED by D3]:** Deliver input-change visibility first. Finding comparison and scheduling optimizations are outside this slice.
- **A2 [ADOPTED by D3]:** Compute one comparison against the latest published run per monitored target. Display it only when that
  run matches the browser's displayed run; explain deferred adoption instead of computing every retained tab's old baseline.
- **A3 [ADOPTED by D3]:** Exact file differences cover recorded, comparable input domains only. Show unavailable comparison for
  absent or changed collection scopes. Do not add a persistent monitoring-input inventory to fill historical gaps.
- **A4 [ADOPTED by D3]:** Use the existing Checks panel and compact status area, with a paged path disclosure. Add no graph markers
  for unverified changes and no additional primary toolbar control.

## Non-goals

- No new scheduler, watcher, polling loop, process, port, dependency, Git integration or persistent summary store.
- No build-only Auto mode, native settling-policy change, priority system, build wrapper, plugin or mandatory project hook.
- No immutable historical build/source snapshot feature or claim that a receipt identifies the exact compiled source.
- No new/resolved finding comparison, architecture score, inferred dependency changes or partial graph publication.
- No per-module restriction of compiler invalidation or CPD: headers can affect many units and clones can cross modules.
- No code diff, renamed-file inference, exact changed-line claims or automatic source editing.
- No extra C++ scanning when checks do not authorize it; saved-only opening remains scan-free.
- No completion or archival of other tasks' unfinished native/runtime acceptance gates.

## Verified evidence

### Facts

1. [Monitor](../../laniakea/monitor.py) already owns notifications, bounded burst settling, periodic reconciliation, a single
   active worker and coalesced target generations. Source events do not establish content changes. Unchanged input identities
   avoid staging; generation checks reject obsolete work. Native eligibility is already resolved by
   [Unreal checks](../../laniakea/unreal/checks.py). Changing these mechanisms is not necessary for A1.
2. [Unreal monitoring](../../laniakea/unreal/monitor.py), `inspect()`, computes input fingerprints and an identity covering
   recipe, tools, compiler environment and build context. It returns raw inputs but no user-facing comparison. Its existing
   `changed` boolean is computed before configuration files are added and is not a complete change explanation.
3. [Worker](../../laniakea/monitor_worker.py) probe results contain current fingerprints and the prior automatic identity.
   [Monitor status](../../laniakea/monitor.py) keeps lifecycle/progress but no changed-path collection; its controller does not
   consume the raw probe input dictionary. HTTP polling cannot explain which inputs differ merely from the opaque identity.
4. [Pipeline freshness](../../laniakea/pipeline.py), [server target metadata](../../laniakea/server.py) and
   [the banner](../../viewer/app.js) already have a static changed-path presentation. Modern saved-map startup disables scanning;
   it supplies unknown freshness and an empty path sample. This is not a live comparison facility to duplicate.
5. [Published inputs](../../laniakea/unreal/__init__.py) record build inputs and receipt fingerprints, plus C++/external inputs
   for native runs or the successfully acquired [source-health scope](../../laniakea/unreal/source_health.py). Configuration and
   tool/environment observations used by the monitor are not a complete per-input published inventory.
   `automatic.json` retains the complete monitoring identity, not the original component values.
6. [Source fingerprints](../../laniakea/unreal/source_inputs.py) honor the selected corpus and declared source mounts.
   Native fingerprinting includes previously recorded external compiler inputs. Missing tools or Off choices can intentionally
   leave source bodies unmonitored. A scope change cannot safely be presented as files added or removed.
7. [Analysis](../../viewer/analysis.js) separates displayed evidence, pending settings and newer ready results.
   [Live adoption](../../viewer/live.js) can be deferred by gestures, saves and drafts. Any new comparison must preserve this
   distinction; latest-ready counts cannot silently describe an older displayed map.

Diagnostic proof: [synthetic input probe](../../workspace/tmp/input-change-investigation/probe.py) and
[results](../../workspace/tmp/input-change-investigation/probe.json). On the Sample fixture, a configuration edit changed the
monitoring identity while `changed` remained false; the file had no canonical configuration baseline. With both source checks
Off, a C++ edit preserved the monitored identity. Saved-map metadata correctly reported unknown freshness with zero sampled
paths. These results refute treating an empty path list, that boolean or an unchanged Off-mode identity as whole-project freshness.

### Prior art and limits

- [Sonar incremental analysis](https://docs.sonarsource.com/sonarqube-server/2025.5/analyzing-source-code/incremental-analysis/introduction)
  considers cross-file dependencies and build/settings changes when reusing C++ analysis.
- [clangd indexing](https://clangd.llvm.org/design/indexing) retains cached per-file results and separates background indexing
  from current-file information. This supports reuse; it does not establish Laniakea's cache equivalence or performance.
- [Visual Studio background analysis](https://learn.microsoft.com/en-us/visualstudio/ide/configure-c-cpp-advanced-options?view=visualstudio)
  provides open/save feedback. Laniakea is an architecture explorer, not an editor diagnostics replacement.

The inferred product gap is trustworthy visibility of observed change, not a demonstrated need for another analyzer or
scheduler. No prototype, new browser behavior or performance improvement is verified by this investigation.

## Current architecture and source of truth

| owner | responsibility for this slice |
|---|---|
| [Profile registry](../../laniakea/profiles.py) and [Unreal monitor](../../laniakea/unreal/monitor.py) | collection scope, comparison eligibility and profile-specific input categories |
| [Worker](../../laniakea/monitor_worker.py) | derive comparison from the same fingerprint pass used for identity; no HTTP-thread scanning |
| [Monitor](../../laniakea/monitor.py) | accept generation-bound observations, retain one bounded comparison per target and expose current/unknown state |
| [Snapshots](../../laniakea/snapshots.py) | immutable run/read-context identity; no mutable comparison stored as canonical snapshot facts |
| [Server](../../laniakea/server.py) | bounded cached metadata and paged paths, with no arbitrary filesystem query |
| [Analysis](../../viewer/analysis.js), [live](../../viewer/live.js), [app](../../viewer/app.js) | comparison display, cancellation and displayed-run binding; existing banner uses the same projection |
| [Review](../../docs/architecture/review.md) | findings and decisions remain bound to recorded evidence; no input-event findings |

## Problem and root cause

The scheduler can know that recorded evidence needs refresh while the operator sees only pending/running status or an old
stale banner. The comparison data is not projected from worker observations into the live UI. Input identities also contain
more domains than canonical input manifests, so simply diffing dictionaries would manufacture additions and deletions.

## Decision

Implement A1-A4 as an advisory projection of existing observation data. Preserve D2 and all current publication safeguards.

### Premise / KISS gate

Monitor already owns the observation lifecycle and must remain asynchronous to keep exploration responsive during expensive
checks. Its worker already obtains the required fingerprints. Extend that path; do not introduce a second scanner or wait
for a build event that cannot establish source stability. Add one profile projection, one cached paged-read route on the
existing HTTP server and one read-only Checks section. No extra worker phase or persistent file is required.

Use the compact Checks entry when a matching live comparison is available. Preserve useful scan-enabled startup banner paths
when no live comparison exists. Receipt timestamp changes are build-evidence changes, not proof of edited source or a build.
Knowingly give up comparison against every retained older run and exact attribution for inputs never recorded in a baseline.
Both limitations remain explicit rather than adding another inventory/history mechanism.

### Comparison semantics

1. Bind every observation to target, published baseline run, compared scope, current monitoring identity and observation time.
   This is an observed comparison, not an atomic filesystem snapshot or an architecture verdict.
2. Let the profile establish comparable domains from published manifest coverage and run-bound settings. Compare native source
   or completed CPD scope only when current collection covers the same domain. A missing baseline, newly enabled collection,
   unavailable tools, narrower/different prefixes, exclusions or changed roots must not turn unseen files into additions/deletions.
   Comparable build-input domains can remain available independently of unavailable source-content comparison.
3. In comparable domains, report distinct added, modified and removed inputs, grouped by profile-provided categories such as
   implementation, header, build rule/descriptor and recorded external input. Moves remain add/remove. Missing external-input
   markers must be interpreted by the profile, not mistaken for a content digest. Only proven absence can mean removed;
   permission/read errors remain unknown or failed. Refine the existing collection boundary if necessary, without a second
   filesystem pass. Counts describe inputs, not modules or refs.
4. Configuration/tool/environment/adapter differences without per-input published values get an explicit context or baseline
   limitation. A changed automatic identity with no explained file differences can establish an overall monitoring-context
   difference; it cannot identify the exact cause. A manual run without that identity cannot establish this comparison.
   Do not reuse `inspect().changed` as a complete summary or list every current configuration file as newly added.
5. State whether each domain is compared, not recorded, not monitored or unavailable. Unknown, failed and known-empty comparisons
   differ. Recorded external inputs are not an exhaustive inventory of newly reachable headers. Unknown input families remain
   visible as limitations rather than being silently dropped or triggering a wider scan.
6. Derive conservative recheck guidance from the profile and recorded coverage. Say references or duplication evidence may
   be outdated, not that dependencies changed or a violation appeared. Missing native evidence remains missing evidence.

### Observation lifecycle and transport

- Derive differences from fingerprints already obtained by the worker. Keep mandatory identity/validation logic authoritative;
  the advisory projection must never decide whether to extract or publish.
- Accept an observation only for the worker's matching target/run/generation. On a relevant event, mark its freshness pending;
  paused/inactive/degraded/error states cannot continue claiming a current zero-change comparison. A retained list is explicitly
  last observed, with time and scope. Repeated unchanged content can retain its comparison identity and loaded page.
- Keep one current comparison per target in the existing Monitor state. Status contains counts, coverage and a comparison
  token, not all paths or raw hash/environment dictionaries. Provide a bounded paged `GET /monitor/changes` read using target,
  baseline run and expected comparison token; only cached data is read. Reuse server paging validation conventions.
- Expired tokens or baseline mismatches return a clear conflict, never a page from another observation. Bound paths, retained
  comparison memory and response size. Preserve truthful totals and disclose incomplete detail if a resource limit is reached;
  never silently truncate. Keep the existing worker-result limit. Probe transport need not duplicate unused raw fingerprints
  beside the comparison, but audit consumers before removing those internal payload fields; profile input APIs remain intact.
- Comparison projection/format limits degrade this advisory feature without rejecting valid graph publication. Actual input
  I/O and required analysis errors retain their current fail-closed semantics. No broad exception-to-empty conversion.
- On publication, replace/invalidate the old baseline comparison. Reuse the worker's validated after-observation where it
  establishes the new comparison; otherwise show pending/unknown. Do not invent zero changes or add a redundant full scan.
- A2 deliberately avoids per-tab scans. When ready run Y differs from displayed run X, withhold Y's changed counts/paths
  from X and explain that comparison awaits map adoption. Adoption uses the normal guards and preserves user exploration.

### Operator experience

Use one read-only "Changes since recorded analysis" section in Checks. Show comparison state, last observation, scoped counts
and "Show paths". Expand a single bounded path page with category/change kind; provide Next/Previous without rebuilding
check-mode controls. Use ordinary escaped text and existing root-based source navigation for known files. Opening a file at
its start is navigation, not a claim about changed lines; removed or unmapped inputs must not acquire fabricated source links.

Use existing Run checks / Apply and run / Retry / Run recommended checks actions with guidance. Off choices stay Off until
explicitly changed. Opening paths never starts acquisition, resumes a paused target or alters Review. Comparison inspection
does not create a settings draft or block adoption. Cancel page requests on target, observation or panel changes independently
of the settings-request epoch; late path replies cannot erase form edits, replace another target or reopen a closed panel.

Keep the galaxy, coverage counts and Review findings visible as recorded data. Change notifications use informational copy,
not policy-violation styling. Keep Checks/Review/View accessible at narrow widths, wrap paths, retain keyboard focus and avoid
count-driven layout shifts. Reuse the existing banner for a compact pointer to Checks instead of a second full path list.
Use reserved summary/control space for asynchronous updates; do not insert a height-changing map banner or reopen a dismissed
panel on each observation. An intentional panel opening may resize the viewport, but must not fit/reset the camera.

### Alternatives considered

| option | parts added / removed | judgment |
|---|---|---|
| Existing startup banner only | no new route; no live comparison | Cannot explain ongoing changes or expose all comparable paths beyond its sample |
| Worker projection + existing Monitor/Checks | one bounded cached-read route; replaces duplicate banner list | Recommended; no new execution or persistence owner |
| Independent watcher or browser-triggered scans | extra scans/lifecycle or source work on request threads | Duplicates observation and violates responsiveness/saved-only boundaries |
| Store full historical monitoring inventories | extra capture/versioning/storage contracts | Not needed for A1; preserve explicit unknown domains under A3 |
| Build-only scheduling or historical build snapshots | build signal/provenance and changed publication contracts | Separate behavior; does not solve this visibility gap |
| Finding deltas now | two evaluated baselines plus policy/coverage/triage compatibility | Different evidence problem; excluded by A1 |

## Required invariants

1. Preserve source boundaries, selected target, immutable graph/reference identity, publication validation and owned cancellation.
2. Keep Auto, required requests, legacy opt-outs, failure reuse and complete cross-module analysis unchanged under D2.
3. No source I/O, tool load or analyzer launch in status/path HTTP handlers; no new scan on saved-only startup or inactive browsing.
4. Baseline/run/scope uncertainty is never zero changes. A summary cannot leak ready evidence into an older displayed map.
5. Events and path changes do not create Review findings, assert changed architecture or fabricate declaration ownership.
6. No canonical schema, run evidence, layout or triage migration. Comparison is disposable session state, not another truth store.
7. All comparable paths remain inspectable within declared limits; pagination never mixes observations and cannot read arbitrary files.
8. Preserve Python 3.9+, offline loopback operation, privacy, existing panel focus, drafts, camera, pins and Inspector state.

## Implementation tasks

- [x] Add the failing acceptance/guard cases below to existing monitor/input/server/Analysis/Live test owners before production edits.
- [x] Extend profile observation projection with explicit scope eligibility, categorized differences, context uncertainty and recheck
  guidance. Reuse the already collected fingerprints and recorded coverage; leave extraction identity semantics unchanged.
- [x] Transport and accept bounded comparison observations through the current worker/controller. Implement pending, error, pause,
  publication and unchanged-observation behavior with one cached comparison per target.
- [x] Add the cached paged read to the existing server; validate parameters, comparison identity, limits and absent monitoring.
- [x] Extend Checks and the existing banner using one comparison projection. Prove displayed-run binding, safe file navigation,
  form independence, paging cancellation and responsive layout. Do not add speculative graph annotations.
- [x] Update the stable owners below, run focused and browser acceptance, inspect protected-state hashes and the full diff.
  D3 authorizes implementation; archive only this task when its own gates pass.

## Test-first and verification plan

### Red evidence

Add guards only for the changed machine-provable contracts; layout/readability judgments remain reviewed browser evidence.

| case and evidence kind | current wrong/absent behavior the new guard must reject |
|---|---|
| Comparable recorded C++ edits/additions/deletions - permanent worker guard | No categorized live differences despite a changed identity |
| Completed scoped CPD baseline - worker guard | Cannot explain precise changes within the recorded corpus without widening it |
| Off, missing tools, failed acquisition or missing baseline - worker/UI guards | An empty or unavailable comparison can read as zero source changes |
| Changed scope, roots or prefixes - worker guard | A naive dictionary union reports previously uncollected files as added/removed |
| Configuration-only/context change - worker guard | Reusing `changed` misses it; naive baseline comparison repeatedly adds unrecorded configuration files |
| Recorded external removal / unknown external inputs - worker guard | Missing markers become modified hashes or unsupported external coverage looks exhaustive |
| Same content touch and ordinary reconciliation - scheduler guard | Event notifications alone become permanent changed rows or reset identical page state |
| Dirty generation, failed read and lost notifications - scheduler guard | Obsolete or unknown observations can look current/empty |
| Pause, restart, saved-only and unsupported profile - guards | Comparison can claim live freshness or initiate unauthorized acquisition |
| Publication and deferred adoption - Live/browser guards | Old summaries survive new baselines or ready-run paths leak into the displayed map |
| More than one page, expired cursor and overlapping tab requests - server guards | Paths truncate silently or pages mix baselines/observations |
| Oversized/malformed advisory payload - worker/controller guards | New presentation data can abort otherwise valid publication or become false zero |
| Path request with read/scan hooks forbidden - server guard | Opening/paging changes triggers filesystem scans or arbitrary path reads |
| Target switch, close, Apply delay and dirty form - Analysis/browser guards | Late path responses overwrite another target, settings draft or dismissed panel |
| Real UI inspection - acceptance + reviewer judgment | User cannot distinguish changed inputs, missing comparison and recorded architecture without terminal commands |

Use Sample sources and existing [recorded UBT support](../../tests/support.py). Reuse published native/health fixtures or the
small [native/health integration](../../tests/test_native_health.py) for positive source-coverage cases; do not make the feature
depend on full private-project indexing. Existing [Off-mode](../../tests/test_monitor_inputs.py),
[coverage](../../tests/test_analysis_controls.py), [server](../../tests/test_server.py), [Analysis](../../tests/analysis.test.cjs) and
[deferred-adoption](../../tests/check-coverage.browser.js) regressions protect already-correct behavior.

### Green evidence

Run the exact new failing cases first, followed by affected suites from [verification](../../tests/README.md):

```text
python -m unittest discover -s tests -p test_monitor*.py
python -m unittest discover -s tests -p test_analysis_controls.py
python -m unittest discover -s tests -p test_server.py
node --test tests/analysis.test.cjs tests/live.test.cjs
python -m unittest discover -s tests -p test_documentation.py
python -m unittest discover -s tests -p test_privacy.py
```

- Repeat affected Python checks with Python 3.11; check the documented 3.9 boundary. Conditional native/CPD skips are not proof.
- Extend the existing [Analysis browser scenario](../../tests/analysis.browser.js) and
  [coverage/adoption scenario](../../tests/check-coverage.browser.js) on a disposable Sample workspace with the normal pipeline,
  read contexts and HTTP server. Exercise trusted controls, long paths, multiple pages, desktop/compact/narrow widths and themes.
- Match before/after probe input-read counts and HTTP costs on the same fixture. Repeated polls/page reads must not reread
  sources or launch analyzers. Test large synthetic changed-input sets, bounded payload/memory and complete-or-explicitly-limited
  paging. Record actual browser latency; reject repeatable material regressions, not an arbitrary percentage threshold.
- Passively inspect the real viewer for readable state and unchanged user stores. Preserve its check choices; do not start
  native work or edit private sources just to populate this UI. Positive change/paging proof belongs to controlled Sample data.
  Existing full native/runtime acceptance remains independently unverified unless actually completed.
- Review all changed files for private data, ASCII, links, duplicated contracts and unwanted staging/commits.

## Documentation plan

| owner / existing statement | implementation update |
|---|---|
| [Monitoring](../../docs/architecture/monitoring.md): input identities, event settling and publication | Own advisory comparison lifecycle, baseline binding, limits and read-only paging |
| [Unreal profile](../../docs/architecture/unreal-profile.md): source/build/health inputs and receipt limits | Own comparable domains, categories, unrecorded context and conservative recheck meaning |
| [Viewer](../../docs/architecture/viewer.md): displayed versus ready evidence and panel state | Own Checks presentation, deferred comparison, paging cancellation and form independence |
| [Graph model](../../docs/architecture/graph-model.md): recorded freshness and monitoring link | Retain its route; do not copy the new monitoring protocol here |
| [Guide](../../docs/guide.md): current Run/Stop/Retry workflow | Add brief change-inspection guidance; link to owners instead of repeating their state contracts |
| [Verification](../../tests/README.md): suite routes | Update affected browser/worker coverage descriptions |

No new stable document, router or todo README entry is required. Stable code/docs/tests never depend on this plan.

## Rollout and rollback

Add optional live metadata without changing canonical artifacts or saved recipes. Historical runs and profiles without
comparison support show honest unavailable/limited state. Browser/server version mismatch must not break exploration.
Rollback removes the advisory projection/route/UI; validated maps, caches, positions, triage and monitoring retain their
existing owners. No data migration or automatic source-policy change is included.

## Completion criteria

Approved implementation shows correct comparable paths, honest limits and useful existing recheck actions while recorded
architecture remains usable. Unknown domains never imply freshness, ready/displayed generations never mix, reads remain
bounded and scan-free, and protected state remains unchanged. New acceptance and affected tests pass, stable contracts are
updated, and future scheduling/finding-delta work is not represented as delivered.

## Review record

### 2026-11-19 - Investigation

- D1 and D2 recorded; A1-A4 are recommendations requiring review. Initial working tree was clean.
- Inspected Monitor, profile input collection, optional acquisition, immutable contexts, server metadata, Analysis and Live
  consumers. The synthetic probe exposed the incomplete `changed` boolean and unrecorded configuration baseline directly.
- Baseline: 44 focused Python checks passed without skips; 13 Analysis/Live JavaScript checks passed. Receipts are in
  `workspace/tmp/input-change-investigation/`. They verify existing contracts, not the proposed comparison feature.
- Plan validation: five documentation/privacy checks passed; the new file is ASCII and its local links/anchors resolve.
- Only this plan is an intended repository edit. No production code, tests, settings, stable docs or user state was changed.

### 2026-11-19 - Approved implementation and acceptance

- D3 authorizes the focused implementation. Both reviewer guardrails are valid and implemented: byte-identical receipt
  rewrites are build-evidence changes; scan-enabled startup paths remain available when no matching live comparison exists.
  No reviewer point required refutation or an architectural change.
- Unreal projects differences from the existing input pass with recorded-scope checks. Worker transport and Monitor retain
  one bounded, generation-bound observation. The cached server route performs no source scanning. Comparison failures cannot
  reject a valid map. Existing identities, scheduling, required checks, graph facts and user-state ownership are unchanged.
- Checks presents counts, limits, guidance and 50-path pages. Target/run/observation guards reject mixed pages and cancel late
  requests independently of settings. The fixed-height map strip avoids asynchronous map shifts. The existing banner owner
  retains its legacy disclosure and focus across unchanged polls; new paging stays in Analysis rather than the main entrypoint.
- Red proof: the added input/scheduler tests produced six missing-comparison failures; the route test returned the expected
  pre-feature 404; two JavaScript tests rejected the absent summary projection. A later focused regression reproduced an
  open legacy disclosure being replaced by status refresh, then passed after the bounded banner cache correction.
  Initial empty-page/removed-row assertions were corrected to match the deliberately edited and sorted Sample fixture;
  those assertion errors are not product-defect evidence.
- Python: 78 affected checks passed without skips, followed by the full non-Engine suite: 335 passed and one optional legacy
  clangd-indexer test skipped (336 executed). Real LLVM and CPD were enabled. The strengthened real native/CPD comparison
  assertions and final external-removal case then passed in 18 focused checks without skips. Python 3.11 passed 83 affected
  checks and the same 18 real native/CPD checks; all 11 changed Python files passed Python 3.9 grammar validation. This is not
  a Python 3.9 runtime claim. The Engine integration suite was not repeated for this advisory feature.
- JavaScript: all 189 tests passed. Chromium passed the new 123-path scenario plus existing Analysis, coverage-adoption and
  live-adoption scenarios. Proof includes paging, removed-file links, expired observations, Off scopes, focused
  links, dirty forms, late close/target replies, deferred adoption, narrow widths and both themes. Existing live acceptance
  retains render-failure rollback and multiple-tab checks. A Windows lock race in the ignored harness release flag was
  replaced by an in-memory event; the final feature replay passed without runtime errors.
- Matched synthetic native probes read exactly 20 project files before and after. Before/after p95 was 166.05/165.82 ms;
  maximum was 169.00/177.07 ms. These small-fixture measurements establish no extra source pass, not a general speedup.
  Cached live-status reads measured 9.5 ms p95 and 22.1 ms maximum in the passive viewer smoke; no analyzer was started by
  inspection. Documentation/privacy checks passed; final ASCII, link, syntax and whitespace checks are part of closeout.
- The normal viewer was stopped through owned shutdown and restarted at its usual address. Passive inspection confirmed
  readable comparison, narrow access, close focus and unchanged layouts. Its existing native/duplication Off choices and
  source-body opt-out remain intact. All three protected layout files remain byte-identical; absent policy/triage files
  remain absent. No private source was edited and no private native acceptance was attempted for this feature.
- Durable contracts moved to monitoring, Unreal profile, viewer, guide and verification owners. No dependency, persistent
  store, scanner, scheduler, canonical schema or renderer was added. No staging or commit was performed. This task is DONE;
  the separate Analysis Controls task remains PARTIAL with its independent D6 runtime gate unverified.

Private, disposable receipts under `workspace/tmp/input-change-implementation/`: [red Python](../../workspace/tmp/input-change-implementation/red.json),
[affected checks](../../workspace/tmp/input-change-implementation/backend.json), [broad Python](../../workspace/tmp/input-change-implementation/python-all.json),
[real native/CPD](../../workspace/tmp/input-change-implementation/native-health.json), [Python 3.11](../../workspace/tmp/input-change-implementation/py311.json),
[Python 3.11 native/CPD](../../workspace/tmp/input-change-implementation/py311-native-health.json),
[JavaScript](../../workspace/tmp/input-change-implementation/javascript.log), [feature browser](../../workspace/tmp/input-change-implementation/browser.json),
[Analysis browser](../../workspace/tmp/input-change-implementation/regression-analysis/browser.json),
[coverage browser](../../workspace/tmp/input-change-implementation/regression-coverage/coverage-browser.json),
[live browser](../../workspace/tmp/input-change-implementation/regression-live/browser-results.json),
[probe measurements](../../workspace/tmp/input-change-implementation/probe-performance.json),
[passive viewer](../../workspace/tmp/input-change-implementation/main-browser.json), [protected state](../../workspace/tmp/input-change-implementation/protected-stores.json).
