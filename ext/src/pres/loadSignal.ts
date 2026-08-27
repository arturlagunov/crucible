import * as vc from "vscode";
import * as ws from "./ws";
import type { Graph } from "./graph";

/** u.review.load + открыть самый жирный файл. */
export class LoadSignal {
  static async apply(g: Graph, fsPath: string): Promise<void> {
    g.u.review.load(fsPath);
    const { count, dirty } = g.v.painter.paint();
    if (dirty) {
      g.u.review.save();
    }
    await reveal(g, count);
  }
}

async function reveal(g: Graph, n: number): Promise<void> {
  const top = g.store.review!.busiest();
  if (top) {
    const fp = ws.fsPath(top.key);
    if (fp) {
      const doc = await vc.workspace.openTextDocument(vc.Uri.file(fp));
      const ed = await vc.window.showTextDocument(doc, { preview: false });
      const line = top.first.lines[0] - 1;
      ed.selection = new vc.Selection(line, 0, line, 0);
      ed.revealRange(new vc.Range(line, 0, line, 0));
      g.v.decorator.decorate(ed);
    }
  }
  g.u.review.notify();
  vc.window.showInformationMessage(
    `Crucible: ${g.store.review!.id} — ${n} тредов`
  );
}
