const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");

const REQ = ".load-request";
const STATE = vscode.CommentThreadState;

// ── utils ──────────────────────────────────────────────────────────────

function norm(p) {
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function relKey(fileUri, folderUri) {
  const root = folderUri.fsPath.replace(/\\/g, "/");
  const full = fileUri.fsPath.replace(/\\/g, "/");
  if (full.startsWith(root + "/") || full === root) {
    return full.slice(root.length).replace(/^\/+/, "");
  }
  return norm(vscode.workspace.asRelativePath(fileUri, false));
}

function wsFsPath(ws) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return undefined;
  }
  return path.join(folder.uri.fsPath, ...norm(ws).split("/"));
}

/** span [1-based] → 0-based Range (целые строки). */
function spanRange(span, endCol = Number.MAX_SAFE_INTEGER) {
  const start = Math.max(0, (span?.[0] || 1) - 1);
  const end = Math.max(start, (span?.[1] || span?.[0] || 1) - 1);
  return new vscode.Range(start, 0, end, endCol);
}

function spanLine(span) {
  return Math.max(0, (span?.[0] || 1) - 1);
}

function threadHasUnresolved(th) {
  return (th?.msgs || []).some((m) => m.status === "UNRESOLVED");
}

function err(e) {
  vscode.window.showErrorMessage(String(e?.message || e));
}

function flash(msg, ms = 2000) {
  vscode.window.setStatusBarMessage(`Crucible: ${msg}`, ms);
}

function localAuthor() {
  try {
    return os.userInfo().username || "local";
  } catch {
    return "local";
  }
}

function msgIdOf(comment, thread, data) {
  if (!comment) {
    return undefined;
  }
  if (comment.msgId) {
    return String(comment.msgId);
  }
  const m = /\bmid=(\S+)/.exec(String(comment.contextValue || ""));
  if (m) {
    return m[1];
  }
  const idx = (thread?.comments || []).indexOf(comment);
  if (idx >= 0 && data?.msgs?.[idx]) {
    return String(data.msgs[idx].id);
  }
  const name = comment.author?.name;
  const body = String(comment.body?.value || comment.body || "");
  const hit = (data?.msgs || []).find(
    (x) =>
      (x.author === name || x.user === name) && body.includes(x.text || "")
  );
  return hit ? String(hit.id) : undefined;
}

function makeComment(msg) {
  const head =
    msg.status && msg.status !== "UNKNOWN" ? `**${msg.status}**\n\n` : "";
  const md = new vscode.MarkdownString(`${head}${msg.text || ""}`);
  md.isTrusted = true;
  return {
    author: { name: msg.author || msg.user || "?" },
    body: md,
    mode: vscode.CommentMode.Preview,
    contextValue: `canDelete canCopy mid=${msg.id || ""}`,
    msgId: String(msg.id || ""),
    timestamp: msg.date ? new Date(msg.date) : undefined,
  };
}

function commentUrl(msgId, bundle) {
  const id = String(msgId || "").split(":").pop();
  return `${bundle.base}/cru/${bundle.review.id}#c${id}`;
}

/** Args меню Comments: (thread, comment) | (comment, thread) | {thread,comment}. */
function unpack(a, b) {
  if (a?.thread && (a.comment || Array.isArray(a.thread?.comments))) {
    return { thread: a.thread, comment: a.comment };
  }
  const isTh = (x) =>
    x && (Array.isArray(x.comments) || x.uri) && x.range !== undefined;
  const isCm = (x) =>
    x && (x.body !== undefined || x.author !== undefined) && !isTh(x);
  if (isTh(a) && (isCm(b) || b === undefined)) {
    return { thread: a, comment: b };
  }
  if (isCm(a) && isTh(b)) {
    return { thread: b, comment: a };
  }
  if (isCm(a) && !b && painter) {
    const thread =
      painter.threads.find((t) => (t.comments || []).includes(a)) ||
      painter.threads.find((t) =>
        (t.comments || []).some((c) => c.msgId && c.msgId === a.msgId)
      );
    return { thread, comment: a };
  }
  return { thread: a, comment: b };
}

// ── Painter ────────────────────────────────────────────────────────────

class Painter {
  /** @param {vscode.CommentController} controller */
  constructor(controller) {
    this.controller = controller;
    this.bundle = undefined;
    this.jsonPath = undefined;
    this.threads = [];
    /** @type {WeakMap<vscode.CommentThread, string>} */
    this.meta = new WeakMap();
    this.gutter = undefined;
    this.lineHi = undefined;
    this.byFile = new Map();
    this.log = vscode.window.createOutputChannel("Crucible");
  }

