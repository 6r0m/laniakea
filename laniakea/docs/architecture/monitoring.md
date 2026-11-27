# Background analysis

Session monitoring prepares immutable runs while the saved map stays available. The [CLI](../../cli.py) owns
activation options; the [viewer](../../../viewer/docs/architecture/live-updates.md#live-snapshots) owns adoption of ready generations.

## Ownership

- [Monitor](../../monitor.py) owns session activation, debounce, generations and one background job at a time.
- [Check choices](../../unreal/checks.py) own Unreal modes, prerequisites and coverage descriptions.
- [Progress](../../progress.py) projects bounded owned-worker phases into Monitor status.
- [Profile inputs](../../unreal/monitor.py) define consumed files, physical boundaries and watch specifications.
- [Windows notifications](../../notifications.py) multiplex directory reads through one completion port.
- [Owned processes](../../owned_process.py) contain disposable workers and descendants in Windows Job Objects.
- [Worker](../../monitor_worker.py) probes inputs and stages extraction/read indexes; it cannot publish.
- [Read contexts](../../snapshots.py) bind HTTP reads and write validation to immutable runs.
- [Automatic history](../../automatic_history.py) reclaims only tagged background artifacts.

## Requested checks

New project builds record recommended intent separately from the effective acquisition recipe and published evidence.
The initial build can collect CPD; first monitored opening resolves available native work without blocking saved-map serving.
Native Auto requires validated local tools and a usable successful-build receipt; it never compiles the analysed project.
Required native requests retain fail-closed semantics. When upgrading a module-only run, useful module/health results can
publish before native augmentation. Unavailable or failed augmentation never downgrades an existing native map.
Legacy recipes remain authoritative until explicitly changed; a false symbols flag is not consent to enable native work.

Same-origin check requests use the existing controller, validated profile choices and expected run/settings revision.
Identical pending choices coalesce; stale conflicting forms are rejected. Mode selectors stay disabled while a submission
is awaiting its response, so an acknowledgement cannot erase a newer unsent choice. Pending intent remains session-local until the
validated run/request commits. Stop pauses only the selected target, invalidates publication and reports Stopping until
owned cleanup is confirmed. Resuming preserves pending intent; restarting discards uncommitted choices.

Workers report small phase/elapsed summaries and real completed-unit counts through the existing status poll. Unknown
totals stay indeterminate. Progress-output I/O failure logs once and disables that attempt's optional phase reporting;
canonical analysis and its failures retain their normal outcome. Status exposes only progress belonging to the current target/job/generation. HTTP threads
never scan sources, load tools or start analyzers directly. Saved-only startup cannot activate work through browser controls.

When an owned job belongs to an earlier generation, its unit counts remain hidden. A separate bounded status explains that
earlier work is still running before the queued recheck, with optional elapsed job time. This is not progress on current
inputs or a result claim. The projection disappears on job close, pause, replacement or shutdown, and never leaks another
target's work. It reads controller-owned state only and does not change scheduling, cancellation or publication.

## Scheduling and failure

Activation applies only to registered saved targets. Browsing another target does not activate it. Watches are armed before
the baseline probe; notifications mark a coalesced generation dirty. Content identities decide whether extraction is needed.
Provider availability and the committed recipe determine whether C++ bodies participate. Historical inactive targets consume
no source scanning or analysis work. Source mounts are revalidated before reads; notifications never authorize a new root.
Manual and older runs without a complete automatic input identity require initial reconciliation. Matching canonical source
hashes alone cannot establish that configuration, tools and all monitored inputs are unchanged.

[Monitor](../../monitor.py) settles event bursts with bounded batching before reconciling input identities.
The batch limit permits reconciliation during sustained activity; it does not guarantee a quiet period. Neither batching
nor a quiet interval proves that inputs will stay unchanged throughout a long scan. Changes during staging can supersede
that candidate, so before/after validation and the controller's generation check remain mandatory.

Events are hints, not a durable log. Overflow, failed watches and malformed events expose degraded monitoring. Periodic
reconciliation recovers missed edits. Replacing a directory changes its watch identity and does not inherit the old
directory's refusal delay. Engine/toolchain inputs have narrow watches; assets, generated trees and the Engine are not
recursively watched. Review policy, triage and positions do not trigger source extraction.

Required build preparation still runs for changed inputs. CPD retains its complete-corpus cache and native indexing retains
its preprocessing guards. A verified unchanged automatic baseline creates no new run. Continuous edits coalesce rather than
repeatedly killing jobs.
Typed external-build contention has bounded retries; other failures require changed inputs or explicit Retry. A failed target
does not monopolize the queue. Refused writer locks leave the existing writer alone.
An automatic snapshot's complete input identity remains the restart baseline even when provider coverage failed. Unchanged
inputs retain that coverage without another extraction; relevant input, tool or recipe changes, or explicit Retry, permit
another attempt. Persistent native refusal is limited to completed, recognized parse/semantic diagnostics with a
preprocessing guard and consumed inputs covered by the unchanged monitoring identity. That identity includes the compiler
environment used by preprocessing. Unknown/new external inputs cannot establish reuse. A bounded classified outcome stays
independent of the last good map; unclassified records never establish completed analysis or a reusable refusal.
Required On requests, UBT/other provider errors, superseded inputs, access/resource failures and unrecognized diagnostics
cannot create native negative-cache entries. They retain the ordinary session failure/Retry behavior.
Negative-cache read, write and cleanup I/O failures produce bounded diagnostics without changing the primary acquisition
outcome. An unreadable cache cannot refuse analysis. A published automatic native result takes precedence over an old
negative record with the same input identity, even when that record could not be deleted.
Reusing a snapshot never promotes failed coverage to completed analysis or zero findings.

An unrecorded optional external header appearing outside watched inputs does not itself guarantee scheduling. Native
preprocessing guards detect it on the next extraction; Retry, a build or another observed input change can initiate that
extraction. Recorded external inputs are monitored. This is a trigger limitation, not permission to reuse invalid native facts.

## Input-change comparison

The profile projects comparable changes from the existing fingerprint pass; it does not scan again or decide when work
should run. The worker binds its advisory result to the published run. Monitor accepts only the matching job/generation
and retains one bounded observation per target in memory. Canonical graphs, acquisition coverage and user stores are unchanged.

Status includes scope, category counts, time and an observation identity, without paths or raw fingerprints.
`GET /monitor/changes` pages that cached observation using target, baseline run and expected observation identity. Cursors
are offsets with at most 100 paths per page. Replaced observations or mismatched runs return HTTP 409. Requests cannot select
filesystem paths, read sources, load tools or start checks. Detail is limited to 10,000 paths and 2 MiB of serialized rows;
full detected counts remain available and incomplete detail is explicit. Malformed advisory metadata degrades comparison
without changing an otherwise valid analysis/publication outcome. Actual input-read failures retain normal failure semantics.

An event makes the previous observation pending. Pause, failed watches, input errors and inactive targets cannot claim a
current comparison. Publication rebinds comparison to the new run using its validated worker observation. Detecting an
externally published run invalidates the old observation and page token; comparison stays pending through context preparation
until the existing probe establishes the new baseline. The browser only
shows counts/paths for its displayed baseline; a newer baseline waits for ordinary adoption. A monitoring identity can
establish that overall context differs, but cannot attribute changes to configuration or tools lacking recorded values.
An empty comparable path list never certifies the whole project as unchanged. Domain interpretation belongs to
[the profile](../../unreal/docs/architecture/build-extraction.md#input-comparison-domains); presentation belongs to [the viewer](../../../viewer/docs/architecture/live-updates.md#coverage-and-freshness-presentation).

## Publication and shutdown

The controller holds the existing extraction lock while a worker stages and validates a candidate. Before/after identity
checks use the same prior input contract. Newly discovered candidate inputs and selected linked products are separately
validated against their captured state; the accepted candidate retains its new identity. Observed generations are checked
before promotion. The controller alone replaces the latest pointer; cancellation and known supersession retain the last good
map. Filesystem edits are not globally locked, so a later observed edit makes work pending.

The worker validates the canonical graph/read index before promotion. Its result binds the run and manifest to the verified
source, generator and cache identities; the controller checks those bindings without repeating large index reads. A valid
index belonging to another graph cannot be admitted. Review is lazy and independent: policy or triage failures cannot block
a usable map. Versioned snapshot URLs pin manifest, topology, exact-reference pages and layout/triage validation
to the same generation. Map URLs also bind the validated index identity, so regeneration cannot reinterpret old group IDs.
Old URLs never acquire new reference identities. Expired contexts return HTTP 410. Active readers,
the initial context and the latest/recovery contexts protect their artifacts from cleanup. Manual runs and user stores are
never automatically removed; disposable automatic history is tagged separately.
Contexts and browser status heartbeats identify target, run and validated index. Different indexes for one run coexist while
claimed, so retaining a run alone cannot falsely promise access to a replaced index. Unknown identities cannot acquire or
replace a claim. Data and layout routes use the shared immutable run; map, reference and Review routes require the exact index.
A tab retains its current read context for a bounded interval and replaces its own claim when
it adopts or switches targets; it cannot release another tab's context. Expired claims stop protecting abandoned generations.
This state lives only in the existing read-context owner and does not become another persistent store.

Workers enter their Job Object during process creation, before execution. The controller alone holds the non-inherited
kill-on-close handle. Containment refusal cannot launch an uncontained fallback. Stop prevents starts/publication, cancels
owned descendants and drains notification I/O within the existing viewer-stop budget. Ports and process names never
authorize termination. A cleanup failure remains observable rather than reporting confirmed shutdown.
An unexpected scheduler failure performs the same owned-job and notification cleanup and releases its writer lease without
requiring a later stop request. Unconfirmed cleanup remains an error.

Startup reads workspace artifacts before source scanning. The launch-selected target is monitored by default; saved-only
startup disables monitoring. Browser reads remain pinned until that browser adopts a prepared context.
