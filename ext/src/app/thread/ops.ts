import * as vscode from "vscode";
import type { ThreadStatus } from "../../domain/types";
import { toComments } from "../../vscode/commentView";
import type { ThreadHost } from "../shape";

export class ThreadOps {
  constructor(private host: ThreadHost) {}

  setState(ct: vscode.CommentThread, status: ThreadStatus): vscode.CommentThread {
    const live = this.host.ui.panel.liveOf(ct) || ct;
    const data = this.host.ui.panel.dataOf(live);
    const tid = data?.id || this.host.ui.panel.threadId(live);
    this.host.ui.panel.setUi(live, status, tid);
    if (!data) {
      return live;
    }
    data.msgs.setStatus(status);
    live.comments = toComments(data);
    return live;
  }

  delete(ct: vscode.CommentThread): void {
    const id = this.host.ui.panel.threadId(ct);
    const live = this.host.ui.panel.liveOf(ct);
    if (!id || !this.host.data.bundle) {
      throw new Error("тред не найден");
    }
    if (!this.host.data.bundle.del(id)) {
      throw new Error("тред не найден");
    }
    this.host.ui.panel.dropId(id);
    (live || ct).dispose();
    this.host.ops.store.save();
  }
}