  info(msg) {
    this.log.appendLine(`[${new Date().toISOString()}] ${msg}`);
  }

  reindex() {
    this.byFile = new Map();
    for (const th of this.bundle?.threads || []) {
      const key = norm(th.ws);
      if (!this.byFile.has(key)) {
        this.byFile.set(key, []);
      }
      this.byFile.get(key).push(th);
    }
    if (this.bundle) {
      this.bundle.count = this.bundle.threads.length;
    }
  }

  load(jsonUri) {
    const fsPath = typeof jsonUri === "string" ? jsonUri : jsonUri.fsPath;
    this.bundle = JSON.parse(fs.readFileSync(fsPath, "utf8"));
    if (!this.bundle?.review?.id || !Array.isArray(this.bundle.threads)) {
      throw new Error("это не *-threads.json");
    }
    const total = this.bundle.threads.length;
    this.bundle.threads = this.bundle.threads.filter(threadHasUnresolved);
    this.jsonPath = fsPath;
    this.reindex();
    this.info(
      `loaded ${fsPath}: ${this.bundle.threads.length}/${total} threads (unresolved only)`
    );
  }

  clear() {
    for (const t of this.threads) {
      t.dispose();
    }
    this.threads = [];
  }

  reset() {
    this.clear();
    this.bundle = undefined;
    this.jsonPath = undefined;
    this.byFile = new Map();
    for (const ed of vscode.window.visibleTextEditors) {
      if (this.gutter) {
        ed.setDecorations(this.gutter, []);
      }
      if (this.lineHi) {
        ed.setDecorations(this.lineHi, []);
      }
    }
  }

  threadIdOf(ct) {
    if (!ct) {
      return undefined;
    }
    return (
      this.meta.get(ct) ||
      /\btid=(\S+)/.exec(String(ct.contextValue || ""))?.[1] ||
      /·\s*(\S+)\s*$/.exec(String(ct.label || ""))?.[1]
    );
  }

  liveOf(ctOrId) {
    const id = typeof ctOrId === "string" ? ctOrId : this.threadIdOf(ctOrId);
    if (!id) {
      return undefined;
    }
    return (
      this.threads.find((t) => this.threadIdOf(t) === id) ||
      (typeof ctOrId === "object" ? ctOrId : undefined)
    );
  }

  dataOf(ct) {
    const id = this.threadIdOf(ct);
    return id && this.bundle
      ? this.bundle.threads.find((t) => t.id === id)
      : undefined;
  }

