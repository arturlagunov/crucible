import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { REQ } from "./constants";
import { norm } from "./norm";

export class Paths {
  static norm(p: string | undefined): string {
    return norm(p);
  }

  static relKey(fileUri: vscode.Uri, folderUri: vscode.Uri): string {
    const root = folderUri.fsPath.replace(/\\/g, "/");
    const full = fileUri.fsPath.replace(/\\/g, "/");
    if (full.startsWith(root + "/") || full === root) {
      return full.slice(root.length).replace(/^\/+/, "");
    }
    return Paths.norm(vscode.workspace.asRelativePath(fileUri, false));
  }

  static wsFsPath(ws: string): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }
    return path.join(folder.uri.fsPath, ...Paths.norm(ws).split("/"));
  }

  static docForPath(fsPath: string | undefined): vscode.TextDocument | undefined {
    if (!fsPath) {
      return undefined;
    }
    const want = path.normalize(fsPath);
    const active = vscode.window.activeTextEditor;
    if (active && path.normalize(active.document.uri.fsPath) === want) {
      return active.document;
    }
    return vscode.workspace.textDocuments.find(
      (d) => path.normalize(d.uri.fsPath) === want
    );
  }

  static lines(fsPath: string): string[] {
    const doc = Paths.docForPath(fsPath);
    if (doc) {
      return doc.getText().split(/\r?\n/);
    }
    return fs.readFileSync(fsPath, "utf8").split(/\r?\n/);
  }

  static reqPath(): string | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder
      ? path.join(folder.uri.fsPath, "projects", "crucible", REQ)
      : undefined;
  }
}
