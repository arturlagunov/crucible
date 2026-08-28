import * as fs from "fs";
import * as path from "path";
import { Paths } from "./paths";
import { REQ } from "./constants";

/** Makefile ROOT: crucible/.load-request. Compiled file: ext/out/infra. */
function extReq(): string {
  return path.join(__dirname, "..", "..", "..", REQ);
}

/** Прочитать и снять `.load-request`. Путь к json или undefined. */
export function consume(folderFs?: string): string | undefined {
  const hits = [extReq()];
  if (folderFs) {
    hits.push(Paths.reqPath(folderFs), path.join(folderFs, REQ));
  }
  const p = hits.find((x) => fs.existsSync(x));
  if (!p) {
    return undefined;
  }
  let body: { file?: string };
  try {
    body = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return undefined;
  }
  try {
    fs.unlinkSync(p);
  } catch {
    /* */
  }
  return body.file ? String(body.file) : undefined;
}
