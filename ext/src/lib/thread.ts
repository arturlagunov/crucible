import * as vscode from "vscode";
import { Anchor } from "./anchor";
import { CommentList } from "./commentList";
import type { ThreadBundle } from "./bundle";
import type { SessionView } from "./sessionView";
import { Paths } from "./paths";
import { Ui } from "./ui";
import type { Span, ThreadAnchor, ThreadData, ThreadStatus } from "./types";

export class Thread {
  id!: string;
  ws!: string;
  private span!: Span;
  readonly reviewId: string;
  status!: ThreadStatus | string;
  msgs!: CommentList;
  anchor?: ThreadAnchor;
  anchorMiss?: boolean;

  constructor(raw: ThreadData, reviewId: string) {
    Object.assign(this, raw);
    this.reviewId = reviewId;
    this.span = [...raw.span] as Span;
    this.msgs = CommentList.fromRaw(raw.msgs);
  }

  /** normalized [start, end], copy */
  get lines(): Span {
    const a = this.span[0] || 1;
    const b = this.span[1] ?? a;
    return [a, b];
  }

  get unresolved(): boolean {
    return this.msgs.some((c) => c.status === "UNRESOLVED");
  }

  get ln(): string {
    return Thread.formatLn(this.lines) || String(this.lines[0]);
  }

  get label(): string {
    const warn = this.anchorMiss ? " ⚠" : "";
    return `${this.reviewId} · ${this.id} · :${this.ln}${warn}`;
  }

  range(doc?: vscode.TextDocument): vscode.Range {
    const start = Math.max(0, this.lines[0] - 1);
    const end = Math.max(start, this.lines[1] - 1);
    if (doc && end < doc.lineCount) {
      const endCol = doc.lineAt(end).text.length;
      return new vscode.Range(start, 0, end, endCol);
    }
    return new vscode.Range(start, 0, end, Number.MAX_SAFE_INTEGER);
  }

  relocate(docLines: string[]): boolean {
    const [prevA, prevB] = this.lines;

    if (!this.anchor?.lines?.length) {
      this.anchor = { lines: Anchor.capture(docLines, this.span) };
    }

    delete this.anchorMiss;

    const at = Anchor.at(docLines, this.span);
    const anchor = Anchor.normLines(this.anchor.lines);
    if (at.every((l, i) => l === anchor[i]) && at.length === anchor.length) {
      return false;
    }

    const found = Anchor.find(docLines, anchor, this.span);
    if (found) {
      this.span = found;
      return found[0] !== prevA || found[1] !== prevB;
    }

    this.anchorMiss = true;
    return false;
  }

  placeMiss(line: number, docLines: string[]): { next: number; changed: boolean } {
    const n = Math.max(1, this.anchor?.lines?.length || 1);
    const end = Math.min(line + n - 1, docLines.length);
    const [prevA, prevB] = this.lines;
    const changed = line !== prevA || end !== prevB;
    if (changed) {
      this.span = [line, end];
    }
    return { next: end + 1, changed };
  }

  applyEdit(
    change: vscode.TextDocumentContentChangeEvent,
    lineCount: number
  ): { prev: Span; next: Span } | undefined {
    const prev = this.lines;
    const next = this.clamp(this.shift(change), lineCount);
    if (next[0] === prev[0] && next[1] === prev[1]) {
      return undefined;
    }
    this.span = next;
    return { prev, next };
  }

  overlaps(change: vscode.TextDocumentContentChangeEvent): boolean {
    const editStart = change.range.start.line + 1;
    const editEnd = change.range.end.line + 1;
    const [a, b] = this.lines;
    return !(editEnd < a || editStart > b);
  }

  toRaw(): ThreadData {
    return {
      id: this.id,
      ws: this.ws,
      span: [...this.span] as Span,
      status: this.status,
      msgs: this.msgs.toRaw(),
      anchor: this.anchor,
      anchorMiss: this.anchorMiss,
    };
  }

  /** Markdown для preview-документа. */
  toMarkdown(bundle?: ThreadBundle): string {
    const lines = [`# ${this.id} · :${this.lines[0]}`, ""];
    for (const c of this.msgs) {
      lines.push(`## ${c.author || c.user || "?"} · ${c.status || ""}`, "");
      lines.push(c.text || "", "", "---", "");
    }
    const root = this.msgs.first();
    if (bundle && root) {
      lines.push("", `[Открыть в Crucible](${root.url(bundle)})`);
    }
    return lines.join("\n");
  }

  /** Preview + focus comments panel. */
  static async open(view: SessionView, data: Thread, uri: vscode.Uri): Promise<void> {
    const ct = view.panel.threads.find((t) => view.panel.threadId(t) === data.id);
    const doc = Paths.docForPath(uri.fsPath);
    if (ct && doc) {
      view.panel.sync(ct, data);
      ct.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
      for (const cmdId of [
        "workbench.action.focusCommentsView",
        "workbench.panel.comments.focus",
      ]) {
        try {
          await vscode.commands.executeCommand(cmdId);
          break;
        } catch {
          /* */
        }
      }
    }
    const md = await vscode.workspace.openTextDocument({
      content: data.toMarkdown(view.bundle),
      language: "markdown",
    });
    await vscode.window.showTextDocument(md, {
      preview: true,
      preserveFocus: false,
    });
    Ui.flash(`тред ${data.id}`, 1500);
  }

  private shift(change: vscode.TextDocumentContentChangeEvent): Span {
    const [a, b] = this.lines;
    return [
      this.shiftLine(a - 1, change) + 1,
      this.shiftLine(b - 1, change) + 1,
    ];
  }

  private shiftLine(line: number, change: vscode.TextDocumentContentChangeEvent): number {
    const start = change.range.start.line;
    const end = change.range.end.line;
    const delta = change.text.split("\n").length - 1 - (end - start);
    if (line < start) {
      return line;
    }
    if (line > end) {
      return line + delta;
    }
    return line + delta;
  }

  private clamp(span: Span, lineCount: number): Span {
    const maxLine = Math.max(1, lineCount);
    const a = Math.max(1, Math.min(span[0], maxLine));
    const b = Math.max(a, Math.min(span[1] ?? a, maxLine));
    return [a, b];
  }

  private static formatLn(lines: Span): string {
    const [a, b] = lines;
    if (!a) {
      return "";
    }
    return a === b ? `${a}` : `${a}-${b}`;
  }
}
