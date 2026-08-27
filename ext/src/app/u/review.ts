import type * as d from "../../domain/d";
import * as store from "../store";
import * as m from "../../domain/m";

const ORDER: d.Show[] = ["unresolved", "all", "resolved"];

export function load(s: store.Store, fsPath: string): void {
  s.load(fsPath);
}

export function save(s: store.Store): void {
  s.save();
}

export function clear(s: store.Store): void {
  s.clear();
}

export function cycleShow(s: store.Store): d.Show | undefined {
  if (!s.review) {
    return undefined;
  }
  const i = Math.max(0, ORDER.indexOf(s.show));
  s.show = ORDER[(i + 1) % ORDER.length];
  return s.show;
}

export function setShow(s: store.Store, raw: unknown): d.Show {
  s.show = store.asShow(raw);
  return s.show;
}

export function relocate(
  anchors: m.Anchor,
  items: m.thread.Item[],
  docLines: string[]
): boolean {
  return anchors.locateLines(items, docLines, { miss: false });
}
