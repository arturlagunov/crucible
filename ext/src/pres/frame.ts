import type { U } from "../app/di";
import type * as store from "../app/store";
import type * as v from "./v";

export type Frame = {
  u: U;
  store: store.Store;
  v: {
    panel: v.Panel;
    painter: v.Painter;
    decorator: v.Decorator;
    thread: v.Thread;
  };
  notify(): void;
};
