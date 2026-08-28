import * as path from "path";
import * as vc from "vscode";
import type * as store from "../../app/store";
import type { Panel } from "./panel";
import * as ws from "../ws";

export interface PaintOpts {
  expand?: boolean;
}

export type Ports = {
  store: Pick<store.Store, "review" | "show">;
  panel: Panel;
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
    const review = this.p.store.review;
    if (!folder || !review) {
      throw new Error("нет workspace или ревью");
    }
    const expand = opts.expand === true;
    let all = review.threads;
    if (onlyUri) {
      all = review.forKey(ws.relKey(onlyUri));
      this.p.panel.dropUri(onlyUri);
    } else {
      this.p.panel.clear();
    }

    const list = all.shown(this.p.store.show);
    const count = this.p.panel.paint(list, expand);
    this.p.info(`painted ${count}`);
    return count;
  }

  repaintFile(uri: vc.Uri, expand = false): number {
    const review = this.p.store.review;
    if (!review) {
      return 0;
    }
    const all = review.forKey(ws.relKey(uri));
    const list = all.shown(this.p.store.show);
    if (!list.length) {
      this.p.panel.dropUri(uri);
      return 0;
    }
    this.p.panel.dropUri(uri);
    const count = this.p.panel.paint(list, expand);
    if (count) {
      this.p.info(`repaint ${path.basename(uri.fsPath)}: ${count}`);
    }
    return count;
  }
}
