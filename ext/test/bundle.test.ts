import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { test } from "node:test";
import { ThreadBundle } from "../src/domain/bundle";
import { Thread } from "../src/domain/thread";
import { ThreadList } from "../src/domain/threadList";
import type { CommentData, ThreadData, ThreadStatus } from "../src/domain/types";

function msg(id: string, status: ThreadStatus): CommentData {
  return { id, text: "x", status };
}

function raw(id: string, status: ThreadStatus, ws = "src/a.bsl"): ThreadData {
  return {
    id,
    ws,
    span: [1, 1],
    msgs: [msg(id, status)],
  };
}

test("shown: unresolved / resolved / all", () => {
  const list = ThreadList.from([
    new Thread(raw("a", "UNRESOLVED"), "CR-1"),
    new Thread(raw("b", "RESOLVED"), "CR-1"),
  ]);
  assert.equal(list.shown("unresolved").length, 1);
  assert.equal(list.shown("resolved").first()?.id, "b");
  assert.equal(list.shown("all").length, 2);
});

test("open: только UNRESOLVED", () => {
  const list = ThreadList.from([
    new Thread(raw("a", "UNRESOLVED"), "CR-1"),
    new Thread(raw("b", "RESOLVED"), "CR-1"),
  ]);
  assert.equal(list.length, 2);
  assert.equal(list.open.length, 1);
  assert.equal(list.open.first()?.id, "a");
});

test("save: resolved остаются в JSON", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cru-"));
  const file = path.join(dir, "t.json");
  const bundle = new ThreadBundle(
    { id: "CR-1" },
    "http://example",
    ThreadList.from([
      new Thread(raw("a", "UNRESOLVED"), "CR-1"),
      new Thread(raw("b", "RESOLVED"), "CR-1"),
    ])
  );
  bundle.save(file);
  const { bundle: loaded, total } = ThreadBundle.read(file);
  assert.equal(total, 2);
  assert.equal(loaded.threads.length, 2);
  assert.equal(loaded.threads.open.length, 1);
  assert.deepEqual(
    loaded.threads.map((t) => t.id).sort(),
    ["a", "b"]
  );
  fs.rmSync(dir, { recursive: true });
});

test("read: UNRESOLVED msg → тред открыт, даже если stored RESOLVED", () => {
  const th = new Thread(
    { ...raw("b", "UNRESOLVED"), status: "RESOLVED" },
    "CR-1"
  );
  assert.equal(th.unresolved, true);
  assert.equal(th.toRaw().status, "UNRESOLVED");
});

test("index: forKey / atLine / busiest", () => {
  const bundle = new ThreadBundle(
    { id: "CR-1" },
    "http://example",
    ThreadList.from([
      new Thread(raw("a", "UNRESOLVED", "src/a.bsl"), "CR-1"),
      new Thread(
        { ...raw("b", "UNRESOLVED", "src/a.bsl"), span: [10, 12] },
        "CR-1"
      ),
      new Thread(raw("c", "RESOLVED", "src/b.bsl"), "CR-1"),
    ])
  );
  assert.equal(bundle.forKey("src/a.bsl").length, 2);
  assert.equal(bundle.forKey("/src/a.bsl").length, 2);
  assert.equal(bundle.atLine("src/a.bsl", 9)?.id, "b");
  assert.equal(bundle.busiest()?.key, "src/a.bsl");
});

test("byWs группирует по пути", () => {
  const map = ThreadList.byWs([
    new Thread(raw("a", "UNRESOLVED", "x/a.bsl"), "CR-1"),
    new Thread(raw("b", "UNRESOLVED", "/x/a.bsl"), "CR-1"),
  ]);
  assert.equal(map.size, 1);
  assert.equal(map.get("x/a.bsl")?.length, 2);
});
