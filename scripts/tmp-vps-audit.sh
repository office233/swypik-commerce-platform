#!/usr/bin/env bash
echo "== containere (toate):"
docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Image}}' | sort
echo
echo "== imagini dangling + nefolosite:"
docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}' | head -25
echo
echo "== spatiu docker:"
docker system df
echo
echo "== volume orfane:"
docker volume ls -qf dangling=true | head -10
echo
echo "== /opt (dimensiuni):"
du -sh /opt/* 2>/dev/null | sort -rh | head -12
echo
echo "== cronuri active:"
crontab -l | grep -v '^#' | grep -v '^$' | sed 's/x-cron-secret: [0-9a-f]*/SECRET/' | cut -c1-110
