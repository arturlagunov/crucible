import type { Decorator } from "./decorator";
import type { LensHandle } from "./lens";
import type { Status } from "./status";

export type Ports = {
  decorator: Decorator;
  lens: LensHandle;
  status: Status;
};

/** Гуттер + CodeLens + status bar. Panel сюда не входит. */
export function refresh(p: Ports): () => void {
  return () => {
    p.status.paint();
    p.decorator.refreshAll();
    p.lens.refresh();
  };
}
