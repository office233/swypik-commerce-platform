/**
 * Admin Applications — creator applications queue
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { dbQuery } from "@/lib/db";
import { requireAdminSession } from "@/lib/security/admin-auth";
import ApplicationActions from "./ApplicationActions";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Trimisă",
  in_review: "În analiză",
  approved: "Aprobată",
  rejected: "Respinsă",
  withdrawn: "Retrasă",
};

type Row = {
  id: string;
  user_id: string;
  status: string;
  requested_handle: string;
  category: string | null;
  website_url: string | null;
  social_links: Record<string, string> | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  user_role: string;
};

function fmtDate(d: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "-";
  }
}

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
    const t = await getTranslations("adminApplications");
  await requireAdminSession();
  const sp = await searchParams;
  const status = ["submitted", "in_review", "approved", "rejected", "withdrawn", "all"].includes(sp.status || "")
    ? sp.status!
    : "submitted";

  let rows: Row[] = [];
  let loadError: string | null = null;

  try {
    const params: any[] = [];
    let whereSql = "";
    if (status !== "all") {
      params.push(status);
      whereSql = `WHERE ca.status = $1`;
    }
    const res = await dbQuery(
      `
      SELECT ca.id, ca.user_id, ca.status, ca.requested_handle, ca.category,
             ca.website_url, ca.social_links, ca.review_note, ca.reviewed_at, ca.created_at,
             u.username, u.display_name, u.avatar_url, u.email, u.role AS user_role
      FROM creator_applications ca
      JOIN users u ON u.id = ca.user_id
      ${whereSql}
      ORDER BY ca.created_at DESC
      LIMIT 100
      `,
      params
    );
    rows = res.rows as Row[];
  } catch (e: any) {
    loadError = e?.message || "Eroare DB";
  }

  const tabs: Array<{ value: string; label: string }> = [
    { value: "submitted", label: "Trimise" },
    { value: "in_review", label: "În analiză" },
    { value: "approved", label: "Aprobate" },
    { value: "rejected", label: "Respinse" },
    { value: "all", label: "Toate" },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#0D0D0D]">{t("creatorTitle")}</h1>
        <p className="text-sm text-black/60 mt-1">{t("creatorSubtitle")}</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.value}
            href={`/admin/applications?status=${t.value}`}
            className={`inline-flex items-center rounded-md px-4 py-2.5 text-xs font-bold border min-h-[40px] ${
              status === t.value ? "bg-black text-white border-black" : "border-black/15 text-black/70"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{loadError}</div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/10 px-6 py-16 text-center text-black/50">
          Nicio aplicație găsită.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const social = r.social_links && typeof r.social_links === "object" ? r.social_links : {};
            const socialEntries = Object.entries(social).filter(([, v]) => typeof v === "string" && v);
            const isPending = r.status === "submitted" || r.status === "in_review";
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-black/10 p-4">
                <div className="flex items-start gap-4">
                  {r.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-black/10 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/u/${r.username}`} className="font-bold hover:underline">@{r.username}</Link>
                      {r.display_name && <span className="text-sm text-black/60">{r.display_name}</span>}
                      <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded ${
                        r.status === "approved" ? "bg-green-100 text-green-800"
                        : r.status === "rejected" ? "bg-red-100 text-red-800"
                        : r.status === "withdrawn" ? "bg-black/10 text-black/60"
                        : "bg-yellow-100 text-yellow-800"
                      }`}>{STATUS_LABELS[r.status] || r.status}</span>
                      {r.user_role === "creator" && (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-800">Deja creator</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-black/50">{r.email || "fără email"} · {fmtDate(r.created_at)}</div>

                    <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div>
                        <dt className="text-xs font-bold text-black/50 uppercase">Handle dorit</dt>
                        <dd>@{r.requested_handle}</dd>
                      </div>
                      {r.category && (
                        <div>
                          <dt className="text-xs font-bold text-black/50 uppercase">Categorie</dt>
                          <dd>{r.category}</dd>
                        </div>
                      )}
                      {r.website_url && (
                        <div className="md:col-span-2">
                          <dt className="text-xs font-bold text-black/50 uppercase">Website</dt>
                          <dd><a href={r.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">{r.website_url}</a></dd>
                        </div>
                      )}
                      {socialEntries.length > 0 && (
                        <div className="md:col-span-2">
                          <dt className="text-xs font-bold text-black/50 uppercase">Social</dt>
                          <dd className="flex flex-wrap gap-2 mt-1">
                            {socialEntries.map(([k, v]) => (
                              <a key={k} href={String(v)} target="_blank" rel="noopener noreferrer" className="text-xs bg-black/5 px-2 py-1 rounded hover:bg-black/10">
                                {k}
                              </a>
                            ))}
                          </dd>
                        </div>
                      )}
                      {r.review_note && (
                        <div className="md:col-span-2">
                          <dt className="text-xs font-bold text-black/50 uppercase">{t("reviewNote")}</dt>
                          <dd className="text-black/70">{r.review_note}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                </div>

                {isPending && (
                  <div className="mt-4 pt-4 border-t border-black/5">
                    <ApplicationActions applicationId={r.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
