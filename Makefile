ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
REVIEW ?= CR-17391
EXT_ID := onec-sandbox.crucible-comments-demo-0.2.2
EXT_DIR := $(HOME)/.cursor/extensions
PYTHON ?= python3

.PHONY: help fetch install uninstall load test

help:
	@echo "make fetch / install / uninstall / load [FILE=...] / test"

fetch:
	$(PYTHON) "$(ROOT)build_threads.py" "$(REVIEW)"

install:
	mkdir -p "$(EXT_DIR)"
	rm -f "$(EXT_DIR)"/onec-sandbox.crucible-comments-demo-*
	ln -sfn "$(ROOT)comments-demo" "$(EXT_DIR)/$(EXT_ID)"
	@echo "OK $(EXT_ID) — Reload Window"

uninstall:
	rm -f "$(EXT_DIR)"/onec-sandbox.crucible-comments-demo-*

load:
ifdef FILE
	@$(PYTHON) "$(ROOT)load_signal.py" "$(abspath $(FILE))"
else
	@$(PYTHON) "$(ROOT)load_signal.py"
endif

test:
	cd "$(ROOT)" && $(PYTHON) -m unittest tests.test_source -v
