# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-visitor.spec.ts >> vizitator: /terms se încarcă curat
- Location: tests\e2e-full\01-visitor.spec.ts:32:7

# Error details

```
Error: /terms: console errors

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy.",
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Sări la conținut" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - main [ref=e4]:
    - heading "Termeni și Condiții" [level=1] [ref=e5]
    - paragraph [ref=e6]: "Ultima actualizare: 31 iulie 2026"
    - paragraph [ref=e7]: "Pe scurt: prețul afișat e prețul final, politicile de anulare sunt la vedere înainte de plată, iar drepturile tale legale de consumator rămân mereu intacte."
    - generic [ref=e8]:
      - generic [ref=e9]:
        - heading "1. Cine suntem și ce accepți" [level=2] [ref=e10]
        - paragraph [ref=e11]: Swypik este o platformă online operată de Swypik Technology („Swypik”, „noi”). Prin crearea unui cont sau prin plasarea unei comenzi, accepți acești Termeni. Dacă nu ești de acord cu ei, te rugăm să nu folosești platforma.
        - paragraph [ref=e12]: Acești Termeni se completează cu Politica de confidențialitate și cu Politica de cookie-uri.
      - generic [ref=e13]:
        - heading "2. Rolul Swypik — intermediar sau vânzător" [level=2] [ref=e14]
        - paragraph [ref=e15]: "Rolul nostru diferă în funcție de ce cumperi, iar asta îți afectează drepturile. Îți spunem clar de fiecare dată:"
        - table [ref=e17]:
          - rowgroup [ref=e18]:
            - row "Serviciu Rolul Swypik Cu cine ai contractul" [ref=e19]:
              - columnheader "Serviciu" [ref=e20]
              - columnheader "Rolul Swypik" [ref=e21]
              - columnheader "Cu cine ai contractul" [ref=e22]
          - rowgroup [ref=e23]:
            - row "Shop, Food, Market intermediar vânzătorul/restaurantul" [ref=e24]:
              - cell "Shop, Food, Market" [ref=e25]
              - cell "intermediar" [ref=e26]
              - cell "vânzătorul/restaurantul" [ref=e27]
            - row "Stays (gazde Swypik) intermediar + procesator plăți gazda" [ref=e28]:
              - cell "Stays (gazde Swypik)" [ref=e29]
              - cell "intermediar + procesator plăți" [ref=e30]
              - cell "gazda" [ref=e31]
            - row "Fly (bilete avion) vânzător (merchant of record) Swypik" [ref=e32]:
              - cell "Fly (bilete avion)" [ref=e33]
              - cell "vânzător (merchant of record)" [ref=e34]
              - cell "Swypik" [ref=e35]
            - row "Go, Send, Move intermediar șoferul/curierul" [ref=e36]:
              - cell "Go, Send, Move" [ref=e37]
              - cell "intermediar" [ref=e38]
              - cell "șoferul/curierul" [ref=e39]
        - list [ref=e40]:
          - listitem [ref=e41]: Ca intermediar, nu suntem parte în contractul de vânzare. Facilităm întâlnirea, plata și comunicarea, dar produsul/serviciul e furnizat de partener, care răspunde pentru conformitatea lui.
          - listitem [ref=e42]: Ca vânzător (Fly), noi suntem responsabili contractual față de tine pentru comanda respectivă.
      - generic [ref=e43]:
        - heading "3. Contul tău" [level=2] [ref=e44]
        - list [ref=e45]:
          - listitem [ref=e46]: Trebuie să ai minimum 16 ani pentru a-ți crea un cont și 18 ani pentru a deveni partener (vânzător, gazdă, șofer, curier).
          - listitem [ref=e47]: Datele furnizate trebuie să fie reale și actuale. Conturile cu date false pot fi suspendate.
          - listitem [ref=e48]: Ești responsabil pentru păstrarea confidențialității parolei și pentru activitatea din contul tău.
          - listitem [ref=e49]: Îți poți șterge contul oricând din setări. Păstrăm doar datele pe care legea ne obligă să le reținem (ex. facturi).
      - generic [ref=e50]:
        - heading "4. Prețuri, comisioane și plăți" [level=2] [ref=e51]
        - paragraph [ref=e52]: Prețul afișat este prețul final, cu TVA inclus. Nu adăugăm taxe la finalul comenzii — ce vezi, aia plătești.
        - paragraph [ref=e53]: "Comisioanele noastre sunt reținute din suma încasată de partener, nu adăugate peste prețul tău:"
        - table [ref=e55]:
          - rowgroup [ref=e56]:
            - row "Serviciu Comision Swypik" [ref=e57]:
              - columnheader "Serviciu" [ref=e58]
              - columnheader "Comision Swypik" [ref=e59]
          - rowgroup [ref=e60]:
            - row "Stays (cazări) 10% din valoarea rezervării" [ref=e61]:
              - cell "Stays (cazări)" [ref=e62]
              - cell "10% din valoarea rezervării" [ref=e63]
            - row "Fly (zboruri) 10% din tariful net, minimum 15 lei" [ref=e64]:
              - cell "Fly (zboruri)" [ref=e65]
              - cell "10% din tariful net, minimum 15 lei" [ref=e66]
            - row "Food, Shop, Go conform contractului cu partenerul" [ref=e67]:
              - cell "Food, Shop, Go" [ref=e68]
              - cell "conform contractului cu partenerul" [ref=e69]
        - list [ref=e70]:
          - listitem [ref=e71]: Plata se face prin card (procesat de Stripe) sau din portofelul Swypik.
          - listitem [ref=e72]: Datele cardului nu ajung pe serverele noastre.
          - listitem [ref=e73]: Pentru fiecare comandă primești document fiscal, conform legii.
      - generic [ref=e74]:
        - heading "5. Dreptul de retragere (14 zile)" [level=2] [ref=e75]
        - paragraph [ref=e76]: Conform OUG 34/2014, ai dreptul să te retragi din contractele la distanță în 14 zile, fără să motivezi. Termenul curge de la primirea produsului.
        - paragraph [ref=e77]: "Legea prevede însă și excepții, care se aplică pe Swypik:"
        - list [ref=e78]:
          - listitem [ref=e79]: Mâncare, băuturi și produse perisabile — fără drept de retragere.
          - listitem [ref=e80]: Produse personalizate sau realizate la comandă — fără drept de retragere.
          - listitem [ref=e81]: Produse sigilate desigilate, din motive de igienă sau sănătate — fără drept de retragere.
          - listitem [ref=e82]: Servicii de cazare, transport și închirieri auto cu dată sau perioadă determinată — fără drept legal de retragere; se aplică politica de anulare afișată la rezervare.
          - listitem [ref=e83]: Bilete de avion — supuse condițiilor tarifare ale companiei aeriene, comunicate înainte de plată.
      - generic [ref=e84]:
        - heading "6. Anulări și rambursări" [level=2] [ref=e85]
        - paragraph [ref=e86]: "Politicile noastre de anulare sunt afișate înainte de a plăti, nu ascunse:"
        - list [ref=e87]:
          - listitem [ref=e88]: "Cazări: anulare gratuită cu cel puțin 5 zile înainte de check-in (rambursare 100%); sub 5 zile, rambursare 50%. Dacă gazda anulează, primești banii integral înapoi."
          - listitem [ref=e89]: "Comenzi de mâncare: pot fi anulate până când restaurantul începe prepararea."
          - listitem [ref=e90]: "Curse: anulabile până la acceptarea de către șofer, fără cost."
          - listitem [ref=e91]: Rambursările ajung în portofelul Swypik imediat, sau pe card în 5–10 zile lucrătoare.
      - generic [ref=e92]:
        - heading "7. Ce nu este permis" [level=2] [ref=e93]
        - paragraph [ref=e94]: Încălcarea acestor reguli poate duce la eliminarea conținutului, suspendarea sau închiderea contului, iar în cazuri grave la sesizarea autorităților.
        - list [ref=e95]:
          - listitem [ref=e96]: Publicarea de anunțuri false, produse contrafăcute, ilegale sau periculoase.
          - listitem [ref=e97]: Ocolirea platformei pentru a evita comisionul, după ce contactul a fost făcut prin Swypik.
          - listitem [ref=e98]: Manipularea recenziilor, crearea de conturi multiple sau fraudarea promoțiilor.
          - listitem [ref=e99]: Hărțuirea altor utilizatori, discurs instigator la ură, conținut sexual explicit.
          - listitem [ref=e100]: Încercarea de a accesa neautorizat sistemele noastre.
      - generic [ref=e101]:
        - heading "8. Reguli pentru parteneri" [level=2] [ref=e102]
        - list [ref=e103]:
          - listitem [ref=e104]: Trebuie să dețineți drepturile legale asupra a ceea ce vindeți sau închiriați și să prezentați documentele justificative la cerere.
          - listitem [ref=e105]: Gazdele trebuie să respecte legislația turistică (certificat de clasificare unde e cazul) și să fie înregistrate fiscal.
          - listitem [ref=e106]: Sunteți responsabili pentru propriile obligații fiscale. Raportăm veniturile către ANAF conform DAC7.
          - listitem [ref=e107]: Anulările repetate sau nerespectarea rezervărilor pot duce la suspendarea contului de partener.
          - listitem [ref=e108]: Plățile către parteneri se fac în portofelul Swypik, de unde pot fi retrase conform politicii de retrageri.
      - generic [ref=e109]:
        - heading "9. Conținutul tău" [level=2] [ref=e110]
        - paragraph [ref=e111]: Păstrezi drepturile asupra fotografiilor, videoclipurilor și textelor pe care le publici. Ne acorzi o licență neexclusivă, gratuită, pentru a le afișa și promova pe platformă și în materialele noastre de marketing, cât timp conținutul e publicat.
        - paragraph [ref=e112]: Ești responsabil să ai dreptul de a publica acel conținut. Ștergem la sesizare orice material care încalcă drepturile altcuiva.
      - generic [ref=e113]:
        - heading "10. Răspundere" [level=2] [ref=e114]
        - paragraph [ref=e115]: Pentru comenzile în care suntem intermediari, răspunderea pentru produs sau serviciu revine partenerului. Noi răspundem pentru funcționarea platformei, procesarea corectă a plăților și pentru serviciile în care suntem vânzător.
        - paragraph [ref=e116]: Nu răspundem pentru întreruperi cauzate de evenimente în afara controlului nostru (defecțiuni ale furnizorilor de internet, atacuri informatice, calamități).
        - paragraph [ref=e117]: Nimic din acești Termeni nu limitează drepturile pe care legea ți le acordă ca și consumator.
      - generic [ref=e118]:
        - heading "11. Reclamații și rezolvarea disputelor" [level=2] [ref=e119]
        - paragraph [ref=e120]: Scrie-ne întâi la support@swypik.com — răspundem în maximum 30 de zile. Majoritatea problemelor se rezolvă aici.
        - paragraph [ref=e121]: "Dacă nu ești mulțumit, te poți adresa:"
        - list [ref=e122]:
          - listitem [ref=e123]: ANPC — Autoritatea Națională pentru Protecția Consumatorilor, www.anpc.ro
          - listitem [ref=e124]: SAL — soluționarea alternativă a litigiilor, prin ANPC.
          - listitem [ref=e125]: "Platforma SOL a Comisiei Europene: ec.europa.eu/consumers/odr"
          - listitem [ref=e126]: Instanțele judecătorești competente din România.
      - generic [ref=e127]:
        - heading "12. Modificări și lege aplicabilă" [level=2] [ref=e128]
        - paragraph [ref=e129]: Putem actualiza acești Termeni. Pentru modificări importante te anunțăm cu cel puțin 15 zile înainte, prin email sau notificare în aplicație. Continuarea folosirii platformei după intrarea lor în vigoare înseamnă acceptare.
        - paragraph [ref=e130]: Acestor Termeni li se aplică legea română. Comenzile deja plasate rămân guvernate de versiunea în vigoare la momentul comenzii.
    - paragraph [ref=e131]: "Swypik Technology · support@swypik.com · ANPC: www.anpc.ro · SOL: ec.europa.eu/consumers/odr"
  - navigation [ref=e132]:
    - generic [ref=e133]:
      - link "Acasă" [ref=e134] [cursor=pointer]:
        - /url: /
        - img [ref=e135]
        - generic [ref=e138]: Acasă
      - link "Explorează" [ref=e139] [cursor=pointer]:
        - /url: /explore
        - img [ref=e140]
        - generic [ref=e143]: Explorează
      - link "Încarcă" [ref=e144] [cursor=pointer]:
        - /url: /reels/record
        - img [ref=e145]
      - link "Mesaje" [ref=e146] [cursor=pointer]:
        - /url: /inbox
        - img [ref=e147]
        - generic [ref=e150]: Mesaje
      - link "Profil" [ref=e151] [cursor=pointer]:
        - /url: /account
        - img [ref=e152]
        - generic [ref=e155]: Profil
  - alert [ref=e156]
  - dialog "Cookie-uri & confidențialitate":
    - generic [ref=e159]:
      - heading "Cookie-uri & confidențialitate" [level=2] [ref=e160]
      - paragraph [ref=e161]: Folosim cookie-uri necesare pentru funcționarea Swypik. Cu acordul tău activăm și cookies analitice și de marketing pentru a îmbunătăți experiența. Conform GDPR, ai nevoie să optezi explicit.
      - generic [ref=e162]:
        - button "Acceptă toate" [ref=e163] [cursor=pointer]
        - button "Doar necesare" [ref=e164] [cursor=pointer]
        - button "Setări detaliate" [ref=e165] [cursor=pointer]
        - link "Află mai multe" [ref=e166] [cursor=pointer]:
          - /url: /legal/cookies
```

