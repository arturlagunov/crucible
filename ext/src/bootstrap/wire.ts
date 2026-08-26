import type { View, WireHost } from "../app/shape";
import * as vscode from "vscode";

export function wire(
  host: WireHost,
  createController: (v: View) => vscode.CommentController,
  onRefresh: () => void
): void {
  host.ui.createController = createController;
  host.attachRefresh(onRefresh);
}
