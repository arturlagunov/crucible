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

function docForPath(fsPath) {
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

/** Ключ файла в byFile — совпадает с relKey(uri) даже если ws в json другого формата. */
function wsKey(ws, folderUri) {
  const fp = wsFsPath(ws);
  if (fp && fs.existsSync(fp)) {
    return relKey(vscode.Uri.file(fp), folderUri);
  }
  return norm(ws);
}

/** span [1-based] → 0-based Range (целые строки). */
function spanRange(span, doc) {
  const start = Math.max(0, (span?.[0] || 1) - 1);
  const end = Math.max(start, (span?.[1] || span?.[0] || 1) - 1);
  if (doc && end < doc.lineCount) {
    const endCol = doc.lineAt(end).text.length;
    return new vscode.Range(start, 0, end, endCol);
  }
  return new vscode.Range(start, 0, end, Number.MAX_SAFE_INTEGER);
}

function spanLine(span) {
  return Math.max(0, (span?.[0] || 1) - 1);
}

/** 0-based line → новая строка после TextDocumentContentChangeEvent. */
function shiftLine(line, change) {
  const start = change.range.start.line;
  const end = change.range.end.line;
  const delta =
    change.text.split("\n").length - 1 - (end - start);
  if (line < start) {
    return line;
  }
  if (line > end) {
    return line + delta;
  }
  return line + delta;
}

/** span [1-based] после одной правки. */
function shiftSpan(span, change) {
  const a = span?.[0] || 1;
  const b = span?.[1] || a;
  return [shiftLine(a - 1, change) + 1, shiftLine(b - 1, change) + 1];
}

/** Правка пересекает span треда [1-based]. */
function editOverlapsSpan(change, span) {
  const start = change.range.start.line + 1;
  const end = change.range.end.line + 1;
  const a = span?.[0] || 1;
  const b = span?.[1] ?? a;
  return !(end < a || start > b);
}

function clampSpan(span, lineCount) {
  const maxLine = Math.max(1, lineCount);
  const a = Math.max(1, Math.min(span[0], maxLine));
  const b = Math.max(a, Math.min(span[1] ?? a, maxLine));
  return [a, b];
}

/** Треды файла — по возрастанию span (Cursor ломает gutter при обратном порядке). */
function sortBySpan(list) {
  return [...list].sort(
    (a, b) => a.span[0] - b.span[0] || (a.span[1] ?? a.span[0]) - (b.span[1] ?? b.span[0])
  );
}

function threadLabel(reviewId, th) {
  const start = th.span?.[0] || 1;
  const end = th.span?.[1] || start;
  const lines = start === end ? String(start) : `${start}-${end}`;
  const warn = th.anchorMiss ? " ⚠" : "";
  return `${reviewId} · ${th.id} · :${lines}${warn}`;
}

function normLine(s) {
  return String(s || "").replace(/\s+$/, "");
}

function linesAt(docLines, span) {
  const a = span?.[0] || 1;
  const b = span?.[1] ?? a;
  const out = [];
  for (let i = a; i <= b; i++) {
    if (i >= 1 && i <= docLines.length) {
      out.push(docLines[i - 1]);
    }
  }
  return out;
}

function linesEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (normLine(a[i]) !== normLine(b[i])) {
      return false;
    }
  }
  return true;
}

const TRIVIAL_ANCHOR = new Set([
  "",
  ";",
  "(",
  ")",
  "КонецЕсли",
  "КонецФункции",
  "КонецПроцедуры",
  "Иначе",
]);

function isTrivialAnchor(line) {
  return TRIVIAL_ANCHOR.has(normLine(line).trim());
}

/** Содержимое span → anchor.lines (без пустых строк). */
function captureAnchor(docLines, span) {
  const raw = linesAt(docLines, span).map(normLine);
  const lines = raw.filter((l) => l.length > 0);
  return lines.length ? lines : raw;
}

