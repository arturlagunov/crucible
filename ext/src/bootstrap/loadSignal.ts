import * as fs from "fs";
import * as vscode from "vscode";
import { Paths } from "../infra/paths";
import type { LoadHost } from "../app/shape";

export class LoadSignal {
  static async apply(host: LoadHost, fsPath: string): Promise<void> {
    host.ops.store.load(fsPath);
    const n = host.ui.painter.paint(undefined, { expand: true });
    const top = host.data.bundle!.busiest();
    if (top) {
      const fp = Paths.wsFsPath(top.key);
      if (fp) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fp));
        const ed = await vscode.window.showTextDocument(doc, { preview: false });
        const line = top.first.lines[0] - 1;
        ed.selection = new vscode.Selection(line, 0, line, 0);
        ed.revealRange(new vscode.Range(line, 0, line, 0));
        host.decorate(ed);
      }
    }
    host.notify();
    vscode.window.showInformationMessage(
      `Crucible: ${host.data.bundle!.review.id} — ${n} тредов`
    );
  }

  static async consume(host: LoadHost): Promise<void> {
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
      await LoadSignal.apply(host, String(body.file));
    }
  }
}
