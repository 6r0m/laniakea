# Background analysis

Experimental session monitoring updates saved runs without changing an open browser's read context.
The [CLI](../../laniakea/cli.py) owns activation options; automatic browser adoption is not implemented.

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

Events are hints, not a durable log. Overflow, failed watches and malformed events expose degraded monitoring. Periodic
reconciliation recovers missed edits. Replacing a directory changes its watch identity and does not inherit the old
directory's refusal delay. Engine/toolchain inputs have narrow watches; assets, generated trees and the Engine are not
recursively watched. Review policy, triage and positions do not trigger source extraction.

Required build preparation still runs for changed inputs. CPD retains its complete-corpus cache and native indexing retains
its preprocessing guards. Unchanged bytes create no new run. Continuous edits coalesce rather than repeatedly killing jobs.
Typed external-build contention has bounded retries; other failures require changed inputs or explicit Retry. A failed target
does not monopolize the queue. Refused writer locks leave the existing writer alone.

## Publication and shutdown

The controller holds the existing extraction lock while a worker stages and validates a candidate. Input identity and
observed generations are checked before promotion. The controller alone replaces the latest pointer; cancellation and known
supersession retain the last good map. Filesystem edits are not globally locked, so a later observed edit makes work pending.

The canonical graph/read index must be ready before promotion. Review is lazy and independent: policy or triage failures
cannot block a usable map. Versioned snapshot URLs pin manifest, topology, exact-reference pages and layout/triage validation
to the same generation. Old URLs never acquire new reference identities. Expired contexts return HTTP 410. Active readers,
the initial context and the latest/recovery contexts protect their artifacts from cleanup. Manual runs and user stores are
never automatically removed; disposable automatic history is tagged separately.

Workers enter their Job Object during process creation, before execution. The controller alone holds the non-inherited
kill-on-close handle. Containment refusal cannot launch an uncontained fallback. Stop prevents starts/publication, cancels
owned descendants and drains notification I/O within the existing viewer-stop budget. Ports and process names never
authorize termination. A cleanup failure remains observable rather than reporting confirmed shutdown.

Saved-only startup reads workspace artifacts without source scanning. Monitoring remains explicit, and existing tabs remain
pinned until reopened; preparing a newer context does not itself change exploration state.
