import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politica de cookies — Swypik",
  description: "Cookies folosite de Swypik si cum le poti gestiona.",
};

export default function CookiesPage() {
  return (
    <>
      <h1>Politica de cookies</h1>
      <p><strong>Ultima actualizare:</strong> 14 mai 2026</p>

      <h2>Ce sunt cookies</h2>
      <p>
        Cookies sunt fisiere text mici plasate pe dispozitivul tau cand vizitezi un site. Le folosim
        pentru a face platforma sa functioneze si pentru a-ti imbunatati experienta.
      </p>

      <h2>Categorii de cookies folosite</h2>

      <h3>Esentiale (intotdeauna active)</h3>
      <ul>
        <li><code>swypik_session</code> — token de autentificare (durata: sesiune sau pana la logout)</li>
        <li><code>seller_session</code> — token vanzator (durata: 30 zile)</li>
        <li><code>anon_session</code> — sesiune anonima pentru recomandari (durata: 1 an)</li>
        <li><code>theme</code> — preferinta dark/light (durata: 1 an)</li>
        <li><code>cookie_consent</code> — preferintele tale despre cookies (durata: 1 an)</li>
      </ul>
      <p>Fara aceste cookies platforma nu functioneaza (login, plata, cos).</p>

      <h3>Functionale (optionale)</h3>
      <ul>
        <li>Setari de afisare (locale, preferinte feed)</li>
      </ul>

      <h3>Analitice (optionale)</h3>
      <ul>
        <li>Agregate anonime de utilizare pentru a imbunatati produsul (event-uri de feed, durata vizionare)</li>
      </ul>

      <h2>Cookies terta-parte</h2>
      <ul>
        <li><strong>Stripe</strong> — pentru procesarea platilor la checkout</li>
      </ul>

      <h2>Cum le gestionezi</h2>
      <p>
        Cand intri prima data pe Swypik vei vedea un banner unde poti accepta sau refuza cookies non-esentiale.
        Iti poti schimba decizia oricand prin stergerea cookie-ului <code>cookie_consent</code> din browser.
      </p>
      <p>Poti dezactiva cookies si din setarile browser-ului tau:</p>
      <ul>
        <li>Chrome: Setari → Confidentialitate → Cookies</li>
        <li>Firefox: Setari → Confidentialitate &amp; Securitate</li>
        <li>Safari: Preferinte → Confidentialitate</li>
      </ul>
      <p>Atentie: dezactivarea cookies esentiale va impiedica login-ul si efectuarea de comenzi.</p>

      <h2>Contact</h2>
      <p>Intrebari: <a href="mailto:privacy@swypik.com">privacy@swypik.com</a></p>
    </>
  );
}
