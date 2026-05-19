/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import { getAdultAccess } from "@/lib/adult/gate";
import { adultQuery } from "@/lib/adult/db";
import { signAdultGet } from "@/lib/adult/storageSign";

export const dynamic = "force-dynamic";
export const metadata = { title: "Feed — Swypik After Dark" };

interface Row {
  id: string;
  creator_user_id: string;
  kind: string;
  title: string;
  preview_media_key: string | null;
  price_minor: number;
  currency: string;
  requires_subscription: boolean;
  published_at: string;
}

export default async function AdultFeedPage() {
  const access = await getAdultAccess();
  if (!access.ok) {
    return (
      <section style={card}>
        <h1 style={h1}>Verify to continue</h1>
        <p style={muted}>You need to verify your age to browse the feed.</p>
        <Link href={access.reason === "unauthenticated" ? "/login?next=/adult/feed" : "/adult/verify"} style={btn}>
          {access.reason === "unauthenticated" ? "Sign in" : "Verify"}
        </Link>
      </section>
    );
  }

  const { rows } = await adultQuery<Row>(
    `SELECT id::text, creator_user_id::text, kind, title, preview_media_key,
            price_minor, currency, requires_subscription, published_at::text
       FROM adult.posts
      WHERE status = 'active' AND published_at IS NOT NULL
      ORDER BY published_at DESC
      LIMIT 24`,
  );

  const items = await Promise.all(rows.map(async r => {
    let previewUrl: string | null = null;
    if (r.preview_media_key) {
      try { previewUrl = await signAdultGet(r.preview_media_key, 900); } catch {}
    }
    return { ...r, previewUrl };
  }));

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <h1 style={h1}>Feed</h1>
        <p style={muted}>Newest first. {items.length === 0 ? "Nothing here yet." : `${items.length} posts.`}</p>
      </header>
      <div style={grid}>
        {items.map(p => (
          <Link key={p.id} href={`/adult/post/${p.id}`} style={tile}>
            <div style={thumb(p.previewUrl)} />
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              <strong style={{ color: "#ededed", fontSize: 14 }}>{p.title}</strong>
              <span style={{ color: "#a1a1aa", fontSize: 12 }}>
                {p.requires_subscription ? "Subscribers" : p.price_minor > 0 ? `${(p.price_minor / 100).toFixed(2)} ${p.currency}` : "Free"} · {p.kind}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

const card: React.CSSProperties = { background: "#111114", border: "1px solid #1f1f23", borderRadius: 14, padding: 28 };
const h1: React.CSSProperties = { fontSize: 28, margin: "0 0 12px", color: "#ededed" };
const muted: React.CSSProperties = { color: "#a1a1aa" };
const btn: React.CSSProperties = {
  display: "inline-block", background: "#f43f5e", color: "#fff",
  padding: "10px 20px", borderRadius: 999, textDecoration: "none", fontWeight: 600, marginTop: 12,
};
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 };
const tile: React.CSSProperties = {
  background: "#111114", border: "1px solid #1f1f23", borderRadius: 12, overflow: "hidden",
  textDecoration: "none", display: "block",
};
const thumb = (url: string | null): React.CSSProperties => ({
  aspectRatio: "4/5", background: url ? `#000 center/cover url("${url}")` : "linear-gradient(135deg,#27272a,#1f1f23)",
  filter: url ? "blur(18px) brightness(0.85)" : undefined,
});
