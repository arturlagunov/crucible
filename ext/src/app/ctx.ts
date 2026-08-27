import type * as d from "../domain/d";
import type * as m from "../domain/m";
import type * as store from "./store";

/** Порты экрана. Реализацию даёт pres/di. */
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
  forUri(uri: { fsPath: string }): m.thread.List;
  notify(): void;
};

/** Замыкание сценариев. Снаружи не таскаем. */
export type Ctx = {
  store: store.Store;
} & Ports;
