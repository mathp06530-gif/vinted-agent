"""L'agent rédacteur : regarde les photos, identifie la pièce, écrit l'annonce.

Il utilise Claude (vision) pour lire les étiquettes, logos, codes produit,
repérer l'état et les défauts, puis rédige une annonce qui sonne comme un
vrai vendeur Vinted, pas comme un texte généré.
"""
import base64
import io
import random
import re
from typing import List, Literal, Optional

import anthropic
from PIL import Image
from pydantic import BaseModel, Field

import settings
from db import UPLOAD_DIR

MAX_PHOTOS_SENT = 10
MAX_SIDE = 1568  # taille max conseillée pour la vision

ETATS = Literal[
    "Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "Satisfaisant"
]


class Annonce(BaseModel):
    titre: str = Field(description="Titre Vinted, 25 à 60 caractères")
    description: str = Field(description="Description complète, sans hashtags")
    marque: str
    modele: str = Field(description="Nom précis du modèle / de la ligne, vide si inconnu")
    categorie: str = Field(description="Chemin de catégorie Vinted, ex: Hommes > Chaussures > Baskets")
    taille: str = Field(description="Taille telle que lue sur l'étiquette ou donnée par le vendeur, vide si inconnue")
    etat: ETATS
    couleur: str
    matiere: str = Field(description="Matière principale si visible sur l'étiquette, sinon vide")
    prix: int = Field(description="Prix conseillé en euros")
    prix_min: int = Field(description="Prix plancher raisonnable pour accepter une offre")
    prix_max: int = Field(description="Prix haut si on n'est pas pressé")
    hashtags: List[str] = Field(description="3 à 6 hashtags en minuscules, sans le #")
    notes_vendeur: str = Field(
        description="Notes privées pour le vendeur : ce dont tu n'es pas sûr, infos à vérifier, "
        "conseils photo (ex: 'prends l'étiquette de taille en photo'). Jamais publié."
    )


