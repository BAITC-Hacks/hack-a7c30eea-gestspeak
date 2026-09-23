import json
import os
import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from contextlib import contextmanager

DATA = Path(os.environ.get("GESTSPEAK_DATA", "data")).resolve()


@contextmanager
def connection():
    DATA.mkdir(parents=True, exist_ok=True, mode=0o700)
    conn = sqlite3.connect(DATA / "gestspeak.sqlite3", timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("CREATE TABLE IF NOT EXISTS meetings(id TEXT PRIMARY KEY, body TEXT NOT NULL, created TEXT NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, meeting_id TEXT, event TEXT, at TEXT)")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def save(meeting, event="updated"):
    with connection() as db:
        db.execute("INSERT INTO meetings VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
                   (meeting["id"], json.dumps(meeting, ensure_ascii=False), meeting["created_at"]))
        db.execute("INSERT INTO audit(meeting_id,event,at) VALUES(?,?,?)", (meeting["id"], event, datetime.now(timezone.utc).isoformat()))
    return meeting


def get(mid):
    with connection() as db:
        row = db.execute("SELECT body FROM meetings WHERE id=?", (mid,)).fetchone()
    return json.loads(row[0]) if row else None


def all_meetings():
    with connection() as db:
        return [json.loads(r[0]) for r in db.execute("SELECT body FROM meetings ORDER BY created DESC")]


def delete(mid):
    with connection() as db:
        db.execute("DELETE FROM meetings WHERE id=?", (mid,))
        db.execute("DELETE FROM audit WHERE meeting_id=?", (mid,))


def audit(mid):
    with connection() as db:
        return [dict(r) for r in db.execute("SELECT event,at FROM audit WHERE meeting_id=? ORDER BY id DESC", (mid,))]
