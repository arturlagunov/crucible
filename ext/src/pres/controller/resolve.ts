import * as vc from "vscode";
import type * as m from "../../domain/m";
import * as v from "../v";

export interface Resolved {
  thread: vc.CommentThread;
  comment?: v.Comment;
  data: m.thread.Item;
}

/** VS Code command args → thread + comment view. */
export function unpack(
  a: unknown,
  b: unknown,
  live?: vc.CommentThread[]
): { thread?: vc.CommentThread; comment?: v.Comment } {
  const reply = a as { thread?: vc.CommentThread; comment?: v.Comment };
  if (reply?.thread && (reply.comment || Array.isArray(reply.thread?.comments))) {
    return { thread: reply.thread, comment: reply.comment };
  }
  if (isThread(a) && (isView(b) || b === undefined)) {
    return { thread: a, comment: b as v.Comment | undefined };
  }
  if (isView(a) && isThread(b)) {
    return { thread: b, comment: a };
  }
  if (isView(a) && !b && live?.length) {
    const comment = a;
    const thread =
      live.find((t) => (t.comments || []).includes(comment)) ||
      live.find((t) =>
        (t.comments || []).some(
          (c) =>
            (c as v.Comment).msgId &&
            (c as v.Comment).msgId === comment.msgId
        )
      );
    return { thread, comment };
  }
  return {
    thread: a as vc.CommentThread | undefined,
    comment: b as v.Comment | undefined,
  };
}

/** VS Code command args → thread + comment + domain Thread. */
export function resolveCmd(
  panel: v.Panel,
  review: m.Review | undefined,
  a: unknown,
  b?: unknown
): Resolved | undefined {
  if (!review) {
    return undefined;
  }
  const { thread, comment } = unpack(a, b, panel.threads);
  const data = thread ? panel.dataOf(thread) : undefined;
  if (!thread || !data) {
    v.Ui.err("тред не найден");
    return undefined;
  }
  return { thread, comment, data };
}

function isThread(x: unknown): x is vc.CommentThread {
  if (!x || typeof x !== "object") {
    return false;
  }
  const o = x as vc.CommentThread;
  return (Array.isArray(o.comments) || !!o.uri) && o.range !== undefined;
}

function isView(x: unknown): x is v.Comment {
  if (!x || typeof x !== "object") {
    return false;
  }
  const o = x as v.Comment;
  return (o.body !== undefined || o.author !== undefined) && !isThread(x);
}
