"""Base de données locale (SQLite) : annonces + photos."""
import sqlite3
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
UPLOAD_DIR = DATA_DIR / "photos"
DB_PATH = DATA_DIR / "annonces.db"

STATUSES = ("brouillon", "prete", "publiee", "vendue")

FIELDS = (
    "title", "description", "brand", "model", "category", "size", "condition",
    "color", "material", "price", "price_min", "price_max", "hashtags",
    "hints", "ai_notes", "vinted_url", "status",
)


def now():
    return datetime.now().isoformat(timespec="seconds")


def connect():
    DATA_DIR.mkdir(exist_ok=True)
    UPLOAD_DIR.mkdir(exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def init():
    with connect() as con:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS listings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT, updated_at TEXT,
                status TEXT DEFAULT 'brouillon',
                title TEXT DEFAULT '', description TEXT DEFAULT '',
                brand TEXT DEFAULT '', model TEXT DEFAULT '',
                category TEXT DEFAULT '', size TEXT DEFAULT '',
                condition TEXT DEFAULT '', color TEXT DEFAULT '',
                material TEXT DEFAULT '',
                price REAL, price_min REAL, price_max REAL,
                hashtags TEXT DEFAULT '', hints TEXT DEFAULT '',
                ai_notes TEXT DEFAULT '', vinted_url TEXT DEFAULT '',
                published_at TEXT, sold_at TEXT
            );
            CREATE TABLE IF NOT EXISTS photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
                filename TEXT, position INTEGER DEFAULT 0
            );
            """
        )


def _with_photos(con, row):
    d = dict(row)
    d["photos"] = [
        dict(p) for p in con.execute(
            "SELECT id, filename, position FROM photos WHERE listing_id=? ORDER BY position, id",
            (d["id"],),
        )
    ]
    return d


def list_listings(status=None):
    with connect() as con:
        if status:
            rows = con.execute(
                "SELECT * FROM listings WHERE status=? ORDER BY updated_at DESC", (status,)
            ).fetchall()
        else:
            rows = con.execute("SELECT * FROM listings ORDER BY updated_at DESC").fetchall()
        return [_with_photos(con, r) for r in rows]


def get(listing_id):
    with connect() as con:
        row = con.execute("SELECT * FROM listings WHERE id=?", (listing_id,)).fetchone()
        return _with_photos(con, row) if row else None


def create(hints=""):
    with connect() as con:
        cur = con.execute(
            "INSERT INTO listings (created_at, updated_at, hints) VALUES (?,?,?)",
            (now(), now(), hints),
        )
        return cur.lastrowid


def update(listing_id, data):
    data = {k: v for k, v in data.items() if k in FIELDS}
    if not data:
        return get(listing_id)
    if data.get("status") == "publiee":
        data["published_at"] = now()
    if data.get("status") == "vendue":
        data["sold_at"] = now()
    data["updated_at"] = now()
    cols = ", ".join(f"{k}=?" for k in data)
    with connect() as con:
        con.execute(f"UPDATE listings SET {cols} WHERE id=?", (*data.values(), listing_id))
    return get(listing_id)


def delete(listing_id):
    item = get(listing_id)
    if not item:
        return
    for p in item["photos"]:
        (UPLOAD_DIR / p["filename"]).unlink(missing_ok=True)
    with connect() as con:
        con.execute("DELETE FROM listings WHERE id=?", (listing_id,))


def add_photo(listing_id, filename):
    with connect() as con:
        pos = con.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM photos WHERE listing_id=?", (listing_id,)
        ).fetchone()[0]
        con.execute(
            "INSERT INTO photos (listing_id, filename, position) VALUES (?,?,?)",
            (listing_id, filename, pos),
        )
        con.execute("UPDATE listings SET updated_at=? WHERE id=?", (now(), listing_id))


def delete_photo(photo_id):
    with connect() as con:
        row = con.execute("SELECT filename FROM photos WHERE id=?", (photo_id,)).fetchone()
        if row:
            (UPLOAD_DIR / row["filename"]).unlink(missing_ok=True)
            con.execute("DELETE FROM photos WHERE id=?", (photo_id,))


def reorder_photos(listing_id, photo_ids):
    with connect() as con:
        for pos, pid in enumerate(photo_ids):
            con.execute(
                "UPDATE photos SET position=? WHERE id=? AND listing_id=?", (pos, pid, listing_id)
            )


def stats():
    with connect() as con:
        out = {s: 0 for s in STATUSES}
        for r in con.execute("SELECT status, COUNT(*) n FROM listings GROUP BY status"):
            out[r["status"]] = r["n"]
        out["valeur_en_ligne"] = con.execute(
            "SELECT COALESCE(SUM(price),0) FROM listings WHERE status='publiee'"
        ).fetchone()[0]
        out["ca_vendu"] = con.execute(
            "SELECT COALESCE(SUM(price),0) FROM listings WHERE status='vendue'"
        ).fetchone()[0]
        return out
