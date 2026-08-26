import { norm } from "../infra/norm";
import { Items } from "./items";
import { Thread } from "./thread";
import type { LineEdit, Show } from "./types";

export class ThreadList extends Items<Thread, ThreadList> {
  protected wrap(items: Thread[]): ThreadList {
    return new ThreadList(items);
  }

  /** Только UNRESOLVED. */
  get open(): ThreadList {
    return this.filter((t) => t.unresolved);
  }

  /** Только RESOLVED. */
  get resolved(): ThreadList {
    return this.filter((t) => !t.unresolved);
  }

  shown(show: Show): ThreadList {
    if (show === "all") {
      return this;
    }
    return show === "resolved" ? this.resolved : this.open;
  }

  /** ws → треды. */
  static byWs(items: Iterable<Thread>): Map<string, Thread[]> {
    const byFile = new Map<string, Thread[]>();
    for (const th of items) {
      const key = norm(th.ws);
      if (!key) {
        continue;
      }
      if (!byFile.has(key)) {
        byFile.set(key, []);
      }
      byFile.get(key)!.push(th);
    }
    return byFile;
  }

  /** Сдвиг всех span. */
  shift(edit: LineEdit, lineCount: number): boolean {
    let changed = false;
    for (const th of this.items) {
      if (th.shift(edit, lineCount)) {
        changed = true;
      }
    }
    return changed;
  }

  hit(edit: LineEdit): boolean {
    return this.some((th) => th.overlaps(edit));
  }

  sorted(): ThreadList {
    return this.wrap([...this.items].sort(ThreadList.byLine));
  }

  /** На строке line0 (0-based): span, иначе ближайший start в ±5. */
  atLine(line0: number): Thread | undefined {
    const line1 = line0 + 1;
    for (const th of this.items) {
      const a = th.lines[0];
      const b = th.lines[1];
      if (line1 >= a && line1 <= b) {
        return th;
      }
    }
    let best: Thread | undefined;
    let bestDist = 5;
    for (const th of this.items) {
      const dist = Math.abs(line1 - th.lines[0]);
      if (dist < bestDist) {
        bestDist = dist;
        best = th;
      }
    }
    return best;
  }

  private static byLine(a: Thread, b: Thread): number {
    return a.lines[0] - b.lines[0] || a.lines[1] - b.lines[1];
  }
}
