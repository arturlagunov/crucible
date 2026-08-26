import * as vscode from "vscode";
import type { Thread } from "../domain/thread";
import { Ui } from "../vscode/ui";
import type { ViewComment } from "../vscode/types";
import type { ResolveHost } from "./shape";

export interface Resolved {
  thread: vscode.CommentThread;
  comment?: ViewComment;
  data: Thread;
}

/** VS Code command args → thread + comment view. */
export function unpack(
  a: unknown,
  b: unknown,
  live?: vscode.CommentThread[]
): { thread?: vscode.CommentThread; comment?: ViewComment } {
  const reply = a as { thread?: vscode.CommentThread; comment?: ViewComment };
  if (reply?.thread && (reply.comment || Array.isArray(reply.thread?.comments))) {
    return { thread: reply.thread, comment: reply.comment };
  }
  if (isThread(a) && (isView(b) || b === undefined)) {
    return { thread: a, comment: b as ViewComment | undefined };
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
            (c as ViewComment).msgId &&
            (c as ViewComment).msgId === comment.msgId
        )
      );
    return { thread, comment };
  }
  return {
    thread: a as vscode.CommentThread | undefined,
    comment: b as ViewComment | undefined,
  };
}

/** VS Code command args → thread + comment + domain Thread. */
export function resolveCmd(
  host: ResolveHost,
  a: unknown,
  b?: unknown
): Resolved | undefined {
  if (!host.data.bundle) {
    return undefined;
  }
  const { thread, comment } = unpack(a, b, host.ui.panel.threads);
  const data = thread ? host.ui.panel.dataOf(thread) : undefined;
  if (!thread || !data) {
    Ui.err("тред не найден");
    return undefined;
  }
  return { thread, comment, data };
}

function isThread(x: unknown): x is vscode.CommentThread {
  if (!x || typeof x !== "object") {
    return false;
  }
  const o = x as vscode.CommentThread;
  return (Array.isArray(o.comments) || !!o.uri) && o.range !== undefined;
}

function isView(x: unknown): x is ViewComment {
  if (!x || typeof x !== "object") {
    return false;
  }
  const o = x as ViewComment;
  return (o.body !== undefined || o.author !== undefined) && !isThread(x);
}
