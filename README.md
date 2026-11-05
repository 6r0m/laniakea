# Laniakea

Explore an Unreal Engine C++ project like a star map: its plugin folders, plugins and modules and the dependencies
between them, from the top down to each module, with jump to source. The graph is generated from the project's own build rules, never drawn by hand, and the project
needs nothing installed or configured.

Needs Windows, Python 3.9 or later, and an installed Unreal Engine 5. Clone the repository, then run:

```text
python laniakea.py up path/to/YourProject.uproject
```

Later, `python laniakea.py up` alone reopens the newest project; with make installed, `make up` does the same.

The first run exports the project's Editor target with Unreal Build Tool, which takes seconds, then opens the viewer
at `http://127.0.0.1:8737/`. Wheel into a constellation to reveal its children in place; wheel out to fold it.
Drag empty space to fly between constellations. Hover a star or connection to trace its references without selecting
it. Rings are collapsed groups, dots are individual stars, and diamonds are external. Connections become counted
bundles at a distance and reconnect to their exact endpoints as detail appears. Internal references remain counted
inside collapsed groups. Click to inspect every exact reference or jump to source; following a reference reveals
its destination while retaining the surrounding map.

Browse & filters provides a keyboard-accessible node list and typed reference filters. `/` finds any recorded node;
Enter flies to it. Double-click a group, or focus it with arrow keys and press Enter, to expand or collapse it.
`+` and `-` zoom when the map has focus; Ctrl+wheel remains browser zoom. Existing scope bookmarks fly to that part
of the same map. Drag a star or its visible name to arrange it; dragging a constellation moves its contents too.
Positions save once on release, shared across hierarchy addresses within each project and layout mode. Fit map
changes the camera without moving stars; Reset layout forgets the selected mode's saved positions. Opening the bare server address restores
saved positions from the workspace with HTTP caching disabled. Positions survive extraction and server restarts
while node ids remain the same.
Everything Laniakea learns stays in its own ignored
`workspace/` folder. Laniakea writes nothing into the project; Unreal Build Tool may refresh its own build caches there,
as any build does.

Checks: `python -m unittest discover -s tests`. Viewer regressions also run with
`node --test tests/viewer.test.cjs tests/universe.test.cjs` when Node.js 18 or later is available; it is not needed to run Laniakea.
The Playwright function in `tests/viewer.browser.js` checks wheel expansion and folding, hover tracing, exact
reference navigation, constellation and label dragging, saved positions in a fresh browser, and a narrow viewport
against a served synthetic sample.

| concern | where |
|---|---|
| how it works | [docs](docs/README.md) |
| rules for contributors and agents | [AGENTS.md](AGENTS.md) |
| planned work | [todo](todo/README.md) |

Copyright (C) 2026 6r0m. Licensed under the GNU Affero General Public License, version 3 or later; see
[LICENSE](LICENSE). Third-party code is listed in [THIRD_PARTY.md](THIRD_PARTY.md).

Unreal Engine is a trademark of Epic Games. Laniakea is independent and is not affiliated with or endorsed by Epic
Games.
