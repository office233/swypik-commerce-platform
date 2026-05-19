/* eslint-disable react/no-unescaped-entities */
export const metadata = { title: "DMCA / Takedown Notice — Swypik After Dark" };

export default function AdultDmcaPage() {
  const agent = process.env.ADULT_DMCA_AGENT_EMAIL || "dmca@swypik.com";

  return (
    <article style={prose}>
      <h1>DMCA / Takedown Notice</h1>
      <p><em>Last updated: 19 May 2026.</em></p>

      <p>
        Therapium LTD complies with the Digital Millennium Copyright Act (17 U.S.C. §512) and
        with equivalent EU mechanisms under the Digital Services Act (Regulation (EU) 2022/2065).
        If you believe content on Swypik After Dark infringes a copyright you own or control,
        you may file a notice as described below.
      </p>

      <h2>How to file a notice</h2>
      <p>
        Send a written notice by email to{" "}
        <a href={`mailto:${agent}`}>{agent}</a> with the subject line
        <code> &ldquo;DMCA Takedown Notice&rdquo;</code>. Your notice MUST include:
      </p>
      <ol>
        <li>A physical or electronic signature of the owner or authorised agent.</li>
        <li>Identification of the copyrighted work claimed to have been infringed.</li>
        <li>
          Identification of the material that is claimed to be infringing, with sufficient
          detail (full URLs of every infringing item) for us to locate it.
        </li>
        <li>Your contact information: name, postal address, telephone, email.</li>
        <li>
          A statement that you have a good-faith belief that the use is not authorised by the
          copyright owner, its agent, or the law.
        </li>
        <li>
          A statement, under penalty of perjury, that the information in the notice is accurate
          and that you are the owner or authorised to act on the owner&rsquo;s behalf.
        </li>
      </ol>

      <h2>How we respond</h2>
      <ul>
        <li>We acknowledge receipt within 24 hours and remove or disable access to the material in question pending review.</li>
        <li>We notify the affected creator and allow them to file a counter-notice.</li>
        <li>If a valid counter-notice is filed, the material may be restored 10&ndash;14 business days later unless a court order is provided.</li>
      </ul>

      <h2>Misuse</h2>
      <p>
        Knowingly false notices may result in liability under 17 U.S.C. §512(f) and/or under
        EU/UK law. Repeat infringers will be terminated from the Service.
      </p>

      <h2>Non-copyright reports</h2>
      <p>
        For reports of suspected illegal content (minors, non-consensual, trafficking) use the
        in-product &ldquo;Report&rdquo; control or email{" "}
        <a href="mailto:abuse@18.swypik.com">abuse@18.swypik.com</a>. We prioritise these
        within one hour.
      </p>

      <h2>Designated Agent</h2>
      <address style={{ background: "#111114", border: "1px solid #1f1f23", padding: 16, borderRadius: 10, fontStyle: "normal" }}>
        <strong>DMCA Designated Agent — Therapium LTD</strong><br />
        Email: <a href={`mailto:${agent}`}>{agent}</a><br />
        United Kingdom
      </address>
    </article>
  );
}

const prose: React.CSSProperties = { color: "#d4d4d8", lineHeight: 1.7, fontSize: 15, maxWidth: 760 };
