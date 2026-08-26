export type Span = [number, number];

/** Правка: start/end 0-based, at = start.character, ins = число новых \n. */
export type LineEdit = {
  start: number;
  end: number;
  ins: number;
  at?: number;
};

export type Show = "unresolved" | "resolved" | "all";

export type ThreadStatus = "RESOLVED" | "UNRESOLVED" | "UNKNOWN";

export interface CommentData {
  id: string;
  author?: string;
  user?: string;
  text: string;
  date?: string | number;
  status?: ThreadStatus;
  draft?: boolean;
  deleted?: boolean;
}

export interface ThreadAnchor {
  lines: string[];
}

export interface ThreadData {
  id: string;
  ws: string;
  span: Span;
  msgs: CommentData[];
  anchor?: ThreadAnchor;
  miss?: boolean;
  status?: ThreadStatus;
  item?: string;
  path?: string;
  repo?: string;
}

export interface Bundle {
  review: { id: string; name?: string };
  base: string;
  threads: ThreadData[];
  count?: number;
}
