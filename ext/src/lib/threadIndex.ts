import * as path from "path";
import * as vscode from "vscode";
import { Paths } from "./paths";
import { ThreadList } from "./threadList";
import type { Thread } from "./thread";
import type { ThreadBundle } from "./bundle";

/** Индекс bundle по файлам workspace (relKey / ws). */
export class ThreadIndex {
  private byFile = new Map<string, Thread[]>();

  /** Сброс индекса. */
  clear(): void {
    this.byFile = new Map();
  }

  /** Пересборка из bundle; ключ — wsKey в workspace. */
  reindex(bundle: ThreadBundle | undefined): void {
    this.byFile = new Map();
    const folder = vscode.workspace.workspaceFolders?.[0];
    for (const th of bundle?.threads ?? ThreadList.empty()) {
      const key = folder ? Paths.wsKey(th.ws, folder.uri) : Paths.norm(th.ws);
      if (!this.byFile.has(key)) {
        this.byFile.set(key, []);
      }
      this.byFile.get(key)!.push(th);
    }
    if (bundle) {
      bundle.count = bundle.threads.length;
    }
  }

  /** Список для uri: relKey, при промахе — сравнение fsPath. */
  forUri(uri: vscode.Uri): ThreadList {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return ThreadList.empty();
    }
    const key = Paths.relKey(uri, folder.uri);
    const hit = this.byFile.get(key);
    if (hit?.length) {
      return ThreadList.from(hit);
    }
    const want = path.normalize(uri.fsPath);
    for (const list of this.byFile.values()) {
      const fp = Paths.wsFsPath(list[0]?.ws);
      if (fp && path.normalize(fp) === want) {
        return ThreadList.from(list);
      }
    }
    return ThreadList.empty();
  }

  /** На строке line0 (0-based): span, иначе ближайший start в ±5 строк. */
  atLine(uri: vscode.Uri, line0: number): Thread | undefined {
    const list = this.forUri(uri);
    const line1 = line0 + 1;
    for (const th of list) {
      const a = th.lines[0];
      const b = th.lines[1];
      if (line1 >= a && line1 <= b) {
        return th;
      }
    }
    let best: Thread | undefined;
    let bestDist = 5;
    for (const th of list) {
      const dist = Math.abs(line1 - th.lines[0]);
      if (dist < bestDist) {
        bestDist = dist;
        best = th;
      }
    }
    return best;
  }

  /** Файл с max тредов. */
  busiest(): { key: string; first: Thread } | undefined {
    let bestKey: string | undefined;
    let bestList: Thread[] | undefined;
    let bestN = 0;
    for (const [key, list] of this.byFile) {
      if (list.length > bestN) {
        bestN = list.length;
        bestKey = key;
        bestList = list;
      }
    }
    if (!bestKey || !bestList?.length) {
      return undefined;
    }
    return { key: bestKey, first: bestList[0] };
  }
}
