import * as path from "path";
import * as vscode from "vscode";
import type { View } from "../app/shape";
import { threadRange } from "./span";

export class Decorator {
  private gutter: vscode.TextEditorDecorationType | undefined;
  private lineHi: vscode.TextEditorDecorationType | undefined;

  constructor(private view: View) {}

  init(context: vscode.ExtensionContext): vscode.Disposable[] {
    this.gutter = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.file(
        path.join(context.extensionPath, "media", "comment.svg")
      ),
      gutterIconSize: "contain",
      overviewRulerColor: "#3794ff",
      overviewRulerLane: vscode.OverviewRulerLane.Center,
    });
    this.lineHi = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(55, 148, 255, 0.15)",
      overviewRulerColor: "#3794ff",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    return [this.gutter, this.lineHi];
  }

  clearAll(): void {
    for (const ed of vscode.window.visibleTextEditors) {
      if (this.gutter) {
        ed.setDecorations(this.gutter, []);
      }
      if (this.lineHi) {
        ed.setDecorations(this.lineHi, []);
      }
    }
  }

  decorate(editor: vscode.TextEditor | undefined): void {
    if (!editor || !this.view.data.bundle) {
      return;
    }
    const live = this.view.ui.panel.liveFor(editor.document.uri);
    const marks: vscode.DecorationOptions[] = [];
    const hi: vscode.DecorationOptions[] = [];
    for (const ct of live) {
      const data = this.view.ui.panel.dataOf(ct);
      if (!data) {
        continue;
      }
      const range = ct.range ?? threadRange(data, editor.document);
      if (this.gutter) {
        marks.push({
          range: new vscode.Range(range.start.line, 0, range.start.line, 0),
          hoverMessage: new vscode.MarkdownString(
            `**${data.id}** · ${data.status}${data.miss ? " ⚠" : ""}\n\nAlt+; — открыть`
          ),
        });
      }
      hi.push({ range });
    }
    if (this.gutter) {
      editor.setDecorations(this.gutter, marks);
    }
    if (this.lineHi) {
      editor.setDecorations(this.lineHi, hi);
    }
  }

  refreshAll(): void {
    for (const ed of vscode.window.visibleTextEditors) {
      this.decorate(ed);
    }
  }
}
