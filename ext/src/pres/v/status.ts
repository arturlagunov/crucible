import * as vc from "vscode";
import type * as store from "../../app/store";
import type { Panel } from "./panel";

export type Ports = {
  store: Pick<store.Store, "review" | "show">;
  panel: Panel;
};

/** Persistent status bar: review id + filter. */
export class Status {
  readonly item: vc.StatusBarItem;

  constructor(private p: Ports) {
    const item = vc.window.createStatusBarItem(
      vc.StatusBarAlignment.Right,
      100
    );
    item.command = "cru.show";
    item.tooltip = "клик: unresolved → all → resolved";
    this.item = item;
    this.paint();
  }

  static for(p: Ports): Status {
    return new Status(p);
  }

  dispose(): void {
    this.item.dispose();
  }

  paint(): void {
    const s = this.p.store;
    if (!s.review) {
      this.item.text = "$(comment-discussion) Crucible: idle";
      this.item.show();
      return;
    }
    const show = s.show;
    const n = this.p.panel.threads.length;
    const total = s.review.threads.length;
    const icon = show === "resolved" ? "$(check)" : "$(comment-discussion)";
    this.item.text = `${icon} ${s.review.id}: ${n}/${total} ${show}`;
    this.item.show();
  }
}
