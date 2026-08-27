import type * as d from "../../domain/d";
import type * as store from "../store";

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
