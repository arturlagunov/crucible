import * as fs from "fs";
import * as path from "path";
import { REQ } from "./constants";
import { norm } from "../domain/norm";

export class Paths {
  static norm(p: string | undefined): string {
    return norm(p);
  }

  static relKey(full: string, root: string): string {
    const r = root.replace(/\\/g, "/");
    const f = full.replace(/\\/g, "/");
    if (f.startsWith(r + "/") || f === r) {
      return f.slice(r.length).replace(/^\/+/, "");
    }
    return Paths.norm(f);
  }

  static wsFsPath(ws: string, folderFs: string): string {
    return path.join(folderFs, ...Paths.norm(ws).split("/"));
  }

  static lines(fsPath: string, live?: string): string[] {
    if (live !== undefined) {
      return live.split(/\r?\n/);
    }
    return fs.readFileSync(fsPath, "utf8").split(/\r?\n/);
  }

  static reqPath(folderFs: string): string {
    return path.join(folderFs, "projects", "crucible", REQ);
  }
}
