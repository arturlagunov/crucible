#!/usr/bin/env python3
"""Собирает нормализованные треды Crucible → один *-threads.json."""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


# ── model ───────────────────────────────────────────────────────────────


@dataclass
class Msg:
    """Одно сообщение в треде (корень или reply)."""

    id: str  # CMT:48314
    author: str
    user: str
    text: str
    date: int | str | None
    status: str  # UNRESOLVED | RESOLVED | UNKNOWN
    draft: bool = False
    deleted: bool = False


@dataclass
class Thread:
    """Inline-тред на диапазоне строк файла."""

    id: str  # CMT корня
    item: str  # CFR-...
    path: str  # путь в Crucible: bp3/src/...
    ws: str  # путь в воркспейсе: projects/bp3/bp3/src/...
    repo: str
    span: tuple[int, int]  # (start, end), 1-based inclusive
    msgs: list[Msg] = field(default_factory=list)
    anchor: dict[str, list[str]] | None = None  # {"lines": [...]}


@dataclass
class Review:
    id: str
    name: str
    state: str
    author: str | None


@dataclass
class Bundle:
    """Результат сборки одного review."""

    review: Review
    base: str
    threads: list[Thread] = field(default_factory=list)

    @property
    def count(self) -> int:
        return len(self.threads)

    def to_dict(self) -> dict[str, Any]:
        return {
            "review": asdict(self.review),
            "base": self.base,
            "count": self.count,
            "threads": [asdict(t) for t in self.threads],
        }


# ── source (машина с Crucible) ──────────────────────────────────────────


