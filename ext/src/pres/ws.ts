import * as path from "path";
import * as vc from "vscode";
import { Paths } from "../infra/paths";

export function relKey(uri: vc.Uri): string {
  const folder = vc.workspace.workspaceFolders?.[0];
  if (!folder) {
    return Paths.norm(vc.workspace.asRelativePath(uri, false));
  }
  const root = folder.uri.fsPath.replace(/\\/g, "/");
  const full = uri.fsPath.replace(/\\/g, "/");
  if (full.startsWith(root + "/") || full === root) {
    return Paths.relKey(uri.fsPath, folder.uri.fsPath);
  }
  return Paths.norm(vc.workspace.asRelativePath(uri, false));
}

export function fsPath(ws: string): string | undefined {
  const folder = vc.workspace.workspaceFolders?.[0];
  if (!folder) {
    return undefined;
  }
  return Paths.wsFsPath(ws, folder.uri.fsPath);
}

export function docOf(fsPath: string | undefined): vc.TextDocument | undefined {
  if (!fsPath) {
    return undefined;
  }
  const want = path.normalize(fsPath);
  const active = vc.window.activeTextEditor;
  if (active && path.normalize(active.document.uri.fsPath) === want) {
    return active.document;
  }
  return vc.workspace.textDocuments.find(
    (d) => path.normalize(d.uri.fsPath) === want
  );
}

export function lines(fsPath: string): string[] {
  return Paths.lines(fsPath, docOf(fsPath)?.getText());
}
