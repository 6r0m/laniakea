# Laniakea

Explore an Unreal Engine C++ project like a star map: its plugins, its modules and the dependencies between them,
with jump to source. The graph is generated from the project's own build rules, never drawn by hand, and the project
needs nothing installed or configured.

Needs Windows, Python 3.9 or later, and an installed Unreal Engine 5. Clone the repository, then run:

```text
python laniakea.py up path/to/YourProject.uproject
```

The first run exports the project's Editor target with Unreal Build Tool, which takes seconds, then opens the viewer
on `127.0.0.1`. Double-click a square node to open it. Everything Laniakea learns stays in its own ignored
`workspace/` folder. Laniakea writes nothing into the project; Unreal Build Tool may refresh its own build caches there,
as any build does.

| concern | where |
|---|---|
| how it works | [docs](docs/README.md) |
| rules for contributors and agents | [AGENTS.md](AGENTS.md) |
| planned work | [todo](todo/README.md) |

Copyright (C) 2026 6r0m. Licensed under the GNU Affero General Public License, version 3 or later; see
[LICENSE](LICENSE). Third-party code is listed in [THIRD_PARTY.md](THIRD_PARTY.md).

Unreal Engine is a trademark of Epic Games. Laniakea is independent and is not affiliated with or endorsed by Epic
Games.
