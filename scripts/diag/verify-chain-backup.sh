#!/bin/bash
# Verifica integritatea backupului criptat de chei si absenta arhivelor in clar.
F=$(ls -t /opt/backups/*/chain_keys_*.tar.gz.gpg 2>/dev/null | head -1)
echo "Arhiva: $F"
echo "=== CONTINUT (test decriptare) ==="
gpg -d --batch --quiet --passphrase-file /root/.chain_backup_passphrase "$F" | tar tz

echo ""
echo "=== ARHIVE IN CLAR RAMASE (trebuie sa fie ZERO) ==="
ls /opt/backups/*/chain_keys_*.tar.gz 2>/dev/null && echo "!!! EXISTA IN CLAR" || echo "OK local: niciuna"
ssh -p 23 -i /root/.ssh/storagebox_ed25519 -o StrictHostKeyChecking=no \
  u643366@u643366.your-storagebox.de 'ls backups/*/chain_keys_*.tar.gz' 2>/dev/null \
  && echo "!!! EXISTA IN CLAR OFFSITE" || echo "OK offsite: niciuna"

echo ""
echo "=== OFFSITE: arhive criptate ==="
ssh -p 23 -i /root/.ssh/storagebox_ed25519 -o StrictHostKeyChecking=no \
  u643366@u643366.your-storagebox.de 'ls -la backups/*/chain_keys_*.gpg' 2>/dev/null || echo "nimic offsite inca"

echo ""
echo "=== PASSPHRASE: permisiuni + exclus din backup ==="
ls -la /root/.chain_backup_passphrase
case "$(readlink -f /root/.chain_backup_passphrase)" in
  /opt/backups/*) echo "!!! PERICOL: passphrase e in folderul de backup" ;;
  *) echo "OK: passphrase in afara folderului de backup (nu pleaca offsite)" ;;
esac
