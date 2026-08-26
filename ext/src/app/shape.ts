import * as vscode from "vscode";
import type { ThreadBundle } from "../domain/bundle";
import type { Thread } from "../domain/thread";
import type { ThreadList } from "../domain/threadList";
import type { ThreadStatus } from "../domain/types";
import type { Panel } from "../vscode/panel";
import type { Anchor } from "../domain/anchor";
import type { Data } from "./data";
import type { SaveOpts } from "./bundle/store";

/** Минимальный slice — без import ctx.ts. */
export type View = {
  data: Pick<Data, "bundle" | "show">;
  ui: { panel: Panel };
  info(msg: string): void;
  forUri(uri: vscode.Uri): ThreadList;
};

export type Refresh = {
  notify(): void;
};

export type StoreHost = {
  data: Data;
  info(msg: string): void;
};

export type PaintHost = {
  data: Pick<Data, "bundle" | "show">;
  ui: {
    panel: Panel;
    controller: vscode.CommentController;
    createController?: (v: View) => vscode.CommentController;
    anchors: Anchor;
  };
  forUri(uri: vscode.Uri): ThreadList;
  info(msg: string): void;
  ops: { store: { save(opts?: SaveOpts): void } };
};

export type ThreadHost = {
  data: Pick<Data, "bundle">;
};

export type ResolveHost = {
  data: Pick<Data, "bundle">;
  ui: { panel: Panel };
};

export type WireHost = {
  ui: { createController?: (v: View) => vscode.CommentController };
  attachRefresh(fn: () => void): void;
};

export type LoadHost = Refresh & {
  data: Pick<Data, "bundle">;
  ui: { painter: { paint(onlyUri?: vscode.Uri, opts?: { expand?: boolean }): number } };
  ops: { store: { load(fsPath: string): void } };
  decorate(editor: vscode.TextEditor): void;
};

export type BundleCmds = LoadHost & {
  data: Data;
  ui: {
    panel: Panel;
    decorator: { clearAll(): void };
    painter: { paint(onlyUri?: vscode.Uri, opts?: { expand?: boolean }): number };
    context?: vscode.ExtensionContext;
  };
  ops: {
    store: {
      load(fsPath: string): void;
      save(): void;
      clear(): void;
    };
  };
};

export type ThreadCmds = View &
  Refresh & {
    data: Data;
    ui: {
      panel: Panel;
      painter: { repaintFile(uri: vscode.Uri, expand?: boolean): number };
    };
    ops: {
      store: { save(): void };
      thread: {
        setState(data: Thread, status: ThreadStatus): void;
        delete(id: string): void;
      };
    };
    requireBundle(): ThreadBundle | undefined;
  };

export type CommentCmds = View &
  Refresh & {
    data: Data;
    ui: { panel: Panel };
    ops: {
      store: { save(): void };
      thread: {
        setState(data: Thread, status: ThreadStatus): void;
        delete(id: string): void;
      };
      comment: { delete(data: Thread, mid: string): boolean };
    };
  };

export type TrackHost = {
  data: Pick<Data, "bundle">;
  ui: { panel: Panel };
  forUri(uri: vscode.Uri): ThreadList;
  ops: { store: { save(opts?: SaveOpts): void } };
  info(msg: string): void;
};

export type UiHost = View & {
  data: Data;
};
