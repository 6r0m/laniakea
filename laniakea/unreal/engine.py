# SPDX-License-Identifier: AGPL-3.0-or-later
"""Finding the engine a project uses, and launching its Unreal Build Tool. Windows only."""

import json
import os
import platform
import winreg
from pathlib import Path

from .. import LaniakeaError

UBT_DLL = Path("Engine/Binaries/DotNET/UnrealBuildTool/UnrealBuildTool.dll")
PLATFORM = "Win64"


def is_engine(root):
    return (Path(root) / UBT_DLL).is_file()


def settings_dir():
    """The engine's FPlatformProcess::ApplicationSettingsDir."""
    return Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / "Epic"


def launcher_installations(base=None):
    """Launcher engines by association, from UnrealEngineLauncher/LauncherInstalled.dat."""
    listing = Path(base or settings_dir()) / "UnrealEngineLauncher" / "LauncherInstalled.dat"
    if not listing.is_file():
        return {}
    entries = json.loads(listing.read_text(encoding="utf-8-sig")).get("InstallationList", [])
    return {
        entry["AppName"].removeprefix("UE_"): Path(entry["InstallLocation"])
        for entry in entries
        if entry.get("AppName", "").startswith("UE_") and entry.get("InstallLocation")
    }


def source_builds():
    """Registered source builds by association, from the Builds registry key."""
    builds = {}
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"SOFTWARE\Epic Games\Unreal Engine\Builds") as key:
            index = 0
            while True:
                try:
                    name, value, _ = winreg.EnumValue(key, index)
                except OSError:
                    break
                builds[name] = Path(value)
                index += 1
    except FileNotFoundError:
        pass
    return builds


def resolve(project_file, override=None, launcher=None, sources=None):
    """Return the engine root for a project: --engine, then EngineAssociation, then an enclosing engine tree."""
    if override:
        root = Path(override).resolve()
        if not is_engine(root):
            raise LaniakeaError(f"--engine {override} is not an engine root: {UBT_DLL.as_posix()} is missing")
        return root
    descriptor = json.loads(Path(project_file).read_text(encoding="utf-8-sig"))
    association = descriptor.get("EngineAssociation", "")
    if association:
        installs = {**(launcher_installations() if launcher is None else launcher),
                    **(source_builds() if sources is None else sources)}
        root = installs.get(association)
        if root and is_engine(root):
            return Path(root)
        raise LaniakeaError(
            f"engine {association!r} named by {Path(project_file).name} is not installed or registered; "
            "pass --engine <engine root>")
    for parent in Path(project_file).resolve().parents:
        if is_engine(parent):
            return parent
    raise LaniakeaError(f"{Path(project_file).name} names no engine and is not inside one; pass --engine <engine root>")


def version(root):
    build = json.loads((Path(root) / "Engine/Build/Build.version").read_text(encoding="utf-8-sig"))
    return "{MajorVersion}.{MinorVersion}.{PatchVersion}-{Changelist}".format(**build)


def dotnet(root):
    """The bundled .NET the engine ships, and the environment its own GetDotnetPath.bat sets.

    Called directly rather than through RunDotnet.bat, which would re-parse every argument through cmd.exe.
    """
    arch = "win-arm64" if platform.machine().lower() in ("arm64", "aarch64") else "win-x64"
    found = sorted((Path(root) / "Engine/Binaries/ThirdParty/DotNet").glob(f"*/{arch}/dotnet.exe"))
    if not found:
        raise LaniakeaError(f"no bundled .NET for {arch} under {Path(root) / 'Engine/Binaries/ThirdParty/DotNet'}")
    # Several bundled versions: the newest is the one the engine's scripts select.
    exe = max(found, key=lambda p: tuple(int(x) for x in p.parent.parent.name.split(".") if x.isdigit()))
    env = dict(os.environ)
    env.update({
        "DOTNET_ROOT": str(exe.parent),
        "DOTNET_MULTILEVEL_LOOKUP": "0",
        "DOTNET_ROLL_FORWARD": "LatestMajor",
        "PATH": str(exe.parent) + os.pathsep + env.get("PATH", ""),
    })
    return [str(exe), str(Path(root) / UBT_DLL)], env
