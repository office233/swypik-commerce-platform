/* eslint-disable react/no-unescaped-entities */
/**
 * Per-state health warning banner.
 *
 * Texas HB 1181 (effective 2023, upheld by SCOTUS 2025 in
 * Free Speech Coalition v. Paxton) requires adult sites to display
 * a state-mandated warning to users in Texas. Utah, Louisiana,
 * Virginia, Mississippi, Arkansas, Montana, North Carolina, and Florida
 * have similar (varying) statutes.
 *
 * We surface a compliant warning for all of these states. The TX text
 * is the closest to the statute; others get the same content for safety
 * pending a per-state copy review.
 *
 * This banner is rendered server-side from a Cloudflare-provided region
 * header, so it CANNOT be dismissed by the client (no JS toggle).
 */

import Link from "next/link";

const STATE_NAMES: Record<string, string> = {
  TX: "Texas",
  UT: "Utah",
  LA: "Louisiana",
  MS: "Mississippi",
  VA: "Virginia",
  AR: "Arkansas",
  MT: "Montana",
  NC: "North Carolina",
  FL: "Florida",
};

export function TexasHealthWarning({ regionCode }: { regionCode: string | null }) {
  const stateName = (regionCode && STATE_NAMES[regionCode]) || "your state";

  return (
    <aside
      role="region"
      aria-label={`Health warning for residents of ${stateName}`}
      style={{
        background: "#1c1006",
        borderBottom: "2px solid #d97706",
        color: "#fde68a",
        padding: "12px 20px",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <strong style={{ display: "block", marginBottom: 4, color: "#fbbf24" }}>
        Health & wellness notice — Residents of {stateName}
      </strong>
      <p style={{ margin: 0 }}>
        Pornography is potentially biologically addictive, is proven to harm human brain development,
        desensitizes brain reward circuits, increases conditioned responses, and weakens brain function.
        Exposure to this content is associated with low self-esteem and body image issues, eating disorders,
        impotency, anxiety, and depression. Pornography increases the demand for prostitution, child
        exploitation, and child pornography.
      </p>
      <p style={{ margin: "6px 0 0" }}>
        Confidential help: <a href="https://www.samhsa.gov/find-help/national-helpline" target="_blank" rel="noopener noreferrer" style={{ color: "#fde68a", textDecoration: "underline" }}>SAMHSA National Helpline 1-800-662-HELP (4357)</a>.
        See also our <Link href="/adult/wellness" style={{ color: "#fde68a", textDecoration: "underline" }}>wellness resources</Link>.
      </p>
    </aside>
  );
}
