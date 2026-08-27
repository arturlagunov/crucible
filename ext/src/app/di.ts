import type * as d from "../domain/d";
import type * as m from "../domain/m";
import type * as store from "./store";
import * as u from "./u";

export type U = {
  review: {
    load(fsPath: string): void;
    save(): void;
    clear(): void;
    cycleShow(): d.Show | undefined;
    forUri(uri: { fsPath: string }): m.thread.List;
    notify(): void;
  };
  thread: {
    setStatus(item: m.thread.Item, status: d.thread.Status): void;
    del(item: m.thread.Item): void;
  };
  comment: {
    reply(item: m.thread.Item, text: string, author: string): boolean;
    del(item: m.thread.Item, mid: string): void;
    link(review: m.Review, mid: string): string;
  };
};

export function bind(
  s: store.Store,
  review: Pick<U["review"], "forUri" | "notify">
): U {
  return {
    review: {
      load: (fsPath) => u.review.load(s, fsPath),
      save: () => u.review.save(s),
      clear: () => u.review.clear(s),
      cycleShow: () => u.review.cycleShow(s),
      forUri: review.forUri,
      notify: review.notify,
    },
    thread: {
      setStatus: (item, status) => u.thread.setStatus(s, item, status),
      del: (item) => u.thread.del(s, item),
    },
    comment: {
      reply: (item, text, author) =>
        u.comment.reply(s, item, text, author),
      del: (item, mid) => u.comment.del(s, item, mid),
      link: u.comment.link,
    },
  };
}
