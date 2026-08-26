import * as path from "path";
import * as vscode from "vscode";
import { CommentList } from "./lib/commentList";
import { ThreadBundle } from "./lib/bundle";
import { Anchor } from "./lib/anchor";
import { Decorator } from "./lib/decorator";
import { Panel } from "./lib/panel";
import { ThreadIndex } from "./lib/threadIndex";
import { ThreadList } from "./lib/threadList";
import type { SessionView } from "./lib/sessionView";
import { Ui } from "./lib/ui";
import type { Thread } from "./lib/thread";
import type { CrucibleComment, ThreadStatus } from "./lib/types";

const STATE = vscode.CommentThreadState;

export interface PaintOptions {
  expand?: boolean;
}

export interface SaveOptions {
  quiet?: boolean;
}

export class Session implements SessionView {
  controller!: vscode.CommentController;
  bundle: ThreadBundle | undefined;
  jsonPath: string | undefined;
  index = new ThreadIndex();
  anchors: Anchor;
  decorator: Decorator;
  panel: Panel;
  log: vscode.OutputChannel;
  context: vscode.ExtensionContext | undefined;
  private createController: ((session: Session) => vscode.CommentController) | undefined;
  private onRefresh: (() => void) | undefined;

  constructor(controller?: vscode.CommentController) {
    if (controller) {
      this.controller = controller;
    }
    this.anchors = new Anchor((m) => this.info(m));
    this.decorator = new Decorator(this);
    this.log = vscode.window.createOutputChannel("Crucible");
    this.panel = new Panel(
      () => this.controller,
      (id) => this.bundle?.threads.find((t) => t.id === id),
      (m) => this.info(m)
    );
  }

  wire(
    createController: (session: Session) => vscode.CommentController,
    onRefresh: () => void
  ): void {
    this.createController = createController;
    this.onRefresh = onRefresh;
  }

  forUri(uri: vscode.Uri): ThreadList {
    return this.index.forUri(uri);
  }

  info(msg: string): void {
    this.log.appendLine(`[${new Date().toISOString()}] ${msg}`);
  }

  requireBundle(): ThreadBundle | undefined {
    if (!this.bundle) {
      vscode.window.showWarningMessage("Сначала make load");
      return undefined;
    }
    return this.bundle;
  }

  resolve(
    a: unknown,
    b?: unknown
  ): { thread: vscode.CommentThread; comment?: CrucibleComment; data: Thread } | undefined {
    if (!this.bundle) {
      return undefined;
    }
    const { thread, comment } = CommentList.unpack(a, b, this.panel.threads);
    const data = thread ? this.panel.dataOf(thread) : undefined;
    if (!thread || !data) {
      Ui.err("тред не найден");
      return undefined;
    }
    return { thread, comment, data };
  }

  load(jsonUri: string | vscode.Uri): void {
    const fsPath = typeof jsonUri === "string" ? jsonUri : jsonUri.fsPath;
    const { bundle, total } = ThreadBundle.read(fsPath);
    this.bundle = bundle;
    this.jsonPath = fsPath;
    this.index.reindex(this.bundle);
    this.info(
      `loaded ${fsPath}: ${this.bundle.threads.length}/${total} threads (unresolved only)`
    );
  }

  loadAndPaint(fsPath: string, opts: PaintOptions = {}): number {
    this.load(fsPath);
    return this.paint(undefined, { expand: true, ...opts });
  }

  reset(): void {
    this.panel.clear();
    this.bundle = undefined;
    this.jsonPath = undefined;
    this.index.clear();
    this.decorator.clearAll();
  }

  setState(ct: vscode.CommentThread, status: ThreadStatus | string): vscode.CommentThread {
    const live = this.panel.liveOf(ct) || ct;
    const data = this.panel.dataOf(live);
    const tid = data?.id || this.panel.threadId(live);
    this.panel.setUi(live, status, tid);
    if (!data) {
      return live;
    }
    data.status = status;
    data.msgs.setStatus(status);
    live.comments = data.msgs.toView(data);
    return live;
  }

  remountPanel(expanded: Set<string>, expandUri?: vscode.Uri): void {
    if (!this.context || !this.bundle || !this.createController) {
      return;
    }
    this.panel.clear();
    try {
      this.controller?.dispose();
    } catch (e) {
      this.info(`controller dispose: ${e}`);
    }
    this.controller = this.createController(this);
    this.context.subscriptions.push(this.controller);
    this.paint(undefined, { expand: false });
    const expandKey = expandUri?.toString();
    for (const ct of this.panel.threads) {
      const id = this.panel.threadId(ct);
      const data = this.panel.dataOf(ct);
      const onFile = expandKey && ct.uri.toString() === expandKey;
      if ((id && expanded.has(id)) || onFile || data?.anchorMiss) {
        ct.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
      }
    }
  }

