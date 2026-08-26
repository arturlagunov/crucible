import * as fs from "fs";
import * as vscode from "vscode";
import { Paths } from "./lib/paths";
import type { Session } from "./session";

export class LoadSignal {
  static async apply(
    session: Session,
    fsPath: string,
    refresh: () => void
  ): Promise<void> {
    const n = session.loadAndPaint(fsPath);
    const top = session.index.busiest();
    if (top) {
      const fp = Paths.wsFsPath(top.key);
      if (fp) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fp));
        const ed = await vscode.window.showTextDocument(doc, { preview: false });
        const line = top.first.lines[0] - 1;
        ed.selection = new vscode.Selection(line, 0, line, 0);
        ed.revealRange(new vscode.Range(line, 0, line, 0));
        session.decorate(ed);
      }
    }
    refresh();
    vscode.window.showInformationMessage(
      `Crucible: ${session.bundle!.review.id} — ${n} тредов`
    );
  }

  static async consume(session: Session, refresh: () => void): Promise<void> {
    const p = Paths.reqPath();
    if (!p || !fs.existsSync(p)) {
      return;
    }
    let body: { file?: string };
    try {
      body = JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      return;
    }
    try {
      fs.unlinkSync(p);
    } catch {
      /* */
    }
    if (body.file) {
      await LoadSignal.apply(session, String(body.file), refresh);
    }
  }
}
