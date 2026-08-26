import assert from "node:assert/strict";
import { test } from "node:test";
import { Thread } from "../src/domain/thread";
import { ThreadList } from "../src/domain/threadList";
import type { LineEdit, ThreadData } from "../src/domain/types";

function th(id: string, span: [number, number]): Thread {
  const raw: ThreadData = {
    id,
    ws: "a.bsl",
    span,
    msgs: [{ id: "c", text: "x", status: "UNRESOLVED" }],
  };
  return new Thread(raw, "CR-1");
}

test("shift: insert newline выше треда", () => {
  const t = th("t", [10, 12]);
  const edit: LineEdit = { start: 0, end: 0, ins: 1 };
  assert.equal(t.shift(edit, 100), true);
  assert.deepEqual(t.lines, [11, 13]);
});

test("shift: insert ниже — без сдвига", () => {
  const t = th("t", [10, 12]);
  const edit: LineEdit = { start: 20, end: 20, ins: 1 };
  assert.equal(t.shift(edit, 100), false);
  assert.deepEqual(t.lines, [10, 12]);
});

test("shift: delete строки выше", () => {
  const t = th("t", [10, 12]);
  const edit: LineEdit = { start: 2, end: 3, ins: 0 };
  assert.equal(t.shift(edit, 99), true);
  assert.deepEqual(t.lines, [9, 11]);
});

test("shift: два insert снизу вверх", () => {
  const list = ThreadList.from([th("t", [25, 25])]);
  for (const edit of [
    { start: 20, end: 20, ins: 1 },
    { start: 10, end: 10, ins: 1 },
  ] as LineEdit[]) {
    list.shift(edit, 100);
  }
  assert.deepEqual(list.first()?.lines, [27, 27]);
});

test("shift: enter в конце строки — эта стоит, ниже едет", () => {
  const on = th("a", [10, 10]);
  const below = th("b", [11, 12]);
  const edit: LineEdit = { start: 9, end: 9, ins: 1, at: 5 };
  assert.equal(on.shift(edit, 100), false);
  assert.deepEqual(on.lines, [10, 10]);
  assert.equal(below.shift(edit, 100), true);
  assert.deepEqual(below.lines, [12, 13]);
});

test("overlaps: правка на строке треда", () => {
  const t = th("t", [10, 12]);
  assert.equal(t.overlaps({ start: 9, end: 9, ins: 0 }), true);
  assert.equal(t.overlaps({ start: 0, end: 0, ins: 1 }), false);
});
