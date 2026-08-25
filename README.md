# Crucible → Cursor

```bash
cd projects/crucible && make help
```

## Машина A

```bash
make fetch
```

Скопируй `*-threads.json` на B.

## Машина B

```bash
make install     # → Reload Window

make load FILE=tests/fixtures/CR-17391-threads.json
# или make load  (zenity)
```

Откроется json в Cursor → toast `CR-17391 — N тредов` → прыгнет в файл с комментами.  
Если нет: в json сверху CodeLens **Нанести треды Crucible**.

## Тесты

```bash
make test
```
