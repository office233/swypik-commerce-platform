export const THEME = {
  name: "Coral Commerce",
  psychology: {
    background: "warm trust / low friction",
    primary: "energy / impulse / discovery",
    cart: "safety / confirmation / go action",
    discount: "attention / deal signal",
    premium: "value / status",
    trust: "security / reassurance",
  },
  colors: {
    bg: "#FFF7ED",
    bgSoft: "#FFFBF7",
    card: "#FFFFFF",
    text: "#111827",
    muted: "#64748B",
    border: "#FED7AA",
    primary: "#FF5A1F",
    primaryDark: "#EA3F0B",
    cart: "#16A34A",
    cartDark: "#15803D",
    discount: "#EF4444",
    premium: "#7C3AED",
    trust: "#0EA5E9",
    warning: "#F59E0B",
  },
  classes: {
    appBg: "bg-[#FFF7ED] text-slate-950",
    pageBg: "bg-[linear-gradient(180deg,#FFF7ED_0%,#FFFBF7_45%,#FFFFFF_100%)]",
    card: "bg-white ring-1 ring-orange-100 shadow-[0_18px_45px_rgba(15,23,42,0.10)]",
    heroCard: "bg-white shadow-[0_25px_70px_rgba(249,115,22,0.18)]",
    primaryButton: "bg-[#FF5A1F] text-white shadow-xl shadow-orange-500/25 active:scale-95",
    cartButton: "bg-[#16A34A] text-white shadow-xl shadow-green-500/20 active:scale-95",
    discountBadge: "bg-[#EF4444] text-white shadow-lg",
    premiumBadge: "bg-[#7C3AED] text-white shadow-lg",
    trustBadge: "bg-[#0EA5E9] text-white shadow-lg",
    softInput: "bg-orange-50 ring-1 ring-orange-100",
  },
};

export function commerceBadgeClass(label?: string) {
  if (!label) return "bg-white/95 text-[#FF5A1F]";
  if (label.includes("Bundle") || label.includes("Premium")) return "bg-[#7C3AED] text-white";
  if (label.includes("sigur") || label.includes("Alegere")) return "bg-[#0EA5E9] text-white";
  if (label.includes("coș") || label.includes("adăugat")) return "bg-[#16A34A] text-white";
  if (label.includes("vinde") || label.includes("popular")) return "bg-[#EF4444] text-white";
  return "bg-white/95 text-[#FF5A1F]";
}
