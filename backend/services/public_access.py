"""Short-lived, shared-worker limits for unauthenticated evaluation."""
from __future__ import annotations

from contextlib import closing
import hashlib
import os
import sqlite3
import tempfile
import time
from pathlib import Path


def check_guest_rate(client: str) -> bool:
    # Do not trust forwarded headers or store addresses or submitted expressions.
    window = int(time.time() // 60)
    identity = hashlib.sha256(f"{window}:{client}".encode()).hexdigest()
    path = Path(os.getenv("RA_RATE_LIMIT_DB") or str(Path(tempfile.gettempdir()) / f"ralt-rate-{os.getuid()}.sqlite3"))
    with closing(sqlite3.connect(path, timeout=2)) as conn, conn:
        os.chmod(path, 0o600)
        conn.execute("CREATE TABLE IF NOT EXISTS requests (identity TEXT PRIMARY KEY, window INTEGER, count INTEGER)")
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM requests WHERE window < ?", (window,))
        for key, limit in [(identity, int(os.getenv("RA_GUEST_REQUESTS_PER_MINUTE", "60"))), ("global", int(os.getenv("RA_GUEST_GLOBAL_REQUESTS_PER_MINUTE", "600")))]:
            row = conn.execute("SELECT count FROM requests WHERE identity = ? AND window = ?", (key, window)).fetchone()
            if row and row[0] >= limit:
                return False
        for key in (identity, "global"):
            conn.execute("INSERT INTO requests VALUES (?, ?, 1) ON CONFLICT(identity) DO UPDATE SET count = count + 1", (key, window))
    return True
