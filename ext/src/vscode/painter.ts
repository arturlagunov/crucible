import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ThreadList } from "../domain/threadList";
import { Paths } from "../infra/paths";
import type { PaintHost } from "../app/shape";

export interface PaintOpts {
  expand?: boolean;
}

/** Domain bundle → VS Code CommentThread panel. */
export class Painter {
  constructor(private host: PaintHost) {}

  paint(onlyUri?: vscode.Uri, opts: PaintOpts = {}): number {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder || !this.host.data.bundle) {
      throw new Error("нет workspace или bundle");
    }
    const expand = opts.expand !== false;
    const all = onlyUri
      ? this.host.forUri(onlyUri)
      : this.host.data.bundle.threads;
    if (onlyUri) {
      this.host.ui.panel.dropUri(onlyUri);
    } else {
      this.host.ui.panel.clear();
    }

    let spanDirty = false;
    for (const [ws, items] of ThreadList.byWs(all)) {
      const fp = Paths.wsFsPath(ws);
      if (!fp || !fs.existsSync(fp)) {
        continue;
      }
      const lines = Paths.lines(fp);
      const open = items.filter((t) => t.unresolved);
      const rest = items.filter((t) => !t.unresolved);
      if (this.host.ui.anchors.locateLines(open, lines)) {
        spanDirty = true;
      }
      if (rest.length && this.host.ui.anchors.locateLines(rest, lines, { miss: false })) {
        spanDirty = true;
      }
    }
    const { count } = this.host.ui.panel.paint(all.open, expand, () => false);
    if (spanDirty) {
      this.host.ops.store.save({ quiet: true });
    }
    this.host.info(`painted ${count}`);
    return count;
  }

  repaintFile(uri: vscode.Uri, expand = true): number {
    if (!this.host.data.bundle || !this.host.ui.controller) {
      return 0;
    }
    const all = this.host.forUri(uri);
    const list = all.open;
    if (!list.length) {
      return 0;
    }
    const lines = Paths.lines(uri.fsPath);
    this.host.ui.anchors.locateLines(list.toArray(), lines, { miss: false });
    const rest = all.filter((t) => !t.unresolved);
    if (rest.length) {
      this.host.ui.anchors.locateLines(rest.toArray(), lines, { miss: false });
    }
    this.host.ui.panel.dropUri(uri);
    const { count } = this.host.ui.panel.paint(list, expand, () => false);
    if (count) {
      this.host.info(`repaint ${path.basename(uri.fsPath)}: ${count}`);
    }
    return count;
  }

  remount(expanded: Set<string>, expandUri?: vscode.Uri): void {
    const { createController } = this.host.ui;
    if (!this.host.data.bundle || !createController) {
      return;
    }
    this.host.ui.panel.clear();
    try {
      this.host.ui.controller?.dispose();
    } catch (e) {
      this.host.info(`controller dispose: ${e}`);
    }
    this.host.ui.controller = createController({
      data: this.host.data,
      ui: { panel: this.host.ui.panel },
      info: (m) => this.host.info(m),
      forUri: (u) => this.host.forUri(u),
    });
    this.paint(undefined, { expand: false });
    const expandKey = expandUri?.toString();
    for (const ct of this.host.ui.panel.threads) {
      const id = this.host.ui.panel.threadId(ct);
      const data = this.host.ui.panel.dataOf(ct);
      const onFile = expandKey && ct.uri.toString() === expandKey;
      if ((id && expanded.has(id)) || onFile || data?.miss) {
        ct.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
      }
    }
  }
}
