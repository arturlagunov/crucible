import * as fs from "fs";
import * as vc from "vscode";
import * as m from "../domain/m";
import * as ws from "./ws";
import type { Frame } from "./frame";

/** Строки файлов → u.review.relocate. */
export function locate(
  g: Pick<Frame, "u" | "store">,
  uri?: vc.Uri
): boolean {
  const review = g.store.review;
  if (!review) {
    return false;
  }
  let all = review.threads;
  if (uri) {
    all = review.forKey(ws.relKey(uri));
  }
  let dirty = false;
  for (const [key, items] of m.thread.List.byWs(all)) {
    const fp = ws.fsPath(key);
    if (!fp || !fs.existsSync(fp)) {
      continue;
    }
    if (g.u.review.relocate(items, ws.lines(fp))) {
      dirty = true;
    }
  }
  return dirty;
}
