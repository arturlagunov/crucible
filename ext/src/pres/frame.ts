import type * as vc from "vscode";
import type { U } from "../app/di";
import type * as store from "../app/store";
import type * as m from "../domain/m";
import type * as v from "./v";

export type Frame = {
  u: U;
  store: store.Store;
  forUri(uri: vc.Uri): m.thread.List;
  v: {
    panel: v.Panel;
    painter: v.Painter;
    decorator: v.Decorator;
    thread: v.Thread;
  };
  notify(): void;
};
