# Browser viewer structure

The viewer owns interactive map presentation, navigation and evidence inspection.
The [Python core](../../../laniakea/docs/architecture/structure.md) owns canonical graph evidence and
publication. The [user guide](../../../docs/guide.md) owns operator workflows.

## Composition

| part | responsibility |
|---|---|
| [app.js](../../app.js) | startup, target selection and HTML controls |
| [live.js](../../live.js) | staged snapshot adoption and Monitor transport |
| [analysis.js](../../analysis.js) | check coverage, requested modes and acquisition controls |
| [universe.js](../../universe.js) | containment, reference projection and world positions |
| [sections.js](../../sections.js) | source organization without changing semantic ownership |
| [traces.js](../../traces.js) | shared directional calculations |
| [context.js](../../context.js) | declaration context and qualified lookup |
| [map.js](../../map.js) | canvas geometry, projection and pointer interaction |
| [appearance.js](../../appearance.js) | static Cytoscape appearance and luminous states |
| [app.css](../../app.css) | theme tokens, map atmosphere and HTML surface styling |
| [icons.js](../../icons.js) | type glyphs on existing renderer nodes |
| [scene.js](../../scene.js) | camera, hierarchy navigation and cancellable flights |
| [positions.js](../../positions.js) | ordered loading and saving of released pins |
| [references.js](../../references.js) | reference-page retention and cancellation |
| [inspector.js](../../inspector.js) | accessible inspection tabs |
| [review.js](../../review.js) | finding presentation and triage controls |
| [source-preview.js](../../source-preview.js) | selected-finding source comparison and external-editor actions |

## Relationships

The [viewer diagram](diagrams/main.md) shows the browser components and their external contracts.

## Invariants

- Projection and saved positions preserve recorded semantic ownership.
- The displayed graph, coverage and inspection use one snapshot context.
- Analysis and project-specific meaning enter through the graph and local API contracts.
