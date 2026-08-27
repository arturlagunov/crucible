import type * as d from "../domain/d";
import * as m from "../domain/m";
import type * as store from "./store";
import * as u from "./u";

export type U = {
  review: {
    load(fsPath: string): void;
    save(): void;
    clear(): void;
    cycleShow(): d.Show | undefined;
    setShow(raw: unknown): d.Show;
    relocate(items: m.thread.Item[], docLines: string[]): boolean;
  };
  thread: {
    setStatus(item: m.thread.Item, status: d.thread.Status): void;
    del(item: m.thread.Item): void;
    shift(list: m.thread.List, edit: d.thread.Edit, lineCount: number): boolean;
  };
  comment: {
    reply(item: m.thread.Item, text: string, author: string): boolean;
    del(item: m.thread.Item, mid: string): void;
    link(review: m.Review, mid: string): string;
  };
};

export function bind(s: store.Store, anchors: m.Anchor): U {
  return {
    review: {
      load: (fsPath) => u.review.load(s, fsPath),
      save: () => u.review.save(s),
      clear: () => u.review.clear(s),
      cycleShow: () => u.review.cycleShow(s),
      setShow: (raw) => u.review.setShow(s, raw),
      relocate: (items, docLines) =>
        u.review.relocate(anchors, items, docLines),
    },
    thread: {
      setStatus: (item, status) => u.thread.setStatus(s, item, status),
      del: (item) => u.thread.del(s, item),
      shift: (list, edit, lineCount) => u.thread.shift(list, edit, lineCount),
    },
    comment: {
      reply: (item, text, author) =>
        u.comment.reply(s, item, text, author),
      del: (item, mid) => u.comment.del(s, item, mid),
      link: u.comment.link,
    },
  };
}
