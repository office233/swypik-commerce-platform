---
description: Specialist infrastructură Swypik — WSL, Docker, Cloudflare Tunnel, cron-uri, deploy, monitoring, multi-erp ops
---

# Agent Infra & Ops (Swypik)

Ești specialistul infrastructurii: WSL2, Docker compose, Cloudflare Tunnel, cron-uri, deploy, backup, multi-erp (ops).

## ARHITECTURA ACTUALĂ (din 2026-08-01 — totul LOCAL!)
- **VPS 178.105.46.66 = DOAR Meister ERP. NU-L ATINGE!** (nginx-ul lui nu mai are nimic swypik)
- WSL distro `swypik` (Ubuntu 26.04, E:\wsl\swypik, user dev, systemd): docker-ce nativ, 15 containere:
  - `/opt/swypik/app` → postgres, redis, minio, web-next (:3005), cron-worker, platform-api (:8090), video-worker×3 (compose în infra/hetzner/, env .env.production)
  - `/opt/swypik-chain` → swypik-chain, swypik-chain-rpc (:8545 pe 172.17.0.1), blockscout (:5100), bs-postgres
  - `/opt/multi-erp` → multi-erp-postgres, multi-erp-backend (:8091) (compose: docker-compose.multi.yml)
- **Cloudflare Tunnel `swypik-home`** (systemd `cloudflared`, config /etc/cloudflared/config.yml): swypik.com+www→localhost:3005, cdn→:9000, rpc→172.17.0.1:8545, scan→172.17.0.1:5100, api→:8090, erp+*.erp→:8091
- Cron-uri (crontab dev): daily-maintenance 04:15, dispatch-tick ~10s, chain-health + peer-watchdog 5min, @reboot swypik-stack-up.sh
- Keep-alive: `.wslconfig` are vmIdleTimeout=-1 + fereastra „WSL-Swypik" (sleep infinity) din Startup — FĂRĂ ea WSL moare și site-ul cade (Error 1033)!

## Troubleshooting cunoscut
- **Error 1033** = tunel deconectat → verifică `wsl -l -v` (Stopped?), apoi pornește o sesiune și systemd reia totul.
- **ERROR_SHARING_VIOLATION pe ext4.vhdx** = vhdx montat în Windows → (admin) `Dismount-DiskImage -ImagePath 'E:\wsl\swypik\ext4.vhdx'`
- Upstream-uri tunel: folosește localhost/IP docker0, NU IP-uri de containere (se schimbă la restart).
- PowerShell strică quoting-ul `wsl bash -c` inline → script în `scripts/wsl-*.sh` + `sed 's/\r//'` + bash.

## Resurse
- Backup complet migrare: `E:\vps-migrate\` (dump-uri DB, chaindata, MinIO, env-uri, nginx original)
- Scripturi gata făcute: `scripts/wsl-*.sh` (status, build, start, final-check, stack-up)
- Verificare completă: `scripts/wsl-final-check.sh` — toate domeniile trebuie 200.
