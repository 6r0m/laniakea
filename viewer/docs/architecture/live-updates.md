# Live updates

Coverage, freshness, check controls and adoption of ready snapshots in the browser.

## Coverage and freshness presentation

Zooming into an outside-target or unanalysed scope leaves a named coverage hint in the docked readout.
Node hover and inspection also explain that only recorded structure is available. These statuses do not prove that
configuration disabled the node; the viewer does not infer that cause from target absence.

Checks contains the live input comparison, scoped category counts and paged changed paths. Its compact entry uses the existing
fixed-height map context strip; asynchronous observations do not insert a banner or refit the camera. Paths and counts belong
only to the displayed run. A newer baseline is withheld until normal adoption, while paused/degraded observations remain
explicitly last observed. Missing comparison and known-empty compared domains are distinct; neither implies complete coverage.

Paging is read-only and has its own cancellation epoch, separate from submitted check choices. Close, target and observation
changes cancel obsolete requests; late replies cannot reopen Checks, replace another target or erase drafts. Unchanged polls
retain the loaded page and focused source link. Removed/unmapped paths have no invented links; known files open at their start,
without claiming changed lines. Existing Run/Retry/Auto controls remain the only analysis actions.

When a matching live comparison exists, it replaces the startup banner's duplicate path disclosure. Without it, a scan-enabled
startup retains its useful stale paths and recovery action. Saved-only opening labels unchecked source freshness in the
coverage footer rather than implying that the snapshot is fresh. The [monitoring contract](../../../laniakea/docs/architecture/monitoring.md#input-change-comparison)
owns comparison identity and bounds.

## Live snapshots

The live coordinator polls small session metadata, less often in hidden tabs, and stages manifest, topology, navigation
index and layouts from one ready generation. Adoption checkpoints the native scene, style overrides and UI nodes before
rendering. Previous readers and inspection owners remain intact until that synchronous transition succeeds. A render failure
restores the prior map, camera, URL, Inspector and readers without invoking the failed layout or projection again. Candidate
requests are cancelled; an unrecoverable renderer error explicitly requires reload rather than claiming successful recovery.
Invalid or expired data leaves the last good map available with an explicit update error. Review evaluation is independent
and never delays the map; obsolete Review and exact-page requests are cancelled or ignored by their generation guards.
When the validated read-index identity and projection hints are unchanged, the coordinator reuses topology and unchanged
geometry while refreshing generation-bound readers, coverage and Review. A changed identity always prepares a new universe.

Adoption uses the existing scene, position, reference and Inspector components. It retains the camera, layout mode, surviving
expanded containers, filters, selected entities and Inspector intent. Removed focus falls back through its recorded ancestors with
an explanation. Exact reference IDs are not carried across generations. Back/Forward and target switching use the adopted
generation's immutable data URLs.

Dragging, pending or failed position writes, in-flight Review decisions and edited decision reasons defer adoption. A position
revision change during staging discards that staged copy rather than applying layouts read before a newer move. Independent
tabs heartbeat their current read contexts through the [monitoring contract](../../../laniakea/docs/architecture/monitoring.md#publication-and-shutdown).

The masthead shows the selected project and the displayed manifest's build target. The scope bar starts at Overview.
Browse and Filters share a sidebar slot. Browse selects from the rendered scope members and Filters changes graph visibility.
View groups layout, target outlines and applicable arrangement actions. The Orbit choice uses existing orbit pins first and
then the declared center when available. All modes are selectable. Secondary modes retain their keys and saved arrangements
under More layouts. Map guide,
coverage details and advisory stale-input diagnostics open over the map. The workspace status row and trace area have
stable heights across status and hover updates. Selection opens Inspector through the existing inspection route.
Source comparison makes the graph and map actions inert until it closes.

The adoption checkpoint captures the displayed build context, coverage and status controls alongside the scene and
focused readers. Recovery restores these controls with the previous generation and keeps the native stylesheet installed.
Checks uses the displayed snapshot's
coverage alongside the in-progress phase and labels newer results awaiting adoption. Attempt progress and
requested-versus-applied settings do not replace displayed evidence; removing an adoption block updates coverage with the map.
Only optional profile checks have mode selectors; the map foundation stays mandatory.
The Checks panel starts with recorded coverage. During an attempt it shows the phase, optional measured unit count and elapsed job time. Progress remains
visible in the fixed-height toolbar control when the panel closes. Only validated native unit counts have a determinate
denominator; preparation, duplication, publication and queued earlier work stay indeterminate. Unit completion never claims
overall completion or an ETA, and terminal states clear the running bar. Recorded coverage remains separate from attempts.
Each check has an expandable row with the displayed snapshot's coverage and details for setup, diagnostics and modes.
Status and form updates keep these controls mounted while the check catalog is stable. Edited choices expose Apply and run.
The contextual primary action enables recommended checks or rechecks enabled choices, with Stop/Retry for their
applicable states. Saved-only views show modes as text. Missing/loading/error coverage never becomes a successful zero;
unavailable check catalogs cannot start work.
Analysis offers first-opening guidance when displayed check coverage is incomplete, including informational Off choices.
Automatic opening waits for a visible tab and yields to Review, Inspector, Browse, Filters, View controls, Map guide, graph keyboard focus,
focused controls, gestures and drafts. It does not
close a reading panel or move focus/scroll; deferred guidance remains eligible through the existing status lifecycle.
Manual Checks opening retains normal panel coordination. Presentation or visible dismissal is remembered through the existing
browser preferences, keyed by target and project-root identity rather than run/index. A quiet render or hiding an already-hidden
panel does not consume that opportunity. Hidden-tab rendering cannot acknowledge a panel, including one opened before coverage
arrives; visibility changes reuse the existing status lifecycle. Storage refusal retains an in-memory session guard.
Handled guidance suppresses introductions only; progress, coverage, failure labels and explanations continue updating.
Checks distinguishes recorded coverage, Off and unavailable evidence. Review separately shows active errors and
warnings in recorded evidence. Limited input comparisons are labeled as limited scope.
Settings drafts defer live adoption; late control responses cannot overwrite another target's form. Recommended checks reuse
the normal Auto request and cannot replace dirty/submitting choices or start redundant running work. Close/Escape restores the
primary action's focus. Back to map in the first-opening guide returns focus to the graph without fitting it or starting acquisition.
Successful adoption restores a detached fixed control's visible equivalent, including the Inspector close control, without
scrolling or replacing a newer user focus. The scene rollback path remains independent.
Unavailable, failed, disabled and incomplete checks remain distinct from completed checks and zero findings.
