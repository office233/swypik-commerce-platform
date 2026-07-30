#!/bin/bash
LOGF=$(grep -oP 'LOG_DIR="\K[^"]+' /opt/swypik/app/infra/hetzner/safe-deploy-web.sh | head -1)
[ -z "$LOGF" ] && LOGF=/var/log/swypik
echo "LOG_DIR=$LOGF"
F="$LOGF/deploy-web.log"
ls -la "$F" 2>/dev/null || { find /var/log -name 'deploy-web.log' 2>/dev/null; F=$(find /var/log -name 'deploy-web.log' 2>/dev/null | head -1); }
echo "== ultimele erori a11y =="
grep -n 'a11y\|serious\|violations' "$F" | tail -5
echo "== context ultimul FAIL =="
awk '/running post-deploy a11y/{buf=""} {buf=buf ORS $0} END{}' "$F" >/dev/null 2>&1
tac "$F" | awk '/a11y smoke/{p=1} p{print} /running post-deploy a11y/{exit}' | tac | grep -E 'failed|✘|Error|serious|expect' | head -15
