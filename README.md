# Laniakea

Laniakea is an open-source software architecture explorer. Navigate complex codebases through an
interactive galaxy, trace dependencies to source, and investigate architectural concerns using recorded evidence.

Currently supports Unreal Engine C++ on Windows. Everything runs locally.

## Quick start

### Try the sample &mdash; no Unreal installation required

Windows &middot; Git &middot; Python 3.9+

```text
git clone https://github.com/6r0m/laniakea.git
cd laniakea
python -B tests/preview_sample.py
```

The preview shows recorded module evidence. The [Unreal relay sample](sample/README.md) explains how to collect and
inspect C++ and duplication evidence with local tools.

### Explore your own project

Windows &middot; Python 3.9+ &middot; Unreal Engine 5

```text
python laniakea.py build "path/to/YourProject.uproject"
python laniakea.py up
```

The viewer opens at [http://127.0.0.1:8737/](http://127.0.0.1:8737/). The first map uses evaluated Unreal build rules.
C++ declarations and references use a successful build receipt and local LLVM tools. See the
[user and architecture documentation](docs/README.md) for navigation, setup and system design.

## Contribute

Start with the [contribution guide](CONTRIBUTING.md) and [verification commands](tests/README.md).

## License

Laniakea is [AGPL-3.0-or-later](LICENSE). The authored Unreal relay sample is MIT. See the [third-party notices](THIRD_PARTY.md).
