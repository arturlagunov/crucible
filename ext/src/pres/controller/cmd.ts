import * as vc from "vscode";

export function cmd(
  id: string,
  fn: (...args: unknown[]) => unknown
): vc.Disposable {
  return vc.commands.registerCommand(id, fn);
}
