import * as vc from "vscode";
import * as m from "./domain/m";
import * as v from "./pres/v";
import { bind } from "./app/di";
import * as store from "./app/store";
import { forUri as lookup } from "./pres/lookup";
import type { Graph } from "./pres/graph";

export type { Graph };

export function make(p: {
  info(msg: string): void;
  refresh(): void;
}): Graph {
  const info = p.info;
  const g = {
    store: store.Store.for(info),
  } as Graph;
  const anchors = new m.Anchor(info);
  const notify = () => p.refresh();

  let controller!: vc.CommentController;
  const panel = v.Panel.for(
    () => controller,
    (id) => g.store.review?.threads.find((t) => t.id === id),
    info
  );
  const forUri = (uri: vc.Uri) => lookup(g.store, uri);
  controller = v.Controller.for({ store: g.store, forUri });

  const decorator = v.Decorator.for(panel, g.store);
  const painter = v.Painter.for({
    store: g.store,
    panel,
    anchors,
    forUri,
    info,
  });
  const thread = v.Thread.for({ store: g.store, panel, painter, notify });

  g.u = bind(g.store, { forUri, notify });
  g.v = { panel, painter, decorator, thread, controller };
  return g;
}
