# SPDX-License-Identifier: AGPL-3.0-or-later
"""Entry point: python laniakea.py <command>."""

import sys

from laniakea.cli import main

if __name__ == "__main__":
    # Under make or an IDE task stdout is a pipe; without this the serving line would wait for the server to stop.
    sys.stdout.reconfigure(line_buffering=True)
    sys.exit(main())
