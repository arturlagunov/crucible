import type * as d from "./index";

export type Show = "unresolved" | "resolved" | "all";

/** Диск: *-threads.json. Вложенный review — ключ файла Crucible. */
export interface Review {
  review: { id: string; name?: string };
  base: string;
  threads: d.thread.Item[];
  count?: number;
}
