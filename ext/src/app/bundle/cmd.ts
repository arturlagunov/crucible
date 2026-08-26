import * as vscode from "vscode";
import { LoadSignal } from "../../bootstrap/loadSignal";
import { Ui } from "../../vscode/ui";
import { cmd } from "../cmd";
import type { BundleCmds } from "../shape";

export class BundleCmd {
  constructor(private host: BundleCmds) {}

  bind(): vscode.Disposable[] {
    return [
      cmd("cru.load", () => this.load()),
      cmd("cru.save", () => this.save()),
      cmd("cru.clear", () => this.clear()),
    ];
  }

  private async load(): Promise<void> {
    const pick = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { JSON: ["json"] },
    });
    if (pick?.[0]) {
      await LoadSignal.apply(this.host, pick[0].fsPath);
    }
  }

  private save(): void {
    try {
      this.host.ops.store.save();
      this.host.notify();
    } catch (e) {
      Ui.err(e);
    }
  }

  private clear(): void {
    this.host.ops.store.clear();
    this.host.ui.panel.clear();
    this.host.ui.decorator.clearAll();
    this.host.notify();
  }
}
