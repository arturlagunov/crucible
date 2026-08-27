import * as vc from "vscode";
import { Paths } from "../infra/paths";
import type { Graph } from "./di";

/** u.review.load + открыть самый жирный файл. */
export class LoadSignal {
  static async apply(g: Graph, fsPath: string): Promise<void> {
    const { u } = g;
    const n = u.review.load(fsPath);
    await reveal(g, n);
  }
}

async function reveal(g: Graph, n: number): Promise<void> {
  const top = g.store.review!.busiest();
  if (top) {
    const fp = Paths.wsFsPath(top.key);
    if (fp) {
      const doc = await vc.workspace.openTextDocument(vc.Uri.file(fp));
      const ed = await vc.window.showTextDocument(doc, { preview: false });
      const line = top.first.lines[0] - 1;
      ed.selection = new vc.Selection(line, 0, line, 0);
      ed.revealRange(new vc.Range(line, 0, line, 0));
      g.v.decorator.decorate(ed);
    }
  }
  g.u.notify();
  vc.window.showInformationMessage(
    `Crucible: ${g.store.review!.id} — ${n} тредов`
  );
}
