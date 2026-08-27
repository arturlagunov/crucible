import type * as d from "../../domain/d";
import type * as m from "../../domain/m";
import type * as store from "../store";

export function setStatus(
  s: store.Store,
  item: m.thread.Item,
  status: d.thread.Status
): void {
  item.status = status;
  s.save();
}

export function del(s: store.Store, item: m.thread.Item): void {
  if (!s.review?.del(item.id)) {
    throw new Error("тред не найден");
  }
  s.save();
}

export function shift(
  list: m.thread.List,
  edit: d.thread.Edit,
  lineCount: number
): boolean {
  return list.shift(edit, lineCount);
}
