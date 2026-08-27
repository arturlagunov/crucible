import * as m from "../../domain/m";
import type * as store from "../store";

export function reply(
  s: store.Store,
  item: m.thread.Item,
  text: string,
  author: string
): boolean {
  const body = text.trim();
  if (!body) {
    return false;
  }
  item.msgs.push(m.comment.Item.local(body, author));
  item.status = "UNRESOLVED";
  s.save();
  return true;
}

export function del(s: store.Store, item: m.thread.Item, mid: string): void {
  const before = item.msgs.length;
  item.msgs = item.msgs.del(mid);
  if (item.msgs.length === before) {
    throw new Error(`msg ${mid} не найден`);
  }
  if (!item.msgs.length) {
    s.review?.del(item.id);
  }
  s.save();
}

export function link(review: m.Review, mid: string): string {
  return m.comment.Item.urlOf(mid, review);
}
