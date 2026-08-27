import * as vc from "vscode";
import type * as store from "../../app/store";
import { Span } from "./span";
import type { Panel } from "./panel";

export class Decorator {
  private lineHi: vc.TextEditorDecorationType | undefined;

  constructor(
    private panel: Panel,
    private store: store.Store
  ) {}

  static for(panel: Panel, store: store.Store): Decorator {
    return new Decorator(panel, store);
  }

  init(_context: vc.ExtensionContext): vc.Disposable[] {
    this.lineHi = vc.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: "rgba(55, 148, 255, 0.15)",
      overviewRulerColor: "#3794ff",
      overviewRulerLane: vc.OverviewRulerLane.Left,
    });
    return [this.lineHi];
  }

  clearAll(): void {
    for (const ed of vc.window.visibleTextEditors) {
      if (this.lineHi) {
        ed.setDecorations(this.lineHi, []);
      }
    }
  }

  decorate(editor: vc.TextEditor | undefined): void {
    if (!editor || !this.store.review) {
      return;
    }
    const live = this.panel.liveFor(editor.document.uri);
    const hi: vc.DecorationOptions[] = [];
    for (const ct of live) {
      const data = this.panel.dataOf(ct);
      if (!data) {
        continue;
      }
      hi.push({ range: Span.block(data, editor.document) });
    }
    if (this.lineHi) {
      editor.setDecorations(this.lineHi, hi);
    }
  }

  refreshAll(): void {
    for (const ed of vc.window.visibleTextEditors) {
      this.decorate(ed);
    }
  }
}
