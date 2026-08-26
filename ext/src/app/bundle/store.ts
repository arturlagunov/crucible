import * as path from "path";
import * as vscode from "vscode";
import { ThreadBundle } from "../../domain/bundle";
import { Ui } from "../../vscode/ui";
import type { StoreHost } from "../shape";

const STATE = vscode.CommentThreadState;

export interface SaveOpts {
  quiet?: boolean;
}

/** JSON bundle: load / save / persist. */
export class BundleStore {
  constructor(private host: StoreHost) {}

  load(jsonUri: string | vscode.Uri): void {
    const fsPath = typeof jsonUri === "string" ? jsonUri : jsonUri.fsPath;
    const { bundle } = ThreadBundle.read(fsPath);
    this.host.data.bundle = bundle;
    this.host.data.jsonPath = fsPath;
    this.host.info(
      `loaded ${fsPath}: ${this.host.data.bundle.threads.open.length}/${this.host.data.bundle.threads.length} unresolved`
    );
  }

  clear(): void {
    this.host.data.bundle = undefined;
    this.host.data.jsonPath = undefined;
  }

  /** Снять resolved/unresolved с panel → domain → disk. */
  save(opts: SaveOpts = {}): void {
    const { jsonPath, bundle } = this.host.data;
    if (!jsonPath || !bundle) {
      throw new Error("нечего сохранять");
    }
    for (const ct of this.host.ui.panel.threads) {
      const data = this.host.ui.panel.dataOf(ct);
      if (!data || !STATE || ct.state === undefined) {
        continue;
      }
      data.msgs.setStatus(
        ct.state === STATE.Resolved ? "RESOLVED" : "UNRESOLVED"
      );
    }
    bundle.save(jsonPath);
    this.host.info(`saved ${jsonPath}`);
    if (!opts.quiet) {
      Ui.flash(`сохранено → ${path.basename(jsonPath)}`, 2500);
    }
  }

  persist(): boolean {
    try {
      this.save();
    } catch (e) {
      Ui.err(e);
      return false;
    }
    this.host.notify();
    return true;
  }
}
