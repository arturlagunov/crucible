import * as os from "os";
import * as vc from "vscode";

export class Ui {
  static err(e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    vc.window.showErrorMessage(message);
  }

  static flash(msg: string, ms = 2000): void {
    vc.window.setStatusBarMessage(`Crucible: ${msg}`, ms);
  }

  static localAuthor(): string {
    try {
      return os.userInfo().username || "local";
    } catch {
      return "local";
    }
  }
}
