import * as path from "path";
import * as vscode from "vscode";
import type { LineEdit } from "../domain/types";
import type { TrackHost } from "../app/shape";
import { SAVE_MS } from "../infra/constants";
import { threadRange } from "../vscode/span";

/** Сдвиг span в памяти. JSON — раз в SAVE_MS или на save документа. */
export class EditTracker implements vscode.Disposable {
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposable: vscode.Disposable;

  constructor(private host: TrackHost) {
    this.disposable = vscode.Disposable.from(
      vscode.workspace.onDidChangeTextDocument((e) => this.onChange(e)),
      vscode.workspace.onDidSaveTextDocument(() => this.flush())
    );
  }

  dispose(): void {
    this.flush();
    this.disposable.dispose();
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
    this.pin(e.document);
    if (!moved) {
      return;
    }
    this.dirty = true;
    this.arm();
  }

  /** Вернуть range на первую строку, если VS Code растянул. collapsibleState не трогаем. */
  private pin(doc: vscode.TextDocument): void {
    const panel = this.host.ui.panel;
    for (const ct of panel.liveFor(doc.uri)) {
      const data = panel.dataOf(ct);
      if (!data) {
        continue;
      }
      const want = threadRange(data, doc);
      const r = ct.range;
      if (!r || r.start.line !== want.start.line || r.end.line !== want.end.line) {
        ct.range = want;
      }
    }
  }

  private arm(): void {
    if (this.timer) {
      return;
    }
    this.timer = setTimeout(() => this.flush(), SAVE_MS);
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.dirty || !this.host.data.bundle) {
      return;
    }
    this.dirty = false;
    try {
      this.host.ops.store.save({ quiet: true });
      this.host.info("shift json saved");
    } catch (err) {
      this.dirty = true;
      this.host.info(`save: ${err}`);
    }
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
