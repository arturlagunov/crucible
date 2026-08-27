import type * as d from "./index";

export type Span = [number, number];

/** Правка: start/end 0-based, at = start.character, ins = число новых \n. */
export type Edit = {
  start: number;
  end: number;
  ins: number;
  at?: number;
};

export type Status = "RESOLVED" | "UNRESOLVED" | "UNKNOWN";

export interface Anchor {
  lines: string[];
}

export interface Item {
  id: string;
  ws: string;
  span: Span;
  msgs: d.Comment[];
  anchor?: Anchor;
  miss?: boolean;
  status?: Status;
  item?: string;
  path?: string;
  repo?: string;
}
