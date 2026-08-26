import type { Thread } from "../../domain/thread";

export class CommentOps {
  /** true — сообщений не осталось, тред надо удалить. */
  delete(data: Thread, mid: string): boolean {
    const before = data.msgs.length;
    data.msgs = data.msgs.del(mid);
    if (data.msgs.length === before) {
      throw new Error(`msg ${mid} не найден`);
    }
    return !data.msgs.length;
  }
}
