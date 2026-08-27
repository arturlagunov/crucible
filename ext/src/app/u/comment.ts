import * as m from "../../domain/m";
import type { Ctx } from "../di";

export function reply(
  s: Ctx,
  item: m.thread.Item,
  text: string,
  author: string
): void {
  const body = text.trim();
  if (!body) {
    return;
  }
  item.msgs.push(m.comment.Item.local(body, author));
  item.status = "UNRESOLVED";
  s.panel.touch(item, s.store.show);
  s.u.review.save();
}

export function del(s: Ctx, item: m.thread.Item, mid: string): void {
  const before = item.msgs.length;
  item.msgs = item.msgs.del(mid);
  if (item.msgs.length === before) {
    throw new Error(`msg ${mid} не найден`);
  }
  if (!item.msgs.length) {
    s.store.review?.del(item.id);
    s.panel.dropId(item.id);
  } else {
    s.panel.touch(item);
  }
  s.u.review.save();
}

export function link(review: m.Review, mid: string): string {
  return m.comment.Item.urlOf(mid, review);
}
