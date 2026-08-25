#!/usr/bin/env python3
"""Системный выбор json → projects/crucible/.load-request (плагин поллит)."""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REQ = ROOT / ".load-request"


def pick_file() -> str | None:
    try:
        r = subprocess.run(
            [
                "zenity",
                "--file-selection",
                "--title=Crucible: *-threads.json",
                "--file-filter=JSON | *.json",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
        return None
    except FileNotFoundError:
        pass
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        p = filedialog.askopenfilename(filetypes=[("JSON", "*.json")])
        root.destroy()
        return p or None
    except Exception:
        return None


def main() -> int:
    if len(sys.argv) >= 2:
        file = str(Path(sys.argv[1]).resolve())
    else:
        file = pick_file()
        if not file:
            print("отмена", file=sys.stderr)
            return 1
    if not Path(file).is_file():
        print(f"нет файла: {file}", file=sys.stderr)
        return 1
    REQ.write_text(
        json.dumps({"ts": time.time(), "file": file}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"OK: .load-request → {file}")
    print("Жди toast в Cursor (полл 0.5с). Output → Crucible — лог.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
