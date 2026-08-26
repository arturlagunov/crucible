import * as path from "path";
import * as vscode from "vscode";
import type { Session } from "./session";

export class EditTracker implements vscode.Disposable {
  private pending = new Map<string, vscode.TextDocumentContentChangeEvent[]>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private disposable: vscode.Disposable;

  constructor(private session: Session) {
    this.disposable = vscode.workspace.onDidChangeTextDocument((e) =>
      this.schedule(e)
    );
  }

  dispose(): void {
    this.disposable.dispose();
    for (const t of this.timers.values()) {
      clearTimeout(t);
    }
    this.timers.clear();
    this.pending.clear();
  }

  private schedule(e: vscode.TextDocumentChangeEvent): void {
    if (!this.session.bundle || e.document.uri.scheme !== "file") {
      return;
    }
    if (!this.session.forUri(e.document.uri).length) {
      return;
    }

    const key = e.document.uri.toString();
    const buf = this.pending.get(key) || [];
    buf.push(...e.contentChanges);
    this.pending.set(key, buf);

    const prev = this.timers.get(key);
    if (prev) {
      clearTimeout(prev);
    }
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        const changes = this.pending.get(key) || [];
        this.pending.delete(key);
        if (!changes.length || !this.session.bundle) {
          return;
        }
        const doc = vscode.workspace.textDocuments.find(
          (d) => d.uri.toString() === key
        );
        if (!doc) {
          return;
        }
        if (this.session.applyChanges(doc.uri, changes, doc.lineCount)) {
          this.session.info(
            `shift ${changes.length} edit(s) → ${path.basename(doc.uri.fsPath)}`
          );
        }
      }, 400)
    );
  }
}
