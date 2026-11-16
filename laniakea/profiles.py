# SPDX-License-Identifier: AGPL-3.0-or-later
"""Language profile registration and project detection; adapters own their extraction interfaces."""

from . import LaniakeaError, unreal

PROFILES = {unreal.NAME: unreal}


def get(name):
    try:
        return PROFILES[name]
    except KeyError:
        raise LaniakeaError(f"unknown profile {name!r}; known: {', '.join(PROFILES)}") from None


def detect(reference):
    """The first profile that recognises reference as a project, with its project file."""
    for profile in PROFILES.values():
        found = profile.project_file(reference)
        if found:
            return profile, found
    return None, None
