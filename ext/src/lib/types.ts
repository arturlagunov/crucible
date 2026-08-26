import * as vscode from "vscode";

export type Span = [number, number];

export type ThreadStatus = "RESOLVED" | "UNRESOLVED" | "UNKNOWN";

export interface CommentData {
  id: string;
  author?: string;
  user?: string;
  text: string;
  date?: string | number;
  status?: ThreadStatus | string;
  draft?: boolean;
  deleted?: boolean;
}

/** @deprecated JSON alias */
export type Msg = CommentData;

export interface ThreadAnchor {
  lines: string[];
}

export interface ThreadData {
  id: string;
  ws: string;
  span: Span;
  status: ThreadStatus | string;
  msgs: CommentData[];
  anchor?: ThreadAnchor;
  anchorMiss?: boolean;
}

export interface Bundle {
  review: { id: string; name?: string };
  base: string;
  threads: ThreadData[];
  count?: number;
}

export interface CrucibleComment extends vscode.Comment {
  msgId?: string;
}
