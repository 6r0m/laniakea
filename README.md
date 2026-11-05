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
at `http://127.0.0.1:8737/`. Blue stars are members of the current scope; outer stars provide context and diamonds are
external. Outlined stars are collapsed groups with an inside count; filled stars are leaves. Captions and breadcrumbs
name each kind, so a module and a same-named plugin remain distinct. Select a star to trace its incoming and outgoing
connections; double-click or use its Open link to go inside. Orbits give a stable overview; Connections uses the
existing force layout to place nodes by their relationships.
Browse & filters provides a keyboard-accessible member list and typed edge filters. Back, Backspace or Up return;
`/` finds a node by name. Drag a star or its visible name to arrange the map: positions save on release, separately for each project,
scope and layout mode. Fit map adjusts the view without moving stars; Reset layout forgets that scope's saved
positions for the selected mode. Opening a scope reads its saved positions from the workspace with HTTP caching
disabled, including when opening the bare server address. Saved positions survive new extractions while node ids
remain the same.
Everything Laniakea learns stays in its own ignored
`workspace/` folder. Laniakea writes nothing into the project; Unreal Build Tool may refresh its own build caches there,
as any build does.

Checks: `python -m unittest discover -s tests`. Viewer regressions also run with
`node --test tests/viewer.test.cjs` when Node.js 18 or later is available; it is not needed to run Laniakea.
The Playwright function in `tests/viewer.browser.js` checks label dragging and reopening the bare address against
a served synthetic sample.

| concern | where |
|---|---|
| how it works | [docs](docs/README.md) |
| rules for contributors and agents | [AGENTS.md](AGENTS.md) |
| planned work | [todo](todo/README.md) |

Copyright (C) 2026 6r0m. Licensed under the GNU Affero General Public License, version 3 or later; see
[LICENSE](LICENSE). Third-party code is listed in [THIRD_PARTY.md](THIRD_PARTY.md).

Unreal Engine is a trademark of Epic Games. Laniakea is independent and is not affiliated with or endorsed by Epic
Games.
