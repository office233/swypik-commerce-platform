#!/usr/bin/env python3
"""Chei lipsa accountEdit (one-shot)."""
import json, io, os
BASE = os.path.join(os.path.dirname(__file__), "..", "messages")
KEYS = {
    "ro": {"displayName": "Nume afișat", "linkLabelPlaceholder": "Etichetă (ex: Site-ul meu)", "removeLink": "Șterge linkul"},
    "en": {"displayName": "Display name", "linkLabelPlaceholder": "Label (e.g. My website)", "removeLink": "Remove link"},
    "es": {"displayName": "Nombre visible", "linkLabelPlaceholder": "Etiqueta (ej.: Mi sitio)", "removeLink": "Eliminar enlace"},
    "fr": {"displayName": "Nom affiché", "linkLabelPlaceholder": "Libellé (ex. : Mon site)", "removeLink": "Supprimer le lien"},
    "de": {"displayName": "Anzeigename", "linkLabelPlaceholder": "Bezeichnung (z. B. Meine Website)", "removeLink": "Link entfernen"},
    "pt": {"displayName": "Nome de exibição", "linkLabelPlaceholder": "Rótulo (ex.: Meu site)", "removeLink": "Remover link"},
    "it": {"displayName": "Nome visualizzato", "linkLabelPlaceholder": "Etichetta (es.: Il mio sito)", "removeLink": "Rimuovi link"},
}
for loc, vals in KEYS.items():
    p = os.path.join(BASE, f"{loc}.json")
    with io.open(p, encoding="utf-8") as f:
        data = json.load(f)
    data.setdefault("accountEdit", {}).update(vals)
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(loc, "ok")