  threadsFor(uri) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return [];
    }
    return this.byFile.get(relKey(uri, folder.uri)) || [];
  }

  statusContext(status, threadId) {
    const flag =
      status === "RESOLVED" ? "canUnresolve" : "canResolve";
    const base = `crucible ${flag} canDeleteThread canAddToChat`;
    return threadId ? `${base} tid=${threadId}` : base;
  }

  setUi(ct, status, threadId) {
    if (STATE) {
      ct.state =
        status === "RESOLVED" ? STATE.Resolved : STATE.Unresolved;
    }
    ct.contextValue = this.statusContext(status, threadId);
  }

  setState(ct, status) {
    const live = this.liveOf(ct) || ct;
    const data = this.dataOf(live);
    const tid = data?.id || this.threadIdOf(live);
    this.setUi(live, status, tid);
    if (!data) {
      return live;
    }
    data.status = status;
    for (const m of data.msgs || []) {
      m.status = status;
    }
    live.comments = (data.msgs || []).map(makeComment);
    return live;
  }

  rebuildComments(ct, data) {
    const live = this.liveOf(ct) || ct;
    live.comments = (data.msgs || []).map(makeComment);
  }

  save() {
    if (!this.jsonPath || !this.bundle) {
      throw new Error("нечего сохранять");
    }
    for (const ct of this.threads) {
      const data = this.dataOf(ct);
      if (!data || !STATE || ct.state === undefined) {
        continue;
      }
      data.status =
        ct.state === STATE.Resolved ? "RESOLVED" : "UNRESOLVED";
    }
    this.bundle.count = this.bundle.threads.length;
    fs.writeFileSync(
      this.jsonPath,
      JSON.stringify(this.bundle, null, 2) + "\n",
      "utf8"
    );
    this.info(`saved ${this.jsonPath}`);
    flash(`сохранено → ${path.basename(this.jsonPath)}`, 2500);
  }

  /** save + decorations + statusbar; errors → toast. */
  persist() {
    try {
      this.save();
    } catch (e) {
      err(e);
      return false;
    }
    refreshDecorations();
    updateStatus();
    return true;
  }

  deleteMsg(ct, msgId) {
    const live = this.liveOf(ct) || ct;
    const data = this.dataOf(live);
    if (!data || !this.bundle) {
      throw new Error("тред не найден");
    }
    const before = (data.msgs || []).length;
    data.msgs = (data.msgs || []).filter((m) => String(m.id) !== String(msgId));
    if (data.msgs.length === before) {
      throw new Error(`msg ${msgId} не найден`);
    }
    if (!data.msgs.length) {
      this.deleteThread(live);
      return;
    }
    this.rebuildComments(live, data);
    this.save();
  }

  deleteThread(ct) {
    const id = this.threadIdOf(ct);
    const live = this.liveOf(ct);
    if (!id || !this.bundle) {
      throw new Error("тред не найден");
    }
    this.bundle.threads = this.bundle.threads.filter((t) => t.id !== id);
    this.reindex();
    this.threads = this.threads.filter((t) => this.threadIdOf(t) !== id);
    (live || ct).dispose();
    this.save();
  }

  /**
   * @param {vscode.Uri} [onlyUri]
   * @param {{ expand?: boolean }} [opts]
   */
  paint(onlyUri, opts = {}) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder || !this.bundle) {
      throw new Error("нет workspace или bundle");
    }
    const expand = opts.expand !== false;
    let list;
    if (onlyUri) {
      list = this.threadsFor(onlyUri);
      this.threads = this.threads.filter((t) => {
        if (t.uri.fsPath === onlyUri.fsPath) {
          t.dispose();
          return false;
        }
        return true;
      });
    } else {
      this.clear();
      list = this.bundle.threads;
    }

    let n = 0;
    for (const th of list) {
      const fsPath = wsFsPath(th.ws);
      if (!fsPath || !fs.existsSync(fsPath)) {
        continue;
      }
      const uri = vscode.Uri.file(fsPath);
      const ct = this.controller.createCommentThread(
        uri,
        spanRange(th.span),
        (th.msgs || []).map(makeComment)
      );
      ct.label = `${this.bundle.review.id} · ${th.id}`;
      ct.canReply = true;
      ct.collapsibleState = expand
        ? vscode.CommentThreadCollapsibleState.Expanded
        : vscode.CommentThreadCollapsibleState.Collapsed;
      this.meta.set(ct, th.id);
      this.setUi(
        ct,
        th.status === "RESOLVED" ? "RESOLVED" : "UNRESOLVED",
        th.id
      );
      this.threads.push(ct);
      n++;
    }
    this.info(`painted ${n}`);
    return n;
  }

  decorate(editor) {
    if (!editor || !this.bundle || !this.gutter) {
      return;
    }
    const list = this.threadsFor(editor.document.uri);
    editor.setDecorations(
      this.gutter,
      list.map((th) => ({
        range: new vscode.Range(spanLine(th.span), 0, spanLine(th.span), 0),
        hoverMessage: new vscode.MarkdownString(`**${th.id}** · ${th.status}`),
      }))
    );
    if (this.lineHi) {
      editor.setDecorations(
        this.lineHi,
        list.map((th) => ({ range: spanRange(th.span) }))
      );
    }
  }
}

// ── module state / handlers ────────────────────────────────────────────

/** @type {Painter | undefined} */
let painter;
/** @type {vscode.StatusBarItem | undefined} */
let status;

function refreshDecorations() {
  if (!painter) {
    return;
  }
  for (const ed of vscode.window.visibleTextEditors) {
    painter.decorate(ed);
  }
}

function updateStatus() {
  if (!status) {
    return;
  }
  status.text = painter?.bundle
    ? `$(comment-discussion) ${painter.bundle.review.id}: ${painter.threads.length}`
    : "$(comment-discussion) Crucible: idle";
  status.show();
}

/** Resolve thread from menu args; toast if missing. */
function needThread(a, b) {
  if (!painter?.bundle) {
    return undefined;
  }
  const { thread, comment } = unpack(a, b);
  if (!thread || !painter.dataOf(thread)) {
    err("тред не найден");
    return undefined;
  }
  return { thread, comment, data: painter.dataOf(thread) };
}

function reqPath() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder
    ? path.join(folder.uri.fsPath, "projects", "crucible", REQ)
    : undefined;
}

