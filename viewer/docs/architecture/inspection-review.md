# Inspection and Review

Directional tracing, entity lookup, source evidence and Review decisions in the browser.

## Contents

- [Tracing and inspection](#tracing-and-inspection)
- [Declaration context and search](#declaration-context-and-search)
- [Review presentation](#review-presentation)

## Tracing and inspection

Wheel zoom reveals a pointed group when its local contents have room on screen; zooming out folds groups at a
separate threshold to avoid flicker. Other constellations retain their positions. Hover temporarily emphasizes
connections to a star or a group's descendants. Inspecting a connection lists both directions between its displayed endpoints; following
one reveals its endpoints without closing other groups. The destination's direct references remain available,
with remote endpoints grouped until the operator approaches them.
Bundle counts appear in the trace readout or inspection; the overview keeps the connection lines without a label on every bundle.
Idle bundle names and colors use manifest metadata. A summary without its own manifest type inherits the exact type's color;
mixed types use a neutral color and name each recorded type rather than implying one kind of reference.

Tracing uses theme roles defined in CSS: cyan outgoing, amber incoming and violet within/self. Map guide,
direction words and native arrowheads provide alternatives to color. Node colors keep their existing meaning.
A node trace names its focus and partitions represented references by canonical endpoints in its containment subtree:
source inside/target outside is outgoing, the reverse is incoming, and both inside is within. These counts are disjoint
and retain compact group weights. They describe the architecture projection after configuration exclusion, type,
boundary and viewport filtering, labelled "In this view". Node inspection separately labels its all-recorded reference scope.

Connection inspection combines all shown families and both directions for the same unordered endpoint pair. A deterministic
ID order fixes its A/B identities, with full ownership paths and levels. Both directional totals and a bounded
type breakdown remain stable across native family/direction hits. A one-way pair explicitly reports zero in reverse;
a real self-loop reports within/self. Coincident reciprocal paths keep their endpoint colors and direction-colored arrows.
Tracing styles existing edges only: no extra lanes, geometry changes, graph facts, hover requests or saved positions.
Wire hover titles the endpoint nearest the pointer among the hovered pairs and marks it with a neutral halo. Incoming
and outgoing colors and counts are relative to that title. A screen-space dead band holds the current viewpoint around
midpoints; a clearly closer endpoint changes it. The compact card lists peer names and counts in two columns, scoped to
hovered connections rather than whole-node usage. It clears a nearly horizontal summary wire when space permits.
Within/self remains separate. Type breakdowns stay in Details.
When different endpoint pairs overlap, hit testing retains all pairs under a fixed screen-space tolerance. The card
counts only unique represented references incident to its titled endpoint, and discloses unrelated pairs separately.
A visual crossing never creates a dependency junction. Peer captions are bounded, with explicit disclosure when either
column truncates; the readout and Details retain full names. Clicking opens the candidate list in Details; focus or hover
emphasizes one pair, and choosing it reuses both-direction exact inspection. Longer candidate lists render in batches. Projection changes
that alter the represented references close stale inspection.

Hit testing uses the rendered paths, including curves, and an ephemeral spatial index of the current rendered edges.
It is independent of canonical reference indexing and saved positions. Pointer work is coalesced per animation frame;
unchanged candidate sets reuse their trace. Projection/camera changes invalidate geometry, and gestures clear it.
The hover card stays anchored while the candidate set and viewpoint remain unchanged. No automatic arrangement occurs on hover.
During pair tracing, endpoint captions yield native pointer hits to connections so newly revealed text cannot steal
the click; endpoint glyphs remain interactive. Leaving the trace restores normal caption interaction.
Clicks inspect the same geometric candidates as hover, using a native edge only when no geometric hit is available.
Single and double taps on expanded backgrounds give wires priority; constellation labels and empty backgrounds retain
their group actions. A double tap on a wire does not fold the surrounding constellation.
The docked, keyboard-focusable readout retains the last summary after pointer exit while emphasis clears. Escape,
clear, gestures and projection changes reset it. Its reserved height does not change when trace text changes.
Canvas titles show names only. A nearby hover card provides kind, containment, coverage and direction counts without
adding lines to those titles. Node cards distinguish outgoing, incoming and within/self references recorded in the snapshot
from the current projection. Each affected total exposes its numerical "Of which: project configuration" subset,
included in that total rather than added to it. These weighted subtree totals and subsets do not change with map filters
or configuration marks. The project root's totals are labelled project/subtree statistics. A filtered-out incoming
reference is not reported as no recorded users. A zero
incoming total says "No incoming references recorded in this snapshot", never that runtime use is impossible.
Cards yield native pointer hits to the graph. They disappear on exit, Escape, gestures or projection changes.
The persistent readout retains readable counts and full names; inspection supplies exact rows.
Following an exact architecture reference enables its type and boundary visibility if a current filter would hide it.
Following an internal reference opens its owner and reference list rather than inventing a visible self-loop.
Optional click inspection keeps its marker through projection refreshes while that exact item remains visible.
Pair details retain represented groups with explicitly named A/B directions; hover can orient counts to either endpoint.
Both totals and shortcuts precede separate
exact-reference pages per direction, so reaching the reverse list does not require scrolling through the forward list.
Changing that group set or its weights closes the pair inspection; it never falls back to a single hit family.
Exact-reference navigation retains its original identity. Hiding an inspected item closes its details instead
of highlighting a different ancestor. Hover and wheel exploration do not require an inspected item.
The Inspector's Details tab keeps identity, source and analysis state visible; secondary metadata has a separate disclosure so
references and navigation remain reachable. Constellation controls track expansion without resetting the reference reader.
The shared header and native accessible tabs stay outside each page's scroll region. Tab changes retain mounted content,
reference paging, scroll and unsaved decision reasons, without changing selection or camera. Ordinary reference pages load
when Details first opens. The panel's close button uses the same inspection cancellation as Escape and returns focus to
the toolbar. At narrow widths, the inspector, findings queue and filters are mutually exclusive;
opening the queue hides inspection without discarding it. Explicit reinspection reopens the retained dock; background
projection refresh does not. When the Inspector overlays the map, the floating hover card is hidden and trace text
continues to update in the map readout.

## Declaration context and search

Recorded declaration kind, qualified owner, signature and source context appear in hover and primary inspection;
access/properties and observed-member coverage appear when supplied by the profile. Names remain the canvas captions.
An owner with no indexed children is not necessarily an empty source declaration. Missing context is left unknown;
the Unreal profile owns [compiler metadata and its limits](../../../laniakea/unreal/docs/architecture/native-analysis.md#native-symbol-analysis).
Inheritance/override hover counts come from the current projected reference groups, respect filters and direction,
and count references rather than distinct base types. Exact declaration names remain in existing reference pages;
hover neither fetches those pages nor creates a second relationship-summary store.

Global search matches recorded labels, qualified names, signatures and source-file paths. It presents at most eight ranked choices with
owner/signature/source context and discloses additional matches so a short ambiguous name does not silently choose an
unqualified result. Arrow keys choose a result and Enter inspects it. Search uses the existing in-memory nodes.
Deep scope breadcrumbs keep the immediate parent/current scope visible and place earlier ancestors in a bounded
disclosure with ordinary navigation links. Long names truncate in the header while full names remain available there
and through hover/inspection. Neither search nor breadcrumb navigation changes canonical ownership or saved positions.

## Review presentation

Review starts in the background when a supported target opens, after the map is ready. The list starts closed;
closing it does not disable findings. Its checkbox clears markers and stops new review requests for the current target session.
The toolbar distinguishes checking, failure, off, unavailable and recorded finding counts. Zero findings is not
proof of complete coverage. Review maps affected canonical module IDs onto the current visible
representatives and decorates their native icons without new graph elements, geometry or pointer targets. Collapsed
representatives deduplicate finding IDs; multiple participants in one cycle do not multiply the global issue count.
The accessible Review list retains off-view findings. Map filters do not change rule results or triage.

Source observations add file/module badges through recorded source paths and owners, never fabricated dependency edges.
Recorded file representatives project their findings through existing presentation folders and regions, including folded
and namespace-local file routes. Visible containers deduplicate matching findings; clean siblings remain unmarked, and an
off-screen module does not suppress a visible file's evidence. File-level matches do not assign ownership to classes or
callables. Container inspection uses its exact finding IDs, while hover distinguishes findings inside a container from
findings in a file. The Review tab identifies duplication separately from architecture relations and loads matching
source ranges in bounded pages for the selected finding. Reading range metadata does not read source bodies.
Current-source links retain a snapshot/staleness warning.

Inspector Review lists related findings and mounts evidence and decision controls for the selected finding. It retains
unfinished decision reasons in the target's Review controller through transient loads and inspection changes. The Review
panel lets the reader recover or discard a draft when its finding becomes unavailable. Reasons are restored only against
the same finding fingerprint. The existing finding index and paged reports populate the list and read selected evidence;
an initial page selects a default only while the reader has made no newer selection.

Source findings expose Compare matches and file, owner and line-range rows. Preview, external-editor and copy actions are distinct.
Compare opens up to two numbered read-only panes over the central workspace;
an individual Preview opens one. The header distinguishes total code locations from the currently displayed match ordinals.
Each pane names its match number and provides Previous match / Next match controls across page boundaries.
Occurrence selectors and bounded paging reveal further ranges on demand, including
different ranges in the same file. Wide views compare side by side; narrow views stack contained, scrollable panes.
The Inspector retains the finding, scroll and decision draft. The covered workspace and surrounding controls are inert.
Back to map or Escape disposes the comparison and returns focus to its invoking control. The graph stays mounted at the
same size underneath: no layout, fit, refresh or duplicate camera state is needed to return. Explicit navigation closes
comparison; live adoption waits while reading, while status polling and snapshot retention continue.

Matching lines are highlighted only in current text verified against the recorded digest, not a guaranteed historical
archive. Changed files show no source text or recorded highlight; limits and read failures remain visible. Clipboard
refusal exposes a selectable path. The [source reader](../../../laniakea/docs/architecture/structure.md#source-preview) owns authorization and byte verification.
Requests reuse Review cancellation and inspection generations. Closing or changing the selection, finding, tab or Review
owner cancels the comparison without taking new focus. Late responses cannot restore it. At most two snippets are retained;
reopening revalidates their files. No editor dependency or source write is added.

Exact reference-group associations also mark existing projected connections and their revealed endpoints. Amber/red
halos identify Review warnings and errors independently of direction colors. Fixed-size amber triangle and red stop-sign
badges remain separate from type icons; counts belong to hover and inspection. Visible stars with active findings
pulse in their family color. Visible connections pulse at the same cadence, with tint, strength and priority driven
by their highest active finding. Badges show the highest displayed severity and stay steady. The pulse holds its current brightness
during camera gestures, and directional flow clears as the camera moves. Reduced motion uses static lighting throughout.
Wire halos mark connections that contain finding evidence. The map key explains the star badges.
Warnings follow file, class and callable projection, including a visible line to an off-screen endpoint.
The halo reflects findings attached to the references that pass the current filters.

Hover shows distinct finding counts and a bounded explanation without fetching analysis or exact rows. Clicking a
marked wire or clicking/keyboard-inspecting a marked entity opens the Inspector's Review tab. Ordinary inspection
and explicit Project context open Details. Queue choices focus Review and name the original affected endpoints,
even when the map represents them through a collapsed owner. The tab's count describes the inspected findings rather than
the project-wide queue; off, checking, failed and unavailable states do not resemble zero findings.
A single finding exposes its explanation and decision actions immediately. Exact evidence reuses current reference
paging and validates original IDs before displaying rows. Connections with several findings use a labelled selector;
Details retains the existing endpoint navigation and all ordinary references. Closing inspection cancels its presentation;
a late request cannot reopen the inspector or change its tab. Hover and wheel input never trigger review analysis, fit or
layout changes. Unchanged report and decision revisions retain draft reasons and loaded evidence. Changed findings update only
Review, preserving the ordinary reader and paging. Removing a focused decision action returns focus to its tab.

Acknowledged visibility and semantics belong to the [review contract](../../../laniakea/docs/architecture/review.md). The viewer retains one affected-entity
index, an exact-group association index and at most eight detail pages/8 MiB of serialized page data; parsed-object
overhead is additional. Report/target changes release pending requests and old pages. Review off releases association
indices and detail pages and has no reference scans per animation frame. Trace colors, graph counts and saved arrangements
remain independent.
