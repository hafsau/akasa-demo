"""FY2027 ICD-10-CM code table: lookup, search, and validity checks.

Source: CMS "2027 Code Descriptions in Tabular Order" (public domain), effective
Oct 1, 2026. The order file is fixed-width:

    cols 0-5   order number
    cols 6-13  code (no dot)
    col  14    1 = billable leaf, 0 = header
    cols 16-76 short description
    cols 77-   long description
"""

from __future__ import annotations

import re
import sqlite3
import threading
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "icd10cm" / "icd10cm_order_2027.txt"


@dataclass(frozen=True)
class Code:
    code: str  # dotted, e.g. "I50.23"
    billable: bool
    short: str
    long: str


def dot(code: str) -> str:
    c = code.replace(".", "").strip().upper()
    return c if len(c) <= 3 else f"{c[:3]}.{c[3:]}"


def undot(code: str) -> str:
    return code.replace(".", "").strip().upper()


@lru_cache(maxsize=1)
def _table() -> dict[str, Code]:
    out: dict[str, Code] = {}
    with DATA.open(encoding="latin-1") as f:
        for line in f:
            raw = line[6:14].strip()
            if not raw:
                continue
            out[raw] = Code(
                code=dot(raw),
                billable=line[14] == "1",
                short=line[16:76].strip(),
                long=line[77:].strip(),
            )
    return out


@lru_cache(maxsize=1)
def _fts() -> sqlite3.Connection:
    """In-memory FTS5 index over long descriptions, for the index_lookup tool."""
    db = sqlite3.connect(":memory:", check_same_thread=False)
    db.execute("CREATE VIRTUAL TABLE codes USING fts5(code UNINDEXED, billable UNINDEXED, long)")
    db.executemany(
        "INSERT INTO codes VALUES (?, ?, ?)",
        ((c.code, int(c.billable), c.long) for c in _table().values()),
    )
    return db


def get(code: str) -> Code | None:
    return _table().get(undot(code))


def is_billable(code: str) -> bool:
    c = get(code)
    return bool(c and c.billable)


def children(code: str) -> list[Code]:
    """Billable codes under a header (e.g. I50.2 -> I50.20..I50.23)."""
    prefix = undot(code)
    return [c for k, c in _table().items() if k.startswith(prefix) and k != prefix and c.billable]


# Tool calls run in worker threads; one SQLite connection must not be used concurrently.
_LOCK = threading.Lock()

_WORD = re.compile(r"[A-Za-z0-9]+")


def search(query: str, limit: int = 12, billable_only: bool = True) -> list[Code]:
    """Term search over long descriptions. Every word must match (prefix match)."""
    words = [w.lower() for w in _WORD.findall(query) if len(w) > 1]
    if not words:
        return []
    match = " AND ".join(f'"{w}"*' for w in words)
    sql = "SELECT code FROM codes WHERE codes MATCH ?"
    if billable_only:
        sql += " AND billable = 1"
    sql += " ORDER BY rank LIMIT ?"
    with _LOCK:
        rows = _fts().execute(sql, (match, limit)).fetchall()
    return [c for (code,) in rows if (c := get(code))]
