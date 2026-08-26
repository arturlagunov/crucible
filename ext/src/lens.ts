import * as vscode from "vscode";
import type { SessionView } from "./lib/sessionView";

export interface LensHandle {
  provider: vscode.Disposable;
  emitter: vscode.EventEmitter<void>;
  refresh(): void;
  dispose(): void;
}

export class Lens {
  static for(view: SessionView): LensHandle {
    const emitter = new vscode.EventEmitter<void>();
    const provider = vscode.languages.registerCodeLensProvider(
      { scheme: "file" },
      {
        onDidChangeCodeLenses: emitter.event,
        provideCodeLenses(document) {
          if (!view.bundle) {
            return [];
          }
          const lenses: vscode.CodeLens[] = [];
          for (const th of view.forUri(document.uri)) {
            const line = th.lines[0] - 1;
            const warn = th.anchorMiss ? " ⚠" : "";
            lenses.push(
              new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
                title: `$(comment-discussion) ${th.id}${warn}`,
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
