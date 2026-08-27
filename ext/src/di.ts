import * as vc from "vscode";
import * as m from "./domain/m";
import * as v from "./pres/v";
import { bind } from "./app/di";
import * as store from "./app/store";
import { forUri as lookup } from "./pres/lookup";
import { EditTracker } from "./pres/editTracker";
import { Router } from "./pres/controller/router";
import type { Frame } from "./pres/frame";

export type Graph = Frame & {
  v: Frame["v"] & {
    lens: v.LensHandle;
    status: v.Status;
  };
  tracker: EditTracker;
  router: Router;
};

export function make(p: {
  info(msg: string): void;
  context: vc.ExtensionContext;
}): Graph {
  const info = p.info;
  const g = { store: store.Store.for(info) };
  const anchors = new m.Anchor(info);
  const forUri = (uri: vc.Uri) => lookup(g.store, uri);

  const panel = v.Panel.for({
    store: g.store,
    forUri,
    find: (id) => g.store.review?.threads.find((t) => t.id === id),
    info,
  });
  const decorator = v.Decorator.for(panel, g.store);
  const painter = v.Painter.for({
    store: g.store,
    panel,
    forUri,
    info,
  });
  const u = bind(g.store, anchors);
  u.review.setShow(p.context.workspaceState.get("cru.show"));
  const lens = v.Lens.for({ store: g.store, forUri });
  const tracker = EditTracker.for({
    store: g.store,
    panel,
    forUri,
    shift: (list, edit, n) => u.thread.shift(list, edit, n),
    save: () => u.review.save(),
    info,
  });

  const status = v.Status.for({ store: g.store, panel });
  const notify = () => {
    decorator.refreshAll();
    lens.refresh();
    status.paint();
  };
  const thread = v.Thread.for({ store: g.store, panel, painter, notify });
  const frame: Frame = {
    u,
    store: g.store,
    v: { panel, painter, decorator, thread },
    forUri,
    notify,
  };
  const router = new Router(frame, p.context, info);

  return {
    ...frame,
    v: { panel, painter, decorator, thread, lens, status },
    tracker,
    router,
  };
}
