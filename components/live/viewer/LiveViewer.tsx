"use client";

import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Eye, ShoppingBag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Link } from "@/lib/i18n/navigation";
import type { LiveShopItem, LiveStreamPublic } from "@/lib/live/queries";
import { LiveStateCard } from "../LiveStateCard";
import { useLiveToken } from "../useLiveToken";
import { LiveChat } from "./LiveChat";
import { PinnedProduct, ProductsSheet } from "./LiveProducts";

// SDK-ul WebRTC se încarcă doar când streamul chiar e live.
const LiveVideo = dynamic(() => import("./LiveVideo"), { ssr: false });

type Props = {
  initialStream: LiveStreamPublic;
  initialItems: LiveShopItem[];
  configured: boolean;
  signedIn: boolean;
  pollMs: number;
};

/** Viewer full-screen (ImmersiveSurface): video LiveKit, chat suprapus, produs fixat. */
export default function LiveViewer({ initialStream, initialItems, configured, signedIn, pollMs }: Props) {
  const t = useTranslations("live.viewer");
  const [stream, setStream] = useState(initialStream);
  const [items, setItems] = useState(initialItems);
  const [productsOpen, setProductsOpen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const isLive = stream.status === "live";
  const token = useLiveToken(stream.id, "viewer", configured && isLive, retryKey);

  // Status, spectatori, produs fixat: reîmprospătare periodică (până la final).
  useEffect(() => {
    if (stream.status === "ended" || stream.status === "failed") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/live/streams/${stream.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { stream: LiveStreamPublic; items: LiveShopItem[] };
        setStream(data.stream);
        setItems(data.items);
      } catch {
        // rețea — următorul tick
      }
    }, pollMs);
    return () => clearInterval(timer);
  }, [stream.id, stream.status, pollMs]);

  const name = stream.display_name || (stream.username ? `@${stream.username}` : t("creatorFallback"));
  const pinned = items.find((i) => i.is_pinned) ?? null;

  let stage: ReactNode;
  if (!configured) stage = <LiveStateCard kind="unconfigured" />;
  else if (stream.status === "scheduled") stage = <LiveStateCard kind="scheduled" scheduledAt={stream.scheduled_at} />;
  else if (!isLive) stage = <LiveStateCard kind="ended" />;
  else if (token.status === "ready") {
    stage = <LiveVideo connection={token.connection} onDisconnected={() => setRetryKey((k) => k + 1)} />;
  } else if (token.status === "error") {
    stage = <LiveStateCard kind="error" onRetry={() => setRetryKey((k) => k + 1)} />;
  } else stage = <LiveStateCard kind="connecting" />;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-canvas text-fg">
      <h1 className="sr-only">{stream.title}</h1>
      <div className="absolute inset-0">{stage}</div>

      {/* Bara de sus */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 bg-gradient-to-b from-black/60 to-transparent px-gutter pb-8 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] text-white">
        <Link
          href={stream.username ? `/u/${stream.username}` : "/live"}
          className="pointer-events-auto flex min-h-11 min-w-0 items-center gap-2 rounded-full bg-black/35 py-1 pl-1 pr-3 backdrop-blur"
        >
          <Avatar src={stream.avatar_url} name={name} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="block truncate text-xs text-white/75">{stream.title}</span>
          </span>
        </Link>
        {isLive ? (
          <span className="flex items-center gap-1.5 pt-2.5">
            <Badge tone="danger" className="bg-danger text-white">{t("liveBadge")}</Badge>
            <Badge tone="overlay">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              <span aria-label={t("viewers", { count: stream.viewer_count })}>{stream.viewer_count}</span>
            </Badge>
          </span>
        ) : null}
        <IconButton asChild variant="overlay" label={t("close")} className="pointer-events-auto ml-auto">
          <Link href="/live">
            <X aria-hidden />
          </Link>
        </IconButton>
      </div>

      {/* Zona de jos (deasupra BottomNav prin --bottom-inset): chat + produs fixat + produse */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/60 to-transparent px-gutter pb-[calc(var(--bottom-inset)+0.75rem)] pt-16">
        {isLive || stream.status === "scheduled" ? <LiveChat streamId={stream.id} canChat={isLive} signedIn={signedIn} /> : null}
        {pinned ? <PinnedProduct item={pinned} /> : null}
        {items.length > 0 ? (
          <Button variant="secondary" size="sm" className="pointer-events-auto" onClick={() => setProductsOpen(true)}>
            <ShoppingBag className="h-4 w-4" aria-hidden />
            {t("products", { count: items.length })}
          </Button>
        ) : null}
      </div>

      <ProductsSheet items={items} open={productsOpen} onOpenChange={setProductsOpen} />
    </div>
  );
}
