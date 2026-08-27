import * as vc from "vscode";
import type * as store from "../../app/store";
import type * as m from "../../domain/m";
import { Span } from "./span";

export type Ports = {
  store: Pick<store.Store, "review" | "show">;
  forUri(uri: vc.Uri): m.thread.List;
};

export class Controller {
  static for(p: Ports): vc.CommentController {
    const controller = vc.comments.createCommentController("cru", "Crucible");
    controller.options = { placeHolder: "Ответ в тред…", prompt: "Reply" };
    controller.commentingRangeProvider = {
      provideCommentingRanges(document) {
        if (!p.store.review) {
          return [];
        }
        return p.forUri(document.uri).shown(p.store.show).map((th: m.thread.Item) =>
          Span.line(th, document)
        );
      },
    };
    return controller;
  }
}
