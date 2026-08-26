import assert from "node:assert/strict";
import { test } from "node:test";
import { Anchor } from "../src/domain/anchor";
import { Thread } from "../src/domain/thread";
import type { ThreadData } from "../src/domain/types";

const doc = [
  "Процедура Foo()",
  "  Если Истина Тогда",
  "    Бар();",
  "  КонецЕсли",
  "КонецПроцедуры",
  "",
  "Процедура Baz()",
  "  Если Истина Тогда",
  "    Бар();",
  "  КонецЕсли",
  "КонецПроцедуры",
];

test("find: точный блок у hint", () => {
  const hit = Anchor.find(doc, ["  Если Истина Тогда", "    Бар();"], [2, 3]);
  assert.deepEqual(hit, [2, 3]);
});

test("find: тот же блок ниже — ближе к hint", () => {
  const hit = Anchor.find(doc, ["  Если Истина Тогда", "    Бар();"], [8, 9]);
  assert.deepEqual(hit, [8, 9]);
});

test("find: нет в файле — null", () => {
  assert.equal(Anchor.find(doc, ["Процедура Нет()"], [1, 1]), null);
});

test("find: fallback на нетривиальную строку", () => {
  const hit = Anchor.find(doc, ["Процедура Baz()", "  КонецЕсли"], [1, 2]);
  assert.deepEqual(hit, [7, 7]);
});

function raw(over: Partial<ThreadData> & Pick<ThreadData, "id" | "span">): ThreadData {
  return {
    ws: "a.bsl",
    msgs: [{ id: "CMT:1", text: "x", status: "UNRESOLVED" }],
    ...over,
  };
}

test("relocate: текст на месте — без сдвига", () => {
  const th = new Thread(
    raw({ id: "t1", span: [7, 7], anchor: { lines: ["Процедура Baz()"] } }),
    "CR-1"
  );
  assert.equal(th.relocate(doc), false);
  assert.deepEqual(th.lines, [7, 7]);
  assert.equal(th.miss, undefined);
});

test("relocate: блок уехал вниз", () => {
  const th = new Thread(
    raw({ id: "t1", span: [1, 1], anchor: { lines: ["Процедура Baz()"] } }),
    "CR-1"
  );
  assert.equal(th.relocate(doc), true);
  assert.deepEqual(th.lines, [7, 7]);
});

test("relocate: пустые строки в span — не miss", () => {
  const spaced = ["Foo()", "", "  Bar();", "", "End"];
  const th = new Thread(
    raw({
      id: "t1",
      span: [1, 5],
      anchor: { lines: ["Foo()", "  Bar();", "End"] },
    }),
    "CR-1"
  );
  assert.equal(th.relocate(spaced), false);
  assert.equal(th.miss, undefined);
  assert.deepEqual(th.lines, [1, 5]);
});

test("relocate: нет в файле — miss", () => {
  const th = new Thread(
    raw({ id: "t1", span: [1, 1], anchor: { lines: ["Процедура Нет()"] } }),
    "CR-1"
  );
  assert.equal(th.relocate(doc), false);
  assert.equal(th.miss, true);
  assert.deepEqual(th.lines, [1, 1]);
});
