import * as vscode from "vscode";

export function cmd(
  id: string,
  fn: (...args: unknown[]) => unknown
): vscode.Disposable {
  return vscode.commands.registerCommand(id, fn);
}
