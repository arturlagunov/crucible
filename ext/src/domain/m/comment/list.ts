import type * as d from "../../d";
import { Items } from "../items";
import { Item } from "./item";

export class List extends Items<Item, List> {
  protected wrap(items: Item[]): List {
    return new List(items);
  }

  static fromRaw(msgs: d.Comment[] | undefined): List {
    return new List((msgs || []).map((c) => new Item(c)));
  }

  push(c: Item): void {
    this.items.push(c);
  }

  /** Без элемента id. */
  del(id: string): List {
    return this.filter((c) => String(c.id) !== String(id));
  }

  setStatus(status: d.thread.Status): void {
    for (const c of this.items) {
      c.status = status;
    }
  }

  toRaw(): d.Comment[] {
    return this.items.map((c) => c.toRaw());
  }
}
