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
];
