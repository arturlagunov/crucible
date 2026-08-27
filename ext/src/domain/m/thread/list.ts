import { norm } from "../../norm";
import type * as d from "../../d";
import { Items } from "../items";
import { Item } from "./item";

export class List extends Items<Item, List> {
  protected wrap(items: Item[]): List {
    return new List(items);
  }

  /** Только UNRESOLVED. */
  get open(): List {
    return this.filter((t) => t.unresolved);
  }

  /** Только RESOLVED. */
  get resolved(): List {
    return this.filter((t) => !t.unresolved);
  }

  shown(show: d.Show): List {
    if (show === "all") {
      return this;
    }
    return show === "resolved" ? this.resolved : this.open;
  }

  /** ws → треды. */
  static byWs(items: Iterable<Item>): Map<string, Item[]> {
    const byFile = new Map<string, Item[]>();
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
  shift(edit: d.thread.Edit, lineCount: number): boolean {
    let changed = false;
    for (const th of this.items) {
      if (th.shift(edit, lineCount)) {
        changed = true;
      }
    }
    return changed;
  }

  hit(edit: d.thread.Edit): boolean {
    return this.some((th) => th.overlaps(edit));
  }

  sorted(): List {
    return this.wrap([...this.items].sort(List.byLine));
  }

  /** На строке line0 (0-based): span, иначе ближайший start в ±5. */
  atLine(line0: number): Item | undefined {
    const line1 = line0 + 1;
    for (const th of this.items) {
      const a = th.lines[0];
      const b = th.lines[1];
      if (line1 >= a && line1 <= b) {
        return th;
      }
    }
    let best: Item | undefined;
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

  private static byLine(a: Item, b: Item): number {
    return a.lines[0] - b.lines[0] || a.lines[1] - b.lines[1];
  }
}
