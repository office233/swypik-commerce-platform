export interface CronJob {
  name: string;
  endpoint: string;
  method: "GET" | "POST";
  description: string;
  schedule: string;
}

export const CRON_JOBS: CronJob[] = [
  {
    name: "abandoned-cart",
    endpoint: "/api/cron/abandoned-cart",
    method: "POST",
    description: "Trimite e-mail-uri de recuperare pentru coșuri abandonate (2h–48h).",
    schedule: "La fiecare 4h",
  },
  {
    name: "process-dropship",
    endpoint: "/api/cron/process-dropship",
    method: "POST",
    description: "Procesează comenzile dropship pendente.",
    schedule: "La fiecare 15 min",
  },
  {
    name: "process-payouts",
    endpoint: "/api/cron/process-payouts",
    method: "POST",
    description: "Procesează payout-uri creator (Stripe Connect).",
    schedule: "La fiecare 30 min",
  },
  {
    name: "suspend-unverified",
    endpoint: "/api/cron/suspend-unverified",
    method: "GET",
    description: "Suspendă conturi neverificate după grace period.",
    schedule: "Zilnic",
  },
  {
    name: "swyp-view-milestones",
    endpoint: "/api/cron/swyp-view-milestones",
    method: "GET",
    description: "Recompense SWYP pentru milestone-uri view.",
    schedule: "La fiecare oră",
  },
  {
    name: "sync-dropship-status",
    endpoint: "/api/cron/sync-dropship-status",
    method: "POST",
    description: "Sincronizează status comenzi dropship cu furnizorul.",
    schedule: "La fiecare oră",
  },
];
