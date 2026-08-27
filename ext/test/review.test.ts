import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { test } from "node:test";
import type * as d from "../src/domain/d";
import * as m from "../src/domain/m";

function msg(id: string, status: d.thread.Status): d.Comment {
  return { id, text: "x", status };
}

function raw(id: string, status: d.thread.Status, ws = "src/a.bsl"): d.thread.Item {
  return {
    id,
    ws,
    span: [1, 1],
    msgs: [msg(id, status)],
  };
}

test("shown: unresolved / resolved / all", () => {
  const list = m.thread.List.from([
    new m.thread.Item(raw("a", "UNRESOLVED"), "CR-1"),
    new m.thread.Item(raw("b", "RESOLVED"), "CR-1"),
  ]);
  assert.equal(list.shown("unresolved").length, 1);
  assert.equal(list.shown("resolved").first()?.id, "b");
  assert.equal(list.shown("all").length, 2);
});

test("open: только UNRESOLVED", () => {
  const list = m.thread.List.from([
    new m.thread.Item(raw("a", "UNRESOLVED"), "CR-1"),
    new m.thread.Item(raw("b", "RESOLVED"), "CR-1"),
  ]);
  assert.equal(list.length, 2);
  assert.equal(list.open.length, 1);
  assert.equal(list.open.first()?.id, "a");
});

test("save: resolved остаются в JSON", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cru-"));
  const file = path.join(dir, "t.json");
  const review = new m.Review(
    "CR-1",
    "http://example",
    m.thread.List.from([
      new m.thread.Item(raw("a", "UNRESOLVED"), "CR-1"),
      new m.thread.Item(raw("b", "RESOLVED"), "CR-1"),
    ])
  );
  fs.writeFileSync(file, JSON.stringify(review.toRaw(), null, 2) + "\n");
  const loaded = m.Review.fromRaw(JSON.parse(fs.readFileSync(file, "utf8")));
  assert.equal(loaded.threads.length, 2);
  assert.equal(loaded.threads.open.length, 1);
  assert.deepEqual(
    loaded.threads.map((t) => t.id).sort(),
    ["a", "b"]
  );
  fs.rmSync(dir, { recursive: true });
});

test("read: UNRESOLVED msg → тред открыт, даже если stored RESOLVED", () => {
  const th = new m.thread.Item(
    { ...raw("b", "UNRESOLVED"), status: "RESOLVED" },
    "CR-1"
  );
  assert.equal(th.unresolved, true);
  assert.equal(th.toRaw().status, "UNRESOLVED");
});

test("index: forKey / atLine / busiest", () => {
  const review = new m.Review(
    "CR-1",
    "http://example",
    m.thread.List.from([
      new m.thread.Item(raw("a", "UNRESOLVED", "src/a.bsl"), "CR-1"),
      new m.thread.Item(
        { ...raw("b", "UNRESOLVED", "src/a.bsl"), span: [10, 12] },
        "CR-1"
      ),
      new m.thread.Item(raw("c", "RESOLVED", "src/b.bsl"), "CR-1"),
    ])
  );
  assert.equal(review.forKey("src/a.bsl").length, 2);
  assert.equal(review.forKey("/src/a.bsl").length, 2);
  assert.equal(review.atLine("src/a.bsl", 9)?.id, "b");
  assert.equal(review.busiest()?.key, "src/a.bsl");
});

test("byWs группирует по пути", () => {
  const map = m.thread.List.byWs([
    new m.thread.Item(raw("a", "UNRESOLVED", "x/a.bsl"), "CR-1"),
    new m.thread.Item(raw("b", "UNRESOLVED", "/x/a.bsl"), "CR-1"),
  ]);
  assert.equal(map.size, 1);
  assert.equal(map.get("x/a.bsl")?.length, 2);
});
