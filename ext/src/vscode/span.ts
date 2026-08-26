import * as vscode from "vscode";
import type { Thread } from "../domain/thread";

/** Виджет: только первая строка (весь line). Нулевой range ломает клик по glyph. */
export function threadRange(th: Thread, doc?: vscode.TextDocument): vscode.Range {
  const start = Math.max(0, th.lines[0] - 1);
  if (doc && start < doc.lineCount) {
    const endCol = doc.lineAt(start).text.length;
    return new vscode.Range(start, 0, start, Math.max(endCol, 1));
  }
  return new vscode.Range(start, 0, start, Number.MAX_SAFE_INTEGER);
}

/** Подсветка всего span. */
export function blockRange(th: Thread, doc?: vscode.TextDocument): vscode.Range {
  const start = Math.max(0, th.lines[0] - 1);
  const end = Math.max(start, th.lines[1] - 1);
  if (doc && end < doc.lineCount) {
    const endCol = doc.lineAt(end).text.length;
    return new vscode.Range(start, 0, end, endCol);
  }
  return new vscode.Range(start, 0, end, Number.MAX_SAFE_INTEGER);
}
