# SPDX-License-Identifier: AGPL-3.0-or-later
"""The one registry of language profiles.

A profile is a module with NAME, project_file(reference), target_fields(project, engine, target), default_id(project),
inputs(target) and extract(target, run_dir) -> (graph, manifest fields). Adding a language means one adapter and
one line here.
"""

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
