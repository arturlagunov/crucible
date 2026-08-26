import type { ThreadBundle } from "./bundle";
import type { CommentData, ThreadStatus } from "./types";

export class Comment implements CommentData {
  id!: string;
  author?: string;
  user?: string;
  text!: string;
  date?: string | number;
  status?: ThreadStatus;
  draft?: boolean;
  deleted?: boolean;

  constructor(raw: CommentData) {
    Object.assign(this, raw);
  }

  /** Локальный reply из редактора. */
  static local(text: string, author: string): Comment {
    return new Comment({
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
  static urlOf(id: string | undefined, bundle: ThreadBundle): string {
    const n = String(id || "").split(":").pop();
    return `${bundle.base}/cru/${bundle.review.id}#c${n}`;
  }

  url(bundle: ThreadBundle): string {
    return Comment.urlOf(this.id, bundle);
  }

  toRaw(): CommentData {
    return { ...(this as CommentData) };
  }
}
