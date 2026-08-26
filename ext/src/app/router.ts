import * as vscode from "vscode";
import { BundleCmd } from "./bundle/cmd";
import { CommentCmd } from "./comment/cmd";
import type { BundleCmds, CommentCmds, ThreadCmds } from "./shape";
import { ThreadCmd } from "./thread/cmd";

export class Router {
  constructor(host: BundleCmds & ThreadCmds & CommentCmds) {
    this.bundle = new BundleCmd(host);
    this.thread = new ThreadCmd(host);
    this.comment = new CommentCmd(host);
  }

  private bundle: BundleCmd;
  private thread: ThreadCmd;
  private comment: CommentCmd;

  bind(_context: vscode.ExtensionContext): vscode.Disposable[] {
    return [...this.bundle.bind(), ...this.thread.bind(), ...this.comment.bind()];
  }
}
