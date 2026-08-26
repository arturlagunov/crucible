import * as vscode from "vscode";
import { Router } from "./app/router";
import { Ctx } from "./app/ctx";
import { Controller } from "./vscode/controller";
import { Painter } from "./vscode/painter";
import { EditTracker } from "./bootstrap/editTracker";
import { Lens, type LensHandle } from "./vscode/lens";
import { LoadSignal } from "./bootstrap/loadSignal";
import { wire } from "./bootstrap/wire";
import { POLL_MS } from "./infra/constants";
import { asShow } from "./app/data";

export class App {
  private ctx?: Ctx;
  private status?: vscode.StatusBarItem;
  private editTracker?: EditTracker;
  private codeLens?: LensHandle;

  activate(context: vscode.ExtensionContext): void {
    const ctx = new Ctx();
    ctx.ui.context = context;
    ctx.data.show = asShow(context.workspaceState.get("cru.show"));
    wire(ctx, Controller.for, () => {
      this.refresh();
      this.updateStatus();
    });
    ctx.ui.controller = Controller.for(ctx);
    ctx.ui.painter = new Painter(ctx);
    this.ctx = ctx;

    context.subscriptions.push(...ctx.ui.decorator.init(context));
    context.subscriptions.push(ctx.ui.log);

    const status = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    status.command = "cru.show";
    status.tooltip = "клик: unresolved → all → resolved";
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
          const jsonN = ctx.forUri(ed.document.uri).length;
          const liveN = ctx.ui.panel.liveFor(ed.document.uri).length;
          const want = ctx.forUri(ed.document.uri).shown(ctx.data.show).length;
          if (jsonN > 0 && liveN !== want) {
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
    if (!ctx?.data.bundle) {
      status.text = "$(comment-discussion) Crucible: idle";
      status.show();
      return;
    }
    const show = ctx.data.show;
    const n = ctx.ui.panel.threads.length;
    const total = ctx.data.bundle.threads.length;
    const icon = show === "resolved" ? "$(check)" : "$(comment-discussion)";
    status.text = `${icon} ${ctx.data.bundle.review.id}: ${n}/${total} ${show}`;
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
