import * as fs from "fs";
import type * as d from "../../domain/d";
import * as m from "../../domain/m";

export function asShow(v: unknown): d.Show {
  if (v === "all" || v === "resolved") {
    return v;
  }
  if (v === "done") {
    return "resolved";
  }
  return "unresolved";
}

/** Сессия ревью + JSON на диске. */
export class Store {
  review: m.Review | undefined;
  jsonPath: string | undefined;
  show: d.Show = "unresolved";

  constructor(private info: (msg: string) => void) {}

  static for(info: (msg: string) => void): Store {
    return new Store(info);
  }

  load(fsPath: string): void {
    const raw: unknown = JSON.parse(fs.readFileSync(fsPath, "utf8"));
    const review = m.Review.fromRaw(raw);
    this.review = review;
    this.jsonPath = fsPath;
    const total = review.threads.length;
    const open = review.threads.open.length;
    const resolved = review.threads.resolved.length;
    this.info(
      `loaded ${fsPath}: ${total} threads (${open} unresolved / ${resolved} resolved)`
    );
  }

  clear(): void {
    this.review = undefined;
    this.jsonPath = undefined;
  }

  /** Domain → disk. Не читать status с виджета: Resolved-state прячет треды. */
  save(): void {
    const { jsonPath, review } = this;
    if (!jsonPath || !review) {
      throw new Error("нечего сохранять");
    }
    this.assertWritable(jsonPath, review.threads.length);
    fs.writeFileSync(
      jsonPath,
      JSON.stringify(review.toRaw(), null, 2) + "\n",
      "utf8"
    );
    this.info(`saved ${jsonPath}`);
  }

  persist(): boolean {
    try {
      this.save();
      return true;
    } catch (e) {
      this.info(`save failed: ${e instanceof Error ? e.message : e}`);
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
      this.info(`save skip: disk ${diskN} > mem ${memN}`);
      throw new Error(`save aborted: на диске ${diskN} тредов, в памяти ${memN}`);
    }
  }
}
