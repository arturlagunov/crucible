import * as vc from "vscode";
import type * as m from "../../domain/m";

/** Наш comment в панели VS Code. */
export class Comment implements vc.Comment {
  author: vc.CommentAuthorInformation;
  body: string | vc.MarkdownString;
  mode: vc.CommentMode;
  contextValue?: string;
  msgId?: string;
  timestamp?: Date;

  constructor(raw: {
    author: vc.CommentAuthorInformation;
    body: vc.MarkdownString;
    mode: vc.CommentMode;
    contextValue: string;
    msgId: string;
    timestamp?: Date;
  }) {
    this.author = raw.author;
    this.body = raw.body;
    this.mode = raw.mode;
    this.contextValue = raw.contextValue;
    this.msgId = raw.msgId;
    this.timestamp = raw.timestamp;
  }

  static from(c: m.comment.Item, th: m.thread.Item): Comment {
    const who = c.author || c.user || "?";
    const ln = th.ln;
    const author = ln ? `[Ln ${ln}] ${who}` : who;
    const md = new vc.MarkdownString();
    if (c.status === "UNRESOLVED") {
      md.appendMarkdown(`**UNRESOLVED**\n\n`);
    }
    if (ln) {
      md.appendMarkdown(`**Ln ${ln}** · `);
    }
    md.appendText(c.text || "");
    return new Comment({
      author: { name: author },
      body: md,
      mode: vc.CommentMode.Preview,
      contextValue: `canDelete canCopy mid=${c.id || ""}`,
      msgId: String(c.id || ""),
      timestamp: c.date ? new Date(c.date) : undefined,
    });
  }

  static list(th: m.thread.Item): Comment[] {
    return th.msgs.map((c) => Comment.from(c, th));
  }

  /** id из виджета (fallback если msgId потерян). */
  static idOf(
    view: Comment | undefined,
    ct?: vc.CommentThread,
    th?: m.thread.Item
  ): string | undefined {
    if (!view) {
      return undefined;
    }
    if (view.msgId) {
      return String(view.msgId);
    }
    const mid = /\bmid=(\S+)/.exec(String(view.contextValue || ""));
    if (mid) {
      return mid[1];
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

  private static stripAuthor(name: string | undefined): string {
    return String(name || "").replace(/^\[Ln \d+(?:-\d+)?\] /, "");
  }

  private static bodyText(view: Comment): string {
    const body = view.body;
    if (typeof body === "object" && body && "value" in body) {
      return String(body.value);
    }
    return String(body || "");
  }
}
