# Laniakea

Explore an Unreal Engine C++ project like a star map, from plugin folders and modules to files, namespaces,
classes and functions. Trace dependencies from public contracts into their implementations, with links to source.
Review highlights recorded architecture concerns, checks configured boundaries and inspects optional source-duplication evidence.

Needs Windows, Python 3.9 or later, and an installed Unreal Engine 5. Clone this repository, then run:

```text
python laniakea.py up path/to/YourProject.uproject
```

The viewer opens at **http://127.0.0.1:8737/**. Later, `python laniakea.py up` or `make up` extracts the newest
project again. Use `python laniakea.py serve` to reopen published maps without extracting.

## Choose the detail

| mode | what it reads |
|---|---|
| Ordinary `up` or `extract` | Evaluated module dependencies and plugin descriptors; LLVM is not required |
| `up --symbols` or `extract --symbols` | Also indexes authored C++ with locally supplied LLVM 21.1.8 tools |
| `up --health duplication` | Collects strict C++ source matches with optional local PMD CPD; works with or without `--symbols` |

For native setup, build-context selection and coverage limits, see the [developer guide](docs/guide.md#open-a-project).
For source-duplication setup and limits, see [code-health collection](docs/guide.md#collect-source-duplication).

Wheel in or out to reveal or fold detail gradually. Drag empty space to fly; hover to trace; click to inspect exact
references. Drag a star or its name to arrange it; positions save on release.

Everything learned stays in this clone's ignored `workspace/`. Laniakea writes nothing into the analysed project;
Unreal Build Tool can refresh its own build caches. The viewer runs locally without network resources.

## Contributions welcome

Start with the [contribution guide](CONTRIBUTING.md): small changes and quick checks without Unreal Engine or LLVM.

| concern | where |
|---|---|
| exploration guide, architecture and tool comparisons | [docs](docs/README.md) |
| contributor checks and browser verification | [tests](tests/README.md) |
| repository rules for contributors and agents | [AGENTS.md](AGENTS.md) |

Copyright (C) 2026 6r0m. Licensed under **AGPL-3.0-or-later** (GNU Affero General Public License, version 3 or later); see
[LICENSE](LICENSE). Third-party code is listed in [THIRD_PARTY.md](THIRD_PARTY.md).

Unreal Engine is a trademark of Epic Games. Laniakea is independent and is not affiliated with or endorsed by Epic
Games.
