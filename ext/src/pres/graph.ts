import type * as vc from "vscode";
import type { U } from "../app/di";
import type * as store from "../app/store";
import type * as v from "./v";

export type Graph = {
  u: U;
  store: store.Store;
  v: {
    panel: v.Panel;
    painter: v.Painter;
    decorator: v.Decorator;
    thread: v.Thread;
    controller: vc.CommentController;
  };
};
