import * as vc from "vscode";
import type * as m from "../../domain/m";

/** Span треда → vc.Range. */
export class Span {
  /** Виджет: только первая строка (весь line). Нулевой range ломает клик по glyph. */
  static line(th: m.thread.Item, doc?: vc.TextDocument): vc.Range {
    const start = Math.max(0, th.lines[0] - 1);
    if (doc && start < doc.lineCount) {
      const endCol = doc.lineAt(start).text.length;
      return new vc.Range(start, 0, start, Math.max(endCol, 1));
    }
    return new vc.Range(start, 0, start, Number.MAX_SAFE_INTEGER);
  }

  /** Подсветка всего span. */
  static block(th: m.thread.Item, doc?: vc.TextDocument): vc.Range {
    const start = Math.max(0, th.lines[0] - 1);
    const end = Math.max(start, th.lines[1] - 1);
    if (doc && end < doc.lineCount) {
      const endCol = doc.lineAt(end).text.length;
      return new vc.Range(start, 0, end, endCol);
    }
    return new vc.Range(start, 0, end, Number.MAX_SAFE_INTEGER);
  }
}
