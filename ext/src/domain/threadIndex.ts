import { norm } from "../infra/norm";
import { ThreadList } from "./threadList";
import type { Thread } from "./thread";

/** Индекс threads по ws (нормализованный относительный путь). */
export class ThreadIndex {
  private byFile = new Map<string, Thread[]>();

  rebuild(threads: Iterable<Thread>): void {
    this.byFile = new Map();
    for (const th of threads) {
      const key = norm(th.ws);
      if (!this.byFile.has(key)) {
        this.byFile.set(key, []);
      }
      this.byFile.get(key)!.push(th);
    }
  }

  forKey(key: string): ThreadList {
    const hit = this.byFile.get(norm(key));
    return hit?.length ? ThreadList.from(hit) : ThreadList.empty();
  }

  atLine(key: string, line0: number): Thread | undefined {
    return this.forKey(key).open.atLine(line0);
  }

  /** Файл с max UNRESOLVED тредов. */
  busiest(): { key: string; first: Thread } | undefined {
    let bestKey: string | undefined;
    let bestList: Thread[] | undefined;
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
