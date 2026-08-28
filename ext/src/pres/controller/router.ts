import * as path from "path";
import * as vc from "vscode";
import { LoadSignal } from "../loadSignal";
import * as m from "../../domain/m";
import * as v from "../v";
import { cmd } from "./cmd";
import { Cursor } from "../cursor";
import type { Frame } from "../frame";
import { locate } from "../locate";
import * as ws from "../ws";
import { resolveCmd, unpack } from "./resolve";

const IDS = [
  "cru.load",
  "cru.save",
  "cru.clear",
  "cru.show",
  "cru.paint",
  "cru.open",
  "cru.openId",
  "cru.resolve",
  "cru.unresolve",
  "cru.delThread",
  "cru.reply",
  "cru.del",
  "cru.chat",
  "cru.link",
] as const;

/** VS Code args → доменные параметры → u. Сценарий vscode не видит. */
export class Router {
  constructor(
    private g: Frame,
    private context: vc.ExtensionContext,
    private info: (msg: string) => void
  ) {}

  bind(): vc.Disposable[] {
    return [
      ...IDS.map((id) => cmd(id, (...a) => void this.handle(id, ...a))),
      vc.window.onDidChangeActiveTextEditor((ed) => this.onEditor(ed)),
    ];
  }

  private async handle(id: string, ...args: unknown[]): Promise<void> {
    const g = this.g;
    const { u } = g;
    switch (id) {
      case "cru.load": {
        const pick = await vc.window.showOpenDialog({
          canSelectMany: false,
          filters: { JSON: ["json"] },
        });
        if (pick?.[0]) {
          await LoadSignal.apply(g, pick[0].fsPath);
        }
        return;
      }
      case "cru.save":
        this.run(() => {
          u.review.save();
          g.v.notify();
        }, `сохранено → ${base(g)}`);
        return;
      case "cru.clear":
        this.run(() => {
          u.review.clear();
          g.v.panel.clear();
          g.v.decorator.clearAll();
          g.v.notify();
        });
        return;
      case "cru.show": {
        try {
          const show = u.review.cycleShow();
          if (show) {
            g.v.painter.paint();
            g.v.notify();
            void this.context.workspaceState.update("cru.show", show);
            v.Ui.flash(`show: ${show}`, 1500);
          }
        } catch (e) {
          v.Ui.err(e);
        }
        return;
      }
      case "cru.paint":
        await this.paint();
        return;
      case "cru.open":
        await this.openAt();
        return;
      case "cru.openId":
        await this.openById(args[0] as string);
        return;
      case "cru.resolve":
      case "cru.unresolve": {
        const got = resolveCmd(g.v.panel, g.store.review, args[0]);
        if (!got) {
          return;
        }
        this.run(() => {
          u.thread.setStatus(
            got.data,
            id === "cru.resolve" ? "RESOLVED" : "UNRESOLVED"
          );
          this.sync(got.data.id);
        }, `${id === "cru.resolve" ? "resolved" : "unresolved"} → ${base(g)}`);
        return;
      }
      case "cru.delThread": {
        const got = resolveCmd(g.v.panel, g.store.review, args[0], args[1]);
        if (!got) {
          return;
        }
        this.run(() => {
          u.thread.del(got.data);
          this.sync(got.data.id);
        });
        return;
      }
      case "cru.reply": {
        const reply = args[0] as { thread?: vc.CommentThread; text?: string };
        const got = resolveCmd(g.v.panel, g.store.review, reply?.thread);
        if (!got) {
          return;
        }
        this.run(() => {
          if (u.comment.reply(got.data, reply?.text || "", v.Ui.localAuthor())) {
            this.sync(got.data.id);
          }
        });
        return;
      }
      case "cru.del": {
        const got = resolveCmd(g.v.panel, g.store.review, args[0], args[1]);
        if (!got) {
          return;
        }
        const mid = v.Comment.idOf(got.comment, got.thread, got.data);
        if (!mid) {
          v.Ui.err("коммент не найден");
          return;
        }
        this.run(() => {
          u.comment.del(got.data, mid);
          this.sync(got.data.id);
        });
        return;
      }
      case "cru.chat": {
        const got = resolveCmd(g.v.panel, g.store.review, args[0], args[1]);
        if (!got) {
          return;
        }
        await Cursor.send(this.info, got.data);
        return;
      }
      case "cru.link":
        await this.link(args[0], args[1]);
        return;
    }
  }