async function applyJson(fsPath) {
  if (!painter) {
    return;
  }
  painter.load(fsPath);
  const n = painter.paint(undefined, { expand: true });
  let bestWs;
  let bestN = 0;
  for (const [ws, list] of painter.byFile) {
    if (list.length > bestN) {
      bestN = list.length;
      bestWs = ws;
    }
  }
  if (bestWs) {
    const fsPath2 = wsFsPath(bestWs);
    if (fsPath2) {
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(fsPath2)
      );
      const ed = await vscode.window.showTextDocument(doc, { preview: false });
      const line = spanLine(painter.byFile.get(bestWs)[0].span);
      ed.selection = new vscode.Selection(line, 0, line, 0);
      ed.revealRange(new vscode.Range(line, 0, line, 0));
      painter.decorate(ed);
    }
  }
  refreshDecorations();
  updateStatus();
  vscode.window.showInformationMessage(
    `Crucible: ${painter.bundle.review.id} — ${n} тредов`
  );
}

async function consumeRequest() {
  const p = reqPath();
  if (!p || !fs.existsSync(p)) {
    return;
  }
  let body;
  try {
    body = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return;
  }
  try {
    fs.unlinkSync(p);
  } catch {
    /* */
  }
  if (body.file) {
    await applyJson(String(body.file));
  }
}

function onReply(reply) {
  const got = needThread(reply.thread);
  if (!got) {
    return;
  }
  const text = (reply.text || "").trim();
  if (!text) {
    return;
  }
  got.data.msgs = got.data.msgs || [];
  got.data.msgs.push({
    id: `LOCAL:${Date.now()}`,
    author: localAuthor(),
    user: "local",
    text,
    date: new Date().toISOString(),
    status: "UNRESOLVED",
    draft: false,
    deleted: false,
  });
  painter.setState(got.thread, "UNRESOLVED");
  painter.persist();
}

function setResolved(a, resolved) {
  const got = needThread(a);
  if (!got) {
    return;
  }
  painter.setState(got.thread, resolved ? "RESOLVED" : "UNRESOLVED");
  if (painter.persist()) {
    flash(`${resolved ? "resolved" : "unresolved"} → ${path.basename(painter.jsonPath || "")}`);
  }
}

function onDeleteComment(a, b) {
  const got = needThread(a, b);
  if (!got) {
    return;
  }
  const id = msgIdOf(got.comment, got.thread, got.data);
  if (!id) {
    err("коммент не найден");
    return;
  }
  try {
    painter.deleteMsg(got.thread, id);
  } catch (e) {
    err(e);
    return;
  }
  refreshDecorations();
  updateStatus();
}

function onDeleteThread(a, b) {
  const got = needThread(a, b);
  if (!got) {
    return;
  }
  try {
    painter.deleteThread(got.thread);
  } catch (e) {
    err(e);
    return;
  }
  refreshDecorations();
  updateStatus();
}

async function onAddToChat(a, b) {
  const got = needThread(a, b);
  if (!got) {
    return;
  }
  const { data } = got;
  const fsPath = wsFsPath(data.ws);
  if (!fsPath || !fs.existsSync(fsPath)) {
    err(`нет файла ${data.ws}`);
    return;
  }
  const uri = vscode.Uri.file(fsPath);
  const doc = await vscode.workspace.openTextDocument(uri);
  const start = Math.max(1, data.span?.[0] || 1);
  const end = Math.max(start, data.span?.[1] || start);
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
  const notes = (data.msgs || [])
    .map((m) => `**${m.author}** (${m.status}): ${m.text}`)
    .join("\n\n");
  const intro =
    `Crucible ${painter.bundle.review.id} · ${data.id} · ${data.ws}:${start}` +
    (end !== start ? `-${end}` : "") +
    `\n\n${notes}\n\nРазбери замечание и предложи правку.`;

  let ok = false;
  let isNew = false;
  try {
    await vscode.commands.executeCommand(
      "composer.addsymbolstocomposer",
      payload
    );
    ok = true;
    painter.info("chat: add-to-current");
  } catch (e) {
    painter.info(`chat add: ${e}`);
  }
  if (!ok) {
    try {
      await vscode.commands.executeCommand(
        "composer.addsymbolstonewcomposer",
        payload
      );
      ok = true;
      isNew = true;
      painter.info("chat: newcomposer+selection");
    } catch (e) {
      painter.info(`chat newcomposer: ${e}`);
    }
  }
  if (!ok) {
    try {
      await vscode.commands.executeCommand(
        "composer.startComposerPromptFromSelection"
      );
      ok = true;
      isNew = true;
    } catch (e) {
      painter.info(`chat fromSelection: ${e}`);
    }
  }

  await new Promise((r) => setTimeout(r, 200));

  try {
    const prev = await vscode.env.clipboard.readText();
    await vscode.env.clipboard.writeText(intro);
    await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
    await vscode.env.clipboard.writeText(prev);
  } catch (e) {
    painter.info(`chat paste: ${e}`);
  }

  if (isNew) {
    await new Promise((r) => setTimeout(r, 100));
    for (const c of ["composer.submit", "composer.startComposerPrompt"]) {
      try {
        await vscode.commands.executeCommand(c);
        painter.info(`chat submit via ${c}`);
        break;
      } catch (e) {
        painter.info(`chat submit ${c}: ${e}`);
      }
    }
  }

  const ed = await vscode.window.showTextDocument(doc, {
    preview: false,
    preserveFocus: true,
    selection: range,
  });
  ed.revealRange(range, vscode.TextEditorRevealType.InCenter);

  flash(
    ok
      ? `в чат → ${path.basename(fsPath)}:${start}-${end}`
      : "чат: не вышло (Output → Crucible)",
    3000
  );
}

