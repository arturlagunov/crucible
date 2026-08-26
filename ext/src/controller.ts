import * as vscode from "vscode";
import type { SessionView } from "./lib/sessionView";
import type { Thread } from "./lib/thread";

export class Controller {
  static for(view: SessionView): vscode.CommentController {
    const controller = vscode.comments.createCommentController("cru", "Crucible");
    controller.options = { placeHolder: "Ответ в тред…", prompt: "Reply" };
    controller.commentingRangeProvider = {
      provideCommentingRanges(document) {
        if (!view.bundle) {
          return [];
        }
        return view.forUri(document.uri).map((th: Thread) => th.range(document));
      },
    };
    return controller;
  }
}
