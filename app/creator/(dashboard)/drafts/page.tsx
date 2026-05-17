import { redirect } from "next/navigation";
import Link from "next/link";
import { dbQuery } from "@/lib/db";
import { getCreatorUserId } from "@/lib/creator/session";
import { Pencil, Trash2, Clock, X } from "lucide-react";
import DraftActions from "./DraftActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schițe & Programate | Swypik Creators" };

type Tab = "drafts" | "scheduled";

export default async function DraftsPage(
  { searchParams }: { searchParams: Promise<{ tab?: string }> },
) {
  const creatorId = await getCreatorUserId();
  if (!creatorId) redirect("/auth?next=/creator/drafts");

  const sp = await searchParams;
  const tab: Tab = sp.tab === "scheduled" ? "scheduled" : "drafts";

  const drafts =
    tab === "drafts"
      ? (
          await dbQuery<{
            id: string;
            title: string | null;
            description: string | null;
            thumbnail_url: string | null;
            updated_at: string;
          }>(
            `SELECT id, title, description, thumbnail_url, updated_at
               FROM videos
              WHERE creator_id = $1 AND is_draft = true AND status <> 'deleted'
              ORDER BY updated_at DESC
              LIMIT 100`,
            [creatorId],
          )
        ).rows
      : [];

  const scheduled =
    tab === "scheduled"
      ? (
          await dbQuery<{
            id: string;
            title: string | null;
            thumbnail_url: string | null;
            scheduled_publish_at: string;
          }>(
            `SELECT id, title, thumbnail_url, scheduled_publish_at
               FROM videos
              WHERE creator_id = $1
                AND scheduled_publish_at IS NOT NULL
                AND scheduled_publish_at > now()
                AND status <> 'deleted'
              ORDER BY scheduled_publish_at ASC
              LIMIT 100`,
            [creatorId],
          )
        ).rows
      : [];

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-black text-[#0D0D0D] mb-6">Schițe & Programate</h1>

      <div className="flex gap-2 mb-6 border-b border-[#E5E5E5]">
        <Link
          href="/creator/drafts?tab=drafts"
          className={`px-4 py-3 text-sm font-bold border-b-2 transition ${
            tab === "drafts" ? "border-[#7C3AED] text-[#7C3AED]" : "border-transparent text-[#6E6E80] hover:text-[#0D0D0D]"
          }`}
        >
          Schițe ({tab === "drafts" ? drafts.length : "·"})
        </Link>
        <Link
          href="/creator/drafts?tab=scheduled"
          className={`px-4 py-3 text-sm font-bold border-b-2 transition ${
            tab === "scheduled" ? "border-[#7C3AED] text-[#7C3AED]" : "border-transparent text-[#6E6E80] hover:text-[#0D0D0D]"
          }`}
        >
          Programate ({tab === "scheduled" ? scheduled.length : "·"})
        </Link>
      </div>

      {tab === "drafts" ? (
        drafts.length === 0 ? (
          <EmptyState
            title="Nicio schiță încă"
            hint="Salvează un clip ca schiță din ecranul de upload pentru a-l finaliza mai târziu."
          />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="bg-white border border-[#E5E5E5] rounded-2xl overflow-hidden flex flex-col"
              >
                <div className="aspect-[9/16] bg-[#F4F4F5] relative">
                  {d.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#A1A1AA] text-xs">
                      Fără preview
                    </div>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col">
                  <p className="text-sm font-bold text-[#0D0D0D] line-clamp-2 mb-1">
                    {d.title || "Fără titlu"}
                  </p>
                  <p className="text-[11px] text-[#6E6E80] mb-3">
                    Ultima editare: {new Date(d.updated_at).toLocaleDateString("ro-RO")}
                  </p>
                  <div className="mt-auto flex gap-2">
                    <Link
                      href={`/upload?draft=${d.id}`}
                      className="flex-1 h-9 rounded-lg bg-[#7C3AED] text-white text-xs font-bold flex items-center justify-center gap-1 hover:bg-[#6D28D9]"
                    >
                      <Pencil size={12} /> Editează
                    </Link>
                    <DraftActions
                      videoId={d.id}
                      action="publish-now"
                      label="Publică"
                      icon="send"
                      confirm="Publici acest draft acum?"
                    />
                    <DraftActions
                      videoId={d.id}
                      action="delete"
                      label="Șterge"
                      icon="trash"
                      confirm="Ștergi această schiță?"
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : scheduled.length === 0 ? (
        <EmptyState
          title="Nimic programat"
          hint="Folosește butonul Programează din ecranul de detalii ca să planifici un clip."
        />
      ) : (
        <ul className="space-y-3">
          {scheduled.map((s) => (
            <li
              key={s.id}
              className="bg-white border border-[#E5E5E5] rounded-2xl p-4 flex items-center gap-4"
            >
              <div className="w-16 aspect-[9/16] bg-[#F4F4F5] rounded-lg overflow-hidden flex-shrink-0">
                {s.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#0D0D0D] truncate">{s.title || "Fără titlu"}</p>
                <p className="text-xs text-[#6E6E80] flex items-center gap-1.5 mt-1">
                  <Clock size={12} />
                  <Countdown target={s.scheduled_publish_at} />
                </p>
              </div>
              <DraftActions
                videoId={s.id}
                action="cancel-schedule"
                label="Anulează"
                icon="x"
                confirm="Anulezi programarea? Clipul rămâne ca schiță."
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="text-center py-16 px-6 bg-white border border-dashed border-[#E5E5E5] rounded-2xl">
      <p className="text-base font-bold text-[#0D0D0D] mb-2">{title}</p>
      <p className="text-sm text-[#6E6E80] max-w-sm mx-auto">{hint}</p>
      <Link
        href="/upload"
        className="inline-flex mt-4 h-10 px-5 rounded-xl bg-[#7C3AED] text-white text-sm font-bold items-center"
      >
        Încarcă clip nou
      </Link>
    </div>
  );
}

function Countdown({ target }: { target: string }) {
  const t = new Date(target).getTime();
  const now = Date.now();
  const diff = Math.max(0, t - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const fmt = new Date(target).toLocaleString("ro-RO");
  return (
    <span>
      Se publică în <strong>{h}h {m}m</strong> · {fmt}
    </span>
  );
}
