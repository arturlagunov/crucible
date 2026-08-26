import * as vscode from "vscode";
import { Router } from "./app/router";
import { Ctx } from "./app/ctx";
import { Controller } from "./vscode/controller";
import { EditTracker } from "./bootstrap/editTracker";
import { Lens, type LensHandle } from "./vscode/lens";
import { LoadSignal } from "./bootstrap/loadSignal";
import { wire } from "./bootstrap/wire";
import { POLL_MS } from "./infra/constants";

export class App {
  private ctx?: Ctx;
  private status?: vscode.StatusBarItem;
  private editTracker?: EditTracker;
  private codeLens?: LensHandle;

  activate(context: vscode.ExtensionContext): void {
    const ctx = new Ctx();
    ctx.ui.context = context;
    wire(ctx, Controller.for, () => {
      this.refresh();
      this.updateStatus();
    });
    ctx.ui.controller = Controller.for(ctx);
    this.ctx = ctx;

    context.subscriptions.push(...ctx.ui.decorator.init(context));
    context.subscriptions.push(ctx.ui.log);

    const status = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    status.command = "cru.paint";
    context.subscriptions.push(status);
    this.status = status;

    const codeLens = Lens.for(ctx);
    context.subscriptions.push(codeLens.provider, codeLens.emitter);
    this.codeLens = codeLens;

    const editTracker = new EditTracker(ctx);
    context.subscriptions.push(editTracker);
    this.editTracker = editTracker;

    const router = new Router(ctx);
    this.updateStatus();

    const poll = setInterval(() => void LoadSignal.consume(ctx), POLL_MS);
    context.subscriptions.push({ dispose: () => clearInterval(poll) });
    void LoadSignal.consume(ctx);

    context.subscriptions.push(
      {
        dispose: () => {
          try {
            ctx.ui.controller?.dispose();
          } catch {
            /* */
          }
        },
      },
      vscode.window.onDidChangeActiveTextEditor((ed) => {
        if (ed && ctx.data.bundle) {
          const jsonN = ctx.forUri(ed.document.uri).open.length;
          const liveN = ctx.ui.panel.liveFor(ed.document.uri).length;
          if (jsonN > 0 && liveN !== jsonN) {
            ctx.ui.painter.repaintFile(ed.document.uri, false);
          }
          ctx.notify();
        }
      }),
      ...router.bind(context)
    );

    ctx.info("activate ok");
  }

  deactivate(): void {
    this.editTracker?.dispose();
    this.codeLens?.dispose();
    this.ctx = undefined;
    this.status = undefined;
  }

  private refresh(): void {
    this.ctx?.ui.decorator.refreshAll();
    this.codeLens?.refresh();
  }

  private updateStatus(): void {
    const status = this.status;
    const ctx = this.ctx;
    if (!status) {
      return;
    }
    status.text = ctx?.data.bundle
      ? `$(comment-discussion) ${ctx.data.bundle.review.id}: ${ctx.ui.panel.threads.length}`
      : "$(comment-discussion) Crucible: idle";
    status.show();
  }
}

const app = new App();

export function activate(context: vscode.ExtensionContext): void {
  app.activate(context);
}

export function deactivate(): void {
  app.deactivate();
}
