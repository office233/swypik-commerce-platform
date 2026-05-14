import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politica de confidentialitate — Swypik",
  description: "Cum colectam, folosim si protejam datele tale conform GDPR.",
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Politica de confidentialitate</h1>
      <p><strong>Ultima actualizare:</strong> 14 mai 2026</p>

      <p>
        Aceasta politica explica cum Swypik SRL (&quot;noi&quot;, operator de date) colecteaza,
        foloseste si protejeaza datele tale personale conform Regulamentului (UE) 2016/679 (GDPR)
        si legii 190/2018.
      </p>

      <h2>1. Ce date colectam</h2>
      <ul>
        <li><strong>Date de cont:</strong> email, nume afisat, username, data nasterii</li>
        <li><strong>Date de utilizare:</strong> video-uri vizionate, produse vazute/cumparate,
          like-uri, comentarii, evenimente de feed (anonimizate dupa 90 zile)</li>
        <li><strong>Date de comanda:</strong> adresa de livrare, istoric comenzi</li>
        <li><strong>Date tehnice:</strong> IP, user agent, cookies de sesiune</li>
        <li><strong>Date de plata:</strong> procesate exclusiv de Stripe; noi nu stocam carduri</li>
      </ul>

      <h2>2. Baza legala</h2>
      <ul>
        <li><strong>Executarea contractului</strong> (art. 6.1.b GDPR) — pentru a procesa comenzi</li>
        <li><strong>Consimtamantul tau</strong> (art. 6.1.a) — pentru cookies non-esentiale, marketing</li>
        <li><strong>Interes legitim</strong> (art. 6.1.f) — securitate, prevenire frauda, analytics agregata</li>
        <li><strong>Obligatie legala</strong> (art. 6.1.c) — facturare, raportare fiscala</li>
      </ul>

      <h2>3. Cum folosim datele</h2>
      <ul>
        <li>Procesare comenzi si livrare</li>
        <li>Recomandari personalizate de produse (feed ranking)</li>
        <li>Comunicari tranzactionale (confirmari comanda, status)</li>
        <li>Moderare continut si prevenire abuz (inclusiv clasificator AI)</li>
        <li>Imbunatatire produs (agregate, fara identificare)</li>
      </ul>

      <h2>4. Cui transmitem datele</h2>
      <p>Date pot fi transferate catre urmatorii procesatori, in baza unor contracte conforme GDPR:</p>
      <ul>
        <li><strong>Stripe</strong> (procesare plati, sediul: Irlanda/USA, Standard Contractual Clauses)</li>
        <li><strong>Cloudflare R2</strong> (stocare video/imagini, EU region)</li>
        <li><strong>Hetzner</strong> (gazduire VPS, Germania)</li>
        <li><strong>GitHub Models</strong> (moderare AI, doar text de comentariu/descriere — niciodata date personale)</li>
        <li>Autoritati publice cand legea o cere</li>
      </ul>
      <p>Nu vindem date catre terti pentru marketing.</p>

      <h2>5. Drepturile tale (GDPR)</h2>
      <ul>
        <li>Acces — sa primesti o copie a datelor tale</li>
        <li>Rectificare — sa corectezi date inexacte</li>
        <li>Stergere (&quot;dreptul de a fi uitat&quot;) — cu exceptia obligatiilor legale de retentie</li>
        <li>Restrictionarea prelucrarii</li>
        <li>Portabilitate (export date in format JSON)</li>
        <li>Opozitie la prelucrare bazata pe interes legitim</li>
        <li>Retragerea consimtamantului oricand</li>
        <li>Plangere la <strong>ANSPDCP</strong> (<a href="https://www.dataprotection.ro">dataprotection.ro</a>)</li>
      </ul>
      <p>Exercita-ti drepturile la <a href="mailto:privacy@swypik.com">privacy@swypik.com</a>.
        Raspundem in 30 de zile.</p>

      <h2>6. Retentie</h2>
      <ul>
        <li>Date de cont: pe durata contului + 30 zile dupa stergere</li>
        <li>Date de comanda: 10 ani (obligatie fiscala romana)</li>
        <li>Evenimente de feed: 90 zile in forma raw, apoi agregate anonime</li>
        <li>Logs de securitate: 6 luni</li>
      </ul>

      <h2>7. Cookies</h2>
      <p>Vezi <a href="/legal/cookies">politica de cookies</a> pentru detalii.</p>

      <h2>8. Securitate</h2>
      <p>
        Folosim HTTPS pe tot site-ul, hash SHA-256 pentru token-uri de sesiune, secrete in
        environment variabile, redactare automata a campurilor sensibile in log-uri.
      </p>

      <h2>9. Transferuri internationale</h2>
      <p>
        Date pot fi procesate in afara SEE (ex: Stripe USA, GitHub Models USA) doar in baza
        Standard Contractual Clauses sau decizii de adecvare ale Comisiei Europene.
      </p>

      <h2>10. Minori</h2>
      <p>
        Nu acceptam utilizatori sub 16 ani. Continutul pentru adulti necesita confirmare 18+
        in profil.
      </p>

      <h2>11. Contact DPO</h2>
      <p>
        Operator: Swypik SRL<br />
        Email confidentialitate: <a href="mailto:privacy@swypik.com">privacy@swypik.com</a>
      </p>
    </>
  );
}