async function onLink(a, b) {
  let url = typeof a === "string" ? a : undefined;
  if (!url && painter?.bundle) {
    const { comment } = unpack(a, b);
    const id = msgIdOf(comment);
    if (id) {
      url = commentUrl(id, painter.bundle);
    }
  }
  if (!url) {
    err("нет ссылки");
    return;
  }
  await vscode.env.clipboard.writeText(url);
  flash("ссылка скопирована", 1500);
}

async function paintActive() {
  const ed = vscode.window.activeTextEditor;
  if (!ed || !painter?.bundle) {
    vscode.window.showWarningMessage("Сначала make load");
    return;
  }
  const n = painter.paint(ed.document.uri, { expand: true });
  painter.decorate(ed);
  updateStatus();
  vscode.window.showInformationMessage(
    `Crucible: ${n} тредов на ${path.basename(ed.document.uri.fsPath)}`
  );
}

function cmd(id, fn) {
  return vscode.commands.registerCommand(id, fn);
}

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  const controller = vscode.comments.createCommentController("cru", "Crucible");
  controller.options = { placeHolder: "Ответ в тред…", prompt: "Reply" };
  controller.commentingRangeProvider = {
    provideCommentingRanges(document) {
      if (!painter?.bundle) {
        return [];
      }
      return painter.threadsFor(document.uri).map((th) => spanRange(th.span));
    },
  };

  painter = new Painter(controller);
  painter.gutter = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.file(
      path.join(context.extensionPath, "media", "comment.svg")
    ),
    gutterIconSize: "contain",
    overviewRulerColor: "#3794ff",
    overviewRulerLane: vscode.OverviewRulerLane.Center,
  });
  painter.lineHi = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(55, 148, 255, 0.15)",
    overviewRulerColor: "#3794ff",
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });

  status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  status.command = "cru.paint";
  updateStatus();

  const poll = setInterval(() => void consumeRequest(), 500);
  void consumeRequest();

  context.subscriptions.push(
    controller,
    painter.gutter,
    painter.lineHi,
    painter.log,
    status,
    { dispose: () => clearInterval(poll) },
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      if (ed && painter?.bundle) {
        painter.decorate(ed);
      }
    }),
    cmd("cru.load", async () => {
      const pick = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { JSON: ["json"] },
      });
      if (pick?.[0]) {
        await applyJson(pick[0].fsPath);
      }
    }),
    cmd("cru.paint", () => paintActive()),
    cmd("cru.reply", (r) => onReply(r)),
    cmd("cru.resolve", (t) => setResolved(t, true)),
    cmd("cru.unresolve", (t) => setResolved(t, false)),
    cmd("cru.del", (t, c) => onDeleteComment(t, c)),
    cmd("cru.delThread", (t) => onDeleteThread(t)),
    cmd("cru.chat", (t) => void onAddToChat(t)),
    cmd("cru.save", () => {
      try {
        painter?.save();
      } catch (e) {
        err(e);
      }
    }),
    cmd("cru.clear", () => {
      painter?.reset();
      updateStatus();
    }),
    cmd("cru.link", (a, b) => void onLink(a, b))
  );

  painter.info("activate ok");
}

function deactivate() {
  painter?.clear();
}

module.exports = { activate, deactivate, Painter };
