import type * as d from "../../d";
import type * as m from "../index";

export class Item implements d.Comment {
  id!: string;
  author?: string;
  user?: string;
  text!: string;
  date?: string | number;
  status?: d.thread.Status;
  draft?: boolean;
  deleted?: boolean;

  constructor(raw: d.Comment) {
    Object.assign(this, raw);
  }

  /** Локальный reply из редактора. */
  static local(text: string, author: string): Item {
    return new Item({
      id: `LOCAL:${Date.now()}`,
      author,
      user: "local",
      text,
      date: new Date().toISOString(),
      status: "UNRESOLVED",
      draft: false,
      deleted: false,
    });
  }

  /** Ссылка на сообщение в Crucible. */
  static urlOf(id: string | undefined, review: m.Review): string {
    const n = String(id || "").split(":").pop();
    return `${review.base}/cru/${review.id}#c${n}`;
  }

  url(review: m.Review): string {
    return Item.urlOf(this.id, review);
  }

  toRaw(): d.Comment {
    return { ...(this as d.Comment) };
  }
}
