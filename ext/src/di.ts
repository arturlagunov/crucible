import * as vc from "vscode";
import * as m from "./domain/m";
import * as v from "./pres/v";
import { bind, type U } from "./app/di";
import * as store from "./app/store";
import { forUri as lookup } from "./pres/lookup";
import { EditTracker } from "./pres/editTracker";

export type Graph = {
  u: U;
  store: store.Store;
  v: {
    panel: v.Panel;
    painter: v.Painter;
    decorator: v.Decorator;
    thread: v.Thread;
    controller: vc.CommentController;
    lens: v.LensHandle;
  };
  tracker: EditTracker;
  forUri(uri: vc.Uri): m.thread.List;
  notify(): void;
};

export function make(p: {
  info(msg: string): void;
  refresh(): void;
}): Graph {
  const info = p.info;
  const g = { store: store.Store.for(info) };
  const anchors = new m.Anchor(info);
  const notify = () => p.refresh();
  const forUri = (uri: vc.Uri) => lookup(g.store, uri);

  let controller!: vc.CommentController;
  const panel = v.Panel.for(
    () => controller,
    (id) => g.store.review?.threads.find((t) => t.id === id),
    info
  );
  controller = v.Controller.for({ store: g.store, forUri });

  const decorator = v.Decorator.for(panel, g.store);
  const painter = v.Painter.for({
    store: g.store,
    panel,
    forUri,
    info,
  });
  const thread = v.Thread.for({ store: g.store, panel, painter, notify });
  const u = bind(g.store, anchors);
  const lens = v.Lens.for({ store: g.store, forUri });
  const tracker = EditTracker.for({
    store: g.store,
    panel,
    forUri,
    shift: (list, edit, n) => u.thread.shift(list, edit, n),
    save: () => u.review.save(),
    info,
  });

  return {
    u,
    store: g.store,
    v: { panel, painter, decorator, thread, controller, lens },
    tracker,
    forUri,
    notify,
  };
}
