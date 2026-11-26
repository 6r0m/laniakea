# Laniakea

Laniakea is an open-source architecture explorer for Unreal Engine C++. Everything runs locally.

- **Understand an unfamiliar project.** Explore how plugins and modules fit together, then follow dependencies to their source.
- **Plan a refactor.** Trace callers and consumers of public contracts before changing a module.
- **Review a boundary.** Inspect dependency cycles, rule violations, and matching source ranges, then recheck after edits.

## Quick start

Clone the repository and run the following from its root on Windows with Python 3.9+ and Unreal Engine 5.

```text
python laniakea.py build "path/to/YourProject.uproject"
python laniakea.py up
```

The viewer opens at [http://127.0.0.1:8737/](http://127.0.0.1:8737/). The first map uses evaluated Unreal build rules.
See the [user and architecture documentation](docs/README.md) for navigation, source analysis prerequisites and system design.

## Learn by example

Open the recorded module map with `python -B tests/preview_sample.py`. This preview needs Windows, Git and Python 3.9+.
The [Unreal relay sample](sample/README.md) shows how to trace a healthy dependency, investigate a deliberate boundary
problem and follow its recorded evidence to source.

## Contribute

Start with the [contribution guide](CONTRIBUTING.md) and [verification commands](tests/README.md).

## License

Laniakea is [AGPL-3.0-or-later](LICENSE). The authored Unreal relay sample is MIT. See the [third-party notices](THIRD_PARTY.md).
