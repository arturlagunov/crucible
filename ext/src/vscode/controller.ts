import * as vscode from "vscode";
import type { View } from "../app/shape";
import type { Thread } from "../domain/thread";
import { threadRange } from "./span";

export class Controller {
  static for(view: View): vscode.CommentController {
    const controller = vscode.comments.createCommentController("cru", "Crucible");
    controller.options = { placeHolder: "Ответ в тред…", prompt: "Reply" };
    controller.commentingRangeProvider = {
      provideCommentingRanges(document) {
        if (!view.data.bundle) {
          return [];
        }
        return view.forUri(document.uri).shown(view.data.show).map((th: Thread) =>
          threadRange(th, document)
        );
      },
    };
    return controller;
  }
}
