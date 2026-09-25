"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plug, RefreshCw, Unplug } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { PanelHeading } from "@/components/seller/PanelHeading";
import { sellerApi } from "@/components/seller/api";
import { formatSellerDate } from "@/components/seller/format";

type Status = { connected: boolean; erp_url: string | null; last_sync: string | null };

/** Rutele ERP (security wave) răspund cu coduri HTTP stabile; textul vine din i18n. */
function connectErrorKey(status: number): string {
  if (status === 400) return "errors.invalidUrl";
  if (status === 409) return "errors.keyInUse";
  if (status === 422) return "errors.connectionFailed";
  if (status === 429) return "errors.rateLimited";
  return "errors.generic";
}

/** Conexiunea cu ERP-ul seller-ului (Meister / Multi-ERP): URL https public + cheie API criptată. */
export function ErpConnection() {
  const t = useTranslations("sellerPanel.erp");
  const locale = useLocale();
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    const res = await sellerApi<Status>("/api/seller/erp/connect");
    if (res.ok) setStatus(res.data);
    else setLoadError(true);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function connect() {
    setBusy("connect");
    setError(null);
    const res = await sellerApi<{ product_count?: number }>("/api/seller/erp/connect", {
      method: "POST",
      body: { erp_api_url: url.trim(), erp_api_key: key.trim() },
    });
    setBusy(null);
    if (!res.ok) return setError(t(connectErrorKey(res.status)));
    setKey("");
    toast({ title: t("connected", { count: res.data.product_count ?? 0 }), tone: "success" });
    await load();
  }

  async function sync() {
    setBusy("sync");
    const res = await sellerApi<{ imported: number; updated: number; errors: number }>("/api/seller/erp/sync", { method: "POST" });
    setBusy(null);
    if (!res.ok) return toast({ title: t(res.status === 429 ? "errors.rateLimited" : "errors.syncFailed"), tone: "danger" });
    toast({ title: t("synced", { imported: res.data.imported, updated: res.data.updated, errors: res.data.errors }), tone: "success" });
    await load();
  }

  async function disconnect() {
    setBusy("disconnect");
    const res = await sellerApi("/api/seller/erp/connect", { method: "DELETE" });
    setBusy(null);
    setConfirm(false);
    toast(res.ok ? { title: t("disconnected"), tone: "success" } : { title: t("errors.generic"), tone: "danger" });
    await load();
  }

  if (loadError) return <ErrorState onRetry={() => void load()} />;
  if (!status) return <Skeleton className="h-48 w-full rounded-card" />;

  return (
    <div className="space-y-4">
      <PanelHeading title={t("title")} subtitle={t("subtitle")} />
      {status.connected ? (
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>{t("connectedTitle")}</CardTitle>
              <CardDescription className="break-all">{status.erp_url}</CardDescription>
            </div>
            <Badge tone="success">{t("statusConnected")}</Badge>
          </CardHeader>
          <p className="text-sm text-muted">{t("lastSync", { date: formatSellerDate(locale, status.last_sync, true) })}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button loading={busy === "sync"} onClick={() => void sync()}>
              <RefreshCw className="h-4 w-4" aria-hidden /> {t("sync")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(true)}>
              <Unplug className="h-4 w-4" aria-hidden /> {t("disconnect")}
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{t("connectTitle")}</CardTitle>
              <CardDescription>{t("connectHint")}</CardDescription>
            </div>
            <Plug className="h-5 w-5 text-subtle" aria-hidden />
          </CardHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void connect();
            }}
          >
            <TextField label={t("url")} hint={t("urlHint")} type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} required />
            <TextField label={t("key")} hint={t("keyHint")} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} required minLength={16} />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" loading={busy === "connect"} disabled={!url.trim() || key.trim().length < 16}>
              {t("connect")}
            </Button>
          </form>
        </Card>
      )}

      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("disconnectTitle")}
        description={t("disconnectBody")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {t("keep")}
            </Button>
            <Button variant="danger" loading={busy === "disconnect"} onClick={() => void disconnect()}>
              {t("disconnect")}
            </Button>
          </>
        }
      />
    </div>
  );
}