SYSTEM = """Tu es un vendeur Vinted français expérimenté, plusieurs milliers de ventes, qui connaît la fripe, le streetwear, le luxe et les marques grand public sur le bout des doigts (Nike, Adidas, New Balance, Jordan, Ralph Lauren, Lacoste, Carhartt, Stone Island, The North Face, Arc'teryx, Stüssy, Levi's, Zara, Sandro, Maje, etc.). Ton boulot : à partir des photos d'un vêtement (ou chaussures, accessoire), préparer une annonce prête à publier.

## 1. Identifier la pièce
- Lis tout ce qui est lisible : étiquette de marque, étiquette de taille, étiquette de composition, codes produit (ex. code style Nike du type CW2288-111 sous la languette ou sur l'étiquette intérieure, numéro d'article Adidas, lot Levi's 501/505/550...), logos, broderies, coutures, boutons, zips (YKK, Riri...), semelles.
- Donne le modèle exact quand tu peux le justifier (Air Force 1 '07, Tech Fleece, Dunk Low Panda, Samba OG, 550, Nuptse 700, Detroit Jacket, Polo slim fit...). Si tu hésites entre deux, n'invente pas : reste plus général dans l'annonce et note le doute dans notes_vendeur.
- Si quelque chose fait penser à une contrefaçon (logo bizarre, étiquette incohérente), ne l'écris pas dans l'annonce mais préviens dans notes_vendeur.
- Les infos données par le vendeur (taille, défauts, nombre de portés, prix d'achat...) priment sur ce que tu déduis des photos.

## 2. État (valeurs Vinted)
Neuf avec étiquette / Neuf sans étiquette / Très bon état / Bon état / Satisfaisant. Sois honnête : bouloches, semelle usée, tache, décoloration, trou = tu le vois, tu le dis dans la description, simplement. Un acheteur pardonne un défaut annoncé, pas un défaut caché.

## 3. Prix
Base-toi sur les prix réellement pratiqués en seconde main sur Vinted en France pour ce modèle et cet état (pas le prix neuf). Les vendeurs mettent des prix ronds ou qui finissent en 5 (12, 15, 18, 25, 35, 45...). prix_min = ce qu'on peut accepter sur une offre, prix_max = si on n'est pas pressé.

## 4. Écrire comme un vrai vendeur (le plus important)
L'annonce doit être impossible à distinguer de celle d'un particulier qui vend ses affaires. Concrètement :
- Phrases simples, directes, parfois sans verbe. Ton détendu. Pas de pub, pas de marketing.
- Longueur : 2 à 6 lignes en général. Plus long seulement s'il y a des mesures ou des défauts à détailler.
- Commence directement par l'info utile (« Sweat Carhartt taille M, porté quelques fois. »), jamais par une accroche.
- Varie la structure d'une annonce à l'autre : pas toujours le même ordre, pas toujours les mêmes formules de fin.
- Tu peux utiliser des abréviations courantes et naturelles (« tbe », « taille bien », « dispo », « envoi rapide ») sans en abuser.
- Ponctuation normale de clavier : virgules, points, tirets « - » pour les listes. JAMAIS de tiret long « — » ni « – », jamais de gras, jamais de titres markdown.
- INTERDIT (ça sent l'IA à 10 km) : « Découvrez », « Sublimez », « incontournable », « intemporel », « pièce maîtresse », « allie style et confort », « parfait pour toutes les occasions », « ne manquez pas », « idéal pour », « un must-have », « élégance », « look », « garde-robe », « confort optimal », « qualité exceptionnelle », « véritable », les listes de trois adjectifs, les phrases qui se terminent par un point d'exclamation enthousiaste.
- Pas de superlatifs gratuits. Décris ce qu'on voit : coupe, matière, couleur, détails (poches, capuche, zip...).
- Si l'état est moins bon, dis-le sans détour (« petite tache sur la manche, voir photo 4 »).
- Titre : marque + type + modèle + (taille ou couleur), sans emojis, sans majuscules partout, sans « magnifique ». Ex : « Sweat à capuche Nike Tech Fleece gris M », « Jean Levi's 501 brut W32 L32 ».
- La description ne contient PAS les hashtags (ils sont dans un champ séparé).

Exemples du ton voulu (inspire-toi du ton, pas des phrases) :

« Polo Ralph Lauren bleu marine taille L, coupe custom fit. Porté mais encore en très bon état, pas de bouloches ni de décoloration. Le logo brodé est nickel.
Envoi rapide »

« Nike Air Max 90 blanches, pointure 42.
Semelle encore bien, un peu de traces sur le côté (photo 5), rien de méchant ça part au nettoyage. Vendues sans la boîte. »

« Veste Carhartt Detroit vintage, marron, taille M (taille un peu grand).
Toile bien patinée comme on aime sur ces vestes, doublure couverture intacte, toutes les pressions fonctionnent.
Mesures à plat : épaules 50 cm, longueur 66 cm »
"""


def _style_instructions(cfg):
    lines = []
    lines.append(
        "Tutoie l'acheteur si tu t'adresses à lui." if cfg.get("tutoiement")
        else "Vouvoie l'acheteur si tu t'adresses à lui."
    )
    emojis = cfg.get("emojis", "rare")
    if emojis == "jamais":
        lines.append("Aucun emoji.")
    elif emojis == "rare":
        lines.append("Au maximum un emoji simple, et seulement si ça vient naturellement (souvent aucun).")
    else:
        lines.append("Un ou deux emojis simples autorisés, pas plus.")
    style = cfg.get("style", "naturel")
    if style == "court":
        lines.append("Fais très court : 2-3 lignes max.")
    elif style == "detaille":
        lines.append("Tu peux être un peu plus détaillé (matière, coupe, mesures si fournies), sans jamais tomber dans le marketing.")
    marge = cfg.get("marge_prix", "normal")
    if marge == "vente_rapide":
        lines.append("Le vendeur veut vendre vite : prix conseillé dans le bas de la fourchette du marché.")
    elif marge == "haut":
        lines.append("Le vendeur n'est pas pressé : prix conseillé dans le haut de la fourchette du marché.")
    if cfg.get("signature"):
        lines.append(
            f"Le vendeur aime finir ses annonces avec cette info (reformule-la librement, "
            f"pas forcément mot pour mot) : « {cfg['signature']} »"
        )
    if not cfg.get("hashtags", True):
        lines.append("Renvoie une liste de hashtags vide.")
    return "\n".join(f"- {l}" for l in lines)


