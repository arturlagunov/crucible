ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
REVIEW ?= CR-17391
EXT_ID := onec-sandbox.cru-0.3.4
EXT_DIR := $(HOME)/.cursor/extensions
# Windows/Git Bash: python3 = WindowsApps stub → Error 49
ifdef MSYSTEM
PYTHON ?= python
else ifeq ($(OS),Windows_NT)
PYTHON ?= python
else
PYTHON ?= python3
endif

.PHONY: help fetch install uninstall load test

help:
	@echo "make fetch / install / uninstall / load [FILE=...] / test"

fetch:
	$(PYTHON) "$(ROOT)build_threads.py" "$(REVIEW)"

install:
	mkdir -p "$(EXT_DIR)"
	rm -f "$(EXT_DIR)"/onec-sandbox.cru-* "$(EXT_DIR)"/onec-sandbox.crucible-comments-demo-*
	ln -sfn "$(ROOT)ext" "$(EXT_DIR)/$(EXT_ID)"
	@echo "OK $(EXT_ID) — Reload Window"

uninstall:
	rm -f "$(EXT_DIR)"/onec-sandbox.cru-* "$(EXT_DIR)"/onec-sandbox.crucible-comments-demo-*

load:
ifdef FILE
	@$(PYTHON) "$(ROOT)load_signal.py" "$(abspath $(FILE))"
else
	@$(PYTHON) "$(ROOT)load_signal.py"
endif

test:
	cd "$(ROOT)" && $(PYTHON) -m unittest tests.test_source -v
