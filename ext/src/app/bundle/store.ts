import * as fs from "fs";
import { ThreadBundle } from "../../domain/bundle";
import type { StoreHost } from "../shape";

export interface SaveOpts {
  quiet?: boolean;
}

/** JSON bundle: load / save / persist. */
export class BundleStore {
  constructor(private host: StoreHost) {}

  load(fsPath: string): void {
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
  save(_opts: SaveOpts = {}): void {
    const { jsonPath, bundle } = this.host.data;
    if (!jsonPath || !bundle) {
      throw new Error("нечего сохранять");
    }
    this.assertWritable(jsonPath, bundle.threads.length);
    bundle.save(jsonPath);
    this.host.info(`saved ${jsonPath}`);
  }

  persist(): boolean {
    try {
      this.save();
      return true;
    } catch (e) {
      this.host.info(`save failed: ${e instanceof Error ? e.message : e}`);
      return false;
    }
  }

  /** Старый фильтр+save вырезал resolved. Не затирать полный JSON коротким. */
  private assertWritable(jsonPath: string, memN: number): void {
    if (!fs.existsSync(jsonPath)) {
      return;
    }
    let diskN = 0;
    try {
      const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as {
        threads?: unknown[];
      };
      diskN = Array.isArray(raw.threads) ? raw.threads.length : 0;
    } catch {
      return;
    }
    if (diskN >= 20 && memN < diskN * 0.8) {
      this.host.info(`save skip: disk ${diskN} > mem ${memN}`);
      throw new Error(`save aborted: на диске ${diskN} тредов, в памяти ${memN}`);
    }
  }
}
