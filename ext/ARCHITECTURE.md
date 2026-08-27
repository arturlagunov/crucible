# Crucible ext — архитектура

VS Code extension: paint/edit `*-threads.json`.

Снаружи: `make fetch` → JSON, `make load` → `.load-request`. Ext читает/пишет JSON и рисует native Comments.

## Слои

Луковица. Стрелка = import. Обратно нельзя. Папки = слои. Внутри — пакеты `d` `m` `u` `store` `v`.

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
| Application | `app/` | `u/` use cases, `store/` сессия+диск | vscode, pres |
| Presentation | `pres/` | `v/` view, `controller/` | — знает vscode |
| Infrastructure | `infra/` | paths, constants, loadReq | pres, app, vscode |

```
src/
  domain/     m/ d/ norm.ts
  app/        u/ store/ di.ts     U, bind
  pres/       v/ controller/ frame.ts
              cursor.ts editTracker.ts loadSignal.ts locate.ts lookup.ts ws.ts
  infra/      paths.ts constants.ts loadReq.ts
  main.ts     activate
  di.ts       make → Graph
```

Импорты — только пакеты, не распаковывать:

```
import type * as d from "../domain/d"
import * as m from "../domain/m"
import * as u from "../app/u"
import * as store from "../app/store"
import * as v from "../pres/v"
import * as vc from "vscode"
```

## Команда

```
cru.open / cru.openId
  Router                 vscode args → m.thread.Item
  locate + u.review.save если span съехал
  g.v.thread.open        comments XOR markdown

cru.resolve
  Router                 vscode args → m.thread.Item
  u.thread.setStatus     item.status + store.save
  panel.touch + notify
```

`u` не импортирует `vscode` и `pres`. Open/chat/link/toast — Router / `v`.  
Правка файла: `EditTracker` → `u.thread.shift` → `u.review.save`.  
`.load-request`: `LoadSignal.watch` (activate), не Router.

## Два представления

```
disk JSON            m                           vscode widgets
d.thread.Item[]  →  m.Review.threads  →  Panel.threads
                      │
                      └── threads.open = UNRESOLVED
```

Index: `forKey(ws)`, не `forUri`. `lookup.forUri` переводит Uri → ключ. Живёт на Frame, не на `U`.

## Сборка

`di.make({ info, context })` → `Graph`. `app/di.bind` собирает `U` (store + Anchor).

`Graph` = `Frame` + lens/controller/tracker/router/status.

`Frame` — срез для Router / LoadSignal: `u`, `store`, `forUri`, `v` (panel/painter/decorator/thread), `notify`.

`notify()` — decorator + CodeLens + status bar (замыкание в `make`).

Фабрики: `Store.for`, `Panel.for`, `Controller.for`, `Decorator.for`, `Painter.for`, `Lens.for`, `EditTracker.for`.

## m / d

```
d.thread.Item / d.Comment / d.Review
m.thread.Item / m.thread.List / m.Review
store.Store / store.asShow
u.review.load / save / clear / cycleShow / setShow / relocate
u.thread.setStatus / del / shift
u.comment.reply / del / link
v.Panel / v.Painter / v.Comment / v.Thread
vc.CommentThread / vc.Range / vc.Uri
```

```
m.Review
  ├── threads          все, включая RESOLVED
  ├── threads.open     UI
  └── idx: forKey / atLine / busiest
```

`u.review.relocate` → `Anchor.locateLines`. Строки файла: `pres/ws.lines` (буфер или диск).

`pres/v/comment.ts` — `m.comment.Item` → `v.Comment`.  
`pres/v/thread.ts` — `m.thread.Item` → comments XOR markdown.  
`pres/controller/resolve.ts` — unpack vscode args.

## Application

| | |
|--|--|
| `u.review` | `load` / `save` / `clear` / `cycleShow` / `setShow` / `relocate` |
| `u.thread` | `setStatus` / `del` / `shift` |
| `u.comment` | `reply` / `del` / `link` |
| `store` | сессия + JSON fs |

## Presentation / infra

| | слой | роль |
|--|------|------|
| `v.Panel` | view | CommentThread + id |
| `v.Painter` | view | domain → panel (без relocate) |
| `v.Thread` | view | open comments XOR markdown |
| `Decorator` / `Lens` | view | gutter, CodeLens |
| `controller/Router` | controller | `cru.*` + смена редактора |
| `cursor.ts` | pres edge | приватные `composer.*` |
| `EditTracker` | pres | debounce → `u.thread.shift` + save |
| `LoadSignal.apply` | pres | `u.review.load` + locate + paint + reveal |
| `LoadSignal.watch` | pres | poll `.load-request` |
| `locate` | pres | файлы → `u.review.relocate` |
| `ws.ts` | pres | vscode workspace → paths |
| `loadReq.consume` | infra | `.load-request` → path |

## Тесты

`npm test` в `ext/` — domain: Anchor.find/relocate, `.open`, save сохраняет resolved, forKey, shift.
