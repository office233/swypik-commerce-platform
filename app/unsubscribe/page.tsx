import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Dezabonare — Swypik",
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const t = await getTranslations("unsubscribe");
  const { email } = await searchParams;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ffffff",
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: "480px",
          width: "100%",
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          boxShadow:
            "0 4px 6px -1px rgba(0,0,0,0.07), 0 10px 24px -4px rgba(0,0,0,0.1)",
          padding: "48px 36px",
          textAlign: "center",
        }}
      >
        {/* Logo */}
        <p
          style={{
            fontSize: "28px",
            fontWeight: 800,
            letterSpacing: "-0.5px",
            color: "#111111",
            margin: "0 0 32px 0",
          }}
        >
          Swypik
        </p>

        {/* Success icon */}
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            backgroundColor: "#f0fdf4",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px auto",
            fontSize: "28px",
          }}
        >
          ✓
        </div>

        {/* Main message */}
        <h1
          style={{
            fontSize: "20px",
            fontWeight: 600,
            color: "#111827",
            margin: "0 0 12px 0",
            lineHeight: 1.4,
          }}
        >

          {t("teaiDezabonatCuSucces")}
        </h1>

        {/* Email confirmation */}
        {email && (
          <p
            style={{
              fontSize: "15px",
              color: "#6b7280",
              margin: "0 0 20px 0",
              lineHeight: 1.6,
            }}
          >
            Emailul{" "}
            <strong style={{ color: "#374151" }}>{email}</strong>  {t("aFostEliminatDin")}
          </p>
        )}

        {/* Reassurance */}
        <p
          style={{
            fontSize: "14px",
            color: "#9ca3af",
            margin: "0 0 32px 0",
            lineHeight: 1.6,
          }}
        >

          {t("dacaAiAjunsAici")}{" "}
          <Link
            href="/"
            style={{
              color: "#6366f1",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            swypik.com
          </Link>
          .
        </p>

        {/* CTA button */}
        <Link
          href="/"
          style={{
            display: "inline-block",
            backgroundColor: "#111827",
            color: "#ffffff",
            fontSize: "15px",
            fontWeight: 600,
            padding: "12px 28px",
            borderRadius: "10px",
            textDecoration: "none",
            transition: "background-color 0.2s",
          }}
        >

          {t("mergiLaMagazin")}
        </Link>
      </div>
    </div>
  );
}
