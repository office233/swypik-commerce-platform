# SWYP Pay — Roadmap pe trepte (loialitate → instituție de plăți)

> Document de planificare strategică. Nu e consultanță juridică — jaloanele legale se validează cu avocat specializat în plăți/e-money înainte de fiecare treaptă.
> Creat: 2026-08-02

## Viziune

SWYP evoluează din token de rewards closed-loop în instrument de plată real („Swyp Pay"), pe măsură ce platforma câștigă tracțiune. **Ordinea treptelor e obligatorie** — fiecare treaptă construiește dosarul pentru următoarea.

Regula de aur: **nu deschidem un flux financiar înainte de acoperirea legală pentru el.** Istoricul curat = condiție de licențiere.

---

## Treapta 0 — Closed-loop (ACUM)

**Statut legal:** program de loialitate, în afara reglementării financiare.

**Ce avem:**
- Swyp Chain (geth PoA privat, chainId 643366, supply fix 10 mld, explorer Blockscout)
- Rewards → useri, transfer P2P, plăți user→comerciant și comerciant→comerciant (intern)
- Fluxuri auditate (docs/SECURITY_AUDIT.md)

**Liniile roșii ale treptei (NU se trec fără treapta 3):**
- ❌ cumpărare SWYP cu bani/crypto
- ❌ răscumpărare SWYP în fiat (nici pentru comercianți)
- ❌ listare pe exchange / pool DEX / wrapped SWYP pe rețele publice
- ❌ marketing care numește SWYP „monedă" sau „investiție"

**De făcut pe treapta asta (obiective de produs + transparență):**
- [ ] Pagina publică `/transparency`: genesis.json, adrese oficiale (treasury, REWARDS, custodie), declarație onestă „registru PoA privat operat de Swypik"
- [ ] Proof of reserves automat: sold on-chain treasury + balanțe DB = supply total, publicat zilnic
- [ ] Cod public selectiv: genesis + logica bridge + regulile de emisie rewards (repo separat)
- [ ] ToS: clauză explicită anti-schimb extern (vânzare SWYP contra valoare externă = suspendare)
- [ ] Anomaly detection pe transferuri P2P (pattern OTC gri: transferuri mari unidirecționale între conturi fără altă interacțiune)
- [ ] Fee de circulație pe tranzacții B2B (sink spre treasury) — design anti-tezaurizare
- [ ] Dashboard volume: echivalent-valoare tranzacționată lunar (metrica pragurilor legale)

**Criteriu de trecere la Treapta 1:** volum tranzacții comerciale în creștere susținută + primii ~10-20 comercianți activi.

---

## Treapta 1 — Rețea limitată notificată

**Statut legal:** excepția „rețea limitată" (PSD2 art. 3(k) / Legea 209/2019), notificată la BNR.

**Declanșator:** apropierea de pragul de raportare (~1 mil. € echivalent volum/12 luni pe excepția de rețea limitată) SAU creșterea numărului de comercianți peste ce se poate apăra ca „rețea limitată".

**Acțiuni:**
- [ ] Angajat avocat specializat plăți/e-money (nu crypto generic) — validare roadmap + praguri exacte
- [ ] Notificare BNR pe excepția de rețea limitată
- [ ] Documentare formală a rețelei de acceptare (contracte comercianți, gamă de produse)
- [ ] Politică internă AML light (KYC comercianți, monitorizare tranzacții) — pregătire pentru treapta 2

**Cost estimat:** mii de € (avocat + documentație). Fără capital reglementar.

**Criteriu de trecere:** cerere reală de carduri / plăți externe de la comercianți și useri; volume care justifică costuri BaaS.

---

## Treapta 2 — Swyp Pay pe licența altcuiva (BaaS / agent EMI)

**Statut legal:** brand pe licența unui EMI licențiat (BaaS: ex. Treezor, Intergiro, Swan, Railsr) sau statut de agent EMI înregistrat la BNR.

**Ce devine posibil:**
- Carduri co-branded „Swyp Pay" (fizice/virtuale) — plata în lei de pe cont real, SWYP aplicat ca discount instant la tranzacție
- Conturi cu IBAN pentru comercianți
- Decontare comercianți în lei (model „gift card extins": platforma plătește factura, SWYP se stinge)

**Acțiuni:**
- [ ] Selecție partener BaaS (criterii: acoperire România/RON, costuri per card + per tranzacție, API)
- [ ] Integrare API BaaS ↔ platforma Swypik (ledger SWYP rămâne al nostru, fluxul fiat e al lor)
- [ ] Fond de decontare comercianți + plafoane de emisie rewards legate matematic de venituri (fiecare SWYP emis = datorie viitoare în lei — NU emitem peste capacitatea de decontare)
- [ ] AML/KYC prin partener

**Cost estimat:** zeci de mii €/an (setup + fee-uri). Fără capital reglementar propriu.

**Criteriu de trecere:** volumele fac fee-urile BaaS mai scumpe decât operarea pe licență proprie; business case solid pentru control total.

---

## Treapta 3 — Licență IEME proprie (BNR)

**Statut legal:** Instituție Emitentă de Monedă Electronică. SWYP devine legal monedă electronică (sau e-money token sub MiCA — de decis cu avocații la momentul respectiv).

**Ce devine posibil (abia ACUM se ridică liniile roșii de la Treapta 0):**
- ✅ cumpărare SWYP cu lei (emitere la paritate, fonduri safeguarded)
- ✅ răscumpărare SWYP în lei — inclusiv pentru comercianți
- ✅ plăți generale între oricine, rețea de acceptare nelimitată
- ✅ „Swyp Pay" pe licență proprie

**Cerințe:**
- Capital inițial minim **350.000 €**
- Safeguarding: fondurile clienților în conturi separate la bancă
- Program AML/CFT complet, ofițer de conformitate, audit intern/extern
- Guvernanță: acționariat verificat, conducere „fit & proper", plan de afaceri pe 3 ani
- Proces: realist 12–24 luni de la depunerea dosarului la BNR

**Avantaj construit anterior:** chain-ul privat cu explorer public + proof of reserves + istoric curat de tranzacții = infrastructură de ledger auditabilă, exact ce vrea regulatorul să vadă.

---

## Treapta 4 — „Swyp Bank" (opțional, probabil inutil)

**Statut legal:** instituție de credit, licență BNR/BCE. Capital minim 5 mil. € (practic mult mai mult), ani de proces.

**Diferența reală față de EMI:** depozite cu dobândă + creditare. Pentru plăți, carduri, schimb și comercianți, **EMI (Treapta 3) acoperă tot**. Wise, Revolut (ani de zile), Paysera au funcționat fără licență bancară completă.

**Decizie:** se reevaluează DOAR dacă modelul de business cere creditare (ex. finanțarea comercianților din ecosistem). Altfel, „Swyp Bank" rămâne nume de brand, nu entitate.

---

## Sinteza — ce deblochează fiecare treaptă

| | T0 acum | T1 notificat | T2 BaaS | T3 EMI | T4 bancă |
|---|---|---|---|---|---|
| Rewards + P2P + plăți interne | ✅ | ✅ | ✅ | ✅ | ✅ |
| Card Swyp Pay | ❌ | ❌ | ✅ (pe licența lor) | ✅ | ✅ |
| Decontare comercianți în lei | ❌ | ❌ | ✅ (model gift-card) | ✅ | ✅ |
| Cumpărare/vânzare SWYP ↔ fiat | ❌ | ❌ | ❌ | ✅ | ✅ |
| Depozite cu dobândă, credite | ❌ | ❌ | ❌ | ❌ | ✅ |
| Cost de intrare | 0 | ~mii € | ~zeci mii €/an | 350k € + echipă | 5M+ € |

## Riscuri de secvență (ce NU facem niciodată)

1. **Nu vindem SWYP contra bani înainte de T3** — descalifică dosarul de licență și e ofertă neautorizată.
2. **Nu promitem răscumpărare în fiat înainte de T2/T3** — asta e definiția monedei electronice nelicențiate.
3. **Nu lăsăm emisia de rewards decuplată de capacitatea de decontare** din momentul T2 — altfel construim datorie neacoperită (schemă piramidală de facto).
4. **Nu numim SWYP „criptomonedă"/„investiție"** în marketing pe T0–T2 — doar „puncte de recompensă transferabile".

## Următorii pași imediați (T0)

1. Pagina `/transparency` + genesis public + proof of reserves
2. Clauza anti-schimb extern în ToS
3. Anomaly detection P2P
4. Dashboard volume lunare (metrica de prag)
5. Primul contact cu avocat de plăți — validarea acestui document
