"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

type Me = {
  id: string;
  email: string | null;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

export default function EditProfilePage() {
  const t = useTranslations("accountEdit");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Load current user
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (!data?.authenticated || !data?.customer) {
          router.replace("/auth/login?next=/account/edit");
          return;
        }
        const c = data.customer as Me;
        setMe(c);
        setDisplayName(c.display_name ?? "");
        setUsername(c.username ?? "");
        setBio(c.bio ?? "");
        setAvatarUrl(c.avatar_url ?? null);
      })
      .catch(() => {
        if (!cancelled) router.replace("/auth/login?next=/account/edit");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const onPickAvatar = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onAvatarChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setError("Folosește JPG, PNG sau WebP");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("Imaginea depășește 5MB");
        return;
      }

      // Optimistic local preview
      const localUrl = URL.createObjectURL(file);
      setAvatarPreview(localUrl);
      setError(null);
      setUploadingAvatar(true);

      try {
        const fd = new FormData();
        fd.append("avatar", file);
        const res = await fetch("/api/users/me/avatar", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Eroare la încărcare");
        setAvatarUrl(data.avatar_url);
        setAvatarPreview(null);
        setToast("Avatar actualizat");
        setTimeout(() => setToast(null), 2000);
      } catch (err) {
        setAvatarPreview(null);
        setError(err instanceof Error ? err.message : "Eroare la încărcare");
      } finally {
        setUploadingAvatar(false);
        URL.revokeObjectURL(localUrl);
      }
    },
    []
  );

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!me) return;
      setError(null);
      setSaving(true);

      const body: Record<string, string> = {};
      const trimmedName = displayName.trim();
      const trimmedUser = username.trim().toLowerCase();
      const trimmedBio = bio.trim();

      if (trimmedName !== (me.display_name ?? "")) body.display_name = trimmedName;
      if (trimmedUser !== me.username) body.username = trimmedUser;
      if (trimmedBio !== (me.bio ?? "")) body.bio = trimmedBio;

      if (Object.keys(body).length === 0) {
        router.push("/account");
        return;
      }

      try {
        const res = await fetch("/api/users/me", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Eroare la salvare");
        router.push("/account?updated=1");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Eroare la salvare");
        setSaving(false);
      }
    },
    [bio, displayName, me, router, username]
  );

  const currentAvatar = avatarPreview || avatarUrl;

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-black/95 backdrop-blur border-b border-white/10">
        <div className="flex items-center justify-between px-4 h-14 max-w-2xl mx-auto">
          <Link
            href="/account"
            className="p-2 -ml-2 rounded-full hover:bg-white/10 transition"
            aria-label={t("inapoi")}
          >
            <ArrowLeft size={22} />
          </Link>
          <h1 className="text-base font-semibold">{t("editeazaProfilul")}</h1>
          <div className="w-10" />
        </div>
      </header>

      <form id="edit-profile-form" onSubmit={onSubmit} className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3 py-4">
          <button
            type="button"
            onClick={onPickAvatar}
            disabled={uploadingAvatar}
            className="relative w-28 h-28 rounded-full overflow-hidden border-2 border-white/20 bg-white/5 group disabled:opacity-50"
            aria-label={t("schimbaAvatarul")}
          >
            {currentAvatar ? (
              <Image
                src={currentAvatar}
                alt="Avatar"
                fill
                sizes="112px"
                className="object-cover"
                unoptimized={currentAvatar.startsWith("blob:")}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-white/60 bg-gradient-to-br from-pink-500/40 to-purple-600/40">
                {(displayName || username || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
              <Camera size={24} />
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Loader2 className="animate-spin" size={24} />
              </div>
            )}
          </button>
          <button
            type="button"
            onClick={onPickAvatar}
            disabled={uploadingAvatar}
            className="text-sm font-semibold text-[#7C3AED] hover:underline disabled:opacity-50"
          >
            
            {t("schimbaFotografia")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onAvatarChange}
          />
        </div>

        {/* Display name */}
        <Field
          label="Nume afișat"
          hint={`${displayName.length}/50`}
        >
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            required
            minLength={1}
            placeholder={t("numeleTau")}
            className="w-full min-h-[48px] rounded-xl bg-white/5 border border-white/10 px-4 text-base text-white placeholder:text-white/40 focus:outline-none focus:border-[#7C3AED]"
          />
        </Field>

        {/* Username */}
        <Field
          label="Username"
          hint="litere mici, cifre, _"
        >
          <div className="flex items-center w-full min-h-[48px] rounded-xl bg-white/5 border border-white/10 px-4 focus-within:border-[#7C3AED]">
            <span className="text-white/40 mr-1">@</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              maxLength={30}
              minLength={3}
              required
              pattern="[a-z0-9_]+"
              placeholder="username"
              autoCapitalize="off"
              autoCorrect="off"
              className="flex-1 bg-transparent text-base text-white placeholder:text-white/40 focus:outline-none"
            />
          </div>
        </Field>

        {/* Bio */}
        <Field
          label="Bio"
          hint={`${bio.length}/300`}
        >
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 300))}
            maxLength={300}
            rows={4}
            placeholder="Spune ceva despre tine..."
            className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-base text-white placeholder:text-white/40 resize-none focus:outline-none focus:border-[#7C3AED]"
          />
        </Field>

        {error && (
          <div className="rounded-xl bg-red-500/15 border border-red-500/30 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </form>

      {/* Toast */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-30 bg-white text-black text-sm font-semibold px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* Sticky save bar */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-black/95 backdrop-blur border-t border-white/10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={saving}
            className="flex-1 min-h-[48px] rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold disabled:opacity-50"
          >
            
            {t("anuleaza")}
          </button>
          <button
            type="submit"
            form="edit-profile-form"
            disabled={saving || uploadingAvatar}
            className="flex-[2] min-h-[48px] rounded-xl bg-[#7C3AED] hover:bg-[#E0264A] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving && <Loader2 className="animate-spin" size={18} />}
            
            {t("salveaza")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white/80">{label}</span>
        {hint && <span className="text-xs text-white/40">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
