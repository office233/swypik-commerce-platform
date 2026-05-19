/* eslint-disable react/no-unescaped-entities */
import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { adultQuery } from "@/lib/adult/db";

export const dynamic = "force-dynamic";

interface ReportRow {
  id: string;
  reporter_user_id: string | null;
  reporter_email: string | null;
  target_type: string;
  target_id: string;
  category: string;
  description: string;
  status: string;
  priority: number;
  created_at: string;
}

export default async function AdminReportsPage() {
  if (!(await hasAdminSession())) {
    redirect("/admin/login?redirect=/adult/admin/reports");
  }

  const { rows } = await adultQuery<ReportRow>(
    `SELECT id::text, reporter_user_id::text, reporter_email,
            target_type, target_id::text, category, description,
            status, priority, created_at
       FROM adult.reports
      WHERE status IN ('open','investigating')
      ORDER BY priority ASC, created_at DESC
      LIMIT 200`,
  );

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
        Adult Reports — Triage Queue
      </h1>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>
        {rows.length} open / investigating report{rows.length === 1 ? "" : "s"}.
        Critical categories (minor, csam, non_consensual, revenge) are pinned to priority 1.
      </p>

      {rows.length === 0 ? (
        <p style={{ color: "#888" }}>No open reports. Nice.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #444", textAlign: "left" }}>
              <th style={{ padding: "0.5rem" }}>Prio</th>
              <th style={{ padding: "0.5rem" }}>Category</th>
              <th style={{ padding: "0.5rem" }}>Target</th>
              <th style={{ padding: "0.5rem" }}>Description</th>
              <th style={{ padding: "0.5rem" }}>Reporter</th>
              <th style={{ padding: "0.5rem" }}>Created</th>
              <th style={{ padding: "0.5rem" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #333" }}>
                <td style={{ padding: "0.5rem", fontWeight: r.priority === 1 ? "bold" : "normal", color: r.priority === 1 ? "#e53935" : "inherit" }}>
                  P{r.priority}
                </td>
                <td style={{ padding: "0.5rem" }}>{r.category}</td>
                <td style={{ padding: "0.5rem", fontFamily: "monospace", fontSize: "0.8rem" }}>
                  {r.target_type}/{r.target_id.slice(0, 8)}…
                </td>
                <td style={{ padding: "0.5rem", maxWidth: 350, whiteSpace: "pre-wrap" }}>
                  {r.description.slice(0, 200)}{r.description.length > 200 ? "…" : ""}
                </td>
                <td style={{ padding: "0.5rem", fontSize: "0.8rem" }}>
                  {r.reporter_user_id ? r.reporter_user_id.slice(0, 8) + "…" : r.reporter_email || "anon"}
                </td>
                <td style={{ padding: "0.5rem", fontSize: "0.8rem" }}>
                  {new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ")}
                </td>
                <td style={{ padding: "0.5rem" }}>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: "2rem", color: "#888", fontSize: "0.85rem" }}>
        Takedown via: POST /api/adult/admin/posts/&lt;id&gt;/takedown with body
        <code>{` { reason: "dmca|policy|...", closeReports: true }`}</code>.
        For critical (minor/csam) escalations contact NCMEC immediately.
      </p>
    </main>
  );
}
