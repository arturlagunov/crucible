import * as vc from "vscode";
import { Router } from "./pres/controller/router";
import { make, type Graph } from "./di";
import { LoadSignal } from "./pres/loadSignal";
import { consume } from "./infra/loadReq";
import { POLL_MS } from "./infra/constants";
import * as store from "./app/store";
import { locate } from "./pres/locate";

export class App {
  private g?: Graph;
  private status?: vc.StatusBarItem;

  activate(context: vc.ExtensionContext): void {
    const log = vc.window.createOutputChannel("Crucible");
    const info = (msg: string) => {
      log.appendLine(`[${new Date().toISOString()}] ${msg}`);
    };
    const g = make({
      info,
      refresh: () => this.refresh(),
    });
    g.store.show = store.asShow(context.workspaceState.get("cru.show"));
    this.g = g;

    context.subscriptions.push(...g.v.decorator.init(context));
    context.subscriptions.push(log);

    const status = vc.window.createStatusBarItem(
      vc.StatusBarAlignment.Right,
      100
    );
    status.command = "cru.show";
    status.tooltip = "клик: unresolved → all → resolved";
    context.subscriptions.push(status);
    this.status = status;

    context.subscriptions.push(g.v.lens.provider, g.v.lens.emitter);
    context.subscriptions.push(g.tracker);

    const router = new Router(g, context, info);
    this.refresh();

    const tick = () => void poll(g);
    const id = setInterval(tick, POLL_MS);
    context.subscriptions.push({ dispose: () => clearInterval(id) });
    tick();

    context.subscriptions.push(
      {
        dispose: () => {
          try {
            g.v.controller.dispose();
          } catch {
            /* */
          }
        },
      },
      vc.window.onDidChangeActiveTextEditor((ed) => {
        if (!ed || !g.store.review) {
          return;
        }
        const uri = ed.document.uri;
        const n = g.forUri(uri).length;
        const live = g.v.panel.liveFor(uri).length;
        const want = g.forUri(uri).shown(g.store.show).length;
        if (n > 0 && live !== want) {
          if (locate(g, uri)) {
            g.u.review.save();
          }
          g.v.painter.repaintFile(uri, false);
        }
        g.notify();
      }),
      ...router.bind()
    );

    info("activate ok");
  }

  deactivate(): void {
    this.g?.tracker.dispose();
    this.g?.v.lens.dispose();
    this.g = undefined;
    this.status = undefined;
  }

  private refresh(): void {
    this.g?.v.decorator.refreshAll();
    this.g?.v.lens.refresh();
    const status = this.status;
    const g = this.g;
    if (!status) {
      return;
    }
    if (!g?.store.review) {
      status.text = "$(comment-discussion) Crucible: idle";
      status.show();
      return;
    }
    const show = g.store.show;
    const n = g.v.panel.threads.length;
    const total = g.store.review.threads.length;
    const icon = show === "resolved" ? "$(check)" : "$(comment-discussion)";
    status.text = `${icon} ${g.store.review.id}: ${n}/${total} ${show}`;
    status.show();
  }
}

async function poll(g: Graph): Promise<void> {
  const file = consume(vc.workspace.workspaceFolders?.[0]?.uri.fsPath);
  if (file) {
    await LoadSignal.apply(g, file);
  }
}

const app = new App();

export function activate(context: vc.ExtensionContext): void {
  app.activate(context);
}

export function deactivate(): void {
  app.deactivate();
}
