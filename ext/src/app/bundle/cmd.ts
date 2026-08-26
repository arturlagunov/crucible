import * as path from "path";
import * as vscode from "vscode";
import { LoadSignal } from "../../bootstrap/loadSignal";
import { Ui } from "../../vscode/ui";
import { cmd, commit } from "../cmd";
import type { BundleCmds } from "../shape";
import type { Show } from "../../domain/types";

const ORDER: Show[] = ["unresolved", "all", "resolved"];

export class BundleCmd {
  constructor(private host: BundleCmds) {}

  bind(): vscode.Disposable[] {
    return [
      cmd("cru.load", () => this.load()),
      cmd("cru.save", () => this.save()),
      cmd("cru.clear", () => this.clear()),
      cmd("cru.show", () => this.cycle()),
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
    commit(
      this.host,
      `сохранено → ${path.basename(this.host.data.jsonPath || "")}`
    );
  }

  private clear(): void {
    this.host.ops.store.clear();
    this.host.ui.panel.clear();
    this.host.ui.decorator.clearAll();
    this.host.notify();
  }

  private cycle(): void {
    if (!this.host.data.bundle) {
      return;
    }
    const i = Math.max(0, ORDER.indexOf(this.host.data.show));
    this.host.data.show = ORDER[(i + 1) % ORDER.length];
    void this.host.ui.context?.workspaceState.update("cru.show", this.host.data.show);
    this.host.ui.painter.paint(undefined, { expand: false });
    this.host.notify();
    Ui.flash(`show: ${this.host.data.show}`, 1500);
  }
}
