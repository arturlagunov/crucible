# Crucible ext — архитектура

VS Code extension: paint/edit `*-threads.json`.

Снаружи: `make fetch` → JSON, `make load` → `.load-request` → poll. Ext читает/пишет JSON и рисует native Comments.

## Слои

Луковица. Стрелка = import. Обратно нельзя. Папки = слои (термины архитектуры). Внутри — пакеты-алиасы `d` `m` `u` `store` `v`.

```
         domain              сущности
            ↑
          app                сценарии, store
            ↑
       pres + infra
```

| слой | папка | внутри | не знает |
|------|-------|--------|----------|
| Domain | `domain/` | `m/` entities, `d/` JSON, `norm` | vscode, pres, app, fs |
| Application | `app/` | `u/` use cases, `store/` сессия+диск | vscode, pres/controller |
| Presentation | `pres/` | `v/` view, `controller/` | — знает vscode |
| Infrastructure | `infra/` | paths, constants, loadReq | pres, app |

Presentation — слой, папка `pres`. Внутри две роли:

| роль | папка | что |
|------|-------|-----|
| View | `pres/v/` | Panel, Painter, декорации |
| Controller | `pres/controller/` | `cru.*` args → `u` (`router`, `resolve`) |

```
src/
  domain/
    m/
    d/
    norm.ts

  app/
    u/
    store/           Store, asShow
    ctx.ts
    di.ts

  pres/
    v/
    controller/      router.ts resolve.ts cmd.ts
    cursor.ts        composer — driver, живёт на краю
    editTracker.ts
    loadSignal.ts    load + reveal
    di.ts            сборка Graph

  infra/
    paths.ts
    constants.ts
    loadReq.ts       `.load-request` → path

  main.ts            activate, poll
```

Импорты:

```
import type * as d from "../domain/d"
import * as m from "../domain/m"
import * as u from "../app/u"
import * as store from "../app/store"
import * as v from "../pres/v"
import * as vc from "vscode"
```

`d` в `domain`: форма `*-threads.json`, рядом с `m`. Не DTO сценариев.

## Как проходит команда

```
меню cru.open / cru.openId
  Router                 vscode args → m.thread.Item
  u.thread.open          comments XOR markdown

меню cru.resolve
  Router                 vscode args → m.thread.Item
  u.thread.setStatus     item.status + panel.touch + store.save
```

`u` не импортирует `vscode` и `pres`. Chat/link — ветки Router (`v` / clipboard / Cursor). Toast/err — Router.

Правка файла — без cmd: `EditTracker` → `store.save({ quiet: true })`.

## Два представления

```
disk JSON            m                           vscode widgets
d.thread.Item[]  →  m.Review.threads  →  Panel.threads
                      │
                      └── threads.open = UNRESOLVED
```

Index: `forKey(ws)`, не `forUri`. `lookup.forUri` переводит Uri → ключ.

## Сборка

`pres/di.make` → `Graph`. `app/di.bind` замыкает `u.*` на порты.

Фабрики: `Store.for`, `Panel.for`, `Controller.for`, `Decorator.for`, `Painter.for`, `Lens.for`, `EditTracker.for`.

`notify()` — refresh (decorator + CodeLens + status bar), колбэк из `App`.

## m / d

Доступ только через пакеты:

```
import type * as d from "../domain/d"
import * as m from "../domain/m"
import * as u from "../app/u"
import * as store from "../app/store"
import * as v from "../pres/v"
import * as vc from "vscode"

d.thread.Item / d.Comment / d.Review
m.thread.Item / m.thread.List / m.Review
store.Store / store.asShow
u.review.load / u.thread.open / u.thread.setStatus / u.comment.reply
v.Panel / v.Painter / v.Comment
vc.CommentThread / vc.Range / vc.Uri
```

```
m.Review
  ├── threads          все, включая RESOLVED
  ├── threads.open     UI
  └── idx: forKey / atLine / busiest
```

`Anchor.locateLines(items, docLines, { miss? })`. Строки файла даёт vscode/`Paths.lines` (буфер или диск).

`pres/v/comment.ts` — `m.comment.Item` → `v.Comment`.  
`pres/v/span.ts` — `v.Span`.  
`pres/controller/resolve.ts` — unpack args.  
`pres/v/thread.ts` — `m.thread.Item` → `v.Thread`.

## Application

| | |
|--|--|
| `controller` | `cru.*` + args → `u` |
| `u.review` | `load` / `save` / `clear` / `cycleShow` |
| `u.thread` | `open` / `setStatus` / `del` |
| `u.comment` | `reply` / `del` / `link` |
| `store` | сессия + JSON fs |

`painter` — `v.Painter.for(...)` в `pres/di`.

## Presentation / infra

| | слой | роль |
|--|------|------|
| `v.Panel` | view | CommentThread + id |
| `v.Painter` | view | domain → panel |
| `v.Comment` / `v.Span` | view | маппинг в vscode |
| `Decorator` / `Lens` | view | gutter, CodeLens |
| `controller` | controller | вход команд |
| `cursor.ts` | pres edge | приватные `composer.*` |
| `EditTracker` | pres | debounce → store.save |
| `LoadSignal.apply` | pres | `u.review.load` + reveal |
| `loadReq.consume` | infra | `.load-request` → path |

## Тесты

`npm test` в `ext/` — domain: Anchor.find/relocate, `.open`, save сохраняет resolved, forKey.

## Файлы

```
src/
  domain/m/ d/ norm.ts
  app/     u/ store/ ctx.ts di.ts
  pres/            v/ controller/ cursor.ts editTracker.ts loadSignal.ts di.ts
  infra/           paths.ts constants.ts loadReq.ts
  main.ts
```
