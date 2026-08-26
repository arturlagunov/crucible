import * as vscode from "vscode";
import { Comment } from "./comment";
import type { Thread } from "./thread";
import type { CrucibleComment, CommentData } from "./types";

export class CommentList implements Iterable<Comment> {
  constructor(private items: Comment[] = []) {}

  static fromRaw(msgs: CommentData[] | undefined): CommentList {
    return new CommentList((msgs || []).map((m) => new Comment(m)));
  }

  static from(items: Comment[]): CommentList {
    return new CommentList(items);
  }

  static empty(): CommentList {
    return new CommentList();
  }

  /** VS Code command args → thread + comment view. */
  static unpack(
    a: unknown,
    b: unknown,
    live?: vscode.CommentThread[]
  ): { thread?: vscode.CommentThread; comment?: CrucibleComment } {
    const reply = a as { thread?: vscode.CommentThread; comment?: CrucibleComment };
    if (reply?.thread && (reply.comment || Array.isArray(reply.thread?.comments))) {
      return { thread: reply.thread, comment: reply.comment };
    }
    if (CommentList.isThread(a) && (CommentList.isView(b) || b === undefined)) {
      return { thread: a, comment: b as CrucibleComment | undefined };
    }
    if (CommentList.isView(a) && CommentList.isThread(b)) {
      return { thread: b, comment: a };
    }
    if (CommentList.isView(a) && !b && live?.length) {
      const comment = a;
      const thread =
        live.find((t) => (t.comments || []).includes(comment)) ||
        live.find((t) =>
          (t.comments || []).some(
            (c) =>
              (c as CrucibleComment).msgId &&
              (c as CrucibleComment).msgId === comment.msgId
          )
        );
      return { thread, comment };
    }
    return {
      thread: a as vscode.CommentThread | undefined,
      comment: b as CrucibleComment | undefined,
    };
  }

  get length(): number {
    return this.items.length;
  }

  [Symbol.iterator](): Iterator<Comment> {
    return this.items[Symbol.iterator]();
  }

  at(i: number): Comment | undefined {
    return this.items[i];
  }

  first(): Comment | undefined {
    return this.items[0];
  }

  find(fn: (c: Comment) => boolean): Comment | undefined {
    return this.items.find(fn);
  }

  some(fn: (c: Comment) => boolean): boolean {
    return this.items.some(fn);
  }

  map<T>(fn: (c: Comment) => T): T[] {
    return this.items.map(fn);
  }

  push(c: Comment): void {
    this.items.push(c);
  }

  /** Без элемента id. */
  del(id: string): CommentList {
    return new CommentList(
      this.items.filter((c) => String(c.id) !== String(id))
    );
  }

  setStatus(status: string): void {
    for (const c of this.items) {
      c.status = status;
    }
  }

  toView(th: Thread): CrucibleComment[] {
    return this.items.map((c) => c.toView(th));
  }

  toRaw(): CommentData[] {
    return this.items.map((c) => c.toRaw());
  }

  toArray(): Comment[] {
    return this.items;
  }

  private static isThread(x: unknown): x is vscode.CommentThread {
    if (!x || typeof x !== "object") {
      return false;
    }
    const o = x as vscode.CommentThread;
    return (Array.isArray(o.comments) || !!o.uri) && o.range !== undefined;
  }

  private static isView(x: unknown): x is CrucibleComment {
    if (!x || typeof x !== "object") {
      return false;
    }
    const o = x as CrucibleComment;
    return (o.body !== undefined || o.author !== undefined) && !CommentList.isThread(x);
  }
}
