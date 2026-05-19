/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import VerifyStartButton from "@/components/adult/VerifyStartButton";

export const metadata = { title: "Verify your age — Swypik After Dark" };

export default function AdultVerifyPage() {
  return (
    <article style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header>
        <h1 style={{ fontSize: 32, margin: 0, color: "#ededed" }}>Verify your age</h1>
        <p style={{ color: "#a1a1aa", margin: "8px 0 0" }}>One-time check, takes about a minute.</p>
      </header>

      <section style={cardStyle}>
        <h2 style={h2Style}>How it works</h2>
        <ol style={{ paddingLeft: 18, lineHeight: 1.7, color: "#d4d4d8" }}>
          <li>You&apos;ll be redirected to <strong>Veriff</strong> (our identity verification provider).</li>
          <li>Veriff asks for a government-issued ID and a quick selfie video.</li>
          <li>Veriff confirms you are 18+ and returns a decision in a few seconds.</li>
          <li>Your ID document is stored by Veriff; we only receive the pass/fail result.</li>
        </ol>
        <p style={{ color: "#a1a1aa", fontSize: 13 }}>
          Verification is valid for 5 years. You can ask us to delete the result at any time;
          see the <Link href="/adult/privacy" style={inline}>Privacy Policy</Link>.
        </p>
      </section>

      <section style={cardStyle}>
        <VerifyStartButton />
        <p style={{ color: "#a1a1aa", fontSize: 13, margin: "12px 0 0" }}>
          When the Veriff integration is enabled in production you will be redirected to their
          hosted verification flow. After approval, return to <Link href="/adult" style={inline}>/adult</Link>.
        </p>
      </section>
    </article>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#111114", border: "1px solid #1f1f23", borderRadius: 14, padding: 24,
};
const h2Style: React.CSSProperties = { fontSize: 20, margin: "0 0 12px", color: "#ededed" };
const inline: React.CSSProperties = { color: "#fda4af", textDecoration: "underline" };
