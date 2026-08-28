import * as vc from "vscode";
import { make, type Graph } from "./di";
import { LoadSignal } from "./pres/loadSignal";

export class App {
  private g?: Graph;

  activate(context: vc.ExtensionContext): void {
    const log = vc.window.createOutputChannel("Crucible");
    const info = (msg: string) => {
      log.appendLine(`[${new Date().toISOString()}] ${msg}`);
    };
    const g = make({ info, context });
    this.g = g;

    context.subscriptions.push(
      log,
      ...g.v.decorator.init(context),
      g.v.status,
      g.v.lens.provider,
      g.v.lens.emitter,
      g.tracker,
      {
        dispose: () => g.v.panel.dispose(),
      },
      ...g.router.bind(),
      LoadSignal.watch(g)
    );
    g.v.notify();
    info("activate ok");
  }

  deactivate(): void {
    this.g?.tracker.dispose();
    this.g?.v.lens.dispose();
    this.g = undefined;
  }
}

const app = new App();

export function activate(context: vc.ExtensionContext): void {
  app.activate(context);
}

export function deactivate(): void {
  app.deactivate();
}
