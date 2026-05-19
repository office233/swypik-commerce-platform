import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { currentGeo } from "@/lib/adult/geo";
import { TexasHealthWarning } from "@/components/adult/TexasHealthWarning";

export const metadata: Metadata = {
  title: "Swypik After Dark — 18+",
  description: "Adult content for verified users. 18+ only.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true, "max-snippet": -1, "max-image-preview": "none" },
  },
  other: {
    rating: "RTA-5042-1996-1400-1577-RTA",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  colorScheme: "dark",
};

export default async function AdultLayout({ children }: { children: React.ReactNode }) {
  const geo = await currentGeo();
  return (
    <div className="adult-shell" data-surface="adult" style={{
      minHeight: "100vh",
      background: "#0a0a0b",
      color: "#ededed",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    }}>
      {geo.requiresHealthWarning && <TexasHealthWarning regionCode={geo.regionCode} />}

      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        padding: "12px 20px",
        background: "rgba(10,10,11,0.92)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid #1f1f23",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Link href="/adult" style={{ color: "#f43f5e", fontWeight: 700, fontSize: 18, textDecoration: "none", letterSpacing: 0.5 }}>
          Swypik <span style={{ color: "#ededed" }}>After Dark</span>
        </Link>
        <nav style={{ display: "flex", gap: 16, fontSize: 14 }}>
          <Link href="/adult" style={navLink}>Feed</Link>
          <Link href="/adult/verify" style={navLink}>Verify</Link>
        </nav>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px 80px" }}>{children}</main>

      <footer style={{
        borderTop: "1px solid #1f1f23",
        padding: "24px 20px 48px",
        fontSize: 12, color: "#a1a1aa",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
          <Link href="/adult/terms" style={footerLink}>Terms</Link>
          <Link href="/adult/privacy" style={footerLink}>Privacy</Link>
          <Link href="/adult/2257-statement" style={footerLink}>18 U.S.C. §2257</Link>
          <Link href="/adult/dmca" style={footerLink}>DMCA</Link>
          <a href="https://www.rtalabel.org/" style={footerLink} rel="noopener noreferrer" target="_blank">RTA Label</a>
        </div>
        <p style={{ margin: 0 }}>
          Swypik After Dark is restricted to adults aged 18 or older. All performers are 18+ and have signed releases on file.
          Custodian of Records: Varga Abel Karoly / Therapium LTD (United Kingdom). See the §2257 statement for details.
        </p>
        <p style={{ margin: 0 }}>© {new Date().getFullYear()} Therapium LTD — All rights reserved.</p>
      </footer>
    </div>
  );
}

const navLink: React.CSSProperties = {
  color: "#ededed", textDecoration: "none", padding: "6px 10px", borderRadius: 6,
};
const footerLink: React.CSSProperties = {
  color: "#d4d4d8", textDecoration: "none",
};
