import type * as d from "../../domain/d";
import type * as m from "../../domain/m";
import type { Ctx } from "../di";

export function setStatus(
  s: Ctx,
  item: m.thread.Item,
  status: d.thread.Status
): void {
  item.status = status;
  s.panel.touch(item, s.store.show);
  s.u.review.save();
}

export async function open(s: Ctx, item: m.thread.Item): Promise<void> {
  await s.thread.open(item);
}

export function del(s: Ctx, item: m.thread.Item): void {
  if (!s.store.review?.del(item.id)) {
    throw new Error("тред не найден");
  }
  s.panel.dropId(item.id);
  s.u.review.save();
}
