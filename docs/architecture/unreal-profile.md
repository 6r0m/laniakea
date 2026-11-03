# Unreal profile

How `laniakea/unreal/` reads a project, and the engine behaviour it is built around. Engine citations are paths under
`Engine/Source/Programs/UnrealBuildTool/` unless stated, read at UE 5.8.3.

## Inputs

- The `.uproject`: its `Modules[]`, `Plugins[]` and `EngineAssociation`.
- Every `.uplugin` under `<project>/Plugins`. A folder that holds a descriptor is not searched deeper, as in the
  engine.
- Unreal Build Tool's evaluated module graph of one target, from `-Mode=JsonExport`.
- The project's targets and their types, from `-Mode=QueryTargets`. The default is the Editor target.
- Build inputs for freshness: the `.uproject`, each `.uplugin`, and every `*.Build.cs` and `*.Target.cs` under `Source/`
  and `Plugins/`.

## Finding the engine

1. `--engine <root>`, which is stored in the target.
2. Otherwise `EngineAssociation`, resolved the way `Engine/Source/Developer/DesktopPlatform/Private/` does:
   - launcher engines from `UnrealEngineLauncher/LauncherInstalled.dat` in the application settings folder;
   - source builds from the `SOFTWARE\Epic Games\Unreal Engine\Builds` registry key on Windows, or `[Installations]` in
     `UnrealEngine/Install.ini` elsewhere.
3. An empty association means the project sits inside an engine tree, which is searched upward.

UBT needs the engine's bundled .NET; a system `dotnet` fails. The profile runs
`Engine/Binaries/ThirdParty/DotNet/<version>/<host>-<arch>/dotnet` with the environment the engine's `GetDotnetPath`
scripts set, choosing the newest bundled version. It calls `dotnet` directly rather than through `RunDotnet.bat`,
which would re-parse every argument through `cmd.exe`.

## Running UBT

- Every path passed to UBT is absolute: UBT changes its working directory before it writes outputs.
- Each call passes `-Log=<run>/ubt/<name>.ubt.log`. UBT also writes a structured `<name>.ubt.json` beside the log, so
  a log may never share a stem with an output.
- QueryTargets gets `-Output` and `-DontIncludeParentAssembly`. Without `-Output` it writes
  `<project>/Intermediate/TargetInfo.json` (`Modes/QueryTargetsMode.cs`).
- JsonExport is single-instance. Exit code 10 (`ConflictingInstance`) means another UBT is running; `extract` then
  fails with that reason instead of waiting.
- Exit 0 without the expected output file is a failure.

## What UBT writes into the project

Any UBT call with `-Project` refreshes these, measured on a fresh copy of the sample on 5.8.3. A project that has
been built once already holds them, and a run against such a project changed no file at all.

- `Intermediate/Build/BuildRules/<Project>ModuleRules.dll`, `.pdb` and `...Manifest.json`: the compiled rules
  (`Configuration/Rules/RulesCompiler.cs`).
- `Intermediate/Build/XmlConfigCache.bin`: the build-configuration cache (`Configuration/Xml/XmlConfig.cs`).
  `-XmlConfigCache=` can only load an existing cache, so it cannot be redirected.
- `Saved/UnrealBuildTool/BuildConfiguration.xml`: created empty when missing (`XmlConfig.cs`).

The engine integration test fails on any other change. A launcher engine's `-Mode=GenerateClangDatabase` is different
and destructive: `UEBuildTarget` forces the default intermediate environment on installed engines, so the mode
rewrites the project's live response files, and the next normal build recompiles. Laniakea never runs it on an
analysed project.

## From export to graph

- **Owners.** A module's owner is the descriptor that lists it in `Modules[]`. A module the export has but no
  descriptor lists is placed by the nearest `.uplugin` above its folder. Engine modules are placed under their engine
  plugin the same way, or directly under the engine.
- **Dependency fields.** `PublicDependencyModules`, `PrivateDependencyModules`, `PublicIncludePathModules`,
  `PrivateIncludePathModules` and `DynamicallyLoadedModules` become the `depends.*` types.
  - UBT adds every public dependency to `PublicIncludePathModules` (`Configuration/UEBuildModule.cs`,
    `RecursivelyCreateModules`). An include-path edge is therefore drawn only where no dependency edge exists.
  - The export writes `InternalIncludePaths` from `PublicIncludePaths`, so that field is not consumed.
- **Descriptor dependencies.** Each `Plugins[]` entry with `Enabled` true becomes a `requires` edge carrying `Optional`
  and the platform, target and configuration allow and deny lists. An entry with `Enabled` false switches a plugin off,
  so it is recorded on the node as `disables` instead.
- **Rollup.** `depends.rollup` aggregates module edges between units: a plugin, a module directly under the project, or
  the engine core. An edge between two modules directly under a root is already visible at the top scope, so it is not
  rolled up.
- **Status.**
  - A project module or plugin absent from the export is `not-in-target`.
  - A plugin without modules is `not-analysed`.
  - The export has no plugin field, so a content-only plugin's presence in the target cannot be told.
