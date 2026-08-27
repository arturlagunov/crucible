import type * as d from "./index";

export interface Comment {
  id: string;
  author?: string;
  user?: string;
  text: string;
  date?: string | number;
  status?: d.thread.Status;
  draft?: boolean;
  deleted?: boolean;
}
