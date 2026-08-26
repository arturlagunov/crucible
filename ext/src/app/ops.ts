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
    const painter = new Painter({
      data: host.data,
      ui: host.ui,
      forUri: (u) => host.forUri(u),
      info: (m) => host.info(m),
      ops: { store: this.store },
    });
    host.ui.painter = painter;
    this.thread = new ThreadOps({
      data: host.data,
      ui: { panel: host.ui.panel },
      notify: () => host.notify(),
      ops: { store: this.store },
    });
    this.comment = new CommentOps({
      data: host.data,
      ui: { panel: host.ui.panel },
      ops: { store: this.store, thread: this.thread },
    });
  }
}
