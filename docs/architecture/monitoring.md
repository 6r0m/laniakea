# Background analysis

Session monitoring prepares immutable runs while the saved map stays available. The [CLI](../../laniakea/cli.py) owns
activation options; the [viewer](viewer.md#live-snapshots) owns adoption of ready generations.

## Ownership

- [Monitor](../../laniakea/monitor.py) owns session activation, debounce, generations and one background job at a time.
- [Profile inputs](../../laniakea/unreal/monitor.py) define consumed files, physical boundaries and watch specifications.
- [Windows notifications](../../laniakea/notifications.py) multiplex directory reads through one completion port.
- [Owned processes](../../laniakea/owned_process.py) contain disposable workers and descendants in Windows Job Objects.
- [Worker](../../laniakea/monitor_worker.py) probes inputs and stages extraction/read indexes; it cannot publish.
- [Read contexts](../../laniakea/snapshots.py) bind HTTP reads and write validation to immutable runs.
- [Automatic history](../../laniakea/automatic_history.py) reclaims only tagged background artifacts.

## Scheduling and failure

Activation applies only to registered saved targets. Browsing another target does not activate it. Watches are armed before
the baseline probe; notifications mark a coalesced generation dirty. Content identities decide whether extraction is needed.
Provider availability and the committed recipe determine whether C++ bodies participate. Historical inactive targets consume
no source scanning or analysis work. Source mounts are revalidated before reads; notifications never authorize a new root.
Manual and older runs without a complete automatic input identity require initial reconciliation. Matching canonical source
hashes alone cannot establish that configuration, tools and all monitored inputs are unchanged.

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
another attempt. Reusing a snapshot never promotes failed coverage to completed analysis or zero findings.

An unrecorded optional external header appearing outside watched inputs does not itself guarantee scheduling. Native
preprocessing guards detect it on the next extraction; Retry, a build or another observed input change can initiate that
extraction. Recorded external inputs are monitored. This is a trigger limitation, not permission to reuse invalid native facts.

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
