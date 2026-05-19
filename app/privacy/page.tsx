import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politica de confidențialitate — Swypik",
  description:
    "Politica de confidențialitate Swypik — ce date colectăm, cum le folosim, partajare cu terți, drepturi GDPR și contact DPO.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-[#0D0D0D]">
      <div className="mx-auto max-w-2xl px-5 py-10 md:px-6 md:py-16 leading-relaxed">
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          📄 Acest document este o versiune provizorie. Versiunea finală va fi
          revizuită juridic înainte de lansare.
        </div>

        <h1 className="mb-2 text-3xl font-black tracking-tight md:text-4xl">
          Politica de confidențialitate
        </h1>
        <p className="mb-10 text-sm text-[#6E6E80]">
          Ultima actualizare: 15 mai 2026
        </p>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">1. Date colectate</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Swypik colectează și prelucrează următoarele categorii de date
            personale, în calitate de operator în sensul Regulamentului (UE)
            2016/679 (GDPR): (a) date de cont — nume, adresă de e-mail,
            număr de telefon (opțional), parolă (stocată ca hash), data
            nașterii pentru verificarea vârstei; (b) date de navigare —
            adresă IP (procesată într-o formă pseudonimizată), tip de
            dispozitiv, browser, pagini accesate, durata sesiunii,
            interacțiuni cu conținutul video și cu produsele; (c) istoric
            de achiziții — comenzi, produse vizualizate, articole adăugate
            în coș, adrese de livrare, preferințe; (d) conținut generat
            de utilizator — video-uri, comentarii, aprecieri, recenzii;
            (e) comunicări cu echipa de suport. Furnizarea unora dintre
            aceste date este necesară pentru funcționarea contului, iar
            altele sunt opționale.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">2. Cum folosim datele</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Datele colectate sunt prelucrate în următoarele scopuri și pe
            baza temeiurilor legale corespunzătoare: (a) autentificarea
            utilizatorilor și gestionarea sesiunilor — necesar pentru
            executarea contractului; (b) personalizarea feedului video și a
            recomandărilor de produse, pe baza interacțiunilor anterioare
            — interesul legitim al Swypik de a furniza o experiență
            relevantă, cu posibilitatea de opoziție; (c) procesarea
            plăților prin Stripe și transmiterea informațiilor minime
            necesare pentru autorizarea tranzacției — executare contract și
            obligație legală; (d) prevenirea fraudei și a abuzului — interes
            legitim; (e) comunicări tranzacționale (confirmări comenzi,
            notificări de livrare) — executare contract; (f) marketing prin
            e-mail, doar pe baza consimțământului expres, cu opțiunea de
            dezabonare în orice moment.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">3. Cookie-uri și tracking</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Platforma utilizează cookie-uri tehnice esențiale pentru
            funcționarea sesiunii (autentificare, coș de cumpărături) și
            cookie-uri analitice pentru înțelegerea comportamentului
            agregat. Serverul de reverse-proxy (Caddy) înregistrează
            adresele IP în jurnalele de acces, pe perioada necesară pentru
            depanare și securitate. Evenimentele de interacțiune cu feedul
            video sunt asociate unui identificator derivat din adresa IP
            printr-o funcție hash cu sare („IP-salted feed events”), astfel
            încât IP-ul brut nu este stocat alături de evenimentele
            comportamentale. Puteți gestiona preferințele privind
            cookie-urile din setările browserului, însă dezactivarea
            cookie-urilor esențiale poate afecta funcționarea platformei.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">4. Partajare cu terți</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Datele dumneavoastră pot fi transmise următoarelor categorii
            de persoane împuternicite, exclusiv în scopurile descrise:
            (a) Stripe Payments Europe Ltd., pentru procesarea plăților —
            sunt transmise informațiile minime necesare autorizării
            tranzacției; (b) Cloudflare, Inc., pentru servicii de CDN,
            protecție DDoS și stocarea fișierelor media în Cloudflare R2;
            (c) furnizori de e-mail tranzacțional pentru livrarea
            notificărilor; (d) furnizori parteneri de fulfillment și
            dropshipping internațional — doar atunci când produsul comandat
            este onorat printr-un astfel de canal, fiind transmise adresa
            de livrare și detaliile minime ale comenzii. Nu vindem și nu închiriem
            date personale către terți pentru scopuri de marketing
            independent. Transferurile în afara Spațiului Economic European
            sunt protejate prin clauze contractuale standard.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">
            5. Drepturile utilizatorului
          </h2>
          <p className="text-[15px] text-[#3C3C43]">
            În conformitate cu GDPR, beneficiați de următoarele drepturi:
            (a) dreptul de acces la datele personale prelucrate; (b)
            dreptul de rectificare a datelor inexacte; (c) dreptul la
            ștergerea datelor („dreptul de a fi uitat”), în limitele
            prevăzute de lege; (d) dreptul la restricționarea prelucrării;
            (e) dreptul la portabilitatea datelor, într-un format
            structurat, utilizat în mod curent și care poate fi citit
            automat; (f) dreptul de opoziție la prelucrare, în special
            pentru prelucrările bazate pe interesul legitim sau pe
            marketing direct; (g) dreptul de a nu face obiectul unei
            decizii bazate exclusiv pe prelucrarea automată. Pentru
            exercitarea oricăruia dintre aceste drepturi, ne puteți
            contacta la adresa privacy@swypik.com. Aveți, de asemenea,
            dreptul de a depune o plângere la ANSPDCP (www.dataprotection.ro).
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">6. Retenția datelor</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Datele personale sunt păstrate doar pentru perioada necesară
            atingerii scopurilor pentru care au fost colectate, conform
            următoarelor termene orientative: datele de cont — pe durata
            existenței contului plus 3 ani de la închidere, pentru
            soluționarea unor eventuale litigii; datele tranzacționale și
            facturile — 10 ani, conform legislației fiscale române; datele
            de navigare și jurnalele tehnice — maximum 12 luni; conținutul
            generat de utilizator (video-uri, comentarii) — până la
            ștergerea de către utilizator sau închiderea contului. La
            expirarea acestor termene, datele sunt șterse în siguranță
            sau anonimizate ireversibil pentru scopuri statistice agregate.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">7. Securitate</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Swypik aplică măsuri tehnice și organizatorice adecvate pentru
            protejarea datelor împotriva accesului neautorizat, pierderii,
            modificării sau divulgării. Acestea includ, fără a se limita
            la: transmiterea criptată a datelor prin HTTPS/TLS, stocarea
            parolelor sub formă de hash criptografic cu sare, segregarea
            mediilor de producție și de dezvoltare, jurnalizarea
            auditabilă a operațiunilor sensibile, controlul accesului la
            baza de date pe bază de roluri, copii de siguranță periodice
            și monitorizarea continuă a infrastructurii. Cu toate acestea,
            nicio metodă de transmitere sau stocare nu este complet
            sigură, iar utilizatorii sunt încurajați să folosească parole
            puternice și să își protejeze credențialele de acces.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">8. Contact DPO</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Pentru orice solicitare legată de prelucrarea datelor
            personale, exercitarea drepturilor GDPR sau sesizarea unor
            potențiale incidente de securitate, vă rugăm să contactați
            Responsabilul cu protecția datelor (DPO) la adresa{" "}
            <a
              className="font-semibold text-[#10A37F] underline"
              href="mailto:privacy@swypik.com"
            >
              privacy@swypik.com
            </a>
            . Vom răspunde solicitărilor în termen de maximum 30 de zile
            calendaristice de la primire, conform GDPR.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">
            9. Modificări la această politică
          </h2>
          <p className="text-[15px] text-[#3C3C43]">
            Swypik își rezervă dreptul de a actualiza periodic prezenta
            Politică de confidențialitate pentru a reflecta modificări
            legislative, tehnologice sau ale practicilor noastre de
            prelucrare. Orice modificare semnificativă va fi anunțată în
            mod vizibil pe platformă sau prin e-mail, înainte de intrarea
            în vigoare. Versiunea actualizată va include data ultimei
            modificări, iar continuarea utilizării platformei după această
            dată constituie acceptarea noilor termeni. Vă recomandăm să
            revedeți periodic această pagină pentru a fi la curent cu
            modul în care vă protejăm datele.
          </p>
        </section>
      </div>
    </main>
  );
}
