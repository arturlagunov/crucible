import * as vscode from "vscode";
import { Comment } from "../../domain/comment";
import { Cursor } from "./cursor";
import { idOf } from "../../vscode/commentView";
import { Ui } from "../../vscode/ui";
import { cmd } from "../cmd";
import type { CommentCmds } from "../shape";
import { resolveCmd, unpack } from "../resolve";

export class CommentCmd {
  constructor(private host: CommentCmds) {}

  bind(): vscode.Disposable[] {
    return [
      cmd("cru.reply", (r) =>
        this.reply(r as { thread?: vscode.CommentThread; text?: string })
      ),
      cmd("cru.del", (a, b) => this.del(a, b)),
      cmd("cru.chat", (a, b) => void this.chat(a, b)),
      cmd("cru.link", (a, b) => void this.link(a, b)),
    ];
  }

  private reply(reply: { thread?: vscode.CommentThread; text?: string }): void {
    const got = resolveCmd(this.host, reply.thread);
    if (!got) {
      return;
    }
    const text = (reply.text || "").trim();
    if (!text) {
      return;
    }
    got.data.msgs.push(Comment.local(text, Ui.localAuthor()));
    this.host.ops.thread.setState(got.thread, "UNRESOLVED");
    this.host.ops.store.persist();
  }

  private del(a: unknown, b?: unknown): void {
    const got = resolveCmd(this.host, a, b);
    if (!got) {
      return;
    }
    const id = idOf(got.comment, got.thread, got.data);
    if (!id) {
      Ui.err("коммент не найден");
      return;
    }
    try {
      this.host.ops.comment.delete(got.thread, id);
    } catch (e) {
      Ui.err(e);
      return;
    }
    this.host.notify();
  }

  private async chat(a: unknown, b?: unknown): Promise<void> {
    const got = resolveCmd(this.host, a, b);
    if (!got) {
      return;
    }
    await Cursor.send(this.host, got.data);
  }

  private async link(a: unknown, b?: unknown): Promise<void> {
    let url = typeof a === "string" ? a : undefined;
    if (!url && this.host.data.bundle) {
      const { comment } = unpack(a, b, this.host.ui.panel.threads);
      const id = idOf(comment);
      if (id) {
        url = Comment.urlOf(id, this.host.data.bundle);
      }
    }
    if (!url) {
      Ui.err("нет ссылки");
      return;
    }
    await vscode.env.clipboard.writeText(url);
    Ui.flash("ссылка скопирована", 1500);
  }
}