def _encode_photo(filename):
    with Image.open(UPLOAD_DIR / filename) as img:
        img = img.convert("RGB")
        img.thumbnail((MAX_SIDE, MAX_SIDE))
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=85)
    return base64.standard_b64encode(buf.getvalue()).decode("ascii")


def humanize(text: str) -> str:
    """Filet de sécurité : enlève les tics typographiques d'IA."""
    text = text.replace("**", "").replace("__", "")
    text = re.sub(r"\s*[—–]\s*", ", ", text)
    text = re.sub(r"^#+\s*", "", text, flags=re.M)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


class AgentError(Exception):
    pass


def _user_text(listing, extra_hints, cfg):
    hints = "\n".join(h for h in (listing.get("hints", ""), extra_hints) if h and h.strip())
    already = {
        k: listing.get(k) for k in ("brand", "model", "size", "condition", "price") if listing.get(k)
    }
    text = "Prépare l'annonce Vinted pour cet article.\n\n"
    text += f"Infos du vendeur : {hints or '(aucune, débrouille-toi avec les photos)'}\n"
    if already:
        text += f"Champs déjà renseignés par le vendeur (à respecter) : {already}\n"
    text += f"\nPréférences d'écriture du vendeur :\n{_style_instructions(cfg)}\n"
    text += "\nVariante d'écriture n°" + str(random.randint(1, 999)) + " (change un peu ta formulation par rapport à d'habitude)."
    return hints, text


def generate(listing: dict, extra_hints: str = "") -> dict:
    """Analyse les photos + infos du vendeur et renvoie les champs de l'annonce."""
    cfg = settings.load()
    if not listing["photos"]:
        raise AgentError("Ajoute au moins une photo.")
    hints, user_text = _user_text(listing, extra_hints, cfg)
    if cfg.get("provider", "groq") == "groq":
        a = _generate_groq(listing, cfg, hints, user_text)
    else:
        a = _generate_claude(listing, cfg, user_text)

    tags = " ".join("#" + re.sub(r"[^\w]", "", str(t).lower().lstrip("#")) for t in a["hashtags"] if str(t).strip())
    etat = a["etat"] if a["etat"] in ETATS.__args__ else "Bon état"
    return {
        "title": humanize(a["titre"])[:100],
        "description": humanize(a["description"]),
        "brand": a["marque"].strip(),
        "model": a["modele"].strip(),
        "category": a["categorie"].strip(),
        "size": listing.get("size") or a["taille"].strip(),
        "condition": etat,
        "color": a["couleur"].strip(),
        "material": a["matiere"].strip(),
        "price": listing.get("price") or a["prix"],
        "price_min": a["prix_min"],
        "price_max": a["prix_max"],
        "hashtags": tags if cfg.get("hashtags", True) else "",
        "ai_notes": a["notes_vendeur"].strip(),
    }


def _generate_groq(listing, cfg, hints, user_text):
    import llm_groq
    key = settings.groq_key()
    if not key:
        raise AgentError("Ajoute ta clé Groq (gratuite, console.groq.com) dans Réglages pour activer l'agent.")
    photos = [_encode_photo(p["filename"]) for p in listing["photos"][:llm_groq.MAX_PHOTOS]]
    try:
        obs = llm_groq.observe(key, cfg["groq_vision_model"], photos, hints)
        return llm_groq.write(key, cfg["groq_text_model"], SYSTEM, obs, user_text)
    except llm_groq.GroqError as e:
        raise AgentError(str(e))


