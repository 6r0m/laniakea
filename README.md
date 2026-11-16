# Laniakea

Explore an Unreal Engine C++ project as a continuous galaxy, from plugins and modules to source files, classes and
functions. Trace recorded relationships to source and review architecture concerns with exact evidence.

Windows, Python 3.9+ and Unreal Engine 5 are needed to analyse a project. Start with:

```text
python laniakea.py build "path/to/YourProject.uproject"
python laniakea.py up
```

The viewer opens at **http://127.0.0.1:8737/**.

| concern | owner |
|---|---|
| commands and options | [CLI](laniakea/cli.py) (`python laniakea.py --help`) |
| optional Make shortcuts: build, up, down | [Makefile](Makefile) (`make help`) |
| exploration, setup and architecture | [documentation](docs/README.md) |
| checks and browser acceptance | [verification](tests/README.md) |
| contributions welcome, first steps | [contribution guide](CONTRIBUTING.md) |
| repository and privacy rules | [AGENTS.md](AGENTS.md) |
| license | [AGPL-3.0-or-later](LICENSE) |
| dependency licenses and provenance | [third-party notices](THIRD_PARTY.md) |

Copyright (C) 2026 6r0m.

Unreal Engine is a trademark of Epic Games. Laniakea is independent and is not affiliated with or endorsed by Epic Games.
