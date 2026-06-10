import { dbQuery } from "@/lib/db";
import { getTranslations } from "next-intl/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 300;

type Row = { id: number; type: string; name: string; score: string | null; metadata: unknown; detected_at: string };

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  hashtag: { label: "#tag", color: "#7C3AED" },
  audio: { label: "audio", color: "#FE2C55" },
  product: { label: "produs", color: "#10A37F" },
  topic: { label: "topic", color: "#F59E0B" },
};

export default async function TrendsPage() {
  const t = await getTranslations("trends");
  let rows: Row[] = [];
  try {
    const res = await dbQuery<Row>(
      `WITH latest_run AS (
         SELECT MAX(detected_at) AS ts FROM trending_now
       )
       SELECT t.id, t.type, t.name, t.score::text, t.metadata, t.detected_at::text
         FROM trending_now t, latest_run
        WHERE t.detected_at >= latest_run.ts - interval '1 hour'
        ORDER BY t.score DESC NULLS LAST
        LIMIT 10`,
    );
    rows = res.rows;
  } catch (e) {
    logger.warn({ err: e }, "[/trends] db err");
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24, minHeight: "100vh" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>🔥 Trends acum</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>{t("topulCurentHashtaguriSunete")}</p>

      {rows.length === 0 ? (
        <p style={{ color: "#999", textAlign: "center", padding: 40 }}>

          {t("niciunTrendDetectatInca")}
        </p>
      ) : (
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
          {rows.map((r, idx) => {
            const meta = TYPE_LABEL[r.type] || { label: r.type, color: "#666" };
            return (
              <li
                key={r.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: 14, borderRadius: 12, background: "#fafafa",
                  border: "1px solid #eee",
                }}
              >
                <span style={{ fontSize: 22, fontWeight: 800, color: "#999", minWidth: 32 }}>{idx + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>scor: {Number(r.score || 0).toFixed(2)}</div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "4px 10px",
                  borderRadius: 999, color: "#fff", background: meta.color, textTransform: "uppercase",
                }}>{meta.label}</span>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
