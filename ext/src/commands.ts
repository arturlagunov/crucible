import * as path from "path";
import * as vscode from "vscode";
import { Comment } from "./lib/comment";
import { CommentList } from "./lib/commentList";
import { ChatBridge } from "./lib/chatBridge";
import { Paths } from "./lib/paths";
import { Ui } from "./lib/ui";
import type { Session } from "./session";
import { Thread } from "./lib/thread";

export class Commands {
  constructor(
    private session: Session,
    private refresh: () => void,
    private updateStatus: () => void
  ) {}

  onReply(reply: { thread?: vscode.CommentThread; text?: string }): void {
    const got = this.session.resolve(reply.thread);
    if (!got) {
      return;
    }
    const text = (reply.text || "").trim();
    if (!text) {
      return;
    }
    got.data.msgs.push(Comment.local(text, Ui.localAuthor()));
    this.session.setState(got.thread, "UNRESOLVED");
    this.session.persist();
  }

  setResolved(a: unknown, resolved: boolean): void {
    const got = this.session.resolve(a);
    if (!got) {
      return;
    }
    this.session.setState(got.thread, resolved ? "RESOLVED" : "UNRESOLVED");
    if (this.session.persist()) {
      Ui.flash(
        `${resolved ? "resolved" : "unresolved"} → ${path.basename(this.session.jsonPath || "")}`
      );
    }
  }

  delComment(a: unknown, b?: unknown): void {
    const got = this.session.resolve(a, b);
    if (!got) {
      return;
    }
    const id = Comment.idOf(got.comment, got.thread, got.data);
    if (!id) {
      Ui.err("коммент не найден");
      return;
    }
    try {
      this.session.deleteMsg(got.thread, id);
    } catch (e) {
      Ui.err(e);
      return;
    }
    this.refresh();
    this.updateStatus();
  }

  delThread(a: unknown, b?: unknown): void {
    const got = this.session.resolve(a, b);
    if (!got) {
      return;
    }
    try {
      this.session.deleteThread(got.thread);
    } catch (e) {
      Ui.err(e);
      return;
    }
    this.refresh();
    this.updateStatus();
  }

  async addChat(a: unknown, b?: unknown): Promise<void> {
    const got = this.session.resolve(a, b);
    if (!got) {
      return;
    }
    await ChatBridge.send(this.session, got.data);
  }

  async onLink(a: unknown, b?: unknown): Promise<void> {
    let url = typeof a === "string" ? a : undefined;
    if (!url && this.session.bundle) {
      const { comment } = CommentList.unpack(a, b, this.session.panel.threads);
      const id = Comment.idOf(comment);
      if (id) {
        url = Comment.urlOf(id, this.session.bundle);
      }
    }
    if (!url) {
      Ui.err("нет ссылки");
      return;
    }
    await vscode.env.clipboard.writeText(url);
    Ui.flash("ссылка скопирована", 1500);
  }

  async openById(id: string, uriStr?: string): Promise<void> {
    if (!this.session.requireBundle() || !id) {
      return;
    }
    const data = this.session.bundle!.threads.find((t) => t.id === id);
    if (!data) {
      Ui.err(`тред ${id} не найден в json`);
      return;
    }
    const uri = uriStr
      ? vscode.Uri.parse(uriStr)
      : vscode.Uri.file(Paths.wsFsPath(data.ws)!);
    await Thread.open(this.session, data, uri);
  }

  async openAtCursor(): Promise<void> {
    const ed = vscode.window.activeTextEditor;
    if (!ed || !this.session.requireBundle()) {
      return;
    }
    const data = this.session.index.atLine(ed.document.uri, ed.selection.active.line);
    if (!data) {
      Ui.err(`нет треда на строке ${ed.selection.active.line + 1}`);
      return;
    }
    await Thread.open(this.session, data, ed.document.uri);
  }

  async paintActive(): Promise<void> {
    const ed = vscode.window.activeTextEditor;
    if (!ed || !this.session.requireBundle()) {
      return;
    }
    const uri = ed.document.uri;
    const line = ed.selection.active.line;
    const data = this.session.index.atLine(uri, line);
    if (data) {
      await Thread.open(this.session, data, uri);
      return;
    }
    const n = this.session.repaintFile(uri, true);
    this.refresh();
    this.updateStatus();
    const jsonN = this.session.forUri(uri).length;
    vscode.window.showInformationMessage(
      `Crucible: ${n}/${jsonN} на ${path.basename(uri.fsPath)}`
    );
  }
}
