import * as vscode from "vscode";
import type { CommentHost } from "../shape";

export class CommentOps {
  constructor(private host: CommentHost) {}

  delete(ct: vscode.CommentThread, mid: string): void {
    const live = this.host.ui.panel.liveOf(ct) || ct;
    const data = this.host.ui.panel.dataOf(live);
    if (!data || !this.host.data.bundle) {
      throw new Error("тред не найден");
    }
    const before = data.msgs.length;
    data.msgs = data.msgs.del(mid);
    if (data.msgs.length === before) {
      throw new Error(`msg ${mid} не найден`);
    }
    if (!data.msgs.length) {
      this.host.ops.thread.delete(live);
      return;
    }
    this.host.ui.panel.rebuildComments(live, data);
    this.host.ops.store.save();
  }
}
