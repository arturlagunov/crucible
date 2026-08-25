#!/usr/bin/env python3
"""Тесты Source на моках в tests/fixtures/ (дампы CR-17391)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

CRUCIBLE = Path(__file__).resolve().parents[1]  # projects/crucible
FIXTURES = Path(__file__).resolve().parent / "fixtures"
WS = Path(__file__).resolve().parents[3]  # onec_sandbox/
sys.path.insert(0, str(CRUCIBLE))

from build_threads import Bundle, Msg, Source, Thread  # noqa: E402

REVIEW = "CR-17391"


class TestSourceBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        for name in (
            f"{REVIEW}-details.json",
            f"{REVIEW}-comments.json",
            f"{REVIEW}.html",
        ):
            path = FIXTURES / name
            if not path.exists():
                raise unittest.SkipTest(f"нет мока {path}")
        cls.src = Source(FIXTURES)
        cls.bundle = cls.src.build(REVIEW)

    def test_bundle_shape(self) -> None:
        b = self.bundle
        self.assertIsInstance(b, Bundle)
        self.assertEqual(b.review.id, REVIEW)
        self.assertTrue(b.review.name)
        self.assertEqual(b.base, Source.BASE)
        self.assertEqual(b.count, len(b.threads))
        self.assertGreater(b.count, 0)

    def test_thread_count_matches_line_comments(self) -> None:
        # 185 versioned roots with lineRanges в этом дампе
        self.assertEqual(self.bundle.count, 185)

    def test_known_thread_48314(self) -> None:
        th = next(t for t in self.bundle.threads if t.id == "CMT:48314")
        self.assertIsInstance(th, Thread)
        self.assertEqual(th.item, "CFR-141515")
        self.assertEqual(th.span, (33, 33))
        self.assertTrue(th.path.startswith("bp3/src/"))
        self.assertEqual(th.ws, f"projects/bp3/{th.path}")
        self.assertEqual(th.status, "UNRESOLVED")
        self.assertEqual(len(th.msgs), 3)
        self.assertEqual(th.msgs[0].author, "Воротилова Юлия")
        self.assertEqual(th.msgs[1].author, "Лагунов Артур")
        self.assertEqual(th.msgs[2].author, "Шевелев Илья")
        self.assertIn("табличной части", th.msgs[0].text)
        self.assertEqual(th.msgs[2].status, "UNRESOLVED")

    def test_all_ws_exist_in_workspace(self) -> None:
        missing = [t.ws for t in self.bundle.threads if not (WS / t.ws).exists()]
        self.assertEqual(missing, [], msg=f"нет файлов: {missing[:5]}")

    def test_span_valid(self) -> None:
        for t in self.bundle.threads:
            start, end = t.span
            self.assertGreaterEqual(start, 1)
            self.assertGreaterEqual(end, start)

    def test_msgs_are_dataclasses(self) -> None:
        th = self.bundle.threads[0]
        self.assertTrue(all(isinstance(m, Msg) for m in th.msgs))
        self.assertTrue(all(m.id.startswith("CMT:") for m in th.msgs))

    def test_write_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "out.json"
            path, bundle = self.src.write(REVIEW, out, refresh=False)
            self.assertEqual(path, out)
            data = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(data["count"], bundle.count)
            self.assertEqual(data["review"]["id"], REVIEW)
            self.assertEqual(len(data["threads"]), bundle.count)
            sample = next(t for t in data["threads"] if t["id"] == "CMT:48314")
            self.assertEqual(sample["span"], [33, 33])  # tuple → list в JSON
            self.assertEqual(len(sample["msgs"]), 3)

    def test_to_dict_painter_contract(self) -> None:
        """Поля, которые ждёт Painter в extension.js."""
        d = self.bundle.to_dict()
        self.assertIn("review", d)
        self.assertIn("id", d["review"])
        self.assertIn("base", d)
        self.assertIn("threads", d)
        th = d["threads"][0]
        for key in ("id", "ws", "span", "status", "msgs"):
            self.assertIn(key, th)
        msg = th["msgs"][0]
        for key in ("id", "author", "text", "status", "date"):
            self.assertIn(key, msg)


class TestSourceFetchMocked(unittest.TestCase):
    def test_pull_gets_three_urls(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            src = Source(tmp)
            payloads = {
                "details": b'{"name":"x","state":"Review","reviewItems":{"reviewItem":[]}}',
                "comments": b'{"comments":[]}',
                "html": b'new Comment(1)\n.setResolution(CommentResolution.from({\nstatus: "UNRESOLVED"\n',
            }

            def fake_get(url: str, *, accept: str | None = None) -> bytes:
                if url.endswith("/details"):
                    return payloads["details"]
                if url.endswith("/comments/versioned"):
                    return payloads["comments"]
                if "/cru/" in url:
                    return payloads["html"]
                raise AssertionError(url)

            with patch.object(src, "_get", side_effect=fake_get) as m:
                bundle = src.pull(REVIEW)

            self.assertEqual(m.call_count, 3)
            self.assertEqual(bundle.review.id, REVIEW)
            self.assertEqual(bundle.count, 0)
            # на диск ничего сырого
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_write_refresh_only_threads_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = Source(root)
            empty = Bundle(
                review=__import__("build_threads", fromlist=["Review"]).Review(
                    REVIEW, "n", "Review", None
                ),
                base=Source.BASE,
                threads=[],
            )
            with patch.object(src, "pull", return_value=empty):
                path, _ = src.write(REVIEW, refresh=True)
            self.assertEqual(path, root / "out" / f"{REVIEW}-threads.json")
            self.assertTrue(path.exists())
            self.assertEqual(
                sorted(p.name for p in (root / "out").iterdir()),
                [f"{REVIEW}-threads.json"],
            )


class TestParseHelpers(unittest.TestCase):
    def test_range_single(self) -> None:
        self.assertEqual(Source._range("33"), (33, 33))

    def test_range_span(self) -> None:
        self.assertEqual(Source._range("10-12"), (10, 12))

    def test_ws(self) -> None:
        self.assertEqual(
            Source._ws("bp3/src/Foo.bsl"),
            "projects/bp3/bp3/src/Foo.bsl",
        )


if __name__ == "__main__":
    unittest.main()
