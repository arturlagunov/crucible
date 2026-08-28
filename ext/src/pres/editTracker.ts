import * as path from "path";
import * as vc from "vscode";
import type * as d from "../domain/d";
import type * as store from "../app/store";
import { SAVE_MS } from "../infra/constants";
import * as v from "./v";
import type * as m from "../domain/m";
import * as ws from "./ws";

export type Ports = {
  store: Pick<store.Store, "review">;
  panel: v.Panel;
  shift(list: m.thread.List, edit: d.thread.Edit, lineCount: number): boolean;
  save(): void;
  info(msg: string): void;
};

/** Сдвиг span в памяти. JSON — раз в SAVE_MS или на save документа. */
export class EditTracker implements vc.Disposable {
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposable: vc.Disposable;

  constructor(private p: Ports) {
    this.disposable = vc.Disposable.from(
      vc.workspace.onDidChangeTextDocument((e) => this.onChange(e)),
      vc.workspace.onDidSaveTextDocument(() => this.flush())
    );
  }

  static for(p: Ports): EditTracker {
    return new EditTracker(p);
  }

  dispose(): void {
    this.flush();
    this.disposable.dispose();
  }

  private onChange(e: vc.TextDocumentChangeEvent): void {
    const review = this.p.store.review;
    if (!review || e.document.uri.scheme !== "file") {
      return;
    }
    const list = review.forKey(ws.relKey(e.document.uri));
    if (!list.length || !e.contentChanges.length) {
      return;
    }

    const edits = [...e.contentChanges]
      .sort((a, b) => b.range.start.line - a.range.start.line)
      .map(toEdit);
    let moved = false;
    for (const edit of edits) {
      if (this.p.shift(list, edit, e.document.lineCount)) {
        moved = true;
      }
    }
    this.pin(e.document);
    if (!moved) {
      return;
    }
    this.dirty = true;
    this.arm();
  }

  /** Вернуть range на первую строку, если VS Code растянул. collapsibleState не трогаем. */
  private pin(doc: vc.TextDocument): void {
    const panel = this.p.panel;
    for (const ct of panel.liveFor(doc.uri)) {
      const data = panel.dataOf(ct);
      if (!data) {
        continue;
      }
      const want = v.Span.line(data, doc);
      const r = ct.range;
      if (!r || r.start.line !== want.start.line || r.end.line !== want.end.line) {
        ct.range = want;
      }
    }
  }

  private arm(): void {
    if (this.timer) {
      return;
    }
    this.timer = setTimeout(() => this.flush(), SAVE_MS);
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.dirty || !this.p.store.review) {
      return;
    }
    this.dirty = false;
    try {
      this.p.save();
      this.p.info("shift json saved");
    } catch (err) {
      this.dirty = true;
      this.p.info(`save: ${err}`);
    }
  }
}

function toEdit(change: vc.TextDocumentContentChangeEvent): d.thread.Edit {
  return {
    start: change.range.start.line,
    end: change.range.end.line,
    ins: change.text.split("\n").length - 1,
    at: change.range.start.character,
  };
}