# Test source

```ts
  1  | import { Page, expect, APIRequestContext } from '@playwright/test';
  2  | 
  3  | export const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://swypik.com';
  4  | export const ORIGIN = BASE;
  5  | 
  6  | export type PageIssues = {
  7  |   consoleErrors: string[];
  8  |   failedRequests: string[];
  9  | };
  10 | 
  11 | /** Attach console + failed-request collectors to a page. Call BEFORE navigation. */
  12 | export function collectIssues(page: Page): PageIssues {
  13 |   const issues: PageIssues = { consoleErrors: [], failedRequests: [] };
  14 |   page.on('console', (msg) => {
  15 |     if (msg.type() === 'error') {
  16 |       const text = msg.text();
  17 |       // Ignore known benign noise (3rd-party, favicon, aborted media)
  18 |       if (/favicon|ERR_ABORTED|net::ERR_FAILED.*(hls|\.m3u8|\.ts\b)/i.test(text)) return;
  19 |       issues.consoleErrors.push(text.slice(0, 300));
  20 |     }
  21 |   });
  22 |   page.on('response', (res) => {
  23 |     const url = res.url();
  24 |     if (res.status() >= 400 && url.startsWith(BASE)) {
  25 |       // Expected 401s on auth-check endpoints when logged out
  26 |       if (res.status() === 401 && /\/api\/(auth|me|session)/.test(url)) return;
  27 |       issues.failedRequests.push(`${res.status()} ${url.slice(0, 200)}`);
  28 |     }
  29 |   });
  30 |   return issues;
  31 | }
  32 | 
  33 | export function assertNoIssues(issues: PageIssues, context: string) {
> 34 |   expect(issues.consoleErrors, `${context}: console errors`).toEqual([]);
     |                                                              ^ Error: /terms: console errors
  35 |   expect(issues.failedRequests, `${context}: failed requests`).toEqual([]);
  36 | }
  37 | 
  38 | export function testEmail(tag = '') {
  39 |   return `e2e_pw_${Date.now()}${tag}@test.swypik.local`;
  40 | }
  41 | 
  42 | export const TEST_PASSWORD = 'E2ePw!Test12345';
  43 | 
  44 | /** Create a user via the auth API (fast path for phases that don't test the signup UI itself). */
  45 | export async function apiSignup(request: APIRequestContext, email: string, username?: string) {
  46 |   const res = await request.post(`${BASE}/api/auth`, {
  47 |     headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
  48 |     data: {
  49 |       action: 'signup_password',
  50 |       email,
  51 |       password: TEST_PASSWORD,
  52 |       username: username ?? `e2e_pw_${Date.now().toString(36)}`,
  53 |     },
  54 |   });
  55 |   return res;
  56 | }
  57 | 
  58 | export async function apiLogin(request: APIRequestContext, email: string, password = TEST_PASSWORD) {
  59 |   return request.post(`${BASE}/api/auth`, {
  60 |     headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
  61 |     data: { action: 'login_password', email, password },
  62 |   });
  63 | }
  64 | 
  65 | /** UI login through /auth/login form. */
  66 | export async function uiLogin(page: Page, email: string, password = TEST_PASSWORD) {
  67 |   await page.goto('/auth/login');
  68 |   await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  69 |   await page.locator('input[type="password"]').first().fill(password);
  70 |   await page.locator('button[type="submit"]').first().click();
  71 |   await page.waitForURL((u) => !/\/auth\/login/.test(u.toString()), { timeout: 15_000 });
  72 | }
  73 | 
  74 | /** Login and transfer session cookies from API context into browser context. */
  75 | export async function loginViaApi(page: Page, email: string, password = TEST_PASSWORD) {
  76 |   const res = await apiLogin(page.request, email, password);
  77 |   expect(res.ok(), `api login for ${email}: ${res.status()}`).toBeTruthy();
  78 | }
  79 | 
```