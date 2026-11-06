# SPDX-License-Identifier: AGPL-3.0-or-later
"""Constrain physical reads to the project and its declared plugin mounts."""

import os
from pathlib import Path

from .. import LaniakeaError


class SourceTree:
    def __init__(self, root, plugins=()):
        self.root = Path(root).resolve()
        self.allowed = {self.root, *(Path(plugin).parent.resolve() for plugin in plugins)}
        self.visited = set()

    def require(self, path, discover_plugin=False):
        path = Path(path).absolute()
        try:
            physical = path.resolve()
        except (OSError, RuntimeError) as error:
            raise LaniakeaError(f'cannot resolve source path {path}: {error}') from error
        if any(physical.is_relative_to(root) for root in self.allowed):
            return physical
        # Only plugin discovery may admit a new mount, at its descriptor-owning directory.
        if discover_plugin and path.is_relative_to(self.root / 'Plugins') and path.is_dir() and any(path.glob('*.uplugin')):
            self.allowed.add(physical)
            return physical
        raise LaniakeaError(f'external source link is not a declared plugin mount: {path}')

    def walk(self, top, discover_plugins=False):
        self.require(top, discover_plugins)
        try:
            Path(top).lstat()
        except FileNotFoundError:
            return
        except OSError as error:
            raise LaniakeaError(f'cannot inspect source path {top}: {error}') from error
        def unreadable(error):
            raise LaniakeaError(f'cannot traverse source tree: {error}') from error
        for current, dirs, files in os.walk(top, followlinks=True, onerror=unreadable):
            physical = self.require(current, discover_plugins)
            if physical in self.visited:
                dirs[:] = []
                continue
            self.visited.add(physical)
            yield Path(current), dirs, sorted(files)
            # Consumers first prune caches, assets and private paths; retained directories must stay in bounds.
            for name in dirs:
                self.require(Path(current) / name, discover_plugins)
