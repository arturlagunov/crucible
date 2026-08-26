import { BundleStore } from "./bundle/store";
import { CommentOps } from "./comment/ops";
import { ThreadOps } from "./thread/ops";
import type { OpsSeed } from "./shape";
import { Painter } from "../vscode/painter";

export class Ops {
  readonly store: BundleStore;
  readonly thread: ThreadOps;
  readonly comment: CommentOps;

  constructor(host: OpsSeed) {
    this.store = new BundleStore(host);
    const painter = new Painter({ ...host, ops: { store: this.store } });
    host.ui.painter = painter;
    this.thread = new ThreadOps({
      ...host,
      ui: { panel: host.ui.panel },
      ops: { store: this.store },
    });
    this.comment = new CommentOps({
      ...host,
      ops: { store: this.store, thread: this.thread },
    });
  }
}
