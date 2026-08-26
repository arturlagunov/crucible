import * as vscode from "vscode";
import type { View } from "../app/shape";
import { blockRange } from "./span";

export class Decorator {
  private lineHi: vscode.TextEditorDecorationType | undefined;

  constructor(private view: View) {}

  init(_context: vscode.ExtensionContext): vscode.Disposable[] {
    this.lineHi = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(55, 148, 255, 0.15)",
      overviewRulerColor: "#3794ff",
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    return [this.lineHi];
  }

  clearAll(): void {
    for (const ed of vscode.window.visibleTextEditors) {
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
    const hi: vscode.DecorationOptions[] = [];
    for (const ct of live) {
      const data = this.view.ui.panel.dataOf(ct);
      if (!data) {
        continue;
      }
      hi.push({ range: blockRange(data, editor.document) });
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
