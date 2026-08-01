"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, type LucideIcon } from "lucide-react";

export type MobileDashboardNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type Props = {
  title: string;
  section: string;
  accentClassName: string;
  items: MobileDashboardNavItem[];
};

export default function MobileDashboardNav({ title, section, accentClassName, items }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Deschide meniul"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="grid h-11 w-11 place-items-center rounded-xl border border-[#E5E5E5] bg-white text-2xl text-[#0D0D0D] active:scale-95"
      >
        <Menu size={22} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Inchide meniul"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-[2rem] bg-white p-5 shadow-2xl safe-pb">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-[#6E6E80]">Meniu</p>
                <h2 className="text-xl font-black text-[#0D0D0D]">
                  {title} <span className={accentClassName}>{section}</span>
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-11 w-11 place-items-center rounded-xl bg-[#F7F7F8] text-xl font-black text-[#0D0D0D]"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="space-y-2">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center gap-3 rounded-2xl border border-[#E5E5E5] px-4 py-3 text-sm font-black text-[#0D0D0D] active:scale-[0.99]"
                >
                  <item.icon size={20} />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
