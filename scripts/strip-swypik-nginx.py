#!/usr/bin/env python3
"""Elimină blocurile server swypik din nginx.conf al Meister, păstrând restul intact."""
import re, sys

src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding="utf-8").read()
lines = text.splitlines(keepends=True)

def find_server_blocks(lines):
    """Returnează (start, end) inclusiv pentru fiecare bloc 'server {...}' de top."""
    blocks = []
    i = 0
    while i < len(lines):
        if re.match(r"\s*server\s*\{?\s*$", lines[i]) or re.match(r"\s*server\s*\{", lines[i]):
            depth = 0
            start = i
            j = i
            started = False
            while j < len(lines):
                depth += lines[j].count("{") - lines[j].count("}")
                if "{" in lines[j]:
                    started = True
                if started and depth == 0:
                    blocks.append((start, j))
                    break
                j += 1
            i = j + 1
        else:
            i += 1
    return blocks

SWYPIK_NAMES = re.compile(r"server_name\s+[^;]*swypik\.com")
to_remove = []
for (s, e) in find_server_blocks(lines):
    body = "".join(lines[s:e+1])
    if SWYPIK_NAMES.search(body):
        # blocul redirect 80 comun conține și domenii meister — nu îl ștergem, îl edităm
        if "meistercom.ro" in body:
            continue
        to_remove.append((s, e))

keep = [True] * len(lines)
for (s, e) in to_remove:
    for k in range(s, e + 1):
        keep[k] = False

out = [l for k, l in zip(keep, lines) if k]
result = "".join(out)
# scot swypik din server_name mixte (blocul redirect http->https)
result = re.sub(r"(server_name[^;]*?)\s+swypik\.com\s+www\.swypik\.com\s+cdn\.swypik\.com", r"\1", result)
result = re.sub(r"\s+swypik\.com|\s+www\.swypik\.com|\s+cdn\.swypik\.com", lambda m: "" if "server_name" not in m.string[max(0,m.start()-200):m.start()] else m.group(0), result, count=0)

open(dst, "w", encoding="utf-8", newline="\n").write(result)
removed = len(to_remove)
print(f"blocuri server sterse: {removed}")
for (s, e) in to_remove:
    hdr = "".join(lines[s:s+6])
    m = re.search(r"server_name\s+([^;]+);", hdr + "".join(lines[s:e+1]))
    print("  -", m.group(1).strip() if m else f"lines {s}-{e}")
print("verificare reziduala swypik:", result.lower().count("swypik"))
