import * as vscode from "vscode";
import type { View } from "../app/shape";

export interface LensHandle {
  provider: vscode.Disposable;
  emitter: vscode.EventEmitter<void>;
  refresh(): void;
  dispose(): void;
}

export class Lens {
  static for(view: View): LensHandle {
    const emitter = new vscode.EventEmitter<void>();
    const provider = vscode.languages.registerCodeLensProvider(
      { scheme: "file" },
      {
        onDidChangeCodeLenses: emitter.event,
        provideCodeLenses(document) {
          if (!view.data.bundle) {
            return [];
          }
          const lenses: vscode.CodeLens[] = [];
          for (const th of view.forUri(document.uri).shown(view.data.show)) {
            const line = th.lines[0] - 1;
            const mark = th.unresolved ? "" : " ✓";
            const warn = th.miss ? " ⚠" : "";
            lenses.push(
              new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
                title: `$(comment-discussion) ${th.id}${mark}${warn}`,
                command: "cru.openId",
                arguments: [th.id, document.uri.toString()],
              })
            );
          }
          return lenses;
        },
      }
    );
    return {
      provider,
      emitter,
      refresh() {
        emitter.fire();
      },
      dispose() {
        provider.dispose();
        emitter.dispose();
      },
    };
  }
}
