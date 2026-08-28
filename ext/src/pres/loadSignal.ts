import * as vc from "vscode";
import * as ws from "./ws";
import * as v from "./v";
import type { Frame } from "./frame";
import { locate } from "./locate";
import { consume } from "../infra/loadReq";
import { POLL_MS } from "../infra/constants";

/** u.review.load + открыть самый жирный файл. */
export class LoadSignal {
  static async apply(g: Frame, fsPath: string): Promise<void> {
    try {
      g.u.review.load(fsPath);
      if (locate(g)) {
        try {
          g.u.review.save();
        } catch (e) {
          v.Ui.err(e);
        }
      }
      const n = g.v.painter.paint();
      await reveal(g, n);
    } catch (e) {
      v.Ui.err(e);
    }
  }

  static watch(g: Frame): vc.Disposable {
    const tick = () => {
      try {
        const file = consume(vc.workspace.workspaceFolders?.[0]?.uri.fsPath);
        if (file) {
          void LoadSignal.apply(g, file);
        }
      } catch (e) {
        v.Ui.err(e);
      }
    };
    const id = setInterval(tick, POLL_MS);
    tick();
    return { dispose: () => clearInterval(id) };
  }
}

async function reveal(g: Frame, n: number): Promise<void> {
  const review = g.store.review;
  if (!review) {
    return;
  }
  try {
    const top = review.busiest();
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
  } catch (e) {
    v.Ui.err(e);
  }
  g.v.notify();
  vc.window.showInformationMessage(`Crucible: ${review.id} — ${n} тредов`);
}
