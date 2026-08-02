#!/usr/bin/env python3
"""Chei noi pt action rail Exploreaza (one-shot)."""
import json, io, os
BASE = os.path.join(os.path.dirname(__file__), "..", "messages")
KEYS = {
    "ro": {"actiuniVideo": "Acțiuni video", "apreciaza": "Apreciază", "distribuie": "Distribuie"},
    "en": {"actiuniVideo": "Video actions", "apreciaza": "Like", "distribuie": "Share"},
    "es": {"actiuniVideo": "Acciones del vídeo", "apreciaza": "Me gusta", "distribuie": "Compartir"},
    "fr": {"actiuniVideo": "Actions vidéo", "apreciaza": "J'aime", "distribuie": "Partager"},
    "de": {"actiuniVideo": "Video-Aktionen", "apreciaza": "Gefällt mir", "distribuie": "Teilen"},
    "pt": {"actiuniVideo": "Ações do vídeo", "apreciaza": "Curtir", "distribuie": "Compartilhar"},
    "it": {"actiuniVideo": "Azioni video", "apreciaza": "Mi piace", "distribuie": "Condividi"},
}
for loc, vals in KEYS.items():
    p = os.path.join(BASE, f"{loc}.json")
    with io.open(p, encoding="utf-8") as f:
        data = json.load(f)
    data.setdefault("explore", {}).update(vals)
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(loc, "ok")
