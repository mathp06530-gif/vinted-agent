"""Vinted Agent : serveur local. Lance-le avec lancer.bat puis ouvre http://localhost:5050"""
import socket
import subprocess
import sys
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from PIL import Image, ImageOps

import agent
import db
import settings

try:  # photos iPhone (HEIC)
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

BASE = Path(__file__).parent
app = Flask(__name__, static_folder=str(BASE / "static"), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024
db.init()


def save_upload(file_storage):
    """Convertit n'importe quelle photo (HEIC, PNG...) en JPEG bien orienté."""
    name = f"{uuid.uuid4().hex}.jpg"
    with Image.open(file_storage.stream) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((2400, 2400))
        img.save(db.UPLOAD_DIR / name, "JPEG", quality=90)
    return name


def err(msg, code=400):
    return jsonify({"error": msg}), code


@app.get("/")
def index():
    return send_from_directory(BASE / "static", "index.html")


@app.get("/photos/<path:name>")
def photo(name):
    return send_from_directory(db.UPLOAD_DIR, name)


# ---------- annonces ----------
@app.get("/api/listings")
def listings():
    return jsonify({"items": db.list_listings(request.args.get("status")), "stats": db.stats()})


@app.post("/api/listings")
def create_listing():
    files = request.files.getlist("photos")
    if not files:
        return err("Ajoute au moins une photo.")
    lid = db.create(request.form.get("hints", ""))
    bad = 0
    for f in files:
        try:
            db.add_photo(lid, save_upload(f))
        except Exception:
            bad += 1
    if bad == len(files):
        db.delete(lid)
        return err("Aucune photo n'a pu être lue (format non supporté ?).")
    return jsonify(db.get(lid))


@app.get("/api/listings/<int:lid>")
def get_listing(lid):
    item = db.get(lid)
    return jsonify(item) if item else err("Annonce introuvable", 404)


@app.put("/api/listings/<int:lid>")
def update_listing(lid):
    data = request.get_json(force=True) or {}
    if "status" in data and data["status"] not in db.STATUSES:
        return err("Statut inconnu")
    return jsonify(db.update(lid, data))


@app.delete("/api/listings/<int:lid>")
def delete_listing(lid):
    db.delete(lid)
    return jsonify({"ok": True})


@app.post("/api/listings/<int:lid>/generate")
def generate(lid):
    item = db.get(lid)
    if not item:
        return err("Annonce introuvable", 404)
    body = request.get_json(silent=True) or {}
    try:
        if body.get("offline"):
            fields = agent.generate_offline(item)
        else:
            if body.get("keep_fields") is False:
                for k in ("brand", "model", "size", "condition", "price"):
                    item[k] = None
            fields = agent.generate(item, body.get("hints", ""))
    except agent.AgentError as e:
        return err(str(e))
    return jsonify(db.update(lid, fields))


# ---------- photos ----------
@app.post("/api/listings/<int:lid>/photos")
def add_photos(lid):
    for f in request.files.getlist("photos"):
        try:
            db.add_photo(lid, save_upload(f))
        except Exception:
            pass
    return jsonify(db.get(lid))


@app.post("/api/listings/<int:lid>/photos/order")
def order_photos(lid):
    db.reorder_photos(lid, (request.get_json(force=True) or {}).get("ids", []))
    return jsonify(db.get(lid))


@app.delete("/api/photos/<int:pid>")
def del_photo(pid):
    db.delete_photo(pid)
    return jsonify({"ok": True})


# ---------- publication assistée ----------
@app.post("/api/listings/<int:lid>/publish")
def publish(lid):
    if not db.get(lid):
        return err("Annonce introuvable", 404)
    subprocess.Popen(
        [sys.executable, str(BASE / "publisher.py"), str(lid)],
        cwd=str(BASE),
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    return jsonify({"ok": True})


# ---------- réglages ----------
@app.get("/api/settings")
def get_settings():
    return jsonify(settings.public())


@app.post("/api/settings")
def set_settings():
    settings.save(request.get_json(force=True) or {})
    return jsonify(settings.public())


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


if __name__ == "__main__":
    port = 5050
    print("\n  Vinted Agent est lancé")
    print(f"  Sur ce PC        : http://localhost:{port}")
    ip = lan_ip()
    if ip:
        print(f"  Depuis ton tel   : http://{ip}:{port}  (même Wi-Fi)")
    print("  Ferme cette fenêtre pour arrêter.\n")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
