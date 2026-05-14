import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termeni si conditii — Swypik",
  description: "Termenii si conditiile de utilizare a platformei Swypik.",
};

export default function TermsPage() {
  return (
    <>
      <h1>Termeni si conditii</h1>
      <p><strong>Ultima actualizare:</strong> 14 mai 2026</p>

      <h2>1. Despre Swypik</h2>
      <p>
        Swypik (in continuare &quot;Platforma&quot;, &quot;noi&quot;) este o platforma de social video commerce
        operata de Swypik SRL, persoana juridica romana. Platforma permite descoperirea de produse
        prin clipuri video scurte, urmarirea de creatori si efectuarea de cumparaturi.
      </p>
      <p>
        Prin accesarea sau utilizarea platformei accepti acesti Termeni. Daca nu esti de acord,
        te rugam sa nu utilizezi serviciul.
      </p>

      <h2>2. Eligibilitate</h2>
      <p>
        Trebuie sa ai cel putin <strong>16 ani</strong> pentru a folosi Swypik. Pentru a accesa
        continutul marcat ca fiind pentru adulti trebuie sa ai 18 ani si sa confirmi varsta in profil.
      </p>

      <h2>3. Cont si securitate</h2>
      <ul>
        <li>Esti responsabil pentru pastrarea confidentialitatii sesiunii tale.</li>
        <li>Trebuie sa folosesti date reale la inregistrare.</li>
        <li>Putem suspenda un cont care incalca acesti termeni sau legislatia in vigoare.</li>
      </ul>

      <h2>4. Continut utilizator</h2>
      <p>
        Continutul (video, imagini, comentarii, recenzii) pe care il publici ramane proprietatea ta,
        dar ne acorzi o licenta neexclusiva, gratuita si revocabila pentru a-l afisa pe platforma.
      </p>
      <p>Este interzis sa publici continut care:</p>
      <ul>
        <li>incalca legea romana sau a UE</li>
        <li>contine arme, droguri, continut ilegal</li>
        <li>incalca drepturi de autor sau marca</li>
        <li>promoveaza ura, violenta sau discriminare</li>
        <li>contine continut sexual fara consimtamantul subiectului</li>
      </ul>

      <h2>5. Cumparaturi si plati</h2>
      <p>
        Platile sunt procesate prin <strong>Stripe</strong>. Swypik nu stocheaza date de card.
        Preturile includ TVA cand este aplicabil. Politica de retur urmeaza dispozitiile
        OUG 34/2014 — ai 14 zile pentru a returna un produs.
      </p>

      <h2>6. Creatori si comisioane</h2>
      <p>
        Creatorii aprobati castiga comision pe vanzarile generate prin video-urile lor.
        Detaliile (procent, plata) se comunica in dashboard-ul de creator.
      </p>

      <h2>7. Limitarea raspunderii</h2>
      <p>
        Serviciul este oferit &quot;ca atare&quot;. Nu garantam ca platforma va fi neintrerupta sau
        fara erori. Nu suntem raspunzatori pentru daune indirecte rezultate din utilizare.
      </p>

      <h2>8. Modificari</h2>
      <p>
        Putem actualiza acesti termeni. Schimbarile semnificative se comunica prin email sau notificare
        in aplicatie cu cel putin 30 de zile inainte.
      </p>

      <h2>9. Legislatie aplicabila</h2>
      <p>
        Acesti termeni sunt guvernati de legea romana. Litigiile se solutioneaza prin instantele
        competente din Bucuresti.
      </p>

      <h2>10. Contact</h2>
      <p>Email: <a href="mailto:contact@swypik.com">contact@swypik.com</a></p>
    </>
  );
}
