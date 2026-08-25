# Crucible → Cursor

```bash
cd projects/crucible
make help
```

## Машина A

```bash
make fetch                  # → out/CR-17391-threads.json
make fetch REVIEW=CR-12345
# Windows/Git Bash: make fetch PYTHON=python
```

Скопируй `out/*-threads.json` на машину B.

## Машина B (Cursor)

```bash
make install                # → Reload Window
make load FILE=tests/fixtures/CR-17391-threads.json
# или: make load            # системный диалог
```

## Тесты

```bash
make test
```
