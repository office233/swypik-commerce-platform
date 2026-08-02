#!/bin/bash
cd /opt/swypik/app
echo "HEAD: $(git rev-parse HEAD)"
echo '--- blob din git vs fisier pe disc ---'
for f in messages/en.json messages/ro.json; do
  BLOB=$(git show HEAD:$f | md5sum | cut -d' ' -f1)
  DISK=$(md5sum $f | cut -d' ' -f1)
  echo "$f blob=$BLOB disk=$DISK $([ "$BLOB" = "$DISK" ] && echo SAME || echo DIFFER)"
done
echo '--- blob-ul din git e valid? ---'
git show HEAD:messages/en.json | python3 -c "import json,sys; json.load(sys.stdin); print('blob en OK')" 2>&1 | tail -1
git show HEAD:messages/ro.json | python3 -c "import json,sys; json.load(sys.stdin); print('blob ro OK')" 2>&1 | tail -1
echo '--- context la offset corupt ---'
python3 - <<'EOF'
data = open('messages/en.json','rb').read()
print(repr(data[116380:116470]))
EOF
