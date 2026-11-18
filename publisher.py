"""Publication assistée : ouvre Vinted, met les photos, le titre, la description et le prix.

Le clic final sur « Ajouter » reste TOUJOURS à toi : tu vérifies, tu publies.
Le navigateur garde ta connexion Vinted (dossier data/navigateur), tu ne te
connectes qu'une fois.

Usage : python publisher.py <id_annonce>
"""
import sys
import time

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

import db

NEW_ITEM_URL = "https://www.vinted.fr/items/new"
PROFILE_DIR = db.DATA_DIR / "navigateur"

SELECTORS = {
    "photos": ['input[type="file"]'],
    "title": ['[data-testid="title--input"]', "input#title", 'input[name="title"]'],
    "description": ['[data-testid="description--input"]', "textarea#description", 'textarea[name="description"]'],
    "price": ['[data-testid="price-input--input"]', "input#price", 'input[name="price"]'],
}


def first(page, key, timeout=15000):
    deadline = time.time() + timeout / 1000
    while time.time() < deadline:
        for sel in SELECTORS[key]:
            loc = page.locator(sel).first
            if loc.count():
                return loc
        page.wait_for_timeout(400)
    return None


def type_like_human(loc, text):
    loc.click()
    loc.fill("")
    # on colle le gros du texte puis on tape la fin, pour que le formulaire détecte bien la saisie
    if len(text) > 12:
        loc.fill(text[:-6])
        loc.press("End")
        loc.type(text[-6:], delay=60)
    else:
        loc.type(text, delay=60)


def show_panel(page, item):
    """Petit panneau sur la page Vinted avec les infos à sélectionner à la main."""
    rows = [
        ("Catégorie", item.get("category")), ("Marque", item.get("brand")),
        ("Taille", item.get("size")), ("État", item.get("condition")),
        ("Couleur", item.get("color")), ("Matière", item.get("material")),
    ]
    html = "".join(f"<div><span>{k}</span><b>{v}</b></div>" for k, v in rows if v)
    page.evaluate(
        """(html) => {
            document.getElementById('va-panel')?.remove();
            const d = document.createElement('div');
            d.id = 'va-panel';
            d.innerHTML = '<p style="margin:0 0 6px;font-weight:700">Vinted Agent : à choisir dans le formulaire</p>' + html +
              '<p style="margin:8px 0 0;font-size:12px;opacity:.8">Puis vérifie tout et clique sur « Ajouter ». <a href="#" id="va-x">masquer</a></p>';
            d.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;background:#1d2327;color:#fff;' +
              'padding:12px 14px;border-radius:12px;font:14px system-ui;max-width:300px;box-shadow:0 6px 24px rgba(0,0,0,.3)';
            d.querySelectorAll('div').forEach(r => { r.style.cssText='display:flex;justify-content:space-between;gap:12px;padding:2px 0'; });
            document.body.appendChild(d);
            document.getElementById('va-x').onclick = (e) => { e.preventDefault(); d.remove(); };
        }""",
        html,
    )


def launch(p):
    opts = dict(user_data_dir=str(PROFILE_DIR), headless=False, viewport=None, locale="fr-FR",
                args=["--start-maximized"])
    for channel in ("msedge", "chrome", None):
        try:
            return p.chromium.launch_persistent_context(channel=channel, **opts) if channel \
                else p.chromium.launch_persistent_context(**opts)
        except Exception:
            continue
    raise SystemExit("Aucun navigateur trouvé (Edge ou Chrome). Lance : python -m playwright install chromium")


def main(listing_id):
    item = db.get(listing_id)
    if not item:
        raise SystemExit("Annonce introuvable")
    photos = [str(db.UPLOAD_DIR / p["filename"]) for p in item["photos"]]
    description = "\n\n".join(x for x in (item["description"], item["hashtags"]) if x)

    with sync_playwright() as p:
        ctx = launch(p)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(NEW_ITEM_URL)

        # Pas connecté ? On attend que tu te connectes (10 min max), puis on revient au formulaire.
        deadline = time.time() + 600
        while "/items/new" not in page.url or first(page, "title", 3000) is None:
            if time.time() > deadline or page.is_closed():
                return
            page.wait_for_timeout(2000)
            logged_in = any(c["name"] == "access_token_web" for c in ctx.cookies())
            if logged_in and "/items/new" not in page.url:
                page.goto(NEW_ITEM_URL)

        if photos:
            up = first(page, "photos")
            if up:
                up.set_input_files(photos)
                page.wait_for_timeout(1500 + 700 * len(photos))

        for key, value in (("title", item["title"]), ("description", description),
                           ("price", str(int(item["price"])) if item["price"] else "")):
            if not value:
                continue
            loc = first(page, key, 8000)
            if loc:
                try:
                    type_like_human(loc, value)
                except PWTimeout:
                    pass

        try:
            show_panel(page, item)
        except Exception:
            pass

        # On laisse la fenêtre ouverte jusqu'à ce que tu la fermes.
        try:
            while ctx.pages:
                ctx.pages[0].wait_for_timeout(1000)
        except Exception:
            pass


if __name__ == "__main__":
    main(int(sys.argv[1]))
