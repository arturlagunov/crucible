import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Paths } from "../infra/paths";
import { ThreadList } from "../domain/threadList";
import type { Thread } from "../domain/thread";
import type { ThreadStatus } from "../domain/types";
import { toComments } from "./commentView";
import { threadRange } from "./span";

const STATE = vscode.CommentThreadState;

/** VS Code CommentThread panel + id mapping. */
export class Panel {
  threads: vscode.CommentThread[] = [];
  private meta = new WeakMap<vscode.CommentThread, string>();

  constructor(
    private getController: () => vscode.CommentController,
    private findData: (id: string) => Thread | undefined,
    private log: (msg: string) => void
  ) {}

  static uiCtx(status: ThreadStatus, tid?: string): string {
    const flag = status === "RESOLVED" ? "canUnresolve" : "canResolve";
    const base = `crucible ${flag} canDeleteThread canAddToChat`;
    return tid ? `${base} tid=${tid}` : base;
  }

  /** Mount list; locate — extra pass по файлу (обычно уже сделан). */
  paint(
    list: ThreadList,
    expand: boolean,
    locate: (items: Thread[], fsPath: string) => boolean
  ): { count: number; spanDirty: boolean } {
    let count = 0;
    let spanDirty = false;
    for (const [ws, fileThreads] of ThreadList.byWs(list)) {
      const fsPath = Paths.wsFsPath(ws);
      if (!fsPath || !fs.existsSync(fsPath)) {
        continue;
      }
      if (locate(fileThreads, fsPath)) {
        spanDirty = true;
      }
      for (const th of ThreadList.from(fileThreads).sorted()) {
        const ct = this.mount(th, expand);
        if (ct) {
          this.threads.push(ct);
          count++;
        }
      }
    }
    return { count, spanDirty };
  }

  threadId(ct: vscode.CommentThread | undefined): string | undefined {
    if (!ct) {
      return undefined;
    }
    return (
      this.meta.get(ct) ||
      /\btid=(\S+)/.exec(String(ct.contextValue || ""))?.[1] ||
      /·\s*(CMT:\S+)\s*·/.exec(String(ct.label || ""))?.[1]
    );
  }

  liveOf(ctOrId: vscode.CommentThread | string | undefined): vscode.CommentThread | undefined {
    const id = typeof ctOrId === "string" ? ctOrId : this.threadId(ctOrId);
    if (!id) {
      return undefined;
    }
    return (
      this.threads.find((t) => this.threadId(t) === id) ||
      (typeof ctOrId === "object" ? ctOrId : undefined)
    );
  }

  dataOf(ct: vscode.CommentThread | undefined): Thread | undefined {
    const id = this.threadId(ct);
    return id ? this.findData(id) : undefined;
  }

  liveFor(uri: vscode.Uri): vscode.CommentThread[] {
    const want = path.normalize(uri.fsPath);
    return this.threads.filter((t) => path.normalize(t.uri.fsPath) === want);
  }

  clear(): void {
    for (const t of this.threads) {
      t.dispose();
    }
    this.threads = [];
  }

  dropUri(uri: vscode.Uri): void {
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

  setUi(ct: vscode.CommentThread, status: ThreadStatus, tid?: string): void {
    if (STATE) {
      ct.state = status === "RESOLVED" ? STATE.Resolved : STATE.Unresolved;
    }
    ct.contextValue = Panel.uiCtx(status, tid);
  }

  sync(ct: vscode.CommentThread, data: Thread): void {
    const doc = Paths.docForPath(ct.uri.fsPath);
    ct.label = data.label;
    ct.comments = toComments(data);
    ct.range = threadRange(data, doc);
  }

  rebuildComments(ct: vscode.CommentThread, data: Thread): void {
    const live = this.liveOf(ct) || ct;
    live.comments = toComments(data);
  }

  mount(th: Thread, expand: boolean): vscode.CommentThread | undefined {
    const fsPath = Paths.wsFsPath(th.ws);
    if (!fsPath || !fs.existsSync(fsPath)) {
      return undefined;
    }
    const uri = vscode.Uri.file(fsPath);
    const doc = Paths.docForPath(fsPath);
    try {
      const ct = this.getController().createCommentThread(
        uri,
        threadRange(th, doc),
        toComments(th)
      );
      ct.label = th.label;
      ct.canReply = true;
      ct.collapsibleState = expand
        ? vscode.CommentThreadCollapsibleState.Expanded
        : vscode.CommentThreadCollapsibleState.Collapsed;
      this.meta.set(ct, th.id);
      this.setUi(ct, th.status, th.id);
      if (doc) {
        ct.range = threadRange(th, doc);
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
      if (ct.collapsibleState === vscode.CommentThreadCollapsibleState.Expanded) {
        const id = this.threadId(ct);
        if (id) {
          out.add(id);
        }
      }
    }
    return out;
  }
}
