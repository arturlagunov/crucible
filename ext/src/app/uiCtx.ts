import * as vscode from "vscode";
import { Anchor } from "../domain/anchor";
import { Decorator } from "../vscode/decorator";
import { Panel } from "../vscode/panel";
import type { Painter } from "../vscode/painter";
import type { UiHost, View } from "./shape";

/** VS Code shell: panel, controller, decorations, painter. */
export class UiCtx {
  controller!: vscode.CommentController;
  painter!: Painter;
  readonly panel: Panel;
  readonly decorator: Decorator;
  readonly log: vscode.OutputChannel;
  readonly anchors: Anchor;
  context: vscode.ExtensionContext | undefined;
  createController?: (v: View) => vscode.CommentController;

  constructor(private host: UiHost) {
    this.anchors = new Anchor((m) => host.info(m));
    this.decorator = new Decorator(host);
    this.log = vscode.window.createOutputChannel("Crucible");
    this.panel = new Panel(
      () => this.controller,
      (id) => this.host.data.bundle?.threads.find((t) => t.id === id),
      (m) => host.info(m)
    );
  }
}
