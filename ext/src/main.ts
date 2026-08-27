import * as vc from "vscode";
import { Router } from "./pres/controller/router";
import { make, type Graph } from "./pres/di";
import * as v from "./pres/v";
import { EditTracker } from "./pres/editTracker";
import { LoadSignal } from "./pres/loadSignal";
import { consume } from "./infra/loadReq";
import { POLL_MS } from "./infra/constants";
import * as store from "./app/store";

export class App {
  private graph?: Graph;
  private status?: vc.StatusBarItem;
  private tracker?: EditTracker;
  private lens?: v.LensHandle;

  activate(context: vc.ExtensionContext): void {
    const log = vc.window.createOutputChannel("Crucible");
    const info = (msg: string) => {
      log.appendLine(`[${new Date().toISOString()}] ${msg}`);
    };
    const graph = make({
      info,
      refresh: () => this.refresh(),
    });
    graph.store.show = store.asShow(context.workspaceState.get("cru.show"));
    this.graph = graph;

    context.subscriptions.push(...graph.v.decorator.init(context));
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
      store: graph.store,
      forUri: graph.u.review.forUri,
    });
    context.subscriptions.push(lens.provider, lens.emitter);
    this.lens = lens;

    const tracker = EditTracker.for({
      store: graph.store,
      panel: graph.v.panel,
      forUri: graph.u.review.forUri,
      info,
    });
    context.subscriptions.push(tracker);
    this.tracker = tracker;

    const router = new Router(graph, context, info);
    this.refresh();

    const tick = () => void poll(graph);
    const id = setInterval(tick, POLL_MS);
    context.subscriptions.push({ dispose: () => clearInterval(id) });
    tick();

    context.subscriptions.push(
      {
        dispose: () => {
          try {
            graph.v.controller.dispose();
          } catch {
            /* */
          }
        },
      },
      vc.window.onDidChangeActiveTextEditor((ed) => {
        const { u, store, v } = graph;
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
        u.notify();
      }),
      ...router.bind()
    );

    info("activate ok");
  }

  deactivate(): void {
    this.tracker?.dispose();
    this.lens?.dispose();
    this.graph = undefined;
    this.status = undefined;
  }

  private refresh(): void {
    this.graph?.v.decorator.refreshAll();
    this.lens?.refresh();
    const status = this.status;
    const graph = this.graph;
    if (!status) {
      return;
    }
    if (!graph?.store.review) {
      status.text = "$(comment-discussion) Crucible: idle";
      status.show();
      return;
    }
    const show = graph.store.show;
    const n = graph.v.panel.threads.length;
    const total = graph.store.review.threads.length;
    const icon = show === "resolved" ? "$(check)" : "$(comment-discussion)";
    status.text = `${icon} ${graph.store.review.id}: ${n}/${total} ${show}`;
    status.show();
  }
}

async function poll(graph: Graph): Promise<void> {
  const file = consume();
  if (file) {
    await LoadSignal.apply(graph, file);
  }
}

const app = new App();

export function activate(context: vc.ExtensionContext): void {
  app.activate(context);
}

export function deactivate(): void {
  app.deactivate();
}
