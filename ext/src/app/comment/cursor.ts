import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import { Paths } from "../../infra/paths";
import type { Thread } from "../../domain/thread";

export type CursorHost = {
  data: { bundle?: { review: { id: string } } };
  info(msg: string): void;
};

/**
 * Приватные команды Cursor Composer + clipboard.
 * Сломается на апдейте IDE — не адаптер VS Code API.
 */
export class Cursor {
  static async send(host: CursorHost, data: Thread): Promise<void> {
    const fsPath = Paths.wsFsPath(data.ws);
    if (!fsPath || !fs.existsSync(fsPath)) {
      vscode.window.showErrorMessage(`нет файла ${data.ws}`);
      return;
    }
    const uri = vscode.Uri.file(fsPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const start = Math.max(1, data.lines[0]);
    const end = Math.max(start, data.lines[1]);
    const endLine = Math.min(doc.lineCount, end) - 1;
    const endCol = doc.lineAt(endLine).range.end.character;
    const range = new vscode.Range(start - 1, 0, endLine, endCol);

    const rawText = doc.getText(range);
    const payload = {
      codeSelections: [
        {
          uri,
          range: {
            selectionStartLineNumber: start,
            selectionStartColumn: 1,
            positionLineNumber: end,
            positionColumn: endCol + 1,
          },
          text: "```" + doc.languageId + "\n" + rawText + "\n```",
          rawText,
        },
      ],
    };
    const notes = data.msgs
      .map((c) => `**${c.author}** (${c.status}): ${c.text}`)
      .join("\n\n");
    const intro =
      `Crucible ${host.data.bundle!.review.id} · ${data.id} · ${data.ws}:${start}` +
      (end !== start ? `-${end}` : "") +
      `\n\n${notes}\n\nРазбери замечание и предложи правку.`;

    let ok = false;
    let isNew = false;
    for (const [cmd, logLine, asNew, withPayload] of [
      ["composer.addsymbolstocomposer", "chat: add-to-current", false, true],
      ["composer.addsymbolstonewcomposer", "chat: newcomposer+selection", true, true],
      ["composer.startComposerPromptFromSelection", "chat fromSelection", true, false],
    ] as const) {
      if (ok) {
        break;
      }
      try {
        await vscode.commands.executeCommand(
          cmd,
          withPayload ? payload : undefined
        );
        ok = true;
        isNew = asNew;
        host.info(logLine);
      } catch (e) {
        host.info(`chat ${cmd}: ${e}`);
      }
    }

    await new Promise((r) => setTimeout(r, 200));

    try {
      const prev = await vscode.env.clipboard.readText();
      await vscode.env.clipboard.writeText(intro);
      await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
      await vscode.env.clipboard.writeText(prev);
    } catch (e) {
      host.info(`chat paste: ${e}`);
    }

    if (isNew) {
      await new Promise((r) => setTimeout(r, 100));
      for (const c of ["composer.submit", "composer.startComposerPrompt"]) {
        try {
          await vscode.commands.executeCommand(c);
          host.info(`chat submit via ${c}`);
          break;
        } catch (e) {
          host.info(`chat submit ${c}: ${e}`);
        }
      }
    }

    const ed = await vscode.window.showTextDocument(doc, {
      preview: false,
      preserveFocus: true,
      selection: range,
    });
    ed.revealRange(range, vscode.TextEditorRevealType.InCenter);

    vscode.window.setStatusBarMessage(
      ok
        ? `Crucible: в чат → ${path.basename(fsPath)}:${start}-${end}`
        : "Crucible: чат: не вышло (Output → Crucible)",
      3000
    );
  }
}
