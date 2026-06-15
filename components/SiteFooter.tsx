"use client";

import { Link, usePathname } from "@/lib/i18n/navigation";
import { useTranslations } from "next-intl";

export default function SiteFooter() {
  const pathname = usePathname();
  const t = useTranslations("footer");

  const hiddenPaths = [
    "/explore",
    "/reels",
    "/checkout",
    "/seller",
    "/sellers",
    "/creator",
    "/admin",
    "/auth",
    "/upload",
    "/inbox",
    "/dm",
    "/chat",
  ];
  const isHidden =
    pathname === "/" || hiddenPaths.some((p) => pathname.startsWith(p));
  if (isHidden) return null;

  const year = new Date().getFullYear();

  const cols: { title: string; links: { href: string; label: string }[] }[] = [
    {
      title: t("legal"),
      links: [
        { href: "/legal/terms", label: t("termeni") },
        { href: "/legal/privacy", label: t("confidentialitate") },
        { href: "/legal/cookies", label: t("cookies") },
      ],
    },
    {
      title: t("companie"),
      links: [
        { href: "/about", label: t("despre") },
        { href: "/blog", label: t("blog") },
        { href: "/help", label: t("ajutor") },
      ],
    },
  ];

  return (
    <footer className="mt-12 border-t border-[#E5E5E5] dark:border-[#1F1F1F] bg-white dark:bg-black">
      <div className="mx-auto w-full max-w-5xl px-5 py-10">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <div className="text-lg font-extrabold tracking-tight text-[#0D0D0D] dark:text-white">
              Swypik
            </div>
            <p className="mt-2 max-w-xs text-sm text-[#52525B] dark:text-[#A1A1AA]">
              {t("tagline")}
            </p>
          </div>
          {cols.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#71717A] dark:text-[#71717A]">
                {col.title}
              </div>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-[#3F3F46] hover:text-[#0D0D0D] dark:text-[#A1A1AA] dark:hover:text-white transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-[#F0F0F0] dark:border-[#161616] pt-6 text-xs text-[#71717A] sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} Swypik. {t("drepturi")}</span>
          <span>{t("contact")}: contact@swypik.com</span>
        </div>
      </div>
    </footer>
  );
}
