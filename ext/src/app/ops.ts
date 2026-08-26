import { BundleStore } from "./bundle/store";
import { CommentOps } from "./comment/ops";
import { ThreadOps } from "./thread/ops";
import type { StoreHost } from "./shape";

export class Ops {
  readonly store: BundleStore;
  readonly thread: ThreadOps;
  readonly comment: CommentOps;

  constructor(host: StoreHost) {
    this.store = new BundleStore(host);
    this.thread = new ThreadOps(host);
    this.comment = new CommentOps();
  }
}
