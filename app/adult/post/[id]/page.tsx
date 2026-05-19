/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Post — Swypik After Dark" };

interface PostDetail {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  previewUrl: string | null;
  premiumUrl: string | null;
  priceMinor: number;
  currency: string;
  requiresSubscription: boolean;
  unlocked: boolean;
  isOwner: boolean;
}

async function fetchPost(id: string): Promise<{ post?: PostDetail; status: number }> {
  const h = await headers();
  const cookie = h.get("cookie") || "";
  const host = h.get("host") || "18.swypik.com";
  const proto = h.get("x-forwarded-proto") || "https";
  const r = await fetch(`${proto}://${host}/api/adult/posts/${encodeURIComponent(id)}`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!r.ok) return { status: r.status };
  return { post: await r.json(), status: r.status };
}

export default async function AdultPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { post, status } = await fetchPost(id);

  if (!post) {
    if (status === 401 || status === 403) {
      return (
        <section style={card}>
          <h1 style={h1}>Verification required</h1>
          <Link href="/adult/verify" style={btn}>Verify your age</Link>
        </section>
      );
    }
    return (
      <section style={card}>
        <h1 style={h1}>Not found</h1>
        <Link href="/adult/feed" style={inline}>Back to feed</Link>
      </section>
    );
  }

  return (
    <article style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header>
        <h1 style={h1}>{post.title}</h1>
        <p style={{ color: "#a1a1aa" }}>{post.kind}</p>
      </header>

      {post.unlocked ? (
        post.premiumUrl ? (
          <MediaPlayer url={post.premiumUrl} kind={post.kind} />
        ) : (
          <p style={muted}>Media not available.</p>
        )
      ) : (
        <div style={{ ...card, textAlign: "center" }}>
          {post.previewUrl && (
            <div style={{
              aspectRatio: "16/9",
              background: `#000 center/cover url("${post.previewUrl}")`,
              filter: "blur(22px) brightness(0.75)",
              borderRadius: 12, marginBottom: 16,
            }} />
          )}
          <p style={{ color: "#ededed", fontSize: 18, marginBottom: 12 }}>
            {post.requiresSubscription
              ? "Subscribe to this creator to unlock."
              : `Unlock for ${(post.priceMinor / 100).toFixed(2)} ${post.currency}`}
          </p>
          <p style={muted}>Payments coming soon — adapter pending.</p>
        </div>
      )}

      {post.description && (
        <section style={card}>
          <h2 style={{ fontSize: 18, color: "#ededed", margin: "0 0 8px" }}>About</h2>
          <p style={{ color: "#d4d4d8", whiteSpace: "pre-wrap" }}>{post.description}</p>
        </section>
      )}

      <p style={muted}>
        <Link href="/adult/feed" style={inline}>← Back to feed</Link>
      </p>
    </article>
  );
}

function MediaPlayer({ url, kind }: { url: string; kind: string }) {
  const isVideo = kind === "video" || kind === "live" || /\.(mp4|webm|mov)(\?|$)/i.test(url);
  if (isVideo) {
    return <video src={url} controls playsInline style={{ width: "100%", borderRadius: 12, background: "#000" }} />;
  }
  // Photo set / image
  return <img src={url} alt="" style={{ width: "100%", borderRadius: 12 }} />;
}

const card: React.CSSProperties = { background: "#111114", border: "1px solid #1f1f23", borderRadius: 14, padding: 24 };
const h1: React.CSSProperties = { fontSize: 28, margin: 0, color: "#ededed" };
const muted: React.CSSProperties = { color: "#a1a1aa" };
const inline: React.CSSProperties = { color: "#fda4af", textDecoration: "underline" };
const btn: React.CSSProperties = {
  display: "inline-block", background: "#f43f5e", color: "#fff",
  padding: "10px 20px", borderRadius: 999, textDecoration: "none", fontWeight: 600, marginTop: 12,
};
