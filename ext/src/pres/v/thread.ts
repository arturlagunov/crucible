import * as vc from "vscode";
import type * as m from "../../domain/m";
import type * as store from "../../app/store";
import { Paths } from "../../infra/paths";
import { Panel } from "./panel";
import { Painter } from "./painter";
import { Ui } from "./ui";

export type Ports = {
  store: Pick<store.Store, "review">;
  panel: Panel;
  painter: Painter;
  notify(): void;
};

/** Comments panel XOR markdown preview. */
export class Thread {
  constructor(private p: Ports) {}

  static for(p: Ports): Thread {
    return new Thread(p);
  }

  async open(item: m.thread.Item): Promise<void> {
    const fp = Paths.wsFsPath(item.ws);
    const uri = fp ? vc.Uri.file(fp) : undefined;
    let ct = this.p.panel.liveOf(item.id);
    if (!ct && uri) {
      this.p.painter.repaintFile(uri, true);
      this.p.notify();
      ct = this.p.panel.liveOf(item.id);
    }
    if (ct) {
      this.p.panel.sync(ct, item);
      this.p.panel.expand(item.id);
      await Thread.focus();
      Ui.flash(`тред ${item.id}`, 1500);
      return;
    }
    const md = await vc.workspace.openTextDocument({
      content: item.toMarkdown(this.p.store.review),
      language: "markdown",
    });
    await vc.window.showTextDocument(md, {
      preview: true,
      preserveFocus: false,
    });
    Ui.flash(`тред ${item.id}`, 1500);
  }

  private static async focus(): Promise<void> {
    for (const id of [
      "workbench.action.focusCommentsView",
      "workbench.panel.comments.focus",
    ]) {
      try {
        await vc.commands.executeCommand(id);
        return;
      } catch {
        /* */
      }
    }
  }
}
