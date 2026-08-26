import * as fs from "fs";
import type { Thread } from "./thread";
import type { Span } from "./types";

export class Anchor {
  private static readonly TRIVIAL = new Set([
    "",
    ";",
    "(",
    ")",
    "КонецЕсли",
    "КонецФункции",
    "КонецПроцедуры",
    "Иначе",
  ]);

  constructor(private log: (msg: string) => void = () => {}) {}

  /** Сохранить текст span как якорь (без пустых строк, если есть непустые). */
  static capture(docLines: string[], span: Span): string[] {
    const raw = Anchor.linesAt(docLines, span).map(Anchor.normLine);
    const lines = raw.filter((l) => l.length > 0);
    return lines.length ? lines : raw;
  }

  /** Найти span по якорю; hintSpan — предпочтительная позиция. */
  static find(
    docLines: string[],
    anchor: string[],
    hintSpan: Span | undefined
  ): Span | null {
    if (!anchor?.length) {
      return null;
    }
    const hint = hintSpan?.[0] || 1;
    const n = anchor.length;

    let best: Span | null = null;
    let bestDist = Infinity;
    for (let start = 1; start <= docLines.length - n + 1; start++) {
      const block = Anchor.linesAt(docLines, [start, start + n - 1]).map(
        Anchor.normLine
      );
      if (Anchor.linesEqual(block, anchor)) {
        const dist = Math.abs(start - hint);
        if (dist < bestDist) {
          bestDist = dist;
          best = [start, start + n - 1];
        }
      }
    }
    if (best) {
      return best;
    }

    const needle = anchor.find((l) => !Anchor.isTrivial(l)) || anchor[0];
    if (!needle || anchor.length === 1) {
      return null;
    }
    return Anchor.find(docLines, [needle], hintSpan);
  }

  /** Текст span в docLines, нормализованный. */
  static at(docLines: string[], span: Span): string[] {
    return Anchor.linesAt(docLines, span).map(Anchor.normLine);
  }

  /** Нормализация строк якоря. */
  static normLines(lines: string[]): string[] {
    return lines.map(Anchor.normLine);
  }

  /** Якоря по docLines; true если хоть один span сдвинулся. */
  locate(items: Thread[], fsPath: string): boolean {
    const docLines = Anchor.readLines(fsPath);
    let changed = false;
    const missed: Thread[] = [];

    for (const th of items) {
      const prevA = th.lines[0];
      const prevB = th.lines[1];
      if (th.relocate(docLines)) {
        this.log(`${th.id} anchor ${prevA}-${prevB} → ${th.lines[0]}-${th.lines[1]}`);
        changed = true;
      }
      if (th.anchorMiss) {
        missed.push(th);
      }
    }

    let line = 1;
    for (const th of missed) {
      const { next, changed: moved } = th.placeMiss(line, docLines);
      line = next;
      if (moved) {
        this.log(`${th.id} anchor miss → :${th.lines[0]}-${th.lines[1]}`);
        changed = true;
      }
    }

    return changed;
  }

  private static readLines(fsPath: string): string[] {
    return fs.readFileSync(fsPath, "utf8").split(/\r?\n/);
  }

  private static normLine(s: string | undefined): string {
    return String(s || "").replace(/\s+$/, "");
  }

  private static linesAt(docLines: string[], span: Span | undefined): string[] {
    const a = span?.[0] || 1;
    const b = span?.[1] ?? a;
    const out: string[] = [];
    for (let i = a; i <= b; i++) {
      if (i >= 1 && i <= docLines.length) {
        out.push(docLines[i - 1]);
      }
    }
    return out;
  }

  private static linesEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (Anchor.normLine(a[i]) !== Anchor.normLine(b[i])) {
        return false;
      }
    }
    return true;
  }

  private static isTrivial(line: string): boolean {
    return Anchor.TRIVIAL.has(Anchor.normLine(line).trim());
  }
}