  save(opts: SaveOptions = {}): void {
    if (!this.jsonPath || !this.bundle) {
      throw new Error("нечего сохранять");
    }
    for (const ct of this.panel.threads) {
      const data = this.panel.dataOf(ct);
      if (!data || !STATE || ct.state === undefined) {
        continue;
      }
      data.status = ct.state === STATE.Resolved ? "RESOLVED" : "UNRESOLVED";
    }
    this.bundle.save(this.jsonPath);
    this.info(`saved ${this.jsonPath}`);
    if (!opts.quiet) {
      Ui.flash(`сохранено → ${path.basename(this.jsonPath)}`, 2500);
    }
  }

  applyChanges(
    uri: vscode.Uri,
    changes: readonly vscode.TextDocumentContentChangeEvent[],
    lineCount: number
  ): boolean {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder || !this.bundle || !changes?.length) {
      return false;
    }
    const list = this.forUri(uri);
    if (!list.length) {
      return false;
    }

    const edit = list.applyEdits(changes, lineCount, uri.fsPath, (items, fp) =>
      this.anchors.locate(items, fp)
    );

    if (edit.shifted || edit.relocated) {
      this.info(`shift ${path.basename(uri.fsPath)}: ${edit.moved.join(", ")}`);
      this.remountPanel(this.panel.expandedIds(), uri);
      this.onRefresh?.();
      this.save({ quiet: true });
      Ui.flash(`${path.basename(uri.fsPath)} → ${list.first()?.lines[0]}`, 1500);
      return true;
    }

    if (edit.touched) {
      this.repaintFile(uri, false);
      this.onRefresh?.();
    }
    return edit.touched;
  }

  persist(): boolean {
    try {
      this.save();
    } catch (e) {
      Ui.err(e);
      return false;
    }
    this.onRefresh?.();
    return true;
  }

  deleteMsg(ct: vscode.CommentThread, mid: string): void {
    const live = this.panel.liveOf(ct) || ct;
    const data = this.panel.dataOf(live);
    if (!data || !this.bundle) {
      throw new Error("тред не найден");
    }
    const before = data.msgs.length;
    data.msgs = data.msgs.del(mid);
    if (data.msgs.length === before) {
      throw new Error(`msg ${mid} не найден`);
    }
    if (!data.msgs.length) {
      this.deleteThread(live);
      return;
    }
    this.panel.rebuildComments(live, data);
    this.save();
  }

  deleteThread(ct: vscode.CommentThread): void {
    const id = this.panel.threadId(ct);
    const live = this.panel.liveOf(ct);
    if (!id || !this.bundle) {
      throw new Error("тред не найден");
    }
    if (!this.bundle.del(id)) {
      throw new Error("тред не найден");
    }
    this.index.reindex(this.bundle);
    this.panel.dropId(id);
    (live || ct).dispose();
    this.save();
  }

  repaintFile(uri: vscode.Uri, expand = true): number {
    if (!this.bundle || !this.controller) {
      return 0;
    }
    const list = this.forUri(uri);
    if (!list.length) {
      return 0;
    }
    this.anchors.locate(list.toArray(), uri.fsPath);
    this.panel.dropUri(uri);
    const { count } = this.panel.paint(list, expand, () => false);
    if (count) {
      this.info(`repaint ${path.basename(uri.fsPath)}: ${count}`);
    }
    return count;
  }

  paint(onlyUri?: vscode.Uri, opts: PaintOptions = {}): number {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder || !this.bundle) {
      throw new Error("нет workspace или bundle");
    }
    const expand = opts.expand !== false;
    let list: ThreadList;
    if (onlyUri) {
      list = this.forUri(onlyUri);
      this.panel.dropUri(onlyUri);
    } else {
      this.panel.clear();
      list = this.bundle.threads;
    }

    const { count, spanDirty } = this.panel.paint(list, expand, (items, fp) =>
      this.anchors.locate(items, fp)
    );
    if (spanDirty) {
      this.save({ quiet: true });
    }
    this.info(`painted ${count}`);
    return count;
  }

  decorate(editor: vscode.TextEditor): void {
    this.decorator.decorate(editor);
  }
}