/** Искать блок anchor.lines в файле; hint — ближайший к span[0]. */
function findAnchorSpan(docLines, anchor, hintSpan) {
  if (!anchor?.length) {
    return null;
  }
  const hint = hintSpan?.[0] || 1;
  const n = anchor.length;

  let best = null;
  let bestDist = Infinity;
  for (let start = 1; start <= docLines.length - n + 1; start++) {
    const block = linesAt(docLines, [start, start + n - 1]).map(normLine);
    if (linesEqual(block, anchor)) {
      const dist = Math.abs(start - hint);
      if (dist < bestDist) {
        bestDist = dist;
        best = [start, start + n - 1];
      }
    }
  }
  if (best) {
    return best;
  }

  const needle = anchor.find((l) => !isTrivialAnchor(l)) || anchor[0];
  if (!needle || anchor.length === 1) {
    return null;
  }
  return findAnchorSpan(docLines, [needle], hintSpan);
}

function readDocLines(fsPath) {
  return fs.readFileSync(fsPath, "utf8").split(/\r?\n/);
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
  const cleanName = stripLnAuthor(name);
  const body = String(comment.body?.value || comment.body || "");
  const hit = (data?.msgs || []).find(
    (x) =>
      (x.author === cleanName ||
        x.user === cleanName ||
        x.author === name ||
        x.user === name) &&
      body.includes(x.text || "")
  );
  return hit ? String(hit.id) : undefined;
}

function spanLineTag(span) {
  if (!span?.[0]) {
    return "";
  }
  const a = span[0];
  const b = span[1] ?? a;
  return a === b ? `${a}` : `${a}-${b}`;
}

function authorName(msg, span) {
  const who = msg.author || msg.user || "?";
  const ln = spanLineTag(span);
  return ln ? `[Ln ${ln}] ${who}` : who;
}

function stripLnAuthor(name) {
  return String(name || "").replace(/^\[Ln \d+(?:-\d+)?\] /, "");
}

