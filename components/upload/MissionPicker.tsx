"use client";

import { useEffect, useState } from "react";
import { Target, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { ListItem } from "@/components/ui/ListItem";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { pickerApi, type MissionDto } from "@/lib/upload/api";

/**
 * Înscrierea clipului la o misiune activă (API-ul Missions existent:
 * GET /api/missions + POST /api/missions/[slug]/submit după publicare).
 * Dacă nu există misiuni active, secțiunea nu apare deloc.
 */
export function MissionPicker(props: { slug: string | null; onChange: (slug: string | null) => void }) {
  const t = useTranslations("videoUpload.mission");
  const [open, setOpen] = useState(false);
  const [missions, setMissions] = useState<MissionDto[] | null>(null);

  useEffect(() => {
    let alive = true;
    pickerApi
      .missions()
      .then((m) => alive && setMissions(m))
      .catch(() => alive && setMissions([]));
    return () => {
      alive = false;
    };
  }, []);

  if (missions !== null && missions.length === 0 && !props.slug) return null;
  const selected = missions?.find((m) => m.slug === props.slug);

  return (
    <>
      {props.slug ? (
        <ListItem
          icon={Target}
          title={selected?.title ?? props.slug}
          subtitle={t("selectedHint")}
          trailing={
            <IconButton label={t("remove")} onClick={() => props.onChange(null)}>
              <X aria-hidden />
            </IconButton>
          }
        />
      ) : (
        <ListItem icon={Target} title={t("add")} subtitle={t("addHint")} onClick={() => setOpen(true)} />
      )}
      <Sheet open={open} onOpenChange={setOpen} title={t("sheetTitle")}>
        {missions === null ? (
          <div className="space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : missions.length === 0 ? (
          <EmptyState icon={Target} title={t("empty")} />
        ) : (
          <div className="divide-y divide-subtle">
            {missions.map((m) => (
              <ListItem
                key={m.id}
                icon={Target}
                title={m.title}
                active={m.slug === props.slug}
                onClick={() => {
                  props.onChange(m.slug);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
