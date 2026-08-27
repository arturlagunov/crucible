import * as fs from "fs";
import { Paths } from "./paths";

/** Прочитать и снять `.load-request`. Путь к json или undefined. */
export function consume(): string | undefined {
  const p = Paths.reqPath();
  if (!p || !fs.existsSync(p)) {
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
