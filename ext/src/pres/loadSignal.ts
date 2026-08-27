import * as vc from "vscode";
import * as ws from "./ws";
import type { Frame } from "./frame";
import { locate } from "./locate";
import { consume } from "../infra/loadReq";
import { POLL_MS } from "../infra/constants";

/** u.review.load + открыть самый жирный файл. */
export class LoadSignal {
  static async apply(g: Frame, fsPath: string): Promise<void> {
    g.u.review.load(fsPath);
    if (locate(g)) {
      g.u.review.save();
    }
    const n = g.v.painter.paint();
    await reveal(g, n);
  }

  static watch(g: Frame): vc.Disposable {
    const tick = () => {
      const file = consume(vc.workspace.workspaceFolders?.[0]?.uri.fsPath);
      if (file) {
        void LoadSignal.apply(g, file);
      }
    };
    const id = setInterval(tick, POLL_MS);
    tick();
    return { dispose: () => clearInterval(id) };
  }
}

async function reveal(g: Frame, n: number): Promise<void> {
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
  g.notify();
  vc.window.showInformationMessage(
    `Crucible: ${g.store.review!.id} — ${n} тредов`
  );
}
