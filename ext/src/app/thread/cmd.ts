import * as path from "path";
import * as vscode from "vscode";
import { Thread } from "../../domain/thread";
import { Paths } from "../../infra/paths";
import { Ui } from "../../vscode/ui";
import { cmd } from "../cmd";
import type { ThreadCmds } from "../shape";
import { resolveCmd } from "../resolve";

export class ThreadCmd {
  constructor(private host: ThreadCmds) {}

  bind(): vscode.Disposable[] {
    return [
      cmd("cru.paint", () => this.paintActive()),
      cmd("cru.open", () => this.openAt()),
      cmd("cru.openId", (id, uriStr) =>
        this.openById(id as string, uriStr as string | undefined)
      ),
      cmd("cru.resolve", (a) => this.setResolved(a, true)),
      cmd("cru.unresolve", (a) => this.setResolved(a, false)),
      cmd("cru.delThread", (a, b) => this.del(a, b)),
    ];
  }

  private async openAt(): Promise<void> {
    const ed = vscode.window.activeTextEditor;
    if (!ed || !this.host.requireBundle()) {
      return;
    }
    const data = this.host.forUri(ed.document.uri).open.atLine(ed.selection.active.line);
    if (!data) {
      Ui.err(`нет треда на строке ${ed.selection.active.line + 1}`);
      return;
    }
    await this.open(data, ed.document.uri);
  }

  private async openById(id: string, uriStr?: string): Promise<void> {
    if (!this.host.requireBundle() || !id) {
      return;
    }
    const data = this.host.data.bundle!.threads.find((t) => t.id === id);
    if (!data) {
      Ui.err(`тред ${id} не найден в json`);
      return;
    }
    const uri = uriStr
      ? vscode.Uri.parse(uriStr)
      : vscode.Uri.file(Paths.wsFsPath(data.ws)!);
    await this.open(data, uri);
  }

  private async paintActive(): Promise<void> {
    const ed = vscode.window.activeTextEditor;
    if (!ed || !this.host.requireBundle()) {
      return;
    }
    const uri = ed.document.uri;
    const data = this.host.forUri(uri).open.atLine(ed.selection.active.line);
    if (data) {
      await this.open(data, uri);
      return;
    }
    const n = this.host.ui.painter.repaintFile(uri, true);
    this.host.notify();
    const jsonN = this.host.forUri(uri).open.length;
    vscode.window.showInformationMessage(
      `Crucible: ${n}/${jsonN} на ${path.basename(uri.fsPath)}`
    );
  }

  private setResolved(a: unknown, resolved: boolean): void {
    const got = resolveCmd(this.host, a);
    if (!got) {
      return;
    }
    this.host.ops.thread.setState(got.thread, resolved ? "RESOLVED" : "UNRESOLVED");
    if (this.host.ops.store.persist()) {
      Ui.flash(
        `${resolved ? "resolved" : "unresolved"} → ${path.basename(this.host.data.jsonPath || "")}`
      );
    }
  }

  private del(a: unknown, b?: unknown): void {
    const got = resolveCmd(this.host, a, b);
    if (!got) {
      return;
    }
    try {
      this.host.ops.thread.delete(got.thread);
    } catch (e) {
      Ui.err(e);
      return;
    }
    this.host.notify();
  }

  /** Comments panel XOR markdown preview. */
  private async open(data: Thread, uri: vscode.Uri): Promise<void> {
    let ct = this.live(data.id);
    if (!ct) {
      this.host.ui.painter.repaintFile(uri, true);
      this.host.notify();
      ct = this.live(data.id);
    }
    if (ct) {
      this.host.ui.panel.sync(ct, data);
      ct.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
      await focusComments();
      Ui.flash(`тред ${data.id}`, 1500);
      return;
    }
    const md = await vscode.workspace.openTextDocument({
      content: data.toMarkdown(this.host.data.bundle),
      language: "markdown",
    });
    await vscode.window.showTextDocument(md, {
      preview: true,
      preserveFocus: false,
    });
    Ui.flash(`тред ${data.id}`, 1500);
  }

  private live(id: string): vscode.CommentThread | undefined {
    return this.host.ui.panel.threads.find(
      (t) => this.host.ui.panel.threadId(t) === id
    );
  }
}

async function focusComments(): Promise<void> {
  for (const id of [
    "workbench.action.focusCommentsView",
    "workbench.panel.comments.focus",
  ]) {
    try {
      await vscode.commands.executeCommand(id);
      return;
    } catch {
      /* */
    }
  }
}
