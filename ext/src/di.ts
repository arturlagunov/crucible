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
    controller: vc.CommentController;
    lens: v.LensHandle;
  };
  tracker: EditTracker;
  router: Router;
  status: vc.StatusBarItem;
};

export function make(p: {
  info(msg: string): void;
  context: vc.ExtensionContext;
}): Graph {
  const info = p.info;
  const g = { store: store.Store.for(info) };
  const anchors = new m.Anchor(info);
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

  const status = vc.window.createStatusBarItem(
    vc.StatusBarAlignment.Right,
    100
  );
  status.command = "cru.show";
  status.tooltip = "клик: unresolved → all → resolved";

  const notify = () => {
    decorator.refreshAll();
    lens.refresh();
    paintStatus(status, g.store, panel);
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
    v: { panel, painter, decorator, thread, controller, lens },
    tracker,
    router,
    status,
  };
}

function paintStatus(
  status: vc.StatusBarItem,
  s: store.Store,
  panel: v.Panel
): void {
  if (!s.review) {
    status.text = "$(comment-discussion) Crucible: idle";
    status.show();
    return;
  }
  const show = s.show;
  const n = panel.threads.length;
  const total = s.review.threads.length;
  const icon = show === "resolved" ? "$(check)" : "$(comment-discussion)";
  status.text = `${icon} ${s.review.id}: ${n}/${total} ${show}`;
  status.show();
}
