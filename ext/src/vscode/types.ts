import * as vscode from "vscode";

export interface ViewComment extends vscode.Comment {
  msgId?: string;
}
