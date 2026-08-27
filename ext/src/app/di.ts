import type * as d from "../domain/d";
import type * as m from "../domain/m";
import type * as store from "./store";
import * as u from "./u";

/** Порты экрана. Реализацию даёт make. */
export type Ports = {
  panel: {
    touch(item: m.thread.Item, show?: d.Show): void;
    dropId(id: string): void;
    clear(): void;
  };
  painter: {
    paint(): number;
  };
  decorator: {
    clearAll(): void;
  };
  thread: {
    open(item: m.thread.Item): Promise<void>;
  };
};

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
    open(item: m.thread.Item): Promise<void>;
  };
  comment: {
    reply(item: m.thread.Item, text: string, author: string): boolean;
    del(item: m.thread.Item, mid: string): void;
    link(review: m.Review, mid: string): string;
  };
};

export function bind(
  g: { store: store.Store; v: Ports },
  review: Pick<U["review"], "forUri" | "notify">
): U {
  return {
    review: {
      load: (fsPath) => u.review.load(g.store, fsPath),
      save: () => u.review.save(g.store),
      clear: () => u.review.clear(g.store),
      cycleShow: () => u.review.cycleShow(g.store),
      forUri: review.forUri,
      notify: review.notify,
    },
    thread: {
      setStatus: (item, status) => u.thread.setStatus(g.store, item, status),
      del: (item) => u.thread.del(g.store, item),
      open: (item) => g.v.thread.open(item),
    },
    comment: {
      reply: (item, text, author) =>
        u.comment.reply(g.store, item, text, author),
      del: (item, mid) => u.comment.del(g.store, item, mid),
      link: u.comment.link,
    },
  };
}
