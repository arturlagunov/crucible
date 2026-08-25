const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");

const REQ_NAME = ".load-request";

class Painter {
  /** @param {vscode.CommentController} controller */
  constructor(controller) {
    this.controller = controller;
    this.bundle = undefined;
    /** @type {string | undefined} */
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

  /** @param {vscode.Uri|string} jsonUri */
  load(jsonUri) {
    const fsPath = typeof jsonUri === "string" ? jsonUri : jsonUri.fsPath;
    const raw = fs.readFileSync(fsPath, "utf8");
    this.bundle = JSON.parse(raw);
    if (!this.bundle?.review?.id || !Array.isArray(this.bundle.threads)) {
      throw new Error("это не *-threads.json");
    }
    this.jsonPath = fsPath;
    this.byFile = new Map();
    for (const th of this.bundle.threads) {
      const key = norm(th.ws);
      if (!this.byFile.has(key)) {
        this.byFile.set(key, []);
      }
      this.byFile.get(key).push(th);
    }
    this.info(`loaded ${fsPath}: ${this.bundle.threads.length} threads`);
  }

  clear() {
    for (const t of this.threads) {
      t.dispose();
    }
    this.threads = [];
  }

  /** @returns {string | undefined} */
  threadIdOf(ct) {
    if (!ct) {
      return undefined;
    }
    const cached = this.meta.get(ct);
    if (cached) {
      return cached;
    }
    const m = /\btid=(\S+)/.exec(String(ct.contextValue || ""));
    if (m) {
      return m[1];
    }
    const m2 = /·\s*(\S+)\s*$/.exec(String(ct.label || ""));
    return m2?.[1];
  }

  /** Живой CommentThread из this.threads (меню может отдать другой объект). */
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

  /** @returns {any | undefined} */
  dataOf(ct) {
    const id = this.threadIdOf(ct);
    if (!id || !this.bundle) {
      return undefined;
    }
    return this.bundle.threads.find((t) => t.id === id);
  }

  save() {
    this.saveFixed();
  }

  saveFixed() {
    if (!this.jsonPath || !this.bundle) {
      throw new Error("нечего сохранять");
    }
    for (const ct of this.threads) {
      const data = this.dataOf(ct);
      if (!data) {
        continue;
      }
      if (vscode.CommentThreadState && ct.state !== undefined) {
        data.status =
          ct.state === vscode.CommentThreadState.Resolved
            ? "RESOLVED"
            : "UNRESOLVED";
      }
    }
    this.bundle.count = this.bundle.threads.length;
    fs.writeFileSync(
      this.jsonPath,
      JSON.stringify(this.bundle, null, 2) + "\n",
      "utf8"
    );
    this.info(`saved ${this.jsonPath}`);
    vscode.window.setStatusBarMessage(
      `Crucible: сохранено → ${path.basename(this.jsonPath)}`,
      2500
    );
  }

  /** @param {string} status @param {string} [threadId] */
  statusContext(status, threadId) {
    const resolved = status === "RESOLVED";
    const base = resolved
      ? "crucible canUnresolve canDeleteThread"
      : "crucible canResolve canDeleteThread";
    return threadId ? `${base} tid=${threadId}` : base;
  }

  /** @param {vscode.CommentThread} ct @param {string} status */
  applyThreadStatus(ct, status) {
    const live = this.liveOf(ct) || ct;
    const data = this.dataOf(live);
    const tid = data?.id || this.threadIdOf(live);
    const resolved = status === "RESOLVED";
    if (vscode.CommentThreadState) {
      live.state = resolved
        ? vscode.CommentThreadState.Resolved
        : vscode.CommentThreadState.Unresolved;
    }
    live.contextValue = this.statusContext(status, tid);
    if (!data) {
      return;
    }
    data.status = status;
    for (const m of data.msgs || []) {
      m.status = status;
    }
    if (this.bundle) {
      live.comments = (data.msgs || []).map((m) => makeComment(m, this.bundle));
    }
  }

  /** Пересобрать byFile из bundle.threads */
  reindex() {
    this.byFile = new Map();
    if (!this.bundle) {
      return;
    }
    for (const th of this.bundle.threads) {
      const key = norm(th.ws);
      if (!this.byFile.has(key)) {
        this.byFile.set(key, []);
      }
      this.byFile.get(key).push(th);
    }
    this.bundle.count = this.bundle.threads.length;
  }

  /**
   * Удалить msg из треда. Пустой тред → выкинуть целиком.
   * @param {vscode.CommentThread} ct
   * @param {string} msgId
   */
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
    if (data.msgs.length === 0) {
      this.deleteThread(live);
      return;
    }
    live.comments = data.msgs.map((m) => makeComment(m, this.bundle));
    this.saveFixed();
  }

