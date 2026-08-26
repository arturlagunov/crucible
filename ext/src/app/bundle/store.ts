import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ThreadBundle } from "../../domain/bundle";
import { Ui } from "../../vscode/ui";
import type { StoreHost } from "../shape";

export interface SaveOpts {
  quiet?: boolean;
}

/** JSON bundle: load / save / persist. */
export class BundleStore {
  constructor(private host: StoreHost) {}

  load(jsonUri: string | vscode.Uri): void {
    const fsPath = typeof jsonUri === "string" ? jsonUri : jsonUri.fsPath;
    const { bundle, total } = ThreadBundle.read(fsPath);
    this.host.data.bundle = bundle;
    this.host.data.jsonPath = fsPath;
    const open = bundle.threads.open.length;
    const resolved = bundle.threads.resolved.length;
    this.host.info(
      `loaded ${fsPath}: ${total} threads (${open} unresolved / ${resolved} resolved)`
    );
  }

  clear(): void {
    this.host.data.bundle = undefined;
    this.host.data.jsonPath = undefined;
  }

  /** Domain → disk. Не читать status с виджета: Resolved-state прячет треды. */
  save(opts: SaveOpts = {}): void {
    const { jsonPath, bundle } = this.host.data;
    if (!jsonPath || !bundle) {
      throw new Error("нечего сохранять");
    }
    if (!this.canWrite(jsonPath, bundle.threads.length)) {
      return;
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

  /** Старый фильтр+save вырезал resolved. Не затирать полный JSON коротким. */
  private canWrite(jsonPath: string, memN: number): boolean {
    if (!fs.existsSync(jsonPath)) {
      return true;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as {
        threads?: unknown[];
      };
      const diskN = Array.isArray(raw.threads) ? raw.threads.length : 0;
      if (diskN >= 20 && memN < diskN * 0.8) {
        this.host.info(`save skip: disk ${diskN} > mem ${memN}`);
        Ui.err(`save aborted: на диске ${diskN} тредов, в памяти ${memN}`);
        return false;
      }
    } catch {
      /* */
    }
    return true;
  }
}
