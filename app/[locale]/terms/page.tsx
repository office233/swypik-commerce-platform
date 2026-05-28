import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termeni și condiții — Swypik",
  description:
    "Termenii și condițiile de utilizare ai platformei Swypik — drepturi, obligații, achiziții, returnări și legea aplicabilă.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white text-[#0D0D0D]">
      <div className="mx-auto max-w-2xl px-5 py-10 md:px-6 md:py-16 leading-relaxed">
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          📄 Acest document este o versiune provizorie. Versiunea finală va fi
          revizuită juridic înainte de lansare.
        </div>

        <h1 className="mb-2 text-3xl font-black tracking-tight md:text-4xl">
          Termeni și condiții
        </h1>
        <p className="mb-10 text-sm text-[#6E6E80]">
          Ultima actualizare: 15 mai 2026
        </p>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">1. Acceptarea termenilor</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Prin accesarea sau utilizarea platformei Swypik („Platforma”,
            „Serviciul”), confirmați că ați citit, ați înțeles și acceptați să
            respectați acești Termeni și condiții, precum și Politica de
            confidențialitate disponibilă pe site. Acești termeni constituie un
            acord legal între dumneavoastră („Utilizatorul”) și operatorul
            platformei. Dacă nu sunteți de acord cu oricare dintre prevederile
            de mai jos, vă rugăm să nu utilizați platforma. Continuarea
            utilizării după publicarea unor modificări implică acceptarea
            acelor modificări. Pentru utilizatorii sub 18 ani, accesul la
            anumite secțiuni poate fi restricționat sau condiționat de acordul
            părinților sau al reprezentanților legali. Swypik își rezervă
            dreptul de a refuza accesul sau de a suspenda conturile care
            încalcă acești termeni, fără preaviz, în cazurile prevăzute de
            lege sau de prezentul document.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">2. Utilizarea platformei</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Platforma este destinată descoperirii și achiziționării de produse
            prin intermediul conținutului video creat de utilizatori și de
            vânzători. Utilizatorul se obligă să folosească Serviciul exclusiv
            în scopuri legale, conforme cu acești termeni și cu legislația
            aplicabilă în România și Uniunea Europeană. Sunt interzise:
            utilizarea abuzivă a infrastructurii (scraping automatizat masiv,
            atacuri DDoS, exploatarea vulnerabilităților), încercarea de a
            ocoli mecanismele de securitate, încărcarea de software malițios,
            uzurparea identității altor persoane sau brandurilor, și orice
            activitate frauduloasă legată de plăți. Vânzătorii și creatorii
            sunt responsabili pentru conformitatea produselor și a conținutului
            cu legislația comercială, fiscală și de protecție a consumatorului
            aplicabilă în România.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">3. Conturile utilizatorilor</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Pentru a accesa anumite funcționalități, este necesară crearea
            unui cont. Utilizatorul este responsabil pentru menținerea
            confidențialității credențialelor de autentificare (parolă, OTP,
            sesiuni) și pentru toate activitățile desfășurate prin contul
            propriu. Vă obligați să furnizați informații exacte, complete și
            actualizate la momentul înregistrării și pe parcursul utilizării.
            Un singur cont este permis per persoană fizică, cu excepția
            cazurilor în care același utilizator deține și un cont de vânzător
            sau de creator. Swypik poate suspenda sau închide conturile care
            încalcă acești termeni, prezintă activitate suspectă, sau rămân
            inactive o perioadă îndelungată. Utilizatorul poate solicita
            ștergerea contului în orice moment, conform Politicii de
            confidențialitate.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">
            4. Conținut generat de utilizatori
          </h2>
          <p className="text-[15px] text-[#3C3C43]">
            Utilizatorii (creatori, vânzători, cumpărători) pot încărca
            conținut video, imagini, recenzii și comentarii. Prin încărcarea
            conținutului, acordați Swypik o licență non-exclusivă, mondială,
            transferabilă și fără redevențe de a stoca, reproduce, afișa,
            distribui și adapta acel conținut în scopul operării și
            promovării platformei. Garantați că dețineți toate drepturile
            necesare asupra conținutului încărcat și că acesta nu încalcă
            drepturi de autor, drepturi de imagine sau alte drepturi ale
            terților. Este interzis conținutul ilegal, defăimător, obscen,
            care promovează violența, discriminarea, exploatarea minorilor,
            sau care induce în eroare cumpărătorii. Swypik își rezervă
            dreptul de a modera, retrage sau șterge orice conținut care
            încalcă acești termeni, fără preaviz.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">5. Achiziții și plăți</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Plățile pe Swypik sunt procesate prin Stripe, conform termenilor
            și politicilor proprii ai Stripe. Prețurile afișate includ TVA,
            dacă este aplicabil, iar costurile de livrare sunt prezentate
            separat înainte de finalizarea comenzii. În conformitate cu OUG
            34/2014 privind drepturile consumatorilor (transpunerea
            Directivei 2011/83/UE), aveți dreptul de a returna produsele
            achiziționate la distanță în termen de 14 zile de la primire,
            fără a fi nevoie să justificați decizia, cu excepțiile prevăzute
            de lege (produse personalizate, sigilate din motive de igienă
            etc.). Rambursarea se efectuează în maximum 14 zile de la
            primirea produsului returnat. Detaliile complete privind
            returnarea, anularea comenzilor și garanțiile sunt disponibile
            în secțiunea „Politica de retur” a platformei.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">6. Drepturi de autor</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Swypik respectă drepturile de proprietate intelectuală și
            răspunde notificărilor de încălcare în conformitate cu legislația
            aplicabilă, inclusiv Directiva (UE) 2019/790 privind drepturile
            de autor pe piața unică digitală. Dacă considerați că un material
            disponibil pe platformă încalcă drepturile dumneavoastră de
            autor, ne puteți transmite o notificare scrisă la adresa
            legal@swypik.com, care să conțină: (a) identificarea operei
            protejate; (b) localizarea exactă a materialului pretins
            ilicit; (c) datele dumneavoastră de contact; (d) o declarație pe
            propria răspundere că informațiile sunt corecte și că sunteți
            titularul drepturilor sau reprezentantul autorizat. Vom analiza
            notificarea și putem retrage conținutul incriminat. Repetarea
            încălcărilor poate atrage suspendarea contului responsabil.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">7. Limitarea răspunderii</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Swypik furnizează platforma „așa cum este” și „așa cum este
            disponibilă”, fără garanții exprese sau implicite privind
            disponibilitatea neîntreruptă, absența erorilor sau adecvarea
            pentru un scop particular. În limita maximă permisă de lege,
            Swypik nu răspunde pentru daune indirecte, incidentale, speciale
            sau de consecință (inclusiv pierderea de profit, date sau
            oportunități comerciale) rezultate din utilizarea sau
            imposibilitatea de utilizare a platformei. Pentru produsele
            comercializate de vânzători terți, răspunderea principală
            revine vânzătorului, conform legislației privind comerțul
            electronic și protecția consumatorului. Aceste limitări nu se
            aplică în cazurile de dol, culpă gravă sau în alte situații în
            care legea nu permite limitarea răspunderii.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">8. Legea aplicabilă</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Acești Termeni și condiții sunt guvernați de legea română.
            Orice litigiu care decurge din sau în legătură cu utilizarea
            platformei va fi soluționat amiabil, iar în caz contrar va fi
            de competența instanțelor judecătorești competente de pe
            teritoriul României. Consumatorii pot apela și la platforma
            europeană de soluționare online a litigiilor (ODR), disponibilă
            la adresa https://ec.europa.eu/consumers/odr, sau la Autoritatea
            Națională pentru Protecția Consumatorilor (ANPC). Dacă vreuna
            dintre prevederile acestor termeni este declarată nulă sau
            inaplicabilă, restul prevederilor rămân pe deplin valabile și
            produc efecte juridice între părți.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-xl font-bold">9. Contact</h2>
          <p className="text-[15px] text-[#3C3C43]">
            Pentru orice întrebări, sesizări sau solicitări legate de
            acești Termeni și condiții, ne puteți contacta la adresa de
            e-mail{" "}
            <a
              className="font-semibold text-[#10A37F] underline"
              href="mailto:legal@swypik.com"
            >
              legal@swypik.com
            </a>
            . Vă vom răspunde în termen de maximum 30 de zile lucrătoare
            de la primirea solicitării.
          </p>
        </section>
      </div>
    </main>
  );
}
