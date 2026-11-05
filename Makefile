# SPDX-License-Identifier: AGPL-3.0-or-later
# Shortcuts over the Python command line, which stays the real entry point (README.md).
# Recipes use no shell syntax, so they run the same under cmd.exe and sh.

PYTHON ?= python
PROJECT ?=

.DEFAULT_GOAL := help
.PHONY: help up

help: ## Show these targets
	$(info make up                   extract the newest project again and open the viewer; Ctrl+C stops it)
	$(info make up PROJECT=<path>    the same for a .uproject, its folder, or an extracted target id)
	@$(PYTHON) -c 0

up: ## Extract, then serve on 127.0.0.1
	@$(PYTHON) laniakea.py up $(PROJECT)
