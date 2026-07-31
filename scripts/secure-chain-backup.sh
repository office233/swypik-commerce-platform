#!/bin/bash
# Securizează backupul cheilor de trezorerie:
#  1. generează o passphrase puternică (o dată), stocată local cu chmod 600
#     ȘI EXCLUSĂ din backupul offsite;
#  2. modifică backup-all.sh să cripteze arhiva chain_keys cu GPG AES-256;
#  3. re-criptează arhivele deja urcate în clar și le șterge pe cele vechi.
set -e

PASS_FILE=/root/.chain_backup_passphrase

if [ ! -f "$PASS_FILE" ]; then
  openssl rand -base64 32 | tr -d '\n' > "$PASS_FILE"
  chmod 600 "$PASS_FILE"
  echo "PASSPHRASE GENERATĂ (salveaz-o în password manager, apare o singură dată):"
  echo "-----------------------------------------------------------"
  cat "$PASS_FILE"; echo
  echo "-----------------------------------------------------------"
else
  echo "Passphrase există deja la $PASS_FILE"
fi
