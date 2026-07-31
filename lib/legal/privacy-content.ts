/**
 * Conținutul politicii de confidențialitate — sursă unică de adevăr.
 *
 * IMPORTANT: reflectă ce colectează EFECTIV platforma (verificat în cod și DB).
 * La orice funcționalitate nouă care prelucrează date personale, actualizează
 * și acest fișier — altfel politica devine falsă, ceea ce e o încălcare GDPR
 * în sine (principiul transparenței, art. 5(1)(a)).
 *
 * Ultima verificare față de cod: 31 iulie 2026.
 */

export const PRIVACY_LAST_UPDATED = "31 iulie 2026";

export type PrivacySection = {
    id: string;
    title: string;
    /** Paragrafe de text. */
    body?: string[];
    /** Tabel opțional: [antet, ...rânduri]. */
    table?: { headers: string[]; rows: string[][] };
    /** Listă cu buline. */
    bullets?: string[];
};

export const PRIVACY_SECTIONS: PrivacySection[] = [
    {
        id: "operator",
        title: "1. Cine suntem",
        body: [
            "Swypik este operat de Swypik Technology, societate înregistrată în România. Suntem „operator de date” în sensul Regulamentului (UE) 2016/679 (GDPR) pentru datele descrise mai jos.",
            "Pentru orice întrebare privind datele tale personale, scrie-ne la privacy@swypik.com. Îți răspundem în cel mult 30 de zile.",
        ],
    },
    {
        id: "date",
        title: "2. Ce date colectăm și de ce",
        body: [
            "Colectăm doar datele necesare pentru funcționarea serviciului. Mai jos, exact ce se strânge, pentru ce și pe ce temei legal:",
        ],
        table: {
            headers: ["Date", "Scop", "Temei legal"],
            rows: [
                ["Email, nume, telefon", "cont, comunicări despre comenzi", "executarea contractului"],
                ["Parolă (hash)", "autentificare securizată", "executarea contractului"],
                ["Adresă de livrare", "livrarea comenzilor", "executarea contractului"],
                ["Adresă IP, user-agent", "securitate, prevenirea fraudei", "interes legitim"],
                ["Locație GPS (curieri/șoferi)", "atribuirea și urmărirea curselor", "executarea contractului"],
                ["Istoric comenzi și plăți", "facturare, suport, garanții", "obligație legală"],
                ["CNP (gazde, persoane fizice)", "raportare fiscală ANAF (DAC7)", "obligație legală"],
                ["CUI/CIF (firme)", "facturare și raportare", "obligație legală"],
                ["Documente de verificare", "verificarea identității partenerilor", "obligație legală"],
                ["Comportament în aplicație", "recomandări, îmbunătățirea produsului", "consimțământ"],
            ],
        },
    },
    {
        id: "sensibile",
        title: "3. Date sensibile — cum le protejăm",
        body: [
            "Anumite date necesită protecție suplimentară, iar noi aplicăm măsuri tehnice specifice:",
        ],
        bullets: [
            "CNP-ul gazdelor este criptat AES-256-GCM în baza de date. Nu este stocat niciodată în clar, nu apare public și, în panoul de administrare, se afișează doar mascat (ex: 1••••••••7890). Îl decriptăm exclusiv pentru raportarea fiscală obligatorie sau la solicitarea autorităților.",
            "Parolele sunt stocate ca hash criptografic — nici noi nu le putem citi.",
            "Datele cardurilor bancare nu ajung niciodată pe serverele noastre: plățile sunt procesate de Stripe, furnizor certificat PCI-DSS.",
            "Adresa IP și user-agent-ul sunt anonimizate automat după 90 de zile.",
        ],
    },
    {
        id: "cookies",
        title: "4. Cookie-uri",
        body: [
            "Folosim cookie-uri strict necesare (autentificare, coș, securitate) fără de care platforma nu funcționează — acestea nu necesită acordul tău.",
            "Cookie-urile de analiză și marketing se activează doar dacă le accepți explicit în banner. Îți poți schimba opțiunea oricând din setările de confidențialitate, fără să pierzi accesul la serviciu.",
        ],
    },
    {
        id: "terti",
        title: "5. Cui transmitem datele",
        body: [
            "Nu vindem datele tale. Le transmitem doar cui este strict necesar pentru livrarea serviciului:",
        ],
        table: {
            headers: ["Destinatar", "Ce primește", "De ce"],
            rows: [
                ["Stripe", "date de plată, email", "procesarea plăților"],
                ["Vânzători / gazde / curieri", "nume, telefon, adresă", "livrarea comenzii sau a cazării"],
                ["Duffel", "nume pasager, dată naștere", "emiterea biletelor de avion"],
                ["Furnizor de email (Resend)", "email, conținutul notificării", "trimiterea confirmărilor"],
                ["ANAF", "date fiscale, venituri", "obligație legală (DAC7)"],
                ["Hetzner (Germania)", "găzduirea serverelor", "infrastructură"],
            ],
        },
    },
    {
        id: "transfer",
        title: "6. Unde sunt stocate datele",
        body: [
            "Serverele noastre sunt în Uniunea Europeană (Germania). Unii furnizori (ex. Stripe) pot procesa date în afara UE, dar doar pe baza clauzelor contractuale standard aprobate de Comisia Europeană sau a unei decizii de adecvare.",
        ],
    },
    {
        id: "retentie",
        title: "7. Cât timp păstrăm datele",
        table: {
            headers: ["Tip de date", "Perioadă"],
            rows: [
                ["Cont activ", "cât timp ai contul deschis"],
                ["După ștergerea contului", "30 de zile, apoi ștergere definitivă"],
                ["Facturi și documente fiscale", "10 ani (obligație legală)"],
                ["CNP și date de raportare DAC7", "conform termenului fiscal aplicabil"],
                ["Adresă IP, user-agent", "90 de zile, apoi anonimizare"],
                ["Sesiuni expirate", "30 de zile"],
            ],
        },
    },
    {
        id: "drepturi",
        title: "8. Drepturile tale",
        body: ["Conform GDPR, ai următoarele drepturi, pe care le poți exercita gratuit:"],
        bullets: [
            "Acces — să afli ce date avem despre tine și să primești o copie.",
            "Rectificare — să corectezi datele greșite (majoritatea direct din contul tău).",
            "Ștergere — să ceri eliminarea datelor, cu excepția celor pe care legea ne obligă să le păstrăm (ex. facturi).",
            "Restricționare — să ceri limitarea prelucrării cât timp verificăm o contestație.",
            "Portabilitate — să primești datele într-un format structurat, citibil automat.",
            "Opoziție — să te opui prelucrărilor bazate pe interes legitim.",
            "Retragerea consimțământului — oricând, pentru analiză și marketing.",
        ],
    },
    {
        id: "contact",
        title: "9. Contact și reclamații",
        body: [
            "Pentru exercitarea drepturilor sau orice nelămurire: privacy@swypik.com.",
            "Dacă nu ești mulțumit de răspunsul nostru, te poți adresa Autorității Naționale de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP), Bd. G-ral. Gheorghe Magheru 28-30, București, www.dataprotection.ro.",
        ],
    },
    {
        id: "minori",
        title: "10. Minori",
        body: [
            "Swypik nu se adresează persoanelor sub 16 ani. Pentru a deveni gazdă, vânzător, șofer sau curier trebuie să ai minimum 18 ani — verificăm acest lucru inclusiv prin CNP. Dacă aflăm că am colectat date de la un minor sub 16 ani fără acordul părintelui, le ștergem.",
        ],
    },
    {
        id: "modificari",
        title: "11. Modificări",
        body: [
            "Când modificăm această politică, actualizăm data de mai sus. Pentru schimbări importante, te anunțăm prin email sau printr-o notificare în aplicație, cu cel puțin 15 zile înainte de intrarea lor în vigoare.",
        ],
    },
];
