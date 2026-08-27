import * as fs from "fs";
import * as path from "path";
import * as vc from "vscode";
import * as ws from "../ws";
import * as m from "../../domain/m";
import type * as d from "../../domain/d";
import { Comment } from "./comment";
import { Span } from "./span";

const STATE = vc.CommentThreadState;

/** VS Code CommentThread panel + id mapping. */
export class Panel {
  threads: vc.CommentThread[] = [];
  private meta = new WeakMap<vc.CommentThread, string>();

  constructor(
    private getController: () => vc.CommentController,
    private findData: (id: string) => m.thread.Item | undefined,
    private log: (msg: string) => void
  ) {}

  static for(
    controller: () => vc.CommentController,
    find: (id: string) => m.thread.Item | undefined,
    info: (msg: string) => void
  ): Panel {
    return new Panel(controller, find, info);
  }

  static uiCtx(status: d.thread.Status, tid?: string): string {
    const flag = status === "RESOLVED" ? "canUnresolve" : "canResolve";
    const base = `crucible ${flag} canDeleteThread canAddToChat`;
    return tid ? `${base} tid=${tid}` : base;
  }

  /** Mount list. */
  paint(list: m.thread.List, expand: boolean): number {
    let count = 0;
    for (const [key, fileThreads] of m.thread.List.byWs(list)) {
      const fsPath = ws.fsPath(key);
      if (!fsPath || !fs.existsSync(fsPath)) {
        continue;
      }
      for (const th of m.thread.List.from(fileThreads).sorted()) {
        const ct = this.mount(th, expand);
        if (ct) {
          this.threads.push(ct);
          count++;
        }
      }
    }
    return count;
  }

  threadId(ct: vc.CommentThread | undefined): string | undefined {
    if (!ct) {
      return undefined;
    }
    return (
      this.meta.get(ct) ||
      /\btid=(\S+)/.exec(String(ct.contextValue || ""))?.[1] ||
      /·\s*(CMT:\S+)\s*·/.exec(String(ct.label || ""))?.[1]
    );
  }

  liveOf(ctOrId: vc.CommentThread | string | undefined): vc.CommentThread | undefined {
    const id = typeof ctOrId === "string" ? ctOrId : this.threadId(ctOrId);
    if (!id) {
      return undefined;
    }
    return (
      this.threads.find((t) => this.threadId(t) === id) ||
      (typeof ctOrId === "object" ? ctOrId : undefined)
    );
  }

  dataOf(ct: vc.CommentThread | undefined): m.thread.Item | undefined {
    const id = this.threadId(ct);
    return id ? this.findData(id) : undefined;
  }

  liveFor(uri: vc.Uri): vc.CommentThread[] {
    const want = path.normalize(uri.fsPath);
    return this.threads.filter((t) => path.normalize(t.uri.fsPath) === want);
  }

  clear(): void {
    for (const t of this.threads) {
      t.dispose();
    }
    this.threads = [];
  }

  dropUri(uri: vc.Uri): void {
    const want = path.normalize(uri.fsPath);
    for (const ct of [...this.threads]) {
      if (path.normalize(ct.uri.fsPath) === want) {
        ct.dispose();
      }
    }
    this.threads = this.threads.filter(
      (t) => path.normalize(t.uri.fsPath) !== want
    );
  }

  dropId(id: string): void {
    for (const ct of [...this.threads]) {
      if (this.threadId(ct) === id) {
        ct.dispose();
      }
    }
    this.threads = this.threads.filter((t) => this.threadId(t) !== id);
  }

  /** Domain item → живой виджет по id. Без vscode в сигнатуре вызывающего. */
  touch(item: m.thread.Item, show?: d.Show): vc.CommentThread | undefined {
    const ct = this.liveOf(item.id);
    if (!ct) {
      return undefined;
    }
    return this.apply(ct, item, show);
  }

  expand(id: string): boolean {
    const ct = this.liveOf(id);
    if (!ct) {
      return false;
    }
    ct.collapsibleState = vc.CommentThreadCollapsibleState.Expanded;
    return true;
  }

  setUi(ct: vc.CommentThread, status: d.thread.Status, tid?: string): void {
    // CommentThreadState.Resolved — Cursor прячет glyph в редакторе
    if (STATE) {
      ct.state = STATE.Unresolved;
    }
    ct.contextValue = Panel.uiCtx(status, tid);
  }

  sync(ct: vc.CommentThread, data: m.thread.Item): void {
    const doc = ws.docOf(ct.uri.fsPath);
    ct.label = data.label;
    ct.comments = Comment.list(data);
    ct.range = Span.line(data, doc);
  }

  /** Domain → живой виджет. Если фильтр show его скрывает — снять. */
  apply(ct: vc.CommentThread, data: m.thread.Item, show?: d.Show): vc.CommentThread | undefined {
    const visible =
      show === undefined ||
      show === "all" ||
      (show === "resolved" ? !data.unresolved : data.unresolved);
    if (!visible) {
      this.dropId(data.id);
      return undefined;
    }
    const live = this.liveOf(ct) || ct;
    this.setUi(live, data.status, data.id);
    live.label = data.label;
    live.comments = Comment.list(data);
    return live;
  }

  mount(th: m.thread.Item, expand: boolean): vc.CommentThread | undefined {
    const fsPath = ws.fsPath(th.ws);
    if (!fsPath || !fs.existsSync(fsPath)) {
      return undefined;
    }
    const uri = vc.Uri.file(fsPath);
    const doc = ws.docOf(fsPath);
    try {
      const ct = this.getController().createCommentThread(
        uri,
        Span.line(th, doc),
        Comment.list(th)
      );
      ct.label = th.label;
      ct.canReply = true;
      ct.collapsibleState = expand
        ? vc.CommentThreadCollapsibleState.Expanded
        : vc.CommentThreadCollapsibleState.Collapsed;
      this.meta.set(ct, th.id);
      this.setUi(ct, th.status, th.id);
      if (doc) {
        ct.range = Span.line(th, doc);
      }
      return ct;
    } catch (e) {
      this.log(`mount ${th.id} @${th.lines}: ${e}`);
      return undefined;
    }
  }

  expandedIds(): Set<string> {
    const out = new Set<string>();
    for (const ct of this.threads) {
      if (ct.collapsibleState === vc.CommentThreadCollapsibleState.Expanded) {
        const id = this.threadId(ct);
        if (id) {
          out.add(id);
        }
      }
    }
    return out;
  }
}
