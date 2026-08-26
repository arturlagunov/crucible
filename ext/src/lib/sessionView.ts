import * as vscode from "vscode";
import type { ThreadBundle } from "./bundle";
import type { Panel } from "./panel";
import type { ThreadIndex } from "./threadIndex";
import type { ThreadList } from "./threadList";

/** Контракт для lib-модулей без import session.ts. */
export interface SessionView {
  bundle: ThreadBundle | undefined;
  panel: Panel;
  index: ThreadIndex;
  info(msg: string): void;
  forUri(uri: vscode.Uri): ThreadList;
}
