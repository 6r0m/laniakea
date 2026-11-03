# SPDX-License-Identifier: AGPL-3.0-or-later
"""Entry point: python laniakea.py <command>."""

import sys

from laniakea.cli import main

if __name__ == "__main__":
    sys.exit(main())
