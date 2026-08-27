import * as vc from "vscode";
import type * as store from "../../app/store";
import type * as m from "../../domain/m";

export interface LensHandle {
  provider: vc.Disposable;
  emitter: vc.EventEmitter<void>;
  refresh(): void;
  dispose(): void;
}

export type Ports = {
  store: Pick<store.Store, "review" | "show">;
  forUri(uri: vc.Uri): m.thread.List;
};

export class Lens {
  static for(p: Ports): LensHandle {
    const emitter = new vc.EventEmitter<void>();
    const provider = vc.languages.registerCodeLensProvider(
      { scheme: "file" },
      {
        onDidChangeCodeLenses: emitter.event,
        provideCodeLenses(document) {
          if (!p.store.review) {
            return [];
          }
          const lenses: vc.CodeLens[] = [];
          for (const th of p.forUri(document.uri).shown(p.store.show)) {
            const line = th.lines[0] - 1;
            const mark = th.unresolved ? "" : " ✓";
            const warn = th.miss ? " ⚠" : "";
            lenses.push(
              new vc.CodeLens(new vc.Range(line, 0, line, 0), {
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
