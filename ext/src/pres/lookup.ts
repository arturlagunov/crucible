import * as path from "path";
import * as vc from "vscode";
import { Paths } from "../infra/paths";
import * as m from "../domain/m";
import type * as store from "../app/store";

/** vscode Uri → треды файла в текущем review. */
export function forUri(store: store.Store, uri: vc.Uri): m.thread.List {
  const review = store.review;
  if (!review) {
    return m.thread.List.empty();
  }
  const folder = vc.workspace.workspaceFolders?.[0];
  if (!folder) {
    return m.thread.List.empty();
  }
  const key = Paths.relKey(uri, folder.uri);
  const hit = review.forKey(key);
  if (hit.length) {
    return hit;
  }
  const want = path.normalize(uri.fsPath);
  for (const th of review.threads) {
    const fp = Paths.wsFsPath(th.ws);
    if (fp && path.normalize(fp) === want) {
      return review.forKey(th.ws);
    }
  }
  return m.thread.List.empty();
}
