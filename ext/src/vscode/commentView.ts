import * as vscode from "vscode";
import type { Comment } from "../domain/comment";
import type { Thread } from "../domain/thread";
import type { CrucibleComment } from "./types";

/** Domain comment → VS Code Comment panel. */
export function toView(c: Comment, th: Thread): CrucibleComment {
  const who = c.author || c.user || "?";
  const ln = th.ln;
  const author = ln ? `[Ln ${ln}] ${who}` : who;
  const md = new vscode.MarkdownString();
  if (c.status && c.status !== "UNKNOWN") {
    md.appendMarkdown(`**${c.status}**\n\n`);
  }
  if (ln) {
    md.appendMarkdown(`**Ln ${ln}** · `);
  }
  md.appendText(c.text || "");
  return {
    author: { name: author },
    body: md,
    mode: vscode.CommentMode.Preview,
    contextValue: `canDelete canCopy mid=${c.id || ""}`,
    msgId: String(c.id || ""),
    timestamp: c.date ? new Date(c.date) : undefined,
  };
}

export function toComments(th: Thread): CrucibleComment[] {
  return th.msgs.map((c) => toView(c, th));
}

/** id из VS Code Comment (fallback если msgId потерян). */
export function idOf(
  view: CrucibleComment | undefined,
  ct?: vscode.CommentThread,
  th?: Thread
): string | undefined {
  if (!view) {
    return undefined;
  }
  if (view.msgId) {
    return String(view.msgId);
  }
  const m = /\bmid=(\S+)/.exec(String(view.contextValue || ""));
  if (m) {
    return m[1];
  }
  const idx = (ct?.comments || []).indexOf(view);
  if (idx >= 0) {
    const hit = th?.msgs.at(idx);
    if (hit) {
      return hit.id;
    }
  }
  const name = view.author?.name;
  const clean = stripAuthor(name);
  const body = bodyText(view);
  const hit = th?.msgs.find(
    (c) =>
      (c.author === clean ||
        c.user === clean ||
        c.author === name ||
        c.user === name) &&
      body.includes(c.text || "")
  );
  return hit?.id;
}

function stripAuthor(name: string | undefined): string {
  return String(name || "").replace(/^\[Ln \d+(?:-\d+)?\] /, "");
}

function bodyText(view: CrucibleComment): string {
  const body = view.body;
  if (typeof body === "object" && body && "value" in body) {
    return String(body.value);
  }
  return String(body || "");
}