class Source:
    """
    Грузит сырьё с Crucible и пишет только out/*-threads.json.

    path, bundle = Source().write("CR-17391", refresh=True)
    """

    BASE = "https://abderus.dept07/crucible"

    def __init__(
        self,
        root: Path | str | None = None,
        *,
        base: str | None = None,
    ) -> None:
        self.root = Path(root or Path(__file__).resolve().parent)
        self.base = (base or self.BASE).rstrip("/")

    # ── public ──────────────────────────────────────────────────────────

    def pull(self, review: str) -> Bundle:
        """Скачать с Crucible в память и собрать Bundle (файлов-сырья нет)."""
        api = f"{self.base}/rest-service/reviews-v1"
        details = json.loads(
            self._get(f"{api}/{review}/details", accept="application/json")
        )
        comments = json.loads(
            self._get(
                f"{api}/{review}/comments/versioned", accept="application/json"
            )
        )
        html = self._get(f"{self.base}/cru/{review}").decode(
            "utf-8", errors="ignore"
        )
        return self._assemble(
            review, details, comments, self._parse_status(html)
        )

    def build(self, review: str) -> Bundle:
        """Собрать Bundle из локальных дампов в root (моки/тесты)."""
        details = self._json(f"{review}-details.json")
        comments = self._json(f"{review}-comments.json")
        status = self._status_map(review)
        return self._assemble(review, details, comments, status)

    def write(
        self,
        review: str,
        out: Path | str | None = None,
        *,
        refresh: bool = False,
    ) -> tuple[Path, Bundle]:
        """Единственный артефакт: out/*-threads.json. refresh=True → сеть."""
        bundle = self.pull(review) if refresh else self.build(review)
        path = Path(out) if out else self.root / "out" / f"{review}-threads.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(bundle.to_dict(), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return path, bundle

    # ── private: net / assemble ─────────────────────────────────────────

    def _get(self, url: str, *, accept: str | None = None) -> bytes:
        headers = {"Accept": accept} if accept else {}
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"GET {url} → HTTP {e.code}") from e
        except urllib.error.URLError as e:
            raise RuntimeError(f"GET {url} → {e.reason}") from e

    def _assemble(
        self,
        review: str,
        details: dict[str, Any],
        comments: dict[str, Any],
        status: dict[str, str],
    ) -> Bundle:
        items = self._items(details)
        threads: list[Thread] = []
        for node in comments.get("comments") or []:
            th = self._thread(node, items, status)
            if th is not None:
                threads.append(th)
        return Bundle(
            review=self._meta(review, details),
            base=self.base,
            threads=threads,
        )

    # ── private: IO / parse ─────────────────────────────────────────────

    def _json(self, name: str) -> dict[str, Any]:
        return json.loads((self.root / name).read_text(encoding="utf-8"))

    def _status_map(self, review: str) -> dict[str, str]:
        html = self.root / f"{review}.html"
        if not html.exists():
            return {}
        return self._parse_status(html.read_text(encoding="utf-8", errors="ignore"))

    @staticmethod
    def _id(obj: Any) -> str:
        if isinstance(obj, dict):
            return str(obj.get("id") or obj.get("permaId") or "")
        return str(obj or "")

    @staticmethod
    def _range(s: str | None) -> tuple[int, int] | None:
        if not s:
            return None
        s = s.strip()
        if "-" in s:
            a, b = s.split("-", 1)
            return int(a), int(b)
        return int(s), int(s)

    @staticmethod
    def _parse_status(html: str) -> dict[str, str]:
        """numeric comment id → UNRESOLVED|RESOLVED."""
        out: dict[str, str] = {}
        for part in re.split(r"(?=new Comment\(\d+)", html):
            m = re.match(r"new Comment\((\d+)", part)
            if not m:
                continue
            sm = re.search(
                r'\.setResolution\(\s*CommentResolution\.from\(\s*\{\s*status:\s*"(UNRESOLVED|RESOLVED)"',
                part,
            )
            if sm:
                out[m.group(1)] = sm.group(1)
        return out

    @staticmethod
    def _ws(path: str) -> str:
        """bp3/src/... → projects/bp3/bp3/src/..."""
        p = path.lstrip("/")
        if p.startswith("bp3/"):
            return f"projects/bp3/{p}"
        return f"projects/{p}"

    def _items(self, details: dict[str, Any]) -> dict[str, dict]:
        raw = details.get("reviewItems", {}).get("reviewItem", [])
        if isinstance(raw, dict):
            raw = [raw]
        return {self._id(it.get("permId")): it for it in raw}

    def _meta(self, review: str, details: dict[str, Any]) -> Review:
        author = details.get("author")
        if isinstance(author, dict):
            author = author.get("displayName")
        return Review(
            id=review,
            name=details.get("name") or "",
            state=details.get("state") or "",
            author=author,
        )

    def _msgs(self, node: dict[str, Any], status: dict[str, str]) -> list[Msg]:
        pid = self._id(node.get("permaId"))
        num = pid.split(":")[-1] if pid else ""
        user = node.get("user") or {}
        out = [
            Msg(
                id=pid,
                author=user.get("displayName") or user.get("userName") or "?",
                user=user.get("userName") or "",
                text=(node.get("message") or "").replace("\r\n", "\n").strip(),
                date=node.get("createDate"),
                status=status.get(num, "UNKNOWN"),
                draft=bool(node.get("draft")),
                deleted=bool(node.get("deleted")),
            )
        ]
        for reply in node.get("replies") or []:
            out.extend(self._msgs(reply, status))
        return out

    def _thread(
        self,
        node: dict[str, Any],
        items: dict[str, dict],
        status: dict[str, str],
    ) -> Thread | None:
        if node.get("deleted") or node.get("draft"):
            return None

        ranges = node.get("lineRanges") or []
        if not ranges:
            return None

        span = self._range(ranges[0].get("range"))
        if not span:
            return None

        rid = self._id(node.get("reviewItemId"))
        item = items.get(rid, {})
        path = item.get("toPath") or item.get("fromPath") or ""
        if not path:
            return None

        msgs = [
            m
            for m in self._msgs(node, status)
            if not m.deleted and not m.draft and m.text
        ]
        if not msgs:
            return None

        ws = self._ws(path)
        return Thread(
            id=self._id(node.get("permaId")),
            item=rid,
            path=path,
            ws=ws,
            repo=item.get("repositoryName") or "",
            span=span,
            msgs=msgs,
            anchor=self._anchor(ws, span),
        )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("review", nargs="?", default="CR-17391")
    ap.add_argument("--dir", type=Path, default=Path(__file__).resolve().parent)
    ap.add_argument("--base-url", default=Source.BASE)
    ap.add_argument("-o", "--output", type=Path, default=None)
    args = ap.parse_args()

    path, bundle = Source(args.dir, base=args.base_url).write(
        args.review, args.output, refresh=True
    )
    print(f"Wrote {path} ({bundle.count} threads)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