  /** @param {vscode.CommentThread} ct */
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
    this.saveFixed();
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

    /** @type {any[]} */
    let list;
    if (onlyUri) {
      const key = relKey(onlyUri, folder.uri);
      list = this.byFile.get(key) || [];
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
      const fsPath = path.join(folder.uri.fsPath, ...norm(th.ws).split("/"));
      if (!fs.existsSync(fsPath)) {
        continue;
      }
      const uri = vscode.Uri.file(fsPath);
      const start = Math.max(0, (th.span?.[0] || 1) - 1);
      const end = Math.max(start, (th.span?.[1] || th.span?.[0] || 1) - 1);
      const range = new vscode.Range(start, 0, end, Number.MAX_SAFE_INTEGER);
      const comments = (th.msgs || []).map((m) => makeComment(m, this.bundle));
      const ct = this.controller.createCommentThread(uri, range, comments);
      ct.label = `${this.bundle.review.id} · ${th.id}`;
      ct.canReply = true;
      ct.collapsibleState = expand
        ? vscode.CommentThreadCollapsibleState.Expanded
        : vscode.CommentThreadCollapsibleState.Collapsed;
      this.meta.set(ct, th.id);
      const resolved = th.status === "RESOLVED";
      if (vscode.CommentThreadState) {
        ct.state = resolved
          ? vscode.CommentThreadState.Resolved
          : vscode.CommentThreadState.Unresolved;
      }
      ct.contextValue = this.statusContext(
        resolved ? "RESOLVED" : "UNRESOLVED",
        th.id
      );
      this.threads.push(ct);
      n++;
    }
    this.info(`painted ${n}`);
    return n;
  }

  /** @param {vscode.TextEditor} editor */
  decorate(editor) {
    if (!editor || !this.bundle || !this.gutter) {
      return;
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return;
    }
    const list = this.byFile.get(relKey(editor.document.uri, folder.uri)) || [];
    editor.setDecorations(
      this.gutter,
      list.map((th) => {
        const line = Math.max(0, (th.span?.[0] || 1) - 1);
        return {
          range: new vscode.Range(line, 0, line, 0),
          hoverMessage: new vscode.MarkdownString(
            `**${th.id}** · ${th.status}`
          ),
        };
      })
    );
    if (this.lineHi) {
      editor.setDecorations(
        this.lineHi,
        list.map((th) => {
          const line = Math.max(0, (th.span?.[0] || 1) - 1);
          return {
            range: new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER),
          };
        })
      );
    }
  }
}

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

function localAuthor() {
  try {
    return os.userInfo().username || "local";
  } catch {
    return "local";
  }
}

function makeComment(msg, bundle) {
  const id = String(msg.id || "").split(":").pop();
  const url = `${bundle.base}/cru/${bundle.review.id}#c${id}`;
  const cmd = vscode.Uri.parse(
    `command:crucibleCommentsDemo.copyUrl?${encodeURIComponent(
      JSON.stringify([url])
    )}`
  );
  const head =
    msg.status && msg.status !== "UNKNOWN" ? `**${msg.status}**\n\n` : "";
  const md = new vscode.MarkdownString(
    `${head}${msg.text || ""}\n\n[📋 скопировать ссылку](${cmd})`
  );
  md.isTrusted = true;
  return {
    author: { name: msg.author || msg.user || "?" },
    body: md,
    mode: vscode.CommentMode.Preview,
    contextValue: `canDelete mid=${msg.id || ""}`,
    msgId: String(msg.id || ""),
    timestamp:
      typeof msg.date === "number"
        ? new Date(msg.date)
        : msg.date
          ? new Date(msg.date)
          : undefined,
  };
}

/** @type {Painter | undefined} */
let painter;
/** @type {vscode.StatusBarItem | undefined} */
let status;

function reqPath() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return undefined;
  }
  return path.join(folder.uri.fsPath, "projects", "crucible", REQ_NAME);
}

