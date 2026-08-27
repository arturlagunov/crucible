import type * as d from "../../domain/d";
import type * as m from "../../domain/m";
import { persist } from "./persist";
import type { Ctx } from "../ctx";

const ORDER: d.Show[] = ["unresolved", "all", "resolved"];

export function load(s: Ctx, fsPath: string): number {
  s.store.load(fsPath);
  return s.painter.paint();
}

export function save(s: Ctx): void {
  persist(s);
}

export function clear(s: Ctx): void {
  s.store.clear();
  s.panel.clear();
  s.decorator.clearAll();
  s.notify();
}

export function cycleShow(s: Ctx): d.Show | undefined {
  if (!s.store.review) {
    return undefined;
  }
  const i = Math.max(0, ORDER.indexOf(s.store.show));
  s.store.show = ORDER[(i + 1) % ORDER.length];
  s.painter.paint();
  s.notify();
  return s.store.show;
}

export function forUri(s: Ctx, uri: { fsPath: string }): m.thread.List {
  return s.forUri(uri);
}
