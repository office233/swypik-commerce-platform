# Live Commerce Setup (MediaMTX)

## Arhitectură
- **MediaMTX** (`bluenviron/mediamtx:latest`) face RTMP ingest pe :1935 și servește HLS pe :8888.
- Caddy reverse-proxy: `/hls/*` → `mediamtx:8888`.
- Hook-uri lifecycle (`runOnReady` / `runOnNotReady`) cheamă `/api/internal/live/{started,ended}` cu `X-Internal: $INTERNAL_SECRET`.
- Creator publică în OBS la `rtmp://swypik.com:1935/live/<stream_key>`.
- Viewer consumă HLS la `https://swypik.com/hls/live/<stream_key>/index.m3u8`.

## Activare (pași pentru user)

### 1. Variabile env
În `/opt/swypik/app/infra/hetzner/.env.production`:
```
INTERNAL_SECRET=<random 32-byte hex>  # același folosit de Next.js
LIVE_RTMP_HOST=swypik.com
LIVE_HLS_HOST=swypik.com
```

### 2. UFW (deschide RTMP)
```bash
ufw allow 1935/tcp comment 'mediamtx rtmp ingest'
ufw status verbose | grep 1935
```

### 3. Pornește MediaMTX
```bash
cd /opt/swypik/app/infra/hetzner
docker compose -f docker-compose.prod.yml --env-file .env.production up -d mediamtx
docker logs swypik-prod-mediamtx-1 --tail 50
```
Verifică: `curl -sI http://127.0.0.1:9997/v3/config/global/get | head -3` și `curl -sI http://127.0.0.1:8888/`.

### 4. Reload Caddy
```bash
docker compose -f docker-compose.prod.yml restart caddy
```
Test: `curl -sI https://swypik.com/hls/` → 404 (normal când nu există stream activ).

### 5. Creează un stream test
1. Login ca creator → `/creator/live` → „Stream nou".
2. Copiază RTMP URL + stream key.
3. OBS Studio → Settings → Stream → Service=Custom → Server=`rtmp://swypik.com:1935/live` → Stream Key=`<key>`.
4. „Start Streaming". În câteva secunde:
   - MediaMTX trimite `runOnReady` → `/api/internal/live/started` → status='live' + notificări followers.
   - Viewer-ul vede HLS la `/live/<id>`.
5. „Stop Streaming" în OBS → `runOnNotReady` → status='ended'.

## Troubleshooting
- **Port 1935 ocupat**: `ss -tlnp | grep 1935`.
- **OBS connection refused**: verifică UFW + că containerul rulează (`docker ps | grep mediamtx`).
- **Hook nu pornește**: verifică `INTERNAL_SECRET` identic în `.env.production` (citit de mediamtx și de Next.js) + DNS intern docker (`docker exec swypik-prod-mediamtx-1 curl -sf http://swypik-prod-web-next-1:3000/api/health`).
- **HLS 404 pentru viewer**: stream-ul nu transmite. Verifică OBS bitrate < 6 Mbps + că path-ul în OBS e exact `live/<key>`.

## Storage HLS / recordings
Pe disc local (volume `swypik_mediamtx_recordings`). Pentru R2: configurează `pathDefaults.record` + `recordPath` în mediamtx.yml sau rulează un cron de sync.

## Securitate
- Stream key e secret per-creator (16 bytes hex). Nu-l expune în UI altora.
- Anyone-can-read pe HLS (public). Pentru gated streams adaugă `authMethod: http` cu validare token Next.js.
