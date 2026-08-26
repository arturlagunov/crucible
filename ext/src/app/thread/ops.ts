import type { Thread } from "../../domain/thread";
import type { ThreadStatus } from "../../domain/types";
import type { ThreadHost } from "../shape";

export class ThreadOps {
  constructor(private host: ThreadHost) {}

  setState(data: Thread, status: ThreadStatus): void {
    data.status = status;
  }

  delete(id: string): void {
    if (!this.host.data.bundle) {
      throw new Error("тред не найден");
    }
    if (!this.host.data.bundle.del(id)) {
      throw new Error("тред не найден");
    }
  }
}
