export const THEME = {
  name: "Dark Luxury",
  psychology: {
    background: "premium / immersive / focus",
    primary: "trust / premium / creativity",
    accent: "freshness / modernity / tech",
    cart: "money / positive / action",
    discount: "urgency / attention",
    premium: "luxury / exclusivity",
    trust: "security / coolness",
  },
  colors: {
    bg: "#0F0F0F",
    bgSoft: "#1A1A2E",
    card: "#1E1E2E",
    cardHover: "#252540",
    text: "#F8F9FA",
    muted: "#94A3B8",
    border: "rgba(108,92,231,0.15)",
    borderLight: "rgba(255,255,255,0.06)",
    primary: "#6C5CE7",
    primaryLight: "#A29BFE",
    accent: "#00D2FF",
    cart: "#00E676",
    cartDark: "#00C853",
    discount: "#FF6B6B",
    premium: "#BD93F9",
    trust: "#00D2FF",
    warning: "#FFD93D",
    gold: "#F5A623",
  },
  classes: {
    appBg: "bg-[#0F0F0F] text-[#F8F9FA]",
    pageBg: "bg-[linear-gradient(180deg,#0F0F0F_0%,#1A1A2E_100%)]",
    card: "bg-[#1E1E2E]/80 backdrop-blur-xl border border-white/[0.06] shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
    cardHover: "hover:bg-[#252540] hover:border-[rgba(108,92,231,0.25)] hover:shadow-[0_12px_40px_rgba(108,92,231,0.15)] transition-all duration-300",
    heroCard: "bg-gradient-to-br from-[#1E1E2E] to-[#16213E] border border-white/[0.08] shadow-[0_25px_70px_rgba(108,92,231,0.12)]",
    primaryButton: "bg-[#6C5CE7] text-white shadow-lg shadow-[#6C5CE7]/25 hover:bg-[#5A4BD1] active:scale-95 transition-all",
    cartButton: "bg-[#00E676] text-[#0F0F0F] font-black shadow-lg shadow-[#00E676]/20 hover:bg-[#00C853] active:scale-95 transition-all",
    discountBadge: "bg-[#FF6B6B] text-white shadow-lg shadow-[#FF6B6B]/30",
    premiumBadge: "bg-gradient-to-r from-[#BD93F9] to-[#6C5CE7] text-white shadow-lg",
    trustBadge: "bg-[#00D2FF] text-[#0F0F0F] shadow-lg shadow-[#00D2FF]/30",
    softInput: "bg-[#1E1E2E] border border-white/[0.08] focus-within:border-[#6C5CE7]/50 focus-within:shadow-[0_0_20px_rgba(108,92,231,0.15)] transition-all",
    glass: "bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08]",
    glassNav: "bg-[#0F0F0F]/80 backdrop-blur-2xl border-t border-white/[0.06]",
  },
};

export function commerceBadgeClass(label?: string) {
  if (!label) return "bg-white/10 text-[#A29BFE]";
  if (label.includes("Bundle") || label.includes("Premium")) return "bg-gradient-to-r from-[#BD93F9] to-[#6C5CE7] text-white";
  if (label.includes("sigur") || label.includes("Alegere")) return "bg-[#00D2FF]/20 text-[#00D2FF]";
  if (label.includes("coș") || label.includes("adăugat")) return "bg-[#00E676]/20 text-[#00E676]";
  if (label.includes("vinde") || label.includes("popular")) return "bg-[#FF6B6B]/20 text-[#FF6B6B]";
  return "bg-white/10 text-[#A29BFE]";
}
