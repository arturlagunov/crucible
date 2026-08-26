import * as vscode from "vscode";
import { Commands } from "./commands";
import { Controller } from "./controller";
import { EditTracker } from "./editTracker";
import { Lens, type LensHandle } from "./lens";
import { LoadSignal } from "./loadSignal";
import { POLL_MS } from "./lib/constants";
import { Ui } from "./lib/ui";
import { Session } from "./session";

export class App {
  private session?: Session;
  private status?: vscode.StatusBarItem;
  private editTracker?: EditTracker;
  private codeLens?: LensHandle;

  activate(context: vscode.ExtensionContext): void {
    const session = new Session();
    session.context = context;
    session.wire(Controller.for, () => {
      this.refresh();
      this.updateStatus();
    });
    session.controller = Controller.for(session);
    this.session = session;

    context.subscriptions.push(...session.decorator.init(context));
    context.subscriptions.push(session.log);

    const status = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    status.command = "cru.paint";
    context.subscriptions.push(status);
    this.status = status;

    const codeLens = Lens.for(session);
    context.subscriptions.push(codeLens.provider, codeLens.emitter);
    this.codeLens = codeLens;

    const editTracker = new EditTracker(session);
    context.subscriptions.push(editTracker);
    this.editTracker = editTracker;

    const commands = new Commands(session, () => this.refresh(), () => this.updateStatus());
    this.updateStatus();

    const poll = setInterval(
      () => void LoadSignal.consume(session, () => this.refresh()),
      POLL_MS
    );
    context.subscriptions.push({ dispose: () => clearInterval(poll) });
    void LoadSignal.consume(session, () => this.refresh());

    context.subscriptions.push(
      session.controller,
      vscode.window.onDidChangeActiveTextEditor((ed) => {
        if (ed && session.bundle) {
          const jsonN = session.forUri(ed.document.uri).length;
          const liveN = session.panel.liveFor(ed.document.uri).length;
          if (jsonN > 0 && liveN !== jsonN) {
            session.remountPanel(new Set(), ed.document.uri);
          }
          this.refresh();
        }
      }),
      this.cmd("cru.load", async () => {
        const pick = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { JSON: ["json"] },
        });
        if (pick?.[0]) {
          await LoadSignal.apply(session, pick[0].fsPath, () => {
            this.refresh();
            this.updateStatus();
          });
        }
      }),
      this.cmd("cru.paint", () => commands.paintActive()),
      this.cmd("cru.open", () => commands.openAtCursor()),
      this.cmd("cru.openId", (id, uriStr) =>
        commands.openById(id as string, uriStr as string | undefined)
      ),
      this.cmd("cru.reply", (r) =>
        commands.onReply(r as { thread?: vscode.CommentThread; text?: string })
      ),
      this.cmd("cru.resolve", (t) => commands.setResolved(t, true)),
      this.cmd("cru.unresolve", (t) => commands.setResolved(t, false)),
      this.cmd("cru.del", (t, c) => commands.delComment(t, c)),
      this.cmd("cru.delThread", (t) => commands.delThread(t)),
      this.cmd("cru.chat", (t, c) => void commands.addChat(t, c)),
      this.cmd("cru.save", () => {
        try {
          session.save();
          this.refresh();
          this.updateStatus();
        } catch (e) {
          Ui.err(e);
        }
      }),
      this.cmd("cru.clear", () => {
        session.reset();
        this.refresh();
        this.updateStatus();
      }),
      this.cmd("cru.link", (a, b) => void commands.onLink(a, b))
    );

    session.info("activate ok");
  }

  deactivate(): void {
    this.editTracker?.dispose();
    this.codeLens?.dispose();
    this.session = undefined;
    this.status = undefined;
  }

  private refresh(): void {
    this.session?.decorator.refreshAll();
    this.codeLens?.refresh();
  }

  private updateStatus(): void {
    const status = this.status;
    const session = this.session;
    if (!status) {
      return;
    }
    status.text = session?.bundle
      ? `$(comment-discussion) ${session.bundle.review.id}: ${session.panel.threads.length}`
      : "$(comment-discussion) Crucible: idle";
    status.show();
  }

  private cmd(id: string, fn: (...args: unknown[]) => unknown): vscode.Disposable {
    return vscode.commands.registerCommand(id, fn);
  }
}

const app = new App();

export function activate(context: vscode.ExtensionContext): void {
  app.activate(context);
}

export function deactivate(): void {
  app.deactivate();
}
