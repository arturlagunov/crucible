import * as vscode from "vscode";
import type { ThreadBundle } from "./bundle";
import type { Thread } from "./thread";
import type { CrucibleComment, CommentData, ThreadStatus } from "./types";

export class Comment implements CommentData {
  id!: string;
  author?: string;
  user?: string;
  text!: string;
  date?: string | number;
  status?: ThreadStatus | string;
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

  /** id из VS Code Comment (fallback если msgId потерян). */
  static idOf(
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
    const clean = Comment.stripAuthor(name);
    const body = Comment.bodyText(view);
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

  /** Ссылка на сообщение в Crucible. */
  static urlOf(id: string | undefined, bundle: ThreadBundle): string {
    const n = String(id || "").split(":").pop();
    return `${bundle.base}/cru/${bundle.review.id}#c${n}`;
  }

  url(bundle: ThreadBundle): string {
    return Comment.urlOf(this.id, bundle);
  }

  /** VS Code Comment panel. */
  toView(th: Thread): CrucibleComment {
    const who = this.author || this.user || "?";
    const ln = th.ln;
    const author = ln ? `[Ln ${ln}] ${who}` : who;
    const head =
      this.status && this.status !== "UNKNOWN" ? `**${this.status}**\n\n` : "";
    const loc = ln ? `**Ln ${ln}** · ` : "";
    const md = new vscode.MarkdownString(`${head}${loc}${this.text || ""}`);
    md.isTrusted = true;
    return {
      author: { name: author },
      body: md,
      mode: vscode.CommentMode.Preview,
      contextValue: `canDelete canCopy mid=${this.id || ""}`,
      msgId: String(this.id || ""),
      timestamp: this.date ? new Date(this.date) : undefined,
    };
  }

  toRaw(): CommentData {
    return { ...(this as CommentData) };
  }

  private static stripAuthor(name: string | undefined): string {
    return String(name || "").replace(/^\[Ln \d+(?:-\d+)?\] /, "");
  }

  private static bodyText(view: CrucibleComment): string {
    const body = view.body;
    if (typeof body === "object" && body && "value" in body) {
      return String(body.value);
    }
    return String(body || "");
  }
}
