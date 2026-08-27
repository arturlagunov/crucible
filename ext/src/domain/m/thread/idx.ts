import { norm } from "../../norm";
import { Item } from "./item";
import { List } from "./list";

/** Индекс threads по ws (нормализованный относительный путь). */
export class Idx {
  private byFile = new Map<string, Item[]>();

  rebuild(threads: Iterable<Item>): void {
    this.byFile = new Map();
    for (const th of threads) {
      const key = norm(th.ws);
      if (!this.byFile.has(key)) {
        this.byFile.set(key, []);
      }
      this.byFile.get(key)!.push(th);
    }
  }

  forKey(key: string): List {
    const hit = this.byFile.get(norm(key));
    return hit?.length ? List.from(hit) : List.empty();
  }

  atLine(key: string, line0: number): Item | undefined {
    return this.forKey(key).atLine(line0);
  }

  /** Файл с max UNRESOLVED тредов. */
  busiest(): { key: string; first: Item } | undefined {
    let bestKey: string | undefined;
    let bestList: Item[] | undefined;
    let bestN = 0;
    for (const [key, list] of this.byFile) {
      const open = list.filter((t) => t.unresolved);
      if (open.length > bestN) {
        bestN = open.length;
        bestKey = key;
        bestList = open;
      }
    }
    if (!bestKey || !bestList?.length) {
      return undefined;
    }
    return { key: bestKey, first: bestList[0] };
  }
}