async function applyJson(fsPath) {
  if (!painter) {
    return;
  }
  painter.load(fsPath);
  const n = painter.paint(undefined, { expand: true });
  let bestWs = null;
  let bestN = 0;
  for (const [ws, list] of painter.byFile) {
    if (list.length > bestN) {
      bestN = list.length;
      bestWs = ws;
    }
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (folder && bestWs) {
    const uri = vscode.Uri.file(
      path.join(folder.uri.fsPath, ...bestWs.split("/"))
    );
    const doc = await vscode.workspace.openTextDocument(uri);
    const ed = await vscode.window.showTextDocument(doc, { preview: false });
    const line = Math.max(0, (painter.byFile.get(bestWs)[0].span[0] || 1) - 1);
    ed.selection = new vscode.Selection(line, 0, line, 0);
    ed.revealRange(new vscode.Range(line, 0, line, 0));
    painter.decorate(ed);
  }
  for (const ed of vscode.window.visibleTextEditors) {
    painter.decorate(ed);
  }
  updateStatus();
  vscode.window.showInformationMessage(
    `Crucible: ${painter.bundle.review.id} — ${n} тредов. Reply / Resolve в шапке треда.`
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
  if (!body.file) {
    return;
  }
  await applyJson(String(body.file));
}

function startPoll(context) {
  const t = setInterval(() => void consumeRequest(), 500);
  context.subscriptions.push({ dispose: () => clearInterval(t) });
  void consumeRequest();
}

function updateStatus() {
  if (!status) {
    return;
  }
  if (!painter?.bundle) {
    status.text = "$(comment-discussion) Crucible: idle";
  } else {
    status.text = `$(comment-discussion) ${painter.bundle.review.id}: ${painter.threads.length}`;
  }
  status.show();
}

/** @param {vscode.CommentReply} reply */
function onReply(reply) {
  if (!painter?.bundle) {
    return;
  }
  const ct = reply.thread;
  const data = painter.dataOf(ct);
  if (!data) {
    vscode.window.showErrorMessage("тред не найден в bundle");
    return;
  }
  const text = (reply.text || "").trim();
  if (!text) {
    return;
  }
  const msg = {
    id: `LOCAL:${Date.now()}`,
    author: localAuthor(),
    user: "local",
    text,
    date: new Date().toISOString(),
    status: "UNRESOLVED",
    draft: false,
    deleted: false,
  };
  data.msgs = data.msgs || [];
  data.msgs.push(msg);
  painter.applyThreadStatus(ct, "UNRESOLVED");
  try {
    painter.saveFixed();
  } catch (e) {
    vscode.window.showErrorMessage(String(e.message || e));
  }
  refreshDecorations();
  updateStatus();
}

/** Распаковать args меню Comments (порядок thread/comment плавает). */
function unpackThreadComment(a, b) {
  if (a && typeof a === "object" && a.thread && (a.comment || a.reply === undefined)) {
    if (a.comment || Array.isArray(a.thread?.comments)) {
      return { thread: a.thread, comment: a.comment };
    }
  }
  const isThread = (x) =>
    x && (Array.isArray(x.comments) || x.uri) && x.range !== undefined;
  const isComment = (x) =>
    x && (x.body !== undefined || x.author !== undefined) && !isThread(x);
  if (isThread(a) && (isComment(b) || b === undefined)) {
    return { thread: a, comment: b };
  }
  if (isComment(a) && isThread(b)) {
    return { thread: b, comment: a };
  }
  if (isComment(a) && !b && painter) {
    const thread =
      painter.threads.find((t) => (t.comments || []).includes(a)) ||
      painter.threads.find((t) =>
        (t.comments || []).some(
          (c) => c.msgId && c.msgId === a.msgId && a.msgId
        )
      );
    return { thread, comment: a };
  }
  return { thread: a, comment: b };
}

/** @param {vscode.CommentThread} thread */
function setResolved(thread, resolved) {
  if (!painter?.bundle) {
    return;
  }
  const { thread: t } = unpackThreadComment(thread, undefined);
  const ct = t || thread;
  if (!painter.dataOf(ct)) {
    vscode.window.showErrorMessage("тред не найден в bundle");
    return;
  }
  painter.applyThreadStatus(ct, resolved ? "RESOLVED" : "UNRESOLVED");
  try {
    painter.saveFixed();
  } catch (e) {
    vscode.window.showErrorMessage(String(e.message || e));
    return;
  }
  refreshDecorations();
  updateStatus();
  vscode.window.setStatusBarMessage(
    `Crucible: ${resolved ? "resolved" : "unresolved"} → ${path.basename(painter.jsonPath || "")}`,
    2000
  );
}

function onDeleteComment(a, b) {
  if (!painter?.bundle) {
    return;
  }
  const { thread, comment } = unpackThreadComment(a, b);
  if (!thread) {
    painter.info(
      `deleteComment: no thread args=${typeof a},${typeof b} keysA=${a && Object.keys(a)}`
    );
    vscode.window.showErrorMessage("тред не найден");
    return;
  }
  const data = painter.dataOf(thread);
  if (!data) {
    painter.info(
      `deleteComment: dataOf miss label=${thread.label} cv=${thread.contextValue}`
    );
    vscode.window.showErrorMessage("тред не найден");
    return;
  }
  let msgId = comment?.msgId;
  if (!msgId && comment?.contextValue) {
    const m = /\bmid=(\S+)/.exec(String(comment.contextValue));
    msgId = m?.[1];
  }
  if (!msgId && comment) {
    const idx = (thread.comments || []).indexOf(comment);
    if (idx >= 0) {
      msgId = data.msgs?.[idx]?.id;
    }
  }
  if (!msgId && comment?.author?.name) {
    const hit = (data.msgs || []).find(
      (m) =>
        (m.author === comment.author.name || m.user === comment.author.name) &&
        String(comment.body?.value || comment.body || "").includes(m.text || "")
    );
    msgId = hit?.id;
  }
  if (!msgId) {
    vscode.window.showErrorMessage("коммент не найден");
    return;
  }
  try {
    painter.deleteMsg(thread, String(msgId));
  } catch (e) {
    vscode.window.showErrorMessage(String(e.message || e));
    return;
  }
  refreshDecorations();
  updateStatus();
}

function onDeleteThread(a, b) {
  if (!painter?.bundle) {
    return;
  }
  const { thread } = unpackThreadComment(a, b);
  if (!thread || !painter.dataOf(thread)) {
    vscode.window.showErrorMessage("тред не найден");
    return;
  }
  try {
    painter.deleteThread(thread);
  } catch (e) {
    vscode.window.showErrorMessage(String(e.message || e));
    return;
  }
  refreshDecorations();
  updateStatus();
}

function refreshDecorations() {
  if (!painter) {
    return;
  }
  for (const ed of vscode.window.visibleTextEditors) {
    painter.decorate(ed);
  }
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

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  const controller = vscode.comments.createCommentController(
    "crucible-comments",
    "Crucible"
  );
  controller.options = {
    placeHolder: "Ответ в тред…",
    prompt: "Reply",
  };
  controller.commentingRangeProvider = {
    provideCommentingRanges(document) {
      if (!painter?.bundle) {
        return [];
      }
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        return [];
      }
      const list = painter.byFile.get(relKey(document.uri, folder.uri)) || [];
      return list.map((th) => {
        const line = Math.max(0, (th.span?.[0] || 1) - 1);
        return new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
      });
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

  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = "crucibleCommentsDemo.paintActive";
  updateStatus();
  startPoll(context);

  context.subscriptions.push(
    controller,
    painter.gutter,
    painter.lineHi,
    painter.log,
    status,
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      if (ed && painter?.bundle) {
        painter.decorate(ed);
      }
    }),
    vscode.commands.registerCommand("crucibleCommentsDemo.load", async () => {
      const pick = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { JSON: ["json"] },
      });
      if (pick?.[0]) {
        await applyJson(pick[0].fsPath);
      }
    }),
    vscode.commands.registerCommand("crucibleCommentsDemo.paintActive", () =>
      paintActive()
    ),
    vscode.commands.registerCommand("crucibleCommentsDemo.reply", (reply) =>
      onReply(reply)
    ),
    vscode.commands.registerCommand("crucibleCommentsDemo.resolve", (thread) =>
      setResolved(thread, true)
    ),
    vscode.commands.registerCommand("crucibleCommentsDemo.unresolve", (thread) =>
      setResolved(thread, false)
    ),
    vscode.commands.registerCommand(
      "crucibleCommentsDemo.deleteComment",
      (thread, comment) => onDeleteComment(thread, comment)
    ),
    vscode.commands.registerCommand(
      "crucibleCommentsDemo.deleteThread",
      (thread) => onDeleteThread(thread)
    ),
    vscode.commands.registerCommand("crucibleCommentsDemo.save", () => {
      try {
        painter?.saveFixed();
      } catch (e) {
        vscode.window.showErrorMessage(String(e.message || e));
      }
    }),
    vscode.commands.registerCommand("crucibleCommentsDemo.clear", () => {
      painter?.clear();
      const g = painter?.gutter;
      const h = painter?.lineHi;
      if (painter) {
        painter.bundle = undefined;
        painter.jsonPath = undefined;
        painter.byFile = new Map();
      }
      for (const ed of vscode.window.visibleTextEditors) {
        if (g) {
          ed.setDecorations(g, []);
        }
        if (h) {
          ed.setDecorations(h, []);
        }
      }
      updateStatus();
    }),
    vscode.commands.registerCommand(
      "crucibleCommentsDemo.copyUrl",
      async (url) => {
        if (typeof url === "string") {
          await vscode.env.clipboard.writeText(url);
        }
      }
    )
  );

  painter.info("activate ok");
}

function deactivate() {
  painter?.clear();
}

module.exports = { activate, deactivate, Painter };
