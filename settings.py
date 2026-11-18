"""Réglages stockés dans data/config.json (clé API, style d'écriture...)."""
import json
import os
from db import DATA_DIR

CONFIG_PATH = DATA_DIR / "config.json"

DEFAULTS = {
    "provider": "groq",        # "groq" (gratuit) | "anthropic"
    "groq_api_key": "",
    "groq_vision_model": "qwen/qwen3.8-27b",
    "groq_text_model": "openai/gpt-oss-120b",
    "api_key": "",
    "model": "claude-opus-5-5",
    "tutoiement": True,
    "emojis": "rare",          # "jamais" | "rare" | "oui"
    "hashtags": True,
    "signature": "",           # ex: "envoi rapide, je fais des lots"
    "style": "naturel",        # "naturel" | "court" | "detaille"
    "marge_prix": "normal",    # "vente_rapide" | "normal" | "haut"
}

MODELS = {
    "claude-opus-5-5": "Opus 5.5 (meilleure qualité, ~0,05-0,10 € / annonce)",
    "claude-sonnet-5-5": "Sonnet 5.5 (bon compromis, ~0,03 € / annonce)",
    "claude-haiku-5-5": "Haiku 5.5 (très économique, moins fin)",
}


def load():
    cfg = dict(DEFAULTS)
    if CONFIG_PATH.exists():
        try:
            cfg.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            pass
    return cfg


def save(new_values):
    cfg = load()
    for k, v in new_values.items():
        if k not in DEFAULTS:
            continue
        if k in ("api_key", "groq_api_key") and not v:
            continue  # champ vide = on garde l'ancienne clé
        cfg[k] = v
    DATA_DIR.mkdir(exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    return cfg


def api_key():
    return load().get("api_key") or os.environ.get("ANTHROPIC_API_KEY", "")


def groq_key():
    return load().get("groq_api_key") or os.environ.get("GROQ_API_KEY", "")


def public():
    """Réglages renvoyés au navigateur : jamais la clé elle-même."""
    cfg = load()
    key = api_key()
    cfg["api_key"] = ""
    cfg["api_key_set"] = bool(key)
    cfg["api_key_hint"] = f"…{key[-4:]}" if key else ""
    gkey = groq_key()
    cfg["groq_api_key"] = ""
    cfg["groq_key_set"] = bool(gkey)
    cfg["groq_key_hint"] = f"…{gkey[-4:]}" if gkey else ""
    cfg["models"] = MODELS
    from llm_groq import TEXT_MODELS, VISION_MODELS
    cfg["groq_text_models"] = TEXT_MODELS
    cfg["groq_vision_models"] = VISION_MODELS
    return cfg
