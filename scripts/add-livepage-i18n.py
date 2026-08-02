#!/usr/bin/env python3
"""Adauga namespace livePage in cele 7 locale (one-shot, Faza i18n)."""
import json, io, os

BASE = os.path.join(os.path.dirname(__file__), "..", "messages")
KEYS = {
    "ro": {"title": "Live acum", "empty": "Niciun stream activ.", "fallbackTitle": "Live stream"},
    "en": {"title": "Live now", "empty": "No active streams.", "fallbackTitle": "Live stream"},
    "es": {"title": "En vivo ahora", "empty": "No hay transmisiones activas.", "fallbackTitle": "Transmisión en vivo"},
    "fr": {"title": "En direct", "empty": "Aucun stream actif.", "fallbackTitle": "Stream en direct"},
    "de": {"title": "Jetzt live", "empty": "Keine aktiven Streams.", "fallbackTitle": "Live-Stream"},
    "pt": {"title": "Ao vivo agora", "empty": "Nenhuma transmissão ativa.", "fallbackTitle": "Transmissão ao vivo"},
    "it": {"title": "In diretta ora", "empty": "Nessuno stream attivo.", "fallbackTitle": "Streaming dal vivo"},
}
for loc, vals in KEYS.items():
    p = os.path.join(BASE, f"{loc}.json")
    with io.open(p, encoding="utf-8") as f:
        data = json.load(f)
    data["livePage"] = vals
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(loc, "ok")
