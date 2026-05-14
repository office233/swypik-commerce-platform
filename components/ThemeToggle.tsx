"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor } from "lucide-react";

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-9 h-9" aria-hidden />;

  const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
  const label = theme === "dark" ? "Întunecat" : theme === "light" ? "Luminos" : "Sistem";
  const Icon = resolvedTheme === "dark" ? Moon : theme === "system" ? Monitor : Sun;

  return (
    <button
      type="button"
      aria-label={`Tema: ${label} (apasă pentru ${next})`}
      onClick={() => setTheme(next)}
      className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-[#E5E5E5] dark:border-[#27272A] hover:bg-[#F4F4F5] dark:hover:bg-[#18181B] transition"
    >
      <Icon size={18} />
    </button>
  );
}
