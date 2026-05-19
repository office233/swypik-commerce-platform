/* eslint-disable react/no-unescaped-entities */
export const metadata = { title: "Privacy Policy — Swypik After Dark" };

export default function AdultPrivacyPage() {
  return (
    <article style={prose}>
      <h1>Privacy Policy — Swypik After Dark</h1>
      <p><em>Last updated: 19 May 2026 · Controller: Therapium LTD (United Kingdom).</em></p>

      <h2>1. Who we are</h2>
      <p>
        Therapium LTD operates Swypik After Dark (&ldquo;the Service&rdquo;). This policy applies
        only to the Service; the general Swypik website has its own policy.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li><strong>Account data:</strong> the Swypik user id linked to your account, email, username.</li>
        <li><strong>Age verification result:</strong> pass/fail and verification id from Veriff.
          Your ID document is processed and stored by Veriff under their own policy
          (<a href="https://www.veriff.com/privacy-notice" target="_blank" rel="noopener noreferrer">veriff.com/privacy-notice</a>);
          we do not receive or store the document image.</li>
        <li><strong>Creator KYC:</strong> legal name, date of birth, government ID reference, address, tax id.</li>
        <li><strong>Consent releases:</strong> signed PDF (stored in a private, access-controlled bucket) and SHA-256 hash.</li>
        <li><strong>Transactions:</strong> amount, currency, processor reference, IP at purchase, country/region (from Cloudflare headers).</li>
        <li><strong>Technical:</strong> IP address, user agent, request times, Cloudflare ray id, audit log entries.</li>
      </ul>

      <h2>3. Why we process it (lawful bases under GDPR)</h2>
      <ul>
        <li><strong>Legal obligation:</strong> age verification, §2257 records, anti-fraud, anti-CSAM (18 U.S.C. §2258A), tax records.</li>
        <li><strong>Contract:</strong> account, subscriptions, payouts.</li>
        <li><strong>Legitimate interest:</strong> moderation, abuse prevention, security logging, audit trail.</li>
      </ul>

      <h2>4. Who sees it</h2>
      <ul>
        <li><strong>Processors:</strong> Veriff (age/identity), CCBill (charging), Paxum / SEPA banks (payouts), Cloudflare (network), Hetzner (hosting), Sightengine (AI moderation).</li>
        <li><strong>Authorities:</strong> when required by court order or where mandatory reporting applies (e.g. NCMEC for suspected CSAM).</li>
        <li>We do <strong>not</strong> sell personal data and we do not run cross-site advertising trackers on this surface.</li>
      </ul>

      <h2>5. Retention</h2>
      <ul>
        <li>Age verification result: 5 years from the last positive check.</li>
        <li>Creator KYC: 7 years after account closure (tax / §2257).</li>
        <li>Consent releases: 7 years after revocation or content removal.</li>
        <li>Transactions: 10 years (tax / anti-money-laundering).</li>
        <li>Audit log: 7 years.</li>
        <li>Removed media: minimum 90 days when flagged for CSAM (evidence preservation).</li>
      </ul>

      <h2>6. Your rights</h2>
      <p>
        Under GDPR you may request access, correction, erasure (of data not under a retention
        obligation), portability, and restriction of processing. Email{" "}
        <a href="mailto:privacy@18.swypik.com">privacy@18.swypik.com</a>. You may complain to
        your local supervisory authority; the UK lead authority is the ICO (
        <a href="https://ico.org.uk/" target="_blank" rel="noopener noreferrer">ico.org.uk</a>).
      </p>

      <h2>7. International transfers</h2>
      <p>
        Data is processed in the EU and UK. Some processors (e.g. Cloudflare, CCBill) are
        US-based and may process data in the US under Standard Contractual Clauses or the
        UK/EU&ndash;US Data Privacy Framework.
      </p>

      <h2>8. Children</h2>
      <p>
        The Service is restricted to adults. We use a third-party age verification provider
        and do not knowingly process data of anyone under 18. If you believe a minor has
        accessed the Service, email <a href="mailto:abuse@18.swypik.com">abuse@18.swypik.com</a> immediately.
      </p>

      <h2>9. Cookies</h2>
      <p>
        We use a single first-party session cookie (<code>swypik_session</code>) for authentication and a
        Cloudflare cookie for security. No advertising cookies.
      </p>

      <h2>10. Contact</h2>
      <p>Therapium LTD &mdash; <a href="mailto:privacy@18.swypik.com">privacy@18.swypik.com</a>.</p>
    </article>
  );
}

const prose: React.CSSProperties = { color: "#d4d4d8", lineHeight: 1.7, fontSize: 15, maxWidth: 760 };
