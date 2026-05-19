/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import { getAdultAccess } from "@/lib/adult/gate";

export const dynamic = "force-dynamic";

export default async function AdultLandingPage() {
  const access = await getAdultAccess();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: 0, color: "#f43f5e" }}>
          After Dark
        </h1>
        <p style={{ fontSize: 18, color: "#d4d4d8", margin: 0, maxWidth: 640 }}>
          A separate, adults-only side of Swypik for verified creators and verified fans.
          18+ only. Everything is moderated. Every performer signs a consent release.
        </p>
      </section>

      {access.ok ? (
        <VerifiedHero />
      ) : access.reason === "unauthenticated" ? (
        <UnauthenticatedHero />
      ) : access.reason === "blocked" ? (
        <BlockedHero />
      ) : (
        <NeedsVerificationHero />
      )}

      <section style={cardStyle}>
        <h2 style={h2Style}>Ground rules</h2>
        <ul style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7, color: "#d4d4d8" }}>
          <li>18+ only. We use third-party identity verification — never self-declaration.</li>
          <li>Every recognisable performer has a signed release on file. Subjects can revoke at any time.</li>
          <li>Zero tolerance for content involving minors, non-consensual material, or trafficking.</li>
          <li>Payments via CCBill. Payouts via Paxum / SEPA / wire. Never Stripe.</li>
          <li>Reports are reviewed within 24 hours; suspected illegal content within 1 hour.</li>
        </ul>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Legal</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Link href="/adult/terms" style={pillLink}>Terms of Service</Link>
          <Link href="/adult/privacy" style={pillLink}>Privacy Policy</Link>
          <Link href="/adult/2257-statement" style={pillLink}>18 U.S.C. §2257 Statement</Link>
          <Link href="/adult/dmca" style={pillLink}>DMCA / Takedown</Link>
          <Link href="/adult/wellness" style={pillLink}>Wellness resources</Link>
        </div>
      </section>
    </div>
  );
}

function VerifiedHero() {
  return (
    <section style={{ ...cardStyle, borderColor: "#10b981" }}>
      <p style={{ margin: 0, color: "#86efac", fontWeight: 600 }}>You are age-verified.</p>
      <p style={{ margin: "6px 0 16px", color: "#d4d4d8" }}>
        The feed and creator tools are open to you.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/adult/feed" style={primaryBtn}>Open the feed</Link>
        <Link href="/adult/creator/onboarding" style={secondaryBtn}>Become a creator</Link>
      </div>
    </section>
  );
}

function UnauthenticatedHero() {
  return (
    <section style={cardStyle}>
      <p style={{ margin: 0, color: "#fde68a", fontWeight: 600 }}>You are not signed in.</p>
      <p style={{ margin: "6px 0 16px", color: "#d4d4d8" }}>
        Sign in with your Swypik account on the main site, then return here. Your account is
        the same — the surfaces are separate.
      </p>
      <a href="https://swypik.com/account?next=/settings" style={primaryBtn}>Sign in on swypik.com</a>
    </section>
  );
}

function BlockedHero() {
  return (
    <section style={{ ...cardStyle, borderColor: "#ef4444" }}>
      <p style={{ margin: 0, color: "#fca5a5", fontWeight: 600 }}>Access is currently restricted.</p>
      <p style={{ margin: "6px 0 0", color: "#d4d4d8" }}>
        If you believe this is in error, contact{" "}
        <a href="mailto:support@18.swypik.com" style={{ color: "#fda4af" }}>support@18.swypik.com</a>.
      </p>
    </section>
  );
}

function NeedsVerificationHero() {
  return (
    <section style={cardStyle}>
      <p style={{ margin: 0, color: "#fde68a", fontWeight: 600 }}>You need to verify your age.</p>
      <p style={{ margin: "6px 0 16px", color: "#d4d4d8" }}>
        We use Veriff to confirm you are 18 or older. The check takes about a minute and your ID
        document is processed by Veriff, not stored by us.
      </p>
      <Link href="/adult/verify" style={primaryBtn}>Verify my age</Link>
    </section>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#111114",
  border: "1px solid #1f1f23",
  borderRadius: 14,
  padding: 24,
};
const h2Style: React.CSSProperties = { fontSize: 20, fontWeight: 700, margin: "0 0 12px", color: "#ededed" };
const primaryBtn: React.CSSProperties = {
  background: "#f43f5e", color: "#fff", padding: "10px 18px", borderRadius: 999,
  textDecoration: "none", fontWeight: 600, fontSize: 14,
};
const secondaryBtn: React.CSSProperties = {
  background: "transparent", color: "#ededed", border: "1px solid #3f3f46",
  padding: "10px 18px", borderRadius: 999, textDecoration: "none", fontWeight: 600, fontSize: 14,
};
const pillLink: React.CSSProperties = {
  background: "#18181b", color: "#d4d4d8", padding: "8px 14px", borderRadius: 999,
  textDecoration: "none", fontSize: 13, border: "1px solid #27272a",
};
