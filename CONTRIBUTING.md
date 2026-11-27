# Contributing to Laniakea

Bug reports, documentation, tests and focused fixes are welcome. Windows and Python 3.9+ are enough for documentation
and core-logic contributions; Unreal Engine and LLVM are optional.

## Make a first change

1. Read the [project overview](README.md) and [repository rules](AGENTS.md). Fork the repository, clone your fork and
   create a topic branch for one change:

   ```text
   git clone <your-fork-url> laniakea
   cd laniakea
   git switch -c improve-map-guide
   ```

2. Run the [first checks](tests/verification.md#first-checks) from the repository root; they need no Unreal Engine or LLVM.
3. Keep one problem per change. Discuss broad features or new dependencies in an issue first; small corrections
   need no issue. For bugs, add a regression that fails before the fix when practical.
4. Run the relevant checks, then open a pull request against `develop`. Explain the problem, resulting behavior,
   reproduction and verification, including checks not run. Use only synthetic screenshots for visual changes.

The [verification guide](tests/verification.md) owns test prerequisites, commands and optional native checks.

## Find the right owner

Use the [system composition](docs/architecture/structure.md#composition) to find the component that owns the
contract. Each component's architecture links to its code. Update the owning document when a contract changes.

## Write readable changes

Use descriptive names, conventional spacing and explicit control flow for state transitions and failure paths. Keep
functions with the component that owns the state they change. Add Python annotations where they clarify a caller's
contract. Explain constraints in comments. Keep readability edits close to the code under change so reviewers can see
behavior changes clearly.

## Report a useful issue

Include expected and actual behavior, reproduction steps and relevant tool versions. For map issues, give the target
type/configuration, layer, layout mode and pointer/keyboard steps. Note stale snapshots or unanalysed scopes.

Reproduce with the synthetic sample or a small synthetic fixture. Use synthetic names; exclude real-project data,
identifying counts and machine-local paths from submissions. Keep diagnostics in ignored `workspace/tmp/` and check
the diff for private data or secrets. Follow the [privacy rules](AGENTS.md#privacy-never-violate). Documentation is ASCII-only.

## Verify a viewer change

Run the Node suite, then the relevant [browser acceptance checks](tests/verification.md#browser-acceptance). The browser
launcher prepares disposable synthetic fixtures. Report automated and manual results separately.

## License

Contributions to Laniakea use [AGPL-3.0-or-later](LICENSE). Contributions to the authored Unreal relay project under
`sample/SampleProject/` use the [sample's MIT license](sample/SampleProject/LICENSE). Submit only material you can
contribute under the license for that part of the repository, and keep the SPDX identifier in source files.

Preserve third-party notices and record provenance and licensing in [THIRD_PARTY.md](THIRD_PARTY.md).
