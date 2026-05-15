"use client";

import { useState } from "react";
import { CheckCircle2, Play, XCircle } from "lucide-react";
import type { CronJob } from "./jobs";

interface LastRun {
  job_name: string;
  started_at: string;
  completed_at: string | null;
  status: string | null;
  duration_ms: number | null;
  error: string | null;
}

interface Props {
  job: CronJob;
  last: LastRun | null;
}

function fmtAgo(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "acum";
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  return Math.floor(h / 24) + "z";
}

export default function CronJobRow({ job, last }: Props) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  async function trigger() {
    setBusy(true);
    setToast(null);
    try {
      const res = await fetch("/api/admin/cron/" + job.name + "/trigger", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setToast({ type: "ok", msg: "Job pornit" });
      } else {
        setToast({ type: "err", msg: data.error || ("HTTP " + res.status) });
      }
    } catch (err) {
      setToast({ type: "err", msg: (err as Error).message });
    } finally {
      setBusy(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  return (
    <tr className="border-t border-[#0D0D0D]/5">
      <td className="px-4 py-3">
        <div className="font-bold text-[#0D0D0D]">{job.name}</div>
        <div className="text-xs text-[#0D0D0D]/60 mt-0.5">{job.description}</div>
        <code className="text-[10px] text-[#0D0D0D]/40">{job.endpoint}</code>
      </td>
      <td className="px-4 py-3 text-xs text-[#0D0D0D]/70">{job.schedule}</td>
      <td className="px-4 py-3 text-xs text-[#0D0D0D]/70">
        {last ? (
          <>
            {fmtAgo(last.started_at)} în urmă
            {last.duration_ms != null && (
              <span className="text-[#0D0D0D]/40"> · {last.duration_ms}ms</span>
            )}
          </>
        ) : (
          <span className="text-[#0D0D0D]/40">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {last?.status === "success" && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> success
          </span>
        )}
        {last?.status === "failed" && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700" title={last.error || ""}>
            <XCircle className="w-3.5 h-3.5" /> failed
          </span>
        )}
        {last?.status === "running" && (
          <span className="text-xs font-bold text-amber-700">running…</span>
        )}
        {!last && <span className="text-xs text-[#0D0D0D]/40">necunoscut</span>}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={trigger}
          disabled={busy}
          className={"inline-flex items-center gap-1 text-xs font-bold bg-[#0D0D0D] text-white px-3 py-1.5 rounded-md disabled:opacity-50"}
        >
          <Play className="w-3.5 h-3.5" />
          {busy ? "Pornesc…" : "Run acum"}
        </button>
        {toast && (
          <div className={"text-[10px] mt-1 " + (toast.type === "ok" ? "text-emerald-700" : "text-red-700")}>
            {toast.msg}
          </div>
        )}
      </td>
    </tr>
  );
}
