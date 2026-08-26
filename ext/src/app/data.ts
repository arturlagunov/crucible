import * as vscode from "vscode";
import type { ThreadBundle } from "../domain/bundle";

export class Data {
  bundle: ThreadBundle | undefined;
  jsonPath: string | undefined;
}

export function requireBundle(data: Data): ThreadBundle | undefined {
  if (!data.bundle) {
    vscode.window.showWarningMessage("Сначала make load");
    return undefined;
  }
  return data.bundle;
}
