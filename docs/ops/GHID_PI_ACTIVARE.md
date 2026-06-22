# Ghid: Activare Pi Network pentru Swypik

Codul e gata 100%. Mai sunt 3 lucruri pe care DOAR TU le poți face
(necesită conturile tale). Le faci o dată, în ~20 minute.

────────────────────────────────────────────────────────────
PASUL 1 — DNS în Cloudflare (5 min)
────────────────────────────────────────────────────────────
1. Intră pe https://dash.cloudflare.com
2. Alege domeniul `swypik.com`
3. Stânga: meniul **DNS** → **Records**
4. Apasă **Add record**:
     Type:  A
     Name:  pi
     IPv4 address:  46.224.197.2
     Proxy status:  Proxied (norul portocaliu) — la fel ca www
     TTL:  Auto
5. **Save**

Gata. După ~2 minute, pi.swypik.com va răspunde.

────────────────────────────────────────────────────────────
PASUL 2 — Înregistrează app-ul în Pi Developer Portal (10 min)
────────────────────────────────────────────────────────────
ATENȚIE: asta se face DOAR din telefon, în aplicația Pi Browser.

1. Deschide aplicația **Pi** pe telefon (sau instaleaz-o din App Store/Play)
2. Asigură-te că ești logat și ai trecut KYC (verificare identitate)
3. Deschide **Pi Browser** (buton în aplicația Pi)
4. În bara de adresă scrie:  develop.pi   și apasă Go
   (asta deschide Developer Portal)
5. Apasă **New App** / **Create an App**
       App Name:        Swypik
       App Description: Shop by video, pay with Pi
6. Confirmă crearea. Vei vedea un **App Dashboard**.

   ── 2a. Domain validation ──
7. În dashboard caută secțiunea **Hosting** / **Domain** / **App URL**
8. La "Production URL" pune:   https://pi.swypik.com
9. Apasă **Verify** / **Generate validation key**
10. Îți va afișa un text lung de validare. COPIAZĂ-L.
    → Acesta e **PI_VALIDATION_KEY**. Trimite-mi-l mie.

   ── 2b. Server API Key ──
11. În dashboard caută **API Keys** / **Server-Side**
12. Copiază cheia (un șir lung).
    → Acesta e **PI_API_KEY**. Trimite-mi-l mie.

   ── 2c. Configurări importante în portal ──
13. La **Sandbox/Testnet**: lasă pe Testnet deocamdată (testăm cu Pi de test, gratis)
14. La **App Wallet**: portalul îți creează un wallet pentru app.
    Notează adresa (nu e secret).

────────────────────────────────────────────────────────────
PASUL 3 — Trimite-mi cele 2 chei
────────────────────────────────────────────────────────────
Trimite-mi în chat:
   PI_VALIDATION_KEY = <ce ai copiat la pasul 10>
   PI_API_KEY        = <ce ai copiat la pasul 12>

Eu le pun în siguranță pe server, pornesc totul, și testăm împreună.

────────────────────────────────────────────────────────────
Ce fac EU automat după ce-mi dai cheile:
────────────────────────────────────────────────────────────
- pun cheile în .env.production (securizat, 600)
- pun PI_VALIDATION_KEY ca să răspundă /validation-key.txt
- reload Caddy → cert HTTPS automat pentru pi.swypik.com
- restart web-next
- verific că validation-key.txt răspunde corect (ca să treacă verificarea Pi)
- verific că plata în Pi merge end-to-end pe testnet
- îți spun exact cum să testezi din Pi Browser
