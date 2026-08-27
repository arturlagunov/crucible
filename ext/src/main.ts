import * as vc from "vscode";
import { Router } from "./pres/controller/router";
import { make, type Graph } from "./di";
import * as v from "./pres/v";
import { EditTracker } from "./pres/editTracker";
import { LoadSignal } from "./pres/loadSignal";
import { consume } from "./infra/loadReq";
import { POLL_MS } from "./infra/constants";
import * as store from "./app/store";

export class App {
  private g?: Graph;
  private status?: vc.StatusBarItem;
  private tracker?: EditTracker;
  private lens?: v.LensHandle;

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

    const lens = v.Lens.for({
      store: g.store,
      forUri: g.u.review.forUri,
    });
    context.subscriptions.push(lens.provider, lens.emitter);
    this.lens = lens;

    const tracker = EditTracker.for({
      store: g.store,
      panel: g.v.panel,
      forUri: g.u.review.forUri,
      save: () => g.u.review.save(),
      info,
    });
    context.subscriptions.push(tracker);
    this.tracker = tracker;

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
        const { u, store, v } = g;
        if (!ed || !store.review) {
          return;
        }
        const uri = ed.document.uri;
        const n = u.review.forUri(uri).length;
        const live = v.panel.liveFor(uri).length;
        const want = u.review.forUri(uri).shown(store.show).length;
        if (n > 0 && live !== want) {
          v.painter.repaintFile(uri, false);
        }
        u.review.notify();
      }),
      ...router.bind()
    );

    info("activate ok");
  }

  deactivate(): void {
    this.tracker?.dispose();
    this.lens?.dispose();
    this.g = undefined;
    this.status = undefined;
  }

  private refresh(): void {
    this.g?.v.decorator.refreshAll();
    this.lens?.refresh();
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
  const file = consume();
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
