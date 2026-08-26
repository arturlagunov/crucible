import * as fs from "fs";
import { Thread } from "./thread";
import { ThreadIndex } from "./threadIndex";
import { ThreadList } from "./threadList";
import type { Bundle } from "./types";

export class ThreadBundle {
  review: Bundle["review"];
  base: string;
  threads: ThreadList;
  count?: number;
  private idx = new ThreadIndex();

  constructor(review: Bundle["review"], base: string, threads: ThreadList) {
    this.review = review;
    this.base = base;
    this.threads = threads;
    this.count = threads.length;
    this.idx.rebuild(threads);
  }

  forKey(key: string): ThreadList {
    return this.idx.forKey(key);
  }

  atLine(key: string, line0: number): Thread | undefined {
    return this.idx.atLine(key, line0);
  }

  busiest(): { key: string; first: Thread } | undefined {
    return this.idx.busiest();
  }

  static read(fsPath: string): { bundle: ThreadBundle; total: number } {
    const raw = ThreadBundle.loadRaw(fsPath);
    const total = raw.threads.length;
    const threads = ThreadList.from(
      raw.threads.map((t) => new Thread(t, raw.review.id))
    );
    return {
      bundle: new ThreadBundle(raw.review, raw.base, threads),
      total,
    };
  }

  save(fsPath: string): void {
    this.count = this.threads.length;
    const raw: Bundle = {
      review: this.review,
      base: this.base,
      threads: this.threads.map((t) => t.toRaw()),
      count: this.count,
    };
    fs.writeFileSync(fsPath, JSON.stringify(raw, null, 2) + "\n", "utf8");
  }

  del(id: string): boolean {
    const next = this.threads.filter((t) => t.id !== id);
    if (next.length === this.threads.length) {
      return false;
    }
    this.threads = next;
    this.count = next.length;
    this.idx.rebuild(this.threads);
    return true;
  }

  private static loadRaw(fsPath: string): Bundle {
    const raw = JSON.parse(fs.readFileSync(fsPath, "utf8")) as Bundle;
    if (!raw?.review?.id || !Array.isArray(raw.threads)) {
      throw new Error("это не *-threads.json");
    }
    return raw;
  }
}
