"use client";

import { useState } from "react";

export default function VisualSearchPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-black mb-2">Căutare vizuală</h1>
      <p className="text-sm text-[#6E6E80] mb-6">
        În curând: caută produse Swypik încărcând o poză. Modelul CLIP va face match
        între imaginea ta și catalog pe baza similarității vizuale.
      </p>

      <label className="block rounded-2xl border-2 border-dashed border-[#E6E6E6] p-8 text-center cursor-pointer hover:border-[#7C3AED]">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setFile(f);
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
        {preview ? (
          <img src={preview} alt="preview" className="mx-auto max-h-64 rounded-xl" />
        ) : (
          <div className="text-[#6E6E80]">
            <div className="text-3xl mb-2">📷</div>
            Apasă pentru a încărca o imagine
          </div>
        )}
      </label>

      <input
        type="text"
        placeholder="Sau descrie ce cauți (ex: rochie roșie de vară)"
        className="mt-4 w-full rounded-xl border border-[#E6E6E6] px-4 py-3 text-sm"
      />

      <div className="mt-6 rounded-xl bg-[#FAFAFA] p-4 text-sm text-[#6E6E80]">
        <strong className="text-[#0D0D0D]">Status:</strong> integrare CLIP planificată.
        Vezi <code>docs/ai-roadmap.md</code>.
      </div>

      <button
        type="button"
        disabled={!file}
        className="mt-6 w-full rounded-xl bg-[#7C3AED] py-3 text-sm font-bold text-white disabled:opacity-40"
        onClick={async () => {
          await fetch("/api/visual-search", { method: "POST" }).catch(() => null);
        }}
      >
        Caută (în curând)
      </button>
    </main>
  );
}
