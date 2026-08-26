import { Items } from "./items";
import { Comment } from "./comment";
import type { CommentData, ThreadStatus } from "./types";

export class CommentList extends Items<Comment, CommentList> {
  protected wrap(items: Comment[]): CommentList {
    return new CommentList(items);
  }

  static fromRaw(msgs: CommentData[] | undefined): CommentList {
    return new CommentList((msgs || []).map((m) => new Comment(m)));
  }

  push(c: Comment): void {
    this.items.push(c);
  }

  /** Без элемента id. */
  del(id: string): CommentList {
    return this.filter((c) => String(c.id) !== String(id));
  }

  setStatus(status: ThreadStatus): void {
    for (const c of this.items) {
      c.status = status;
    }
  }

  toRaw(): CommentData[] {
    return this.items.map((c) => c.toRaw());
  }
}
