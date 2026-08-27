import type * as d from "../domain/d";
import type * as m from "../domain/m";
import type { Ctx, Ports } from "./ctx";
import * as u from "./u";

export type { Ports };

export type U = {
  notify(): void;
  review: {
    load(fsPath: string): number;
    save(): void;
    clear(): void;
    cycleShow(): d.Show | undefined;
    forUri(uri: { fsPath: string }): m.thread.List;
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

export function bind(ctx: Ctx): U {
  return {
    notify: () => ctx.notify(),
    review: {
      load: (fsPath) => u.review.load(ctx, fsPath),
      save: () => u.review.save(ctx),
      clear: () => u.review.clear(ctx),
      cycleShow: () => u.review.cycleShow(ctx),
      forUri: (uri) => u.review.forUri(ctx, uri),
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
}