  private review(): m.Review | undefined {
    if (!this.g.store.review) {
      vc.window.showWarningMessage("Сначала make load");
      return undefined;
    }
    return this.g.store.review;
  }

  private async openAt(): Promise<void> {
    const ed = vc.window.activeTextEditor;
    const review = this.review();
    if (!ed || !review) {
      return;
    }
    const item = review
      .forKey(ws.relKey(ed.document.uri))
      .atLine(ed.selection.active.line);
    if (!item) {
      v.Ui.err(`нет треда на строке ${ed.selection.active.line + 1}`);
      return;
    }
    this.saveSpan(ed.document.uri);
    await this.g.v.thread.open(item);
  }

  private async openById(id: string): Promise<void> {
    if (!this.review() || !id) {
      return;
    }
    const { store } = this.g;
    const item = store.review!.threads.find((t) => t.id === id);
    if (!item) {
      v.Ui.err(`тред ${id} не найден в json`);
      return;
    }
    const fp = ws.fsPath(item.ws);
    this.saveSpan(fp ? vc.Uri.file(fp) : undefined);
    await this.g.v.thread.open(item);
  }

  private async paint(): Promise<void> {
    const ed = vc.window.activeTextEditor;
    const review = this.review();
    if (!ed || !review) {
      return;
    }
    const g = this.g;
    const uri = ed.document.uri;
    this.saveSpan(uri);
    const list = review.forKey(ws.relKey(uri));
    const item = list.atLine(ed.selection.active.line);
    if (item) {
      await g.v.thread.open(item);
      return;
    }
    const n = g.v.painter.repaintFile(uri, true);
    g.v.notify();
    const total = list.length;
    vc.window.showInformationMessage(
      `Crucible: ${n}/${total} на ${path.basename(uri.fsPath)}`
    );
  }

  private async link(a: unknown, b?: unknown): Promise<void> {
    const { u, store } = this.g;
    let url = typeof a === "string" ? a : undefined;
    if (!url && store.review) {
      const { comment } = unpack(a, b, this.g.v.panel.threads);
      const id = v.Comment.idOf(comment);
      if (id) {
        url = u.comment.link(store.review, id);
      }
    }
    if (!url) {
      v.Ui.err("нет ссылки");
      return;
    }
    await vc.env.clipboard.writeText(url);
    v.Ui.flash("ссылка скопирована", 1500);
  }

  private sync(id: string): void {
    const { store } = this.g;
    const item = store.review?.threads.find((t) => t.id === id);
    if (item) {
      this.g.v.panel.touch(item, store.show);
    } else {
      this.g.v.panel.dropId(id);
    }
    this.g.v.notify();
  }

  private saveSpan(uri?: vc.Uri): void {
    if (locate(this.g, uri)) {
      this.g.u.review.save();
    }
  }

  private onEditor(ed: vc.TextEditor | undefined): void {
    const g = this.g;
    if (!ed || !g.store.review) {
      return;
    }
    const uri = ed.document.uri;
    const list = g.store.review.forKey(ws.relKey(uri));
    const n = list.length;
    const live = g.v.panel.liveFor(uri).length;
    const want = list.shown(g.store.show).length;
    if (n > 0 && live !== want) {
      this.saveSpan(uri);
      g.v.painter.repaintFile(uri, false);
    }
    g.v.notify();
  }

  private run(fn: () => void, flash?: string): void {
    try {
      fn();
      if (flash) {
        v.Ui.flash(flash);
      }
    } catch (e) {
      v.Ui.err(e);
    }
  }
}

function base(g: { store: { jsonPath?: string } }): string {
  return path.basename(g.store.jsonPath || "");
}