function makeComment(msg, span) {
  const head =
    msg.status && msg.status !== "UNKNOWN" ? `**${msg.status}**\n\n` : "";
  const ln = spanLineTag(span);
  const loc = ln ? `**Ln ${ln}** · ` : "";
  const md = new vscode.MarkdownString(`${head}${loc}${msg.text || ""}`);
  md.isTrusted = true;
  return {
    author: { name: authorName(msg, span) },
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

  /**
   * span из json → сверка с anchor → поиск по файлу → иначе anchorMiss.
   * @returns {boolean} span изменился (найден anchor в другом месте)
   */
  locateThread(th, docLines) {
    const prevA = th.span?.[0] || 1;
    const prevB = th.span?.[1] ?? prevA;
    if (!th.anchor?.lines?.length) {
      th.anchor = { lines: captureAnchor(docLines, th.span) };
    }

    delete th.anchorMiss;
    const at = linesAt(docLines, th.span).map(normLine);
    const anchor = th.anchor.lines.map(normLine);
    if (linesEqual(at, anchor)) {
      return false;
    }

    const found = findAnchorSpan(docLines, anchor, th.span);
    if (found) {
      th.span = found;
      if (found[0] !== prevA || found[1] !== prevB) {
        this.info(`${th.id} anchor ${prevA}-${prevB} → ${found[0]}-${found[1]}`);
        return true;
      }
      return false;
    }

    th.anchorMiss = true;
    return false;
  }

  locateFileThreads(threads, fsPath) {
    const docLines = readDocLines(fsPath);
    let changed = false;
    const missed = [];
    for (const th of threads) {
      if (this.locateThread(th, docLines)) {
        changed = true;
      }
      if (th.anchorMiss) {
        missed.push(th);
      }
    }
    let line = 1;
    for (const th of missed) {
      const n = Math.max(1, th.anchor?.lines?.length || 1);
      const end = Math.min(line + n - 1, docLines.length);
      const span = [line, end];
      const prevA = th.span?.[0] || 1;
      const prevB = th.span?.[1] ?? prevA;
      if (span[0] !== prevA || span[1] !== prevB) {
        th.span = span;
        this.info(`${th.id} anchor miss → :${span[0]}-${span[1]}`);
        changed = true;
      }
      line = end + 1;
    }
    return changed;
  }

  reindex() {
    this.byFile = new Map();
    const folder = vscode.workspace.workspaceFolders?.[0];
    for (const th of this.bundle?.threads || []) {
      const key = folder ? wsKey(th.ws, folder.uri) : norm(th.ws);
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
      /·\s*(CMT:\S+)\s*·/.exec(String(ct.label || ""))?.[1]
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
    const key = relKey(uri, folder.uri);
    const hit = this.byFile.get(key);
    if (hit?.length) {
      return hit;
    }
    const want = path.normalize(uri.fsPath);
    for (const list of this.byFile.values()) {
      const fp = wsFsPath(list[0]?.ws);
      if (fp && path.normalize(fp) === want) {
        return list;
      }
    }
    return [];
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
    live.comments = (data.msgs || []).map((m) => makeComment(m, data.span));
    return live;
  }

  rebuildComments(ct, data) {
    const live = this.liveOf(ct) || ct;
    live.comments = (data.msgs || []).map((m) => makeComment(m, data.span));
  }

  /** Обновить range/label/comments — панель Comments читает author и range. */
  syncThread(ct, data) {
    const doc = docForPath(ct.uri.fsPath);
    const r = spanRange(data.span, doc);
    ct.label = threadLabel(this.bundle.review.id, data);
    ct.comments = (data.msgs || []).map((m) => makeComment(m, data.span));
    ct.range = r;
  }

  syncThreads(list) {
    const touched = new Set(list);
    for (const ct of this.threads) {
      const data = this.dataOf(ct);
      if (data && touched.has(data)) {
        this.syncThread(ct, data);
      }
    }
  }

  /** Cursor кэширует панель Comments — пересоздаём controller + все треды. */
  remountPanel(expanded, expandUri) {
    if (!extContext || !this.bundle) {
      return;
    }
    this.clear();
    try {
      cruController?.dispose();
    } catch (e) {
      this.info(`controller dispose: ${e}`);
    }
    cruController = createCruController();
    extContext.subscriptions.push(cruController);
    this.controller = cruController;
    this.paint(undefined, { expand: false });
    const expandKey = expandUri?.toString();
    for (const ct of this.threads) {
      const id = this.threadIdOf(ct);
      const data = this.dataOf(ct);
      const onFile = expandKey && ct.uri.toString() === expandKey;
      if (
        (id && expanded.has(id)) ||
        onFile ||
        data?.anchorMiss
      ) {
        ct.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
      }
    }
  }

  save(opts = {}) {
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
    if (!opts.quiet) {
      flash(`сохранено → ${path.basename(this.jsonPath)}`, 2500);
    }
  }

  /** Сдвинуть span тредов файла по правкам; обновить UI и json. */
  applyChanges(uri, changes, lineCount) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder || !this.bundle || !changes?.length) {
      return false;
    }
    const list = this.threadsFor(uri);
    if (!list?.length) {
      return false;
    }

    let shifted = false;
    const moved = [];
    for (const change of changes) {
      for (const th of list) {
        const prev = th.span;
        const next = clampSpan(shiftSpan(th.span, change), lineCount);
        if (next[0] !== th.span[0] || next[1] !== th.span[1]) {
          th.span = next;
          shifted = true;
          moved.push(`${th.id} ${prev}→${next}`);
        }
      }
    }

    const spansBefore = list.map((th) => `${th.span[0]},${th.span[1]}`);
    this.locateFileThreads(list, uri.fsPath);
    const relocated = list.some(
      (th, i) => `${th.span[0]},${th.span[1]}` !== spansBefore[i]
    );

    const expanded = new Set();
    for (const ct of this.threads) {
      if (
        ct.collapsibleState === vscode.CommentThreadCollapsibleState.Expanded
      ) {
        const id = this.threadIdOf(ct);
        if (id) {
          expanded.add(id);
        }
      }
    }

    if (shifted || relocated) {
      this.info(`shift ${path.basename(uri.fsPath)}: ${moved.join(", ")}`);
      this.remountPanel(expanded, uri);
      refreshDecorations();
      this.save({ quiet: true });
      flash(`${path.basename(uri.fsPath)} → ${list[0].span[0]}`, 1500);
      return true;
    }

    let touched = false;
    for (const change of changes) {
      for (const th of list) {
        if (editOverlapsSpan(change, th.span)) {
          touched = true;
          break;
        }
      }
      if (touched) {
        break;
      }
    }
    if (touched) {
      this.repaintFile(uri, false);
      refreshDecorations();
    }
    return touched;
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

  /** Пересоздать CommentThread одного файла (Cursor теряет виджет после правок). */
  repaintFile(uri, expand = true) {
    if (!this.bundle || !this.controller) {
      return 0;
    }
    const list = this.threadsFor(uri);
    if (!list.length) {
      return 0;
    }

    this.locateFileThreads(list, uri.fsPath);

    for (const ct of [...this.threads]) {
      if (ct.uri.fsPath === uri.fsPath) {
        ct.dispose();
      }
    }
    this.threads = this.threads.filter((t) => t.uri.fsPath !== uri.fsPath);

    let n = 0;
    for (const th of sortBySpan(list)) {
      const fsPath = wsFsPath(th.ws);
      if (!fsPath || !fs.existsSync(fsPath)) {
        continue;
      }
      const ct = this.mountThread(th, expand);
      if (ct) {
        this.threads.push(ct);
        n++;
      }
    }
    if (n) {
      this.info(`repaint ${path.basename(uri.fsPath)}: ${n}`);
    }
    return n;
  }

  mountThread(th, expand) {
    const fsPath = wsFsPath(th.ws);
    if (!fsPath || !fs.existsSync(fsPath) || !this.bundle) {
      return undefined;
    }
    const uri = vscode.Uri.file(fsPath);
    const doc = docForPath(fsPath);
    try {
      const ct = this.controller.createCommentThread(
        uri,
        spanRange(th.span, doc),
        (th.msgs || []).map((m) => makeComment(m, th.span))
      );
      ct.label = threadLabel(this.bundle.review.id, th);
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
      if (doc) {
        ct.range = spanRange(th.span, doc);
      }
      return ct;
    } catch (e) {
      this.info(`mount ${th.id} @${th.span}: ${e}`);
      return undefined;
    }
  }

  liveThreadsFor(uri) {
    const fp = uri.fsPath;
    return this.threads.filter((t) => t.uri.fsPath === fp);
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
    let spanDirty = false;
    const byFile = new Map();
    for (const th of list) {
      const fsPath = wsFsPath(th.ws);
      if (!fsPath || !fs.existsSync(fsPath)) {
        continue;
      }
      if (!byFile.has(fsPath)) {
        byFile.set(fsPath, []);
      }
      byFile.get(fsPath).push(th);
    }

    for (const [fsPath, fileThreads] of byFile) {
      if (this.locateFileThreads(fileThreads, fsPath)) {
        spanDirty = true;
      }
      for (const th of sortBySpan(fileThreads)) {
        const ct = this.mountThread(th, expand);
        if (!ct) {
          continue;
        }
        this.threads.push(ct);
        n++;
      }
    }
    if (spanDirty) {
      this.save({ quiet: true });
    }
    this.info(`painted ${n}`);
    return n;
  }

  decorate(editor) {
    if (!editor || !this.bundle) {
      return;
    }
    const live = this.liveThreadsFor(editor.document.uri);
    const marks = [];
    const hi = [];
    for (const ct of live) {
      const data = this.dataOf(ct);
      if (!data) {
        continue;
      }
      const line = ct.range?.start?.line ?? spanLine(data.span);
      if (this.gutter) {
        marks.push({
          range: new vscode.Range(line, 0, line, 0),
          hoverMessage: new vscode.MarkdownString(
            `**${data.id}** · ${data.status}${data.anchorMiss ? " ⚠" : ""}\n\nAlt+; — открыть`
          ),
        });
      }
      hi.push({ range: ct.range ?? spanRange(data.span, editor.document) });
    }
    if (this.gutter) {
      editor.setDecorations(this.gutter, marks);
    }
    if (this.lineHi) {
      editor.setDecorations(this.lineHi, hi);
    }
  }
}

// ── module state / handlers ────────────────────────────────────────────

/** @type {Painter | undefined} */
let painter;
/** @type {vscode.ExtensionContext | undefined} */
let extContext;
/** @type {vscode.CommentController | undefined} */
let cruController;
/** @type {vscode.StatusBarItem | undefined} */
let status;
/** @type {Map<string, vscode.TextDocumentContentChangeEvent[]>} */
const shiftPending = new Map();
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const shiftTimers = new Map();
/** @type {vscode.EventEmitter<void> | undefined} */
let lensEmitter;

function refreshCodeLenses() {
  lensEmitter?.fire();
}

function scheduleShift(e) {
  if (!painter?.bundle || e.document.uri.scheme !== "file") {
    return;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return;
  }
  if (!painter.threadsFor(e.document.uri).length) {
    return;
  }

  const key = e.document.uri.toString();
  const buf = shiftPending.get(key) || [];
  buf.push(...e.contentChanges);
  shiftPending.set(key, buf);

  const prev = shiftTimers.get(key);
  if (prev) {
    clearTimeout(prev);
  }
  shiftTimers.set(
    key,
    setTimeout(() => {
      shiftTimers.delete(key);
      const changes = shiftPending.get(key) || [];
      shiftPending.delete(key);
      if (!changes.length || !painter?.bundle) {
        return;
      }
      const doc = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === key
      );
      if (!doc) {
        return;
      }
      if (painter.applyChanges(doc.uri, changes, doc.lineCount)) {
        painter.info(
          `shift ${changes.length} edit(s) → ${path.basename(doc.uri.fsPath)}`
        );
      }
    }, 400)
  );
}

