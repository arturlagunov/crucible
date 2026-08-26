import * as fs from "fs";
import * as vscode from "vscode";
import { Paths } from "./paths";
import { Thread } from "./thread";

export interface EditResult {
  shifted: boolean;
  moved: string[];
  relocated: boolean;
  touched: boolean;
}

export class ThreadList implements Iterable<Thread> {
  constructor(private items: Thread[] = []) {}

  static from(items: Thread[]): ThreadList {
    return new ThreadList(items);
  }

  static empty(): ThreadList {
    return new ThreadList();
  }

  /** fsPath → треды существующего файла. */
  static groupByFsPath(items: Iterable<Thread>): Map<string, Thread[]> {
    const byFile = new Map<string, Thread[]>();
    for (const th of items) {
      const fp = Paths.wsFsPath(th.ws);
      if (!fp || !fs.existsSync(fp)) {
        continue;
      }
      if (!byFile.has(fp)) {
        byFile.set(fp, []);
      }
      byFile.get(fp)!.push(th);
    }
    return byFile;
  }

  get length(): number {
    return this.items.length;
  }

  [Symbol.iterator](): Iterator<Thread> {
    return this.items[Symbol.iterator]();
  }

  find(fn: (t: Thread) => boolean): Thread | undefined {
    return this.items.find(fn);
  }

  filter(fn: (t: Thread) => boolean): ThreadList {
    return new ThreadList(this.items.filter(fn));
  }

  map<T>(fn: (t: Thread) => T): T[] {
    return this.items.map(fn);
  }

  some(fn: (t: Thread, i: number) => boolean): boolean {
    return this.items.some(fn);
  }

  first(): Thread | undefined {
    return this.items[0];
  }

  sorted(): ThreadList {
    return new ThreadList([...this.items].sort(ThreadList.byLine));
  }

  /** Сдвиг span + relocate; locate — batch anchor pass. */
  applyEdits(
    changes: readonly vscode.TextDocumentContentChangeEvent[],
    lineCount: number,
    fsPath: string,
    locate: (items: Thread[], path: string) => boolean
  ): EditResult {
    let shifted = false;
    const moved: string[] = [];
    for (const change of changes) {
      for (const th of this.items) {
        const hit = th.applyEdit(change, lineCount);
        if (hit) {
          shifted = true;
          moved.push(`${th.id} ${hit.prev}→${hit.next}`);
        }
      }
    }

    const spansBefore = this.items.map((th) => `${th.lines[0]},${th.lines[1]}`);
    locate(this.items, fsPath);
    const relocated = this.items.some(
      (th, i) => `${th.lines[0]},${th.lines[1]}` !== spansBefore[i]
    );

    let touched = false;
    if (!shifted && !relocated) {
      for (const change of changes) {
        for (const th of this.items) {
          if (th.overlaps(change)) {
            touched = true;
            break;
          }
        }
        if (touched) {
          break;
        }
      }
    }

    return { shifted, moved, relocated, touched };
  }

  toArray(): Thread[] {
    return this.items;
  }

  private static byLine(a: Thread, b: Thread): number {
    return a.lines[0] - b.lines[0] || a.lines[1] - b.lines[1];
  }
}
