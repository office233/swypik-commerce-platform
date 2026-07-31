#!/usr/bin/env bash
# Audit de disc: cine ocupă spațiul pe VPS. READ-ONLY, nu șterge nimic.
echo "=== TOTAL ==="
df -h / | tail -1
echo ""
echo "=== TOP 15 directoare (nivel 1-2) ==="
du -xh --max-depth=2 / 2>/dev/null | sort -hr | head -15
echo ""
echo "=== DOCKER (recuperabil) ==="
docker system df 2>/dev/null
echo ""
echo "=== Volume Docker (date reale) TOP 10 ==="
du -sh /var/lib/docker/volumes/* 2>/dev/null | sort -hr | head -10
echo ""
echo "=== /opt pe proiect ==="
du -sh /opt/* 2>/dev/null | sort -hr | head -10
echo ""
echo "=== Loguri ==="
du -sh /var/log 2>/dev/null
journalctl --disk-usage 2>/dev/null
echo ""
echo "=== /tmp si /root ==="
du -sh /tmp /root 2>/dev/null
echo ""
echo "=== Fisiere > 300MB ==="
find / -xdev -type f -size +300M -exec ls -lh {} \; 2>/dev/null | awk '{print $5, $9}' | sort -hr | head -15
