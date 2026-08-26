import * as vscode from "vscode";
import type { ThreadBundle } from "../domain/bundle";
import type { Show } from "../domain/types";

export class Data {
  bundle: ThreadBundle | undefined;
  jsonPath: string | undefined;
  show: Show = "unresolved";
}

export function asShow(v: unknown): Show {
  if (v === "all" || v === "resolved") {
    return v;
  }
  if (v === "done") {
    return "resolved";
  }
  return "unresolved";
}

export function requireBundle(data: Data): ThreadBundle | undefined {
  if (!data.bundle) {
    vscode.window.showWarningMessage("Сначала make load");
    return undefined;
  }
  return data.bundle;
}
