import * as vc from "vscode";
import * as m from "./domain/m";
import * as v from "./pres/v";
import { bind, type U } from "./app/di";
import type * as store from "./app/store";
import { Store } from "./app/store";
import { forUri as lookup } from "./pres/lookup";

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

export function make(p: {
  info(msg: string): void;
  refresh(): void;
}): Graph {
  const info = p.info;
  const store = Store.for(info);
  const anchors = new m.Anchor(info);
  const notify = () => p.refresh();

  let controller!: vc.CommentController;
  const panel = v.Panel.for(
    () => controller,
    (id) => store.review?.threads.find((t) => t.id === id),
    info
  );
  const forUri = (uri: vc.Uri) => lookup(store, uri);
  controller = v.Controller.for({ store, forUri });

  const decorator = v.Decorator.for(panel, store);
  const painter = v.Painter.for({
    store,
    panel,
    anchors,
    forUri,
    info,
  });
  const thread = v.Thread.for({ store, panel, painter, notify });

  const u = bind({
    store,
    panel,
    painter,
    decorator,
    thread,
    lookup: forUri,
    refresh: notify,
  });

  return {
    u,
    store,
    v: { panel, painter, decorator, thread, controller },
  };
}
