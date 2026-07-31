#!/usr/bin/env python3
"""Patch backup-all.sh: cripteaza arhiva chain_keys cu GPG AES-256.

Passphrase-ul sta in /root/.chain_backup_passphrase (600, doar local, NU
merge offsite - rsync-ul urca doar $BACKUP_ROOT).
"""
import re, sys

P = "/usr/local/bin/backup-all.sh"
src = open(P).read()

if "chain_keys_${TS}.tar.gz.gpg" in src:
    print("deja patchuit")
    sys.exit(0)

old = '''  tar czf "$DAY_DIR/chain_keys_${TS}.tar.gz" \\
    -C / \\
    opt/swypik-chain/data/keystore \\
    opt/swypik-chain/keystore-init \\
    opt/swypik-chain/password.txt \\
    opt/swypik-chain/accounts.env \\
    opt/swypik-chain/genesis.json \\
    opt/swypik-chain/docker-compose.yml 2>/dev/null \\
    && log "OK   chain keys+genesis ($(du -h "$DAY_DIR/chain_keys_${TS}.tar.gz" | cut -f1))" \\
    || { log "FAIL chain keys backup"; fail=1; }'''

new = '''  # Arhiva cu chei e criptata GPG AES-256; passphrase in /root/.chain_backup_passphrase
  # (chmod 600, NU pleaca offsite). Decriptare:
  #   gpg -d --batch --passphrase-file /root/.chain_backup_passphrase chain_keys_X.tar.gz.gpg | tar xz
  tar cz \\
    -C / \\
    opt/swypik-chain/data/keystore \\
    opt/swypik-chain/keystore-init \\
    opt/swypik-chain/password.txt \\
    opt/swypik-chain/accounts.env \\
    opt/swypik-chain/genesis.json \\
    opt/swypik-chain/docker-compose.yml 2>/dev/null \\
    | gpg --symmetric --cipher-algo AES256 --batch --yes \\
        --passphrase-file /root/.chain_backup_passphrase \\
        -o "$DAY_DIR/chain_keys_${TS}.tar.gz.gpg" \\
    && log "OK   chain keys+genesis criptat ($(du -h "$DAY_DIR/chain_keys_${TS}.tar.gz.gpg" | cut -f1))" \\
    || { log "FAIL chain keys backup"; fail=1; }'''

if old not in src:
    print("EROARE: sablonul nu se potriveste"); sys.exit(1)

open(P, "w").write(src.replace(old, new))
print("patchuit OK")
