/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import { cookies } from "next/headers";
import { getAuthUser } from "@/lib/auth/getAuthUser";
import { adultQuery } from "@/lib/adult/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creator dashboard — Swypik After Dark" };

interface KycRow {
  status: string;
  provider: string;
  rejection_reason: string | null;
  address_country: string;
  created_at: string;
  reviewed_at: string | null;
}

async function getCreatorKyc(): Promise<KycRow | null> {
  const user = await getAuthUser();
  if (!user.userId) return null;
  const { rows } = await adultQuery<KycRow>(
    `SELECT status, provider, rejection_reason, address_country,
            created_at::text, reviewed_at::text
       FROM adult.creator_kyc WHERE user_id = $1`,
    [user.userId],
  );
  return rows[0] || null;
}

export default async function AdultCreatorPage() {
  await cookies(); // mark dynamic
  const user = await getAuthUser();
  const kyc = user.userId ? await getCreatorKyc() : null;

  if (!user.userId) {
    return (
      <section style={card}>
        <h1 style={h1}>Become a creator</h1>
        <p style={muted}>You need to sign in first.</p>
        <a href="/login?next=/adult/creator" style={btn}>Sign in</a>
      </section>
    );
  }

  if (!kyc) {
    return (
      <section style={card}>
        <h1 style={h1}>Become a Swypik After Dark creator</h1>
        <p style={muted}>
          To upload adult content you must verify your real identity and confirm
          you are 18+. We use Veriff to check a government ID and a selfie.
        </p>
        <ul style={list}>
          <li>Your legal name and date of birth are stored encrypted.</li>
          <li>You agree to our <Link href="/adult/terms" style={inline}>Terms</Link>, <Link href="/adult/2257-statement" style={inline}>§2257 statement</Link> and content rules.</li>
          <li>You take responsibility for obtaining 2257-compliant consent and ID for every performer in your content.</li>
        </ul>
        <Link href="/adult/creator/apply" style={btn}>Start application</Link>
      </section>
    );
  }

  const statusLabel: Record<string, string> = {
    pending: "Pending Veriff check",
    review: "Under manual review",
    approved: "Approved",
    rejected: "Rejected",
    revoked: "Revoked",
  };

  return (
    <section style={card}>
      <h1 style={h1}>Creator status</h1>
      <p style={{ color: "#ededed", fontSize: 18 }}>
        Status: <strong style={{ color: kyc.status === "approved" ? "#22c55e" : kyc.status === "rejected" ? "#ef4444" : "#fbbf24" }}>{statusLabel[kyc.status] ?? kyc.status}</strong>
      </p>
      {kyc.rejection_reason && (
        <p style={{ ...muted, color: "#fca5a5" }}>Reason: {kyc.rejection_reason}</p>
      )}
      <p style={muted}>Provider: {kyc.provider} · Country: {kyc.address_country}</p>
      <p style={muted}>Submitted: {new Date(kyc.created_at).toLocaleString()}</p>
      {kyc.reviewed_at && <p style={muted}>Decided: {new Date(kyc.reviewed_at).toLocaleString()}</p>}
      {kyc.status === "approved" && (
        <p style={{ marginTop: 16 }}>
          <Link href="/adult/creator/upload" style={btn}>Upload a post</Link>
        </p>
      )}
      {(kyc.status === "rejected" || kyc.status === "revoked") && (
        <p style={{ marginTop: 16 }}>
          <Link href="/adult/creator/apply" style={btn}>Re-apply</Link>
        </p>
      )}
    </section>
  );
}

const card: React.CSSProperties = { background: "#111114", border: "1px solid #1f1f23", borderRadius: 14, padding: 28 };
const h1: React.CSSProperties = { fontSize: 28, margin: "0 0 12px", color: "#ededed" };
const muted: React.CSSProperties = { color: "#a1a1aa", margin: "8px 0" };
const list: React.CSSProperties = { color: "#d4d4d8", lineHeight: 1.7, paddingLeft: 18 };
const inline: React.CSSProperties = { color: "#fda4af", textDecoration: "underline" };
const btn: React.CSSProperties = {
  display: "inline-block", background: "#f43f5e", color: "#fff",
  padding: "10px 20px", borderRadius: 999, textDecoration: "none", fontWeight: 600,
};
