import * as vscode from "vscode";

export interface CrucibleComment extends vscode.Comment {
  msgId?: string;
}
