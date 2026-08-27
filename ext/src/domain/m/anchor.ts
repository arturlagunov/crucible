import type * as d from "../d";
import type * as m from "./index";

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
  static capture(docLines: string[], span: d.thread.Span): string[] {
    const raw = Anchor.linesAt(docLines, span).map(Anchor.normLine);
    const lines = raw.filter((l) => l.length > 0);
    return lines.length ? lines : raw;
  }

  /** Найти span по якорю; hintSpan — предпочтительная позиция. */
  static find(
    docLines: string[],
    anchor: string[],
    hintSpan: d.thread.Span | undefined
  ): d.thread.Span | null {
    if (!anchor?.length) {
      return null;
    }
    const hint = hintSpan?.[0] || 1;
    const n = anchor.length;

    let best: d.thread.Span | null = null;
    let bestDist = Infinity;
    for (let start = 1; start <= docLines.length - n + 1; start++) {
      const block = Anchor.linesAt(docLines, [start, start + n - 1]).map(Anchor.normLine);
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
  static at(docLines: string[], span: d.thread.Span): string[] {
    return Anchor.linesAt(docLines, span).map(Anchor.normLine);
  }

  /** Нормализация строк якоря. */
  static normLines(lines: string[]): string[] {
    return lines.map(Anchor.normLine);
  }

  /** Якоря по docLines; miss=false — не паковать orphans на L1. */
  locateLines(
    items: m.thread.Item[],
    docLines: string[],
    opts: { miss?: boolean } = {}
  ): boolean {
    let changed = false;
    const missed: m.thread.Item[] = [];

    for (const th of items) {
      const prevA = th.lines[0];
      const prevB = th.lines[1];
      if (th.relocate(docLines)) {
        this.log(`${th.id} anchor ${prevA}-${prevB} → ${th.lines[0]}-${th.lines[1]}`);
        changed = true;
      }
      if (th.miss) {
        missed.push(th);
      }
    }

    if (opts.miss === false) {
      return changed;
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

  private static normLine(s: string | undefined): string {
    return String(s || "").replace(/\s+$/, "");
  }

  private static linesAt(
    docLines: string[],
    span: d.thread.Span | undefined
  ): string[] {
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

  static same(a: string[], b: string[]): boolean {
    return Anchor.linesEqual(a, b);
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
