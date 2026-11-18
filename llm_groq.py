"""Agent via Groq (gratuit) : deux modèles open source qui travaillent ensemble.

1. L'« œil » (modèle vision, Qwen) regarde les photos par paquets de 3 et note
   tout ce qu'il voit : étiquettes, codes produit, logos, état, défauts.
2. Le « rédacteur » (gpt-oss-120b) reçoit ces notes et écrit l'annonce.
"""
import json
import time

import groq

VISION_MODELS = {
    "qwen/qwen3.8-27b": "Qwen 3.8 27B (vision)",
}
TEXT_MODELS = {
    "openai/gpt-oss-120b": "GPT-OSS 120B (le plus fort)",
    "openai/gpt-oss-20b": "GPT-OSS 20B (plus rapide)",
}
IMAGES_PER_CALL = 3
MAX_PHOTOS = 9


class GroqError(Exception):
    pass


def _strict(name, props, required=None):
    return {
        "type": "json_schema",
        "json_schema": {
            "name": name,
            "strict": True,
            "schema": {
                "type": "object",
                "properties": props,
                "required": required or list(props),
                "additionalProperties": False,
            },
        },
    }


S = {"type": "string"}
LS = {"type": "array", "items": {"type": "string"}}

OBS_FORMAT = _strict("observations", {
    "type_article": S, "marque": S, "modele_probable": S,
    "textes_lus": {**LS, "description": "Tout texte lisible : étiquettes, codes produit, tailles, compositions"},
    "taille_lue": S, "couleurs": S, "matiere_lue": S,
    "etat_observe": S, "defauts": LS, "details": LS,
    "doutes": S,
})

ETATS = ["Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "Satisfaisant"]
ANNONCE_FORMAT = _strict("annonce", {
    "titre": S, "description": S, "marque": S, "modele": S, "categorie": S, "taille": S,
    "etat": {"type": "string", "enum": ETATS},
    "couleur": S, "matiere": S,
    "prix": {"type": "integer"}, "prix_min": {"type": "integer"}, "prix_max": {"type": "integer"},
    "hashtags": LS, "notes_vendeur": S,
})

VISION_PROMPT = """Tu es l'œil d'un vendeur Vinted expert en vêtements, chaussures et marques (Nike, Adidas, Jordan, New Balance, Ralph Lauren, Lacoste, Carhartt, Stone Island, The North Face, Levi's, Zara...).
Regarde ces photos d'un même article et note tout, de façon factuelle, en français :
- recopie EXACTEMENT chaque texte lisible (étiquette de marque, de taille, de composition, code produit type CW2288-111, numéro de lot Levi's, made in...) ;
- marque, et modèle précis si tu peux le justifier (sinon dis ce qui hésite) ;
- couleurs, matière, coupe, détails (poches, capuche, zip, logo brodé/imprimé...) ;
- état réel et chaque défaut visible (bouloches, taches, usure semelle, trou, décoloration) avec le numéro de photo.
N'invente rien. Si tu n'es pas sûr, mets-le dans "doutes". Champ vide "" si rien."""


def _client(key):
    return groq.Groq(api_key=key, max_retries=3)


def _call(client, **kw):
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(**kw)
            return json.loads(resp.choices[0].message.content or "{}")
        except groq.RateLimitError:
            if attempt == 2:
                raise GroqError("Limite gratuite Groq atteinte pour le moment. Réessaie dans une minute.")
            time.sleep(20)
        except groq.AuthenticationError:
            raise GroqError("Clé Groq refusée. Vérifie-la dans Réglages.")
        except groq.APIStatusError as e:
            raise GroqError(f"Erreur Groq ({e.status_code}) : {e.message}")
        except groq.APIConnectionError:
            raise GroqError("Pas de connexion à Groq. Vérifie ta connexion internet.")
        except json.JSONDecodeError:
            if attempt == 2:
                raise GroqError("Réponse illisible du modèle, relance la génération.")


def observe(key, vision_model, photos_b64, hints):
    """Fait regarder les photos par paquets de 3 et renvoie la liste des observations."""
    client = _client(key)
    photos_b64 = photos_b64[:MAX_PHOTOS]
    notes = []
    for start in range(0, len(photos_b64), IMAGES_PER_CALL):
        batch = photos_b64[start:start + IMAGES_PER_CALL]
        content = [{"type": "text", "text": VISION_PROMPT + (f"\n\nInfo du vendeur : {hints}" if hints else "")}]
        for i, b64 in enumerate(batch, start + 1):
            content.append({"type": "text", "text": f"Photo {i} :"})
            content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
        notes.append(_call(
            client, model=vision_model, messages=[{"role": "user", "content": content}],
            response_format=OBS_FORMAT, max_completion_tokens=2000, temperature=0.2,
        ))
    return notes


def write(key, text_model, system, observations, user_text):
    client = _client(key)
    obs = json.dumps(observations, ensure_ascii=False, indent=1)
    msg = (
        "Tu n'as pas les photos sous les yeux : un assistant les a regardées pour toi "
        "et a noté ce qu'il voit (une fiche par paquet de photos). Fie-toi à ces notes, "
        "croise-les, et quand les fiches se contredisent, prends la plus précise ou signale le doute "
        "dans notes_vendeur.\n\nNotes sur les photos :\n" + obs + "\n\n" + user_text
    )
    kw = dict(
        model=text_model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": msg}],
        response_format=ANNONCE_FORMAT, max_completion_tokens=6000, temperature=0.8,
    )
    if "gpt-oss" in text_model:
        kw["reasoning_effort"] = "medium"
    return _call(client, **kw)
