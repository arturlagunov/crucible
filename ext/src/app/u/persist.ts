import type { Ctx } from "../ctx";

/** Disk + gutter/lens. Кидает — UI снаружи. */
export function persist(s: Ctx): void {
  s.store.save();
  s.notify();
}
