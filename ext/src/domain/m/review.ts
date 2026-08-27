import type * as d from "../d";
import type * as m from "./index";
import * as thread from "./thread";

export class Review {
  id: string;
  name?: string;
  base: string;
  threads: m.thread.List;
  count?: number;
  private idx = new thread.Idx();

  constructor(id: string, base: string, threads: m.thread.List, name?: string) {
    this.id = id;
    this.name = name;
    this.base = base;
    this.threads = threads;
    this.count = threads.length;
    this.idx.rebuild(threads);
  }

  forKey(key: string): m.thread.List {
    return this.idx.forKey(key);
  }

  atLine(key: string, line0: number): m.thread.Item | undefined {
    return this.idx.atLine(key, line0);
  }

  busiest(): { key: string; first: m.thread.Item } | undefined {
    return this.idx.busiest();
  }

  static fromRaw(raw: unknown): Review {
    const data = raw as d.Review;
    if (!data?.review?.id || !Array.isArray(data.threads)) {
      throw new Error("это не *-threads.json");
    }
    const threads = thread.List.from(
      data.threads.map((t) => new thread.Item(t, data.review.id))
    );
    return new Review(data.review.id, data.base, threads, data.review.name);
  }

  toRaw(): d.Review {
    this.count = this.threads.length;
    return {
      review: { id: this.id, name: this.name },
      base: this.base,
      threads: this.threads.map((t) => t.toRaw()),
      count: this.count,
    };
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
}
