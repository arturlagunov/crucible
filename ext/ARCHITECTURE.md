# Crucible ext — архитектура

VS Code extension: paint/edit `*-threads.json`.

Снаружи: `make fetch` → JSON, `make load` → `.load-request` → poll. Ext читает/пишет JSON и рисует native Comments.

## Связь слоёв

Слои — **запрет на импорт**. Стрелка = «можно import». Обратно нельзя.

```
infra  ←  domain  ←  vscode  ←  app  ←  bootstrap / extension
```

| слой | роль | не имеет права |
|------|------|----------------|
| `infra` | `norm`, paths, constants | знать domain/vscode UI |
| `domain` | JSON-модель, якоря | знать vscode API, Panel, команды |
| `vscode` | виджеты Comments | знать `Ctx` |
| `app` | use cases (cmd / ops) | — склейка |
| `bootstrap` / `extension` | когда, не что | жить в domain |

Нижние слои **не импортируют `Ctx`**. Связка — duck types в `shape.ts`. `Ctx` структурно подходит.

`Ops` собирает store → painter (кладёт в `ui.painter`) → thread → comment.

Domain **не** импортирует `vscode` и `app/`. Uri/Range живут в vscode (`threadRange`, `Ctx.forUri`).

## Как проходит команда

```
меню cru.resolve
  ThreadCmd           cmd     распаковал args
  resolveCmd                  { CommentThread, domain Thread }
  ops.thread.setState         модель + виджет
  ops.store.persist           JSON
  host.notify()               gutter + lens + status
```

Правка файла — без cmd: `EditTracker` → `ops.thread.syncFile`.

## Два представления

```
disk JSON            domain                      vscode widgets
ThreadData[]  →  ThreadBundle.threads  →  Panel.threads
                      │
                      └── threads.open = UNRESOLVED
```

Index: `forKey(ws)`, не `forUri`. `Ctx.forUri` переводит Uri → ключ.

## Ctx

| Поле | Содержимое |
|------|------------|
| `ctx.data` | `bundle`, `jsonPath` |
| `ctx.ui` | `panel`, `painter`, `controller`, `decorator`, `anchors`, `log` |
| `ctx.ops` | `store`, `thread`, `comment` — мутации, без проекции в UI |

`notify()` — единственный refresh (decorator + CodeLens + status bar).

cmd не знает `hooks`. Зовут `host.notify()`.

## shape.ts

Срезы по ролям, не один `CmdHost`:

| Тип | Кто |
|-----|-----|
| `View` | Lens, Decorator, Controller (`data.bundle`, `ui.panel`, `forUri`) |
| `StoreHost` / `PaintHost` / `ThreadHost` / `CommentHost` | ops |
| `BundleCmds` / `ThreadCmds` / `CommentCmds` | соответствующие cmd |
| `LoadHost` / `TrackHost` / `WireHost` | bootstrap |
| `OpsSeed` | сборка Ops |

## Domain

```
ThreadBundle
  ├── threads          все, включая RESOLVED
  ├── threads.open     UI
  └── idx: forKey / atLine / busiest
```

`Anchor.locateLines(items, docLines, { miss? })`. Строки файла даёт vscode/`Paths.lines` (буфер или диск).

`vscode/commentView.ts` — Comment → vscode.Comment.  
`vscode/span.ts` — `threadRange`.  
`app/resolve.ts` — unpack args.  
`app/thread/cmd.ts` — open: comments XOR markdown.

## App

| Сущность | ops | cmd |
|----------|-----|-----|
| bundle | store: load/save/clear/persist | load, save, clear |
| thread | setState, delete, syncFile | paint, open, openId, resolve, delThread |
| comment | delete msg | reply, del, chat, link |

`painter` — `ctx.ui.painter`, не ops.

## vscode / infra

| Модуль | Роль |
|--------|------|
| `Panel` | CommentThread + id |
| `Painter` | domain → panel |
| `commentView` / `span` | маппинг в VS Code типы |
| `Decorator` / `Lens` / `Controller` | gutter, CodeLens, ranges |
| `app/comment/cursor.ts` | приватные `composer.*` + clipboard; сломается на апдейте |

## Bootstrap

| | |
|--|--|
| `wire` | createController + attachRefresh |
| `LoadSignal` | `.load-request` → store.load + ui.painter.paint + notify |
| `EditTracker` | debounce → thread.syncFile |

## Тесты

`npm test` в `ext/` — domain: Anchor.find/relocate, `.open`, save сохраняет resolved, forKey.

## Файлы

```
src/
  extension.ts
  bootstrap/     wire, loadSignal, editTracker
  app/
    ctx.ts, data.ts, uiCtx.ts, ops.ts, shape.ts
    resolve.ts, router.ts, cmd.ts
    bundle/ store, cmd
    thread/ ops, cmd
    comment/ ops, cmd, cursor
  domain/        bundle, thread, comment*, threadList, threadIndex, items, anchor, types
  vscode/        panel, painter, commentView, span, decorator, lens, controller, ui, types
  infra/         norm, paths, constants
test/            anchor.test.ts, bundle.test.ts
```
