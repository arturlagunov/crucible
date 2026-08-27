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

/** DI. Снаружи не таскаем. */
export type Ctx = {
  store: store.Store;
  lookup(uri: { fsPath: string }): m.thread.List;
  refresh(): void;
  u: U;
} & Ports;

export type U = {
  review: {
    load(fsPath: string): number;
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
    reply(item: m.thread.Item, text: string, author: string): void;
    del(item: m.thread.Item, mid: string): void;
    link(review: m.Review, mid: string): string;
  };
};

export function bind(ports: Omit<Ctx, "u">): U {
  const ctx = ports as Ctx;
  const bound: U = {
    review: {
      load: (fsPath) => u.review.load(ctx, fsPath),
      save: () => u.review.save(ctx),
      clear: () => u.review.clear(ctx),
      cycleShow: () => u.review.cycleShow(ctx),
      forUri: (uri) => u.review.forUri(ctx, uri),
      notify: () => u.review.notify(ctx),
    },
    thread: {
      setStatus: (item, status) => u.thread.setStatus(ctx, item, status),
      del: (item) => u.thread.del(ctx, item),
      open: (item) => u.thread.open(ctx, item),
    },
    comment: {
      reply: (item, text, author) => u.comment.reply(ctx, item, text, author),
      del: (item, mid) => u.comment.del(ctx, item, mid),
      link: u.comment.link,
    },
  };
  ctx.u = bound;
  return bound;
}
