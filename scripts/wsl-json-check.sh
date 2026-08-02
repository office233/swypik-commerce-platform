#!/bin/bash
cd /opt/swypik/app
git status --short | head -5
git log --oneline -1
echo '--- validare JSON messages/ (python) ---'
for f in messages/*.json; do
  python3 -c "import json,sys; json.load(open('$f',encoding='utf-8')); print('OK','$f')" 2>/dev/null \
    || python3 -c "
import json
try:
    json.load(open('$f', encoding='utf-8'))
except Exception as e:
    print('BAD', '$f', str(e)[:100])
"
done
echo '--- md5 vs git HEAD ---'
git stash list | head -2
git diff --stat HEAD -- messages/ | tail -3
