/* eslint-disable react/no-unescaped-entities */
export const metadata = { title: "18 U.S.C. §2257 Statement — Swypik After Dark" };

export default function Adult2257Page() {
  const name = process.env.ADULT_CUSTODIAN_NAME || "Varga Abel Karoly";
  const entity = process.env.ADULT_CUSTODIAN_ENTITY || "Therapium LTD";
  const jurisdiction = process.env.ADULT_CUSTODIAN_JURISDICTION || "United Kingdom";
  const address = process.env.ADULT_CUSTODIAN_ADDRESS || "TBD — to be updated upon completion of business registration filing.";
  const companyNumber = process.env.ADULT_CUSTODIAN_COMPANY_NUMBER || "TBD";

  return (
    <article style={prose}>
      <h1>18 U.S.C. §2257 Statement — Record-Keeping Requirements Compliance</h1>
      <p><em>Last updated: 19 May 2026.</em></p>

      <p>
        In compliance with the federal labeling and record-keeping law of the United States,
        18 U.S.C. §2257 and §2257A, the following information is provided for any visually
        depicted sexually explicit content produced by or appearing on Swypik After Dark.
      </p>

      <h2>Producers</h2>
      <p>
        With respect to all visual depictions displayed on this website, whether of actual
        sexually explicit conduct or merely lascivious display of the genitals, or otherwise:
      </p>
      <ul>
        <li>All persons depicted were at least 18 years of age at the time of production.</li>
        <li>Records required pursuant to 18 U.S.C. §2257 and 28 C.F.R. §75 are kept by the Custodian of Records listed below.</li>
        <li>All content produced by third-party creators is subject to the same record-keeping requirement; creators are contractually required to maintain primary records and to deliver copies to the Custodian on demand.</li>
      </ul>

      <h2>Custodian of Records</h2>
      <address style={{ background: "#111114", border: "1px solid #1f1f23", padding: 16, borderRadius: 10, fontStyle: "normal" }}>
        <strong>{name}</strong><br />
        {entity}<br />
        {jurisdiction}<br />
        {address !== "TBD — to be updated upon completion of business registration filing." && <>{address}<br /></>}
        {address === "TBD — to be updated upon completion of business registration filing." && <><em>{address}</em><br /></>}
        Company number: {companyNumber}<br />
        Email: <a href="mailto:records@18.swypik.com">records@18.swypik.com</a>
      </address>

      <h2>Scope</h2>
      <p>
        This statement applies to all visually depicted sexually explicit content on
        18.swypik.com and any subdomains. Content licensed from third-party producers is
        accompanied by a similar statement maintained by the third-party producer; copies
        are available on written request.
      </p>

      <h2>Exclusions</h2>
      <p>
        This website does not host any content created prior to 1 May 2026. No content
        is hosted that was produced outside of the requirements of 18 U.S.C. §2257 or §2257A.
      </p>
    </article>
  );
}

const prose: React.CSSProperties = { color: "#d4d4d8", lineHeight: 1.7, fontSize: 15, maxWidth: 760 };
