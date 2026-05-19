/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";

export const metadata = { title: "Terms of Service — Swypik After Dark" };

export default function AdultTermsPage() {
  return (
    <article style={prose}>
      <h1>Terms of Service — Swypik After Dark</h1>
      <p><em>Last updated: 19 May 2026 · Operator: Therapium LTD (United Kingdom).</em></p>

      <p>
        These Terms govern your use of <strong>Swypik After Dark</strong> (the &ldquo;Service&rdquo;), the
        adults-only surface of Swypik operated by Therapium LTD. They are separate from the
        general Swypik Terms; by using the Service you agree to be bound by these Terms.
      </p>

      <h2>1. Eligibility</h2>
      <ul>
        <li>You must be at least 18 years old and the age of majority in your jurisdiction.</li>
        <li>You must complete identity and age verification through our verification provider.</li>
        <li>You must not be on any sanctions list maintained by the EU, UK, US (OFAC), or UN.</li>
      </ul>

      <h2>2. Content rules</h2>
      <p>The following content is strictly prohibited and will result in immediate removal,
        account termination, and where applicable a report to law enforcement:</p>
      <ul>
        <li>Any content involving, depicting, or sexualising minors (under 18).</li>
        <li>Non-consensual content, including hidden-camera, leaked, or &ldquo;revenge&rdquo; material.</li>
        <li>Bestiality, real violence, trafficking, or content that promotes them.</li>
        <li>Deepfake or AI-generated sexual content depicting a real person without that person&rsquo;s release.</li>
        <li>Content marketed as &ldquo;barely legal&rdquo;, &ldquo;school&rdquo;-themed sexual content, or any age-regression framing.</li>
      </ul>

      <h2>3. Creator obligations</h2>
      <ul>
        <li>Complete creator KYC (legal name, date of birth, government ID, address, tax reference).</li>
        <li>Maintain a signed release for every recognisable performer in every piece of content.</li>
        <li>Promptly remove content if a subject revokes consent.</li>
        <li>Comply with all applicable tax obligations in your jurisdiction.</li>
      </ul>

      <h2>4. Viewer obligations</h2>
      <ul>
        <li>Do not screen-record, redistribute, or scrape content.</li>
        <li>Do not contact creators outside the Service to circumvent paid features.</li>
        <li>Do not use the Service to harass, threaten, or solicit illegal activity.</li>
      </ul>

      <h2>5. Payments and refunds</h2>
      <p>
        Charges are processed by <strong>CCBill</strong> (or another approved adult-industry
        processor). Subscription charges renew automatically until cancelled.
        Pay-per-view and tip transactions are final and non-refundable except where required
        by law. Chargebacks may result in immediate suspension while we investigate.
      </p>

      <h2>6. Creator payouts</h2>
      <p>
        Creator earnings are held for fourteen (14) days before becoming available for payout.
        Payouts are made via Paxum, SEPA, wire transfer, or approved alternatives. Payout
        requests are subject to KYC verification and may be delayed for compliance review.
      </p>

      <h2>7. Reports and takedowns</h2>
      <p>
        Use the &ldquo;Report&rdquo; control on any content to flag a violation. Reports involving
        suspected minors, non-consensual content, or trafficking are triaged within one (1) hour
        and where required reported to the National Center for Missing &amp; Exploited Children
        (NCMEC) under 18 U.S.C. §2258A. Copyright takedown requests must follow the procedure
        on our <Link href="/adult/dmca">DMCA page</Link>.
      </p>

      <h2>8. Termination</h2>
      <p>
        We may suspend or terminate access at any time for cause, including failed age
        verification, content violations, or fraud. You may close your account at any time;
        certain records (transactions, consent releases, KYC) are retained for the period
        required by law (typically 7 years).
      </p>

      <h2>9. Liability</h2>
      <p>
        To the maximum extent permitted by law, the Service is provided &ldquo;as is&rdquo; without
        warranty. Therapium LTD&rsquo;s aggregate liability for any claim is limited to the
        amounts you paid in the twelve (12) months preceding the claim.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These Terms are governed by the laws of England and Wales. The courts of London,
        England have exclusive jurisdiction, except where mandatory consumer protection law
        in your country of residence provides otherwise.
      </p>

      <h2>11. Contact</h2>
      <p>
        Therapium LTD &mdash; United Kingdom &mdash; <a href="mailto:legal@18.swypik.com">legal@18.swypik.com</a>.
      </p>
    </article>
  );
}

const prose: React.CSSProperties = {
  color: "#d4d4d8", lineHeight: 1.7, fontSize: 15,
  maxWidth: 760,
};
