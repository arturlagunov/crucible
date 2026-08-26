import * as path from "path";
import * as vscode from "vscode";
import type { LineEdit } from "../domain/types";
import type { TrackHost } from "../app/shape";
import { threadRange } from "../vscode/span";

/** Геометрический сдвиг span + ct.range. Без locate/remount/notify. */
export class EditTracker implements vscode.Disposable {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private disposable: vscode.Disposable;

  constructor(private host: TrackHost) {
    this.disposable = vscode.workspace.onDidChangeTextDocument((e) =>
      this.onChange(e)
    );
  }

  dispose(): void {
    this.disposable.dispose();
    for (const t of this.timers.values()) {
      clearTimeout(t);
    }
    this.timers.clear();
  }

  private onChange(e: vscode.TextDocumentChangeEvent): void {
    if (!this.host.data.bundle || e.document.uri.scheme !== "file") {
      return;
    }
    const list = this.host.forUri(e.document.uri);
    if (!list.length || !e.contentChanges.length) {
      return;
    }

    const edits = [...e.contentChanges]
      .sort((a, b) => b.range.start.line - a.range.start.line)
      .map(toEdit);
    let moved = false;
    for (const edit of edits) {
      if (list.shift(edit, e.document.lineCount)) {
        moved = true;
      }
    }
    if (!moved) {
      return;
    }

    const panel = this.host.ui.panel;
    const doc = e.document;
    for (const ct of panel.liveFor(doc.uri)) {
      const data = panel.dataOf(ct);
      if (!data) {
        continue;
      }
      ct.range = threadRange(data, doc);
      ct.label = data.label;
    }
    this.schedule(doc.uri);
  }

  private schedule(uri: vscode.Uri): void {
    const key = uri.toString();
    const prev = this.timers.get(key);
    if (prev) {
      clearTimeout(prev);
    }
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        if (!this.host.data.bundle) {
          return;
        }
        try {
          this.host.ops.store.save({ quiet: true });
          this.host.info(`shift → ${path.basename(uri.fsPath)}`);
        } catch (err) {
          this.host.info(`save: ${err}`);
        }
      }, 800)
    );
  }
}

function toEdit(change: vscode.TextDocumentContentChangeEvent): LineEdit {
  return {
    start: change.range.start.line,
    end: change.range.end.line,
    ins: change.text.split("\n").length - 1,
    at: change.range.start.character,
  };
}
