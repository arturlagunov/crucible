import type * as d from "../../d";
import type * as m from "../index";
import * as comment from "../comment";
import { Anchor } from "../anchor";

export class Item {
  id!: string;
  ws!: string;
  item?: string;
  path?: string;
  repo?: string;
  private span!: d.thread.Span;
  private stored?: d.thread.Status;
  readonly reviewId: string;
  msgs!: m.comment.List;
  anchor?: d.thread.Anchor;
  miss?: boolean;

  constructor(raw: d.thread.Item, reviewId: string) {
    const { span, msgs, miss, status, ...rest } = raw;
    Object.assign(this, rest);
    this.reviewId = reviewId;
    this.span = [...span] as d.thread.Span;
    this.msgs = comment.List.fromRaw(msgs);
    this.miss = miss;
    this.stored = status;
  }

  /** normalized [start, end], copy */
  get lines(): d.thread.Span {
    const a = this.span[0] || 1;
    const b = this.span[1] ?? a;
    return [a, b];
  }

  get unresolved(): boolean {
    if (this.msgs.some((c) => c.status === "UNRESOLVED")) {
      return true;
    }
    if (this.stored === "RESOLVED") {
      return false;
    }
    if (this.stored === "UNRESOLVED") {
      return true;
    }
    return false;
  }

  get status(): d.thread.Status {
    return this.unresolved ? "UNRESOLVED" : "RESOLVED";
  }

  set status(v: d.thread.Status) {
    this.stored = v;
    this.msgs.setStatus(v);
  }

  get ln(): string {
    return Item.formatLn(this.lines) || String(this.lines[0]);
  }

  get label(): string {
    const warn = this.miss ? " ⚠" : "";
    const done = this.unresolved ? "" : " ✓";
    return `${this.reviewId} · ${this.id} · :${this.ln}${done}${warn}`;
  }

  relocate(docLines: string[]): boolean {
    const [prevA, prevB] = this.lines;

    if (!this.anchor?.lines?.length) {
      this.anchor = { lines: Anchor.capture(docLines, this.span) };
    }

    delete this.miss;

    const at = Anchor.capture(docLines, this.span);
    const needle = Anchor.normLines(this.anchor.lines);
    if (Anchor.same(at, needle)) {
      return false;
    }

    const found = Anchor.find(docLines, needle, this.span);
    if (found) {
      this.span = found;
      return found[0] !== prevA || found[1] !== prevB;
    }

    this.miss = true;
    return false;
  }

  /** Сдвиг span по одной правке. */
  shift(edit: d.thread.Edit, lineCount: number): boolean {
    const [prevA, prevB] = this.lines;
    const next = Item.clamp(
      [Item.shiftLn(prevA - 1, edit) + 1, Item.shiftLn(prevB - 1, edit) + 1],
      lineCount
    );
    if (next[0] === prevA && next[1] === prevB) {
      return false;
    }
    this.span = next;
    return true;
  }

  overlaps(edit: d.thread.Edit): boolean {
    const [a, b] = this.lines;
    const start = edit.start + 1;
    const end = edit.end + 1;
    return !(end < a || start > b);
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

  toRaw(): d.thread.Item {
    return {
      id: this.id,
      ws: this.ws,
      span: [...this.span] as d.thread.Span,
      msgs: this.msgs.toRaw(),
      anchor: this.anchor,
      miss: this.miss,
      status: this.status,
      item: this.item,
      path: this.path,
      repo: this.repo,
    };
  }

  /** Markdown для preview-документа. */
  toMarkdown(review?: m.Review): string {
    const lines = [`# ${this.id} · :${this.lines[0]}`, ""];
    for (const c of this.msgs) {
      lines.push(`## ${c.author || c.user || "?"} · ${c.status || ""}`, "");
      lines.push(c.text || "", "", "---", "");
    }
    const root = this.msgs.first();
    if (review && root) {
      lines.push("", `[Открыть в Crucible](${root.url(review)})`);
    }
    return lines.join("\n");
  }

  private static shiftLn(line: number, edit: d.thread.Edit): number {
    const delta = edit.ins - (edit.end - edit.start);
    if (line < edit.start) {
      return line;
    }
    if (line > edit.end) {
      return line + delta;
    }
    if (edit.start === edit.end && (edit.at ?? 0) > 0) {
      return line;
    }
    if (edit.start === edit.end) {
      return line + delta;
    }
    return edit.start;
  }

  private static clamp(span: d.thread.Span, lineCount: number): d.thread.Span {
    const max = Math.max(1, lineCount);
    const a = Math.max(1, Math.min(span[0], max));
    const b = Math.max(a, Math.min(span[1] ?? a, max));
    return [a, b];
  }

  private static formatLn(lines: d.thread.Span): string {
    const [a, b] = lines;
    if (!a) {
      return "";
    }
    return a === b ? `${a}` : `${a}-${b}`;
  }
}