def _generate_claude(listing, cfg, user_text):
    key = settings.api_key()
    if not key:
        raise AgentError("Ajoute ta clé API Anthropic dans Réglages, ou passe sur Groq (gratuit).")
    content = []
    for i, p in enumerate(listing["photos"][:MAX_PHOTOS_SENT], 1):
        content.append({"type": "text", "text": f"Photo {i} :"})
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg", "data": _encode_photo(p["filename"])},
        })
    content.append({"type": "text", "text": user_text})

    model = cfg.get("model") or "claude-opus-5-5"
    client = anthropic.Anthropic(api_key=key)
    kwargs = dict(
        model=model,
        max_tokens=16000,
        system=SYSTEM,
        messages=[{"role": "user", "content": content}],
        output_format=Annonce,
        output_config={"effort": "high" if "haiku" not in model else "medium"},
    )
    try:
        if model in ("claude-opus-5-5", "claude-sonnet-5-5"):
            # si un filtre de sécurité refuse à tort, l'API bascule seule sur un autre modèle
            resp = client.beta.messages.parse(
                betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs
            )
        else:
            resp = client.messages.parse(**kwargs)
    except anthropic.AuthenticationError:
        raise AgentError("Clé API refusée. Vérifie-la dans Réglages.")
    except anthropic.RateLimitError:
        raise AgentError("Trop de demandes d'un coup, réessaie dans une minute.")
    except anthropic.APIStatusError as e:
        raise AgentError(f"Erreur de l'API ({e.status_code}) : {e.message}")
    except anthropic.APIConnectionError:
        raise AgentError("Pas de connexion à l'API. Vérifie ta connexion internet.")

    if resp.stop_reason == "refusal":
        raise AgentError("L'agent a refusé cette demande. Essaie avec d'autres photos.")
    if resp.stop_reason == "max_tokens" or resp.parsed_output is None:
        raise AgentError("Réponse incomplète de l'agent, relance la génération.")
    return resp.parsed_output.model_dump()


# ---------------------------------------------------------------------------
# Mode sans IA : à partir des champs remplis à la main
# ---------------------------------------------------------------------------
_OUVERTURES = ["{obj}.", "{obj}.", "{obj}, {etat_low}."]
_ETAT_PHRASES = {
    "Neuf avec étiquette": ["Jamais porté, étiquette encore dessus.", "Neuf avec l'étiquette."],
    "Neuf sans étiquette": ["Jamais porté, juste plus l'étiquette.", "Neuf, jamais mis."],
    "Très bon état": ["Porté quelques fois, très bon état.", "Très peu porté, aucun défaut.", "Tbe, rien à signaler."],
    "Bon état": ["Porté mais encore en bon état.", "Bon état général, quelques traces d'usure normales."],
    "Satisfaisant": ["Bien porté, il a vécu (voir photos).", "État moyen, d'où le prix, tout est en photo."],
}
_FINS = ["Envoi rapide", "Dispo pour toute question", "Je fais des lots", "Envoi soigné", ""]


def generate_offline(listing: dict) -> dict:
    cfg = settings.load()
    brand = listing.get("brand") or ""
    model = listing.get("model") or ""
    cat = (listing.get("category") or "").split(">")[-1].strip()
    obj = (listing.get("title") or " ".join(x for x in (cat, brand, model) if x) or "Article").strip()
    if listing.get("size") and listing["size"].lower() not in obj.lower():
        obj += f", taille {listing['size']}"
    etat = listing.get("condition") or "Bon état"
    lines = [random.choice(_OUVERTURES).format(obj=obj, etat_low=etat.lower())]
    lines.append(random.choice(_ETAT_PHRASES.get(etat, _ETAT_PHRASES["Bon état"])))
    hints = (listing.get("hints") or "").strip()
    if hints and hints.lower() not in obj.lower():
        lines.append(hints[:1].upper() + hints[1:])
    fin = cfg.get("signature") or random.choice(_FINS)
    if fin:
        lines.append(fin[:1].upper() + fin[1:])
    title = listing.get("title") or " ".join(x for x in (cat, brand, model, listing.get("size") or "") if x)
    return {"title": title[:100], "description": humanize("\n".join(lines)), "condition": etat}