function refreshDecorations() {
  if (!painter) {
    return;
  }
  for (const ed of vscode.window.visibleTextEditors) {
    painter.decorate(ed);
  }
  refreshCodeLenses();
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

function threadDataAtLine(uri, line0) {
  const line1 = line0 + 1;
  for (const th of painter.threadsFor(uri)) {
    const a = th.span[0];
    const b = th.span[1] ?? a;
    if (line1 >= a && line1 <= b) {
      return th;
    }
  }
  let best;
  let bestDist = 5;
  for (const th of painter.threadsFor(uri)) {
    const dist = Math.abs(line1 - th.span[0]);
    if (dist < bestDist) {
      bestDist = dist;
      best = th;
    }
  }
  return best;
}

function threadAtLine(uri, line0) {
  const data = threadDataAtLine(uri, line0);
  if (!data) {
    return undefined;
  }
  return painter.threads.find((t) => painter.threadIdOf(t) === data.id);
}

async function openThreadData(data, uri) {
  const ct = painter.threads.find((t) => painter.threadIdOf(t) === data.id);
  const doc = docForPath(uri.fsPath);
  if (ct && doc) {
    painter.syncThread(ct, data);
    ct.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    for (const cmdId of [
      "workbench.action.focusCommentsView",
      "workbench.panel.comments.focus",
    ]) {
      try {
        await vscode.commands.executeCommand(cmdId);
        break;
      } catch (_) {}
    }
  }
  await showThreadDoc(data);
  flash(`тред ${data.id}`, 1500);
}

async function showThreadDoc(data) {
  const lines = [`# ${data.id} · :${data.span[0]}`, ""];
  for (const m of data.msgs || []) {
    lines.push(`## ${m.author || m.user || "?"} · ${m.status || ""}`, "");
    lines.push(m.text || "", "", "---", "");
  }
  if (painter?.bundle) {
    lines.push("", `[Открыть в Crucible](${commentUrl(data.msgs?.[0]?.id, painter.bundle)})`);
  }
  const doc = await vscode.workspace.openTextDocument({
    content: lines.join("\n"),
    language: "markdown",
  });
  await vscode.window.showTextDocument(doc, {
    preview: true,
    preserveFocus: false,
  });
}

async function revealThread(ct, uri) {
  const data = painter.dataOf(ct);
  if (!data) {
    err("нет данных треда");
    return;
  }
  await openThreadData(data, uri);
  return data.id;
}

async function openThreadById(id, uriStr) {
  if (!painter?.bundle || !id) {
    vscode.window.showWarningMessage("Сначала make load");
    return;
  }
  const data = painter.bundle.threads.find((t) => t.id === id);
  if (!data) {
    err(`тред ${id} не найден в json`);
    return;
  }
  const uri = uriStr
    ? vscode.Uri.parse(uriStr)
    : vscode.Uri.file(wsFsPath(data.ws));
  await openThreadData(data, uri);
}

async function openThreadAtCursor() {
  const ed = vscode.window.activeTextEditor;
  if (!ed || !painter?.bundle) {
    vscode.window.showWarningMessage("Сначала make load");
    return;
  }
  const data = threadDataAtLine(ed.document.uri, ed.selection.active.line);
  if (!data) {
    err(`нет треда на строке ${ed.selection.active.line + 1}`);
    return;
  }
  await openThreadData(data, ed.document.uri);
}

async function paintActive() {
  const ed = vscode.window.activeTextEditor;
  if (!ed || !painter?.bundle) {
    vscode.window.showWarningMessage("Сначала make load");
    return;
  }
  const uri = ed.document.uri;
  const line = ed.selection.active.line;
  const data = threadDataAtLine(uri, line);
  if (data) {
    await openThreadData(data, uri);
    return;
  }
  const n = painter.repaintFile(uri, true);
  refreshDecorations();
  updateStatus();
  const jsonN = painter.threadsFor(uri).length;
  vscode.window.showInformationMessage(
    `Crucible: ${n}/${jsonN} на ${path.basename(uri.fsPath)}`
  );
}

function cmd(id, fn) {
  return vscode.commands.registerCommand(id, fn);
}

function createCruController() {
  const controller = vscode.comments.createCommentController("cru", "Crucible");
  controller.options = { placeHolder: "Ответ в тред…", prompt: "Reply" };
  controller.commentingRangeProvider = {
    provideCommentingRanges(document) {
      if (!painter?.bundle) {
        return [];
      }
      return painter
        .threadsFor(document.uri)
        .map((th) => spanRange(th.span, document));
    },
  };
  return controller;
}

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  extContext = context;
  cruController = createCruController();
  painter = new Painter(cruController);
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

  lensEmitter = new vscode.EventEmitter();
  context.subscriptions.push(lensEmitter);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: "file" },
      {
        onDidChangeCodeLenses: lensEmitter.event,
        provideCodeLenses(document) {
          if (!painter?.bundle) {
            return [];
          }
          const lenses = [];
          for (const th of painter.threadsFor(document.uri)) {
            const line = spanLine(th.span);
            const warn = th.anchorMiss ? " ⚠" : "";
            lenses.push(
              new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
                title: `$(comment-discussion) ${th.id}${warn}`,
                command: "cru.openId",
                arguments: [th.id, document.uri.toString()],
              })
            );
          }
          return lenses;
        },
      }
    )
  );

  const poll = setInterval(() => void consumeRequest(), 500);
  void consumeRequest();

  context.subscriptions.push(
    cruController,
    painter.gutter,
    painter.lineHi,
    painter.log,
    status,
    { dispose: () => clearInterval(poll) },
    vscode.workspace.onDidChangeTextDocument(scheduleShift),
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      if (ed && painter?.bundle) {
        const jsonN = painter.threadsFor(ed.document.uri).length;
        const liveN = painter.liveThreadsFor(ed.document.uri).length;
        if (jsonN > 0 && liveN !== jsonN) {
          painter.remountPanel(new Set(), ed.document.uri);
        }
        refreshDecorations();
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
    cmd("cru.open", () => openThreadAtCursor()),
    cmd("cru.openId", (id, uriStr) => openThreadById(id, uriStr)),
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
  for (const t of shiftTimers.values()) {
    clearTimeout(t);
  }
  shiftTimers.clear();
  shiftPending.clear();
  painter?.clear();
  try {
    cruController?.dispose();
  } catch {
    /* ok */
  }
}

module.exports = { activate, deactivate, Painter };
