/* eslint-disable react/no-unescaped-entities */
export const metadata = { title: "Access restricted — Swypik After Dark" };

export default function AdultBlockedPage() {
  return (
    <article style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 style={{ fontSize: 32, margin: 0, color: "#ededed" }}>Access restricted</h1>
      <p style={{ color: "#d4d4d8", margin: 0, lineHeight: 1.7 }}>
        Your access to Swypik After Dark is currently restricted. Reasons may include a failed
        age verification, a Terms violation, a contested chargeback, or a pending review.
      </p>
      <p style={{ color: "#d4d4d8", margin: 0 }}>
        If you believe this is in error, write to{" "}
        <a href="mailto:support@18.swypik.com" style={{ color: "#fda4af", textDecoration: "underline" }}>
          support@18.swypik.com
        </a>{" "}
        with your username (NOT your password). We respond within 5 business days.
      </p>
    </article>
  );
}
