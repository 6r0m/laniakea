# SPDX-License-Identifier: AGPL-3.0-or-later
# Shortcuts over the Python CLI; its --help owns command options.
# Recipes use no shell syntax, so they run the same under cmd.exe and sh.

PYTHON ?= python
PROJECT ?=
ARGS ?=

.DEFAULT_GOAL := help
.PHONY: help build up down

help: ## Show these targets
	$(info make build [PROJECT=<path>]  analyse and save; newest saved project when omitted)
	$(info make up                      open the saved map; Ctrl+C stops it)
	$(info make down                    stop this workspace's viewer)
	$(info ARGS="..."                  forward flags to the selected Python command)
	$(info python laniakea.py <command> --help  command options; Python also works without Make)
	@$(PYTHON) -c 0

build: ## Analyse sources without starting the viewer
	@$(PYTHON) laniakea.py build $(if $(strip $(PROJECT)),"$(PROJECT)") $(ARGS)

up: ## Start the viewer without extracting
	$(if $(strip $(PROJECT)),$(error PROJECT belongs to make build; build the map first))
	@$(PYTHON) laniakea.py up $(ARGS)

down: ## Stop only this workspace's viewer
	@$(PYTHON) laniakea.py down $(ARGS)
