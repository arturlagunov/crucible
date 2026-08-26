import * as path from "path";
import * as vscode from "vscode";
import { ThreadList } from "../domain/threadList";
import type { Thread } from "../domain/thread";
import type { ThreadBundle } from "../domain/bundle";
import { Paths } from "../infra/paths";
import { Data, requireBundle } from "./data";
import { Ops } from "./ops";
import { UiCtx } from "./uiCtx";

export class Ctx {
  readonly data = new Data();
  readonly ui: UiCtx;
  readonly ops: Ops;

  private onRefresh?: () => void;

  constructor(controller?: vscode.CommentController) {
    this.ui = new UiCtx(this);
    this.ops = new Ops(this);
    if (controller) {
      this.ui.controller = controller;
    }
  }

  attachRefresh(fn: () => void): void {
    this.onRefresh = fn;
  }

  notify(): void {
    this.onRefresh?.();
  }

  forUri(uri: vscode.Uri): ThreadList {
    const bundle = this.data.bundle;
    if (!bundle) {
      return ThreadList.empty();
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return ThreadList.empty();
    }
    const key = Paths.relKey(uri, folder.uri);
    const hit = bundle.forKey(key);
    if (hit.length) {
      return hit;
    }
    const want = path.normalize(uri.fsPath);
    for (const th of bundle.threads) {
      const fp = Paths.wsFsPath(th.ws);
      if (fp && path.normalize(fp) === want) {
        return bundle.forKey(th.ws);
      }
    }
    return ThreadList.empty();
  }

  atLine(uri: vscode.Uri, line0: number): Thread | undefined {
    return this.forUri(uri).open.atLine(line0);
  }

  info(msg: string): void {
    this.ui.log.appendLine(`[${new Date().toISOString()}] ${msg}`);
  }

  requireBundle(): ThreadBundle | undefined {
    return requireBundle(this.data);
  }

  decorate(editor: vscode.TextEditor): void {
    this.ui.decorator.decorate(editor);
  }
}
