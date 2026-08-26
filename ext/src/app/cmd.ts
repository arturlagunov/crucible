import * as vscode from "vscode";
import { Ui } from "../vscode/ui";

export function cmd(
  id: string,
  fn: (...args: unknown[]) => unknown
): vscode.Disposable {
  return vscode.commands.registerCommand(id, fn);
}

/** Disk + notify + optional flash. Ошибка — в UI, без notify. */
export function commit(
  host: { ops: { store: { save(): void } }; notify(): void },
  flash?: string
): boolean {
  try {
    host.ops.store.save();
  } catch (e) {
    Ui.err(e);
    return false;
  }
  host.notify();
  if (flash) {
    Ui.flash(flash);
  }
  return true;
}
