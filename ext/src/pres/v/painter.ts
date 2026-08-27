import * as fs from "fs";
import * as path from "path";
import * as vc from "vscode";
import * as m from "../../domain/m";
import { Paths } from "../../infra/paths";
import type * as store from "../../app/store";
import type { Panel } from "./panel";

export interface PaintOpts {
  expand?: boolean;
}

export type Ports = {
  store: store.Store;
  panel: Panel;
  anchors: m.Anchor;
  forUri(uri: vc.Uri): m.thread.List;
  info(msg: string): void;
};

/** Review → VS Code CommentThread panel. */
export class Painter {
  constructor(private p: Ports) {}

  static for(p: Ports): Painter {
    return new Painter(p);
  }

  paint(onlyUri?: vc.Uri, opts: PaintOpts = {}): number {
    const folder = vc.workspace.workspaceFolders?.[0];
    if (!folder || !this.p.store.review) {
      throw new Error("нет workspace или ревью");
    }
    const expand = opts.expand === true;
    const all = onlyUri
      ? this.p.forUri(onlyUri)
      : this.p.store.review.threads;
    if (onlyUri) {
      this.p.panel.dropUri(onlyUri);
    } else {
      this.p.panel.clear();
    }

    let spanDirty = false;
    for (const [ws, items] of m.thread.List.byWs(all)) {
      const fp = Paths.wsFsPath(ws);
      if (!fp || !fs.existsSync(fp)) {
        continue;
      }
      const lines = Paths.lines(fp);
      if (this.p.anchors.locateLines(items, lines, { miss: false })) {
        spanDirty = true;
      }
    }
    const list = all.shown(this.p.store.show);
    const { count } = this.p.panel.paint(list, expand, () => false);
    if (spanDirty) {
      this.p.store.save();
    }
    this.p.info(`painted ${count}`);
    return count;
  }

  repaintFile(uri: vc.Uri, expand = false): number {
    if (!this.p.store.review) {
      return 0;
    }
    const all = this.p.forUri(uri);
    const list = all.shown(this.p.store.show);
    if (!list.length) {
      this.p.panel.dropUri(uri);
      return 0;
    }
    const lines = Paths.lines(uri.fsPath);
    this.p.anchors.locateLines(all.toArray(), lines, { miss: false });
    this.p.panel.dropUri(uri);
    const { count } = this.p.panel.paint(list, expand, () => false);
    if (count) {
      this.p.info(`repaint ${path.basename(uri.fsPath)}: ${count}`);
    }
    return count;
  }
}
