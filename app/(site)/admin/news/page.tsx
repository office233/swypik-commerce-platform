"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Newspaper, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { ADMIN_NEWS_STATUSES, type AdminNewsRow, type AdminNewsStatus } from "@/lib/news/admin-types";
import NewsAdminCard from "./_components/NewsAdminCard";

const REQUEST_OPTS: RequestInit = { credentials: "same-origin", headers: { "Content-Type": "application/json" } };

type Meta = { publishMode: "auto" | "review"; aiConfigured: boolean };

export default function AdminNewsPage() {
  const t = useTranslations("adminNews");
  const { toast } = useToast();
  const [status, setStatus] = useState<AdminNewsStatus>("draft");
  const [rows, setRows] = useState<AdminNewsRow[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [failed, setFailed] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setRows(null);
    fetch(`/api/admin/news?status=${status}`, REQUEST_OPTS)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        setRows(d.articles ?? []);
        setMeta({ publishMode: d.publishMode, aiConfigured: Boolean(d.aiConfigured) });
      })
      .catch(() => setFailed(true));
  }, [status]);
  useEffect(load, [load]);

  const runPipeline = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/cron/news-pipeline", { ...REQUEST_OPTS, method: "POST", body: "{}" });
      const d = await res.json().catch(() => ({}));
      toast(res.ok
        ? { title: t("runDone", { count: Number(d.ingested ?? 0) }), tone: "success" }
        : { title: t("runFailed", { error: String(d.error ?? res.status) }), tone: "danger" });
      load();
    } finally {
      setRunning(false);
    }
  };

  const changeStatus = async (id: string, next: AdminNewsStatus) => {
    const res = await fetch(`/api/admin/news/${id}`, { ...REQUEST_OPTS, method: "PATCH", body: JSON.stringify({ status: next }) });
    toast({ title: res.ok ? t("saved") : t("error"), tone: res.ok ? "success" : "danger" });
    if (res.ok) load();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-gutter py-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex min-w-0 flex-1 items-center gap-2 text-xl font-bold text-fg"><Newspaper className="h-5 w-5" aria-hidden /> {t("title")}</h1>
        <Button variant="secondary" loading={running} onClick={runPipeline}><RefreshCw className="h-4 w-4" aria-hidden /> {t("runNow")}</Button>
      </div>
      {meta && (
        <p className={meta.aiConfigured ? "rounded-card bg-info-soft p-3 text-sm text-info" : "rounded-card bg-warning-soft p-3 text-sm text-warning"}>
          {meta.aiConfigured ? t(meta.publishMode === "review" ? "modeReview" : "modeAuto") : t("aiMissing")}
        </p>
      )}
      <Tabs value={status} onValueChange={(v) => setStatus(v as AdminNewsStatus)}>
        <TabsList variant="pill">
          {ADMIN_NEWS_STATUSES.map((s) => <TabsTrigger key={s} value={s}>{t(`status.${s}`)}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      {failed ? (
        <ErrorState onRetry={load} />
      ) : rows === null ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-32 w-full rounded-card" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Newspaper} title={t("empty")} />
      ) : (
        <ul className="space-y-3">{rows.map((r) => <li key={r.id}><NewsAdminCard row={r} onChangeStatus={changeStatus} /></li>)}</ul>
      )}
    </div>
  );
}
