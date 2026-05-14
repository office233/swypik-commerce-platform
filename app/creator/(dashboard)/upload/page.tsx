"use client";

import { useState, useRef, useEffect } from "react";
import {
  Camera,
  UploadCloud,
  Video,
  Link as LinkIcon,
  Sparkles,
  CheckCircle,
  Loader2,
  RefreshCw,
  X,
  Music,
  Hash,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AudioPicker, { type AudioTrackDTO } from "@/components/reels/AudioPicker";

type Step = "pick" | "metadata" | "uploading" | "suggestions" | "publishing" | "success";

type Suggestions = {
  hooks: string[];
  caption: string;
  tags: string[];
  suggested_collection: string;
};

const EMPTY_SUGGESTIONS: Suggestions = {
  hooks: [],
  caption: "",
  tags: [],
  suggested_collection: "",
};

export default function CreatorUploadPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [productLink, setProductLink] = useState("");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  // audio & hashtags polish
  const [audioTrack, setAudioTrack] = useState<AudioTrackDTO | null>(null);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [hashtagLoading, setHashtagLoading] = useState(false);
  const [suggestedHashtags, setSuggestedHashtags] = useState<string[]>([]);

  // post-upload
  const [videoId, setVideoId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions>(EMPTY_SUGGESTIONS);
  const [loadingSection, setLoadingSection] = useState<null | "all" | "hooks" | "caption" | "tags">(null);
  const [hookChoice, setHookChoice] = useState<number>(0);
  const [captionDraft, setCaptionDraft] = useState("");
  const [captionEdited, setCaptionEdited] = useState(false);
  const [tagsDraft, setTagsDraft] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.size > 100 * 1024 * 1024) {
      setErrorMsg("Fișierul este prea mare (max 100MB).");
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setErrorMsg("");
    setStep("metadata");
  };

  const startUpload = async () => {
    if (!file) {
      setErrorMsg("Selectează un clip video.");
      return;
    }
    setStep("uploading");
    setProgress(10);
    try {
      const resSession = await fetch("/api/creator/upload-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          description,
          productId: productLink.split("/product/")[1]?.split("?")[0] || "",
          audio_track_id: audioTrack?.id || null,
        }),
      });
      const sessionData = await resSession.json();
      if (!resSession.ok) throw new Error(sessionData.error || "Eroare la sesiunea de upload.");
      setProgress(30);

      const uploadRes = await fetch(sessionData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Eroare la încărcarea fișierului.");
      setProgress(70);

      const resComplete = await fetch(`/api/creator/upload-session?id=${sessionData.sessionId}&action=complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionData.sessionId }),
      });
      const completeData = await resComplete.json();
      if (!resComplete.ok) throw new Error(completeData.error || "Eroare la finalizare.");
      setProgress(100);

      const vid = completeData.videoId || sessionData.videoId;
      setVideoId(vid);
      setStep("suggestions");
      // pornește generarea AI imediat
      void fetchSuggestions(vid, /*regenerate*/ false);
    } catch (err: any) {
      setErrorMsg(err.message || "Eroare la upload.");
      setStep("metadata");
    }
  };

  const fetchSuggestions = async (vid: string, regenerate: boolean, focus: "hooks" | "caption" | "tags" | "all" = "all") => {
    setLoadingSection(focus);
    try {
      const endpoint = regenerate
        ? "/api/creator/upload-suggestions/regenerate"
        : "/api/creator/upload-suggestions";
      const body = regenerate
        ? { video_id: vid, focus, hook_choice: suggestions.hooks[hookChoice] }
        : { video_id: vid, description, language: "ro" };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Eroare AI");
      const next: Suggestions = {
        hooks: data.hooks || [],
        caption: data.caption || "",
        tags: data.tags || [],
        suggested_collection: data.suggested_collection || "",
      };
      setSuggestions(next);
      if (focus === "all" || focus === "caption") {
        if (!captionEdited) setCaptionDraft(next.caption);
      }
      if (focus === "all" || focus === "tags") setTagsDraft(next.tags);
    } catch (err: any) {
      setErrorMsg(err.message || "Eroare la generarea sugestiilor.");
    } finally {
      setLoadingSection(null);
    }
  };

  const publish = async () => {
    if (!videoId) return;
    setStep("publishing");
    try {
      await fetch(`/api/creator/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: suggestions.hooks[hookChoice] || undefined,
          description: captionDraft,
          tags: tagsDraft,
          visibility: "public",
          ai_hook_selected: suggestions.hooks[hookChoice] || null,
          ai_caption_used: !captionEdited && captionDraft === suggestions.caption,
          collection_hint: suggestions.suggested_collection || null,
        }),
      });
      setStep("success");
      setTimeout(() => router.push("/creator/dashboard"), 1500);
    } catch (err: any) {
      setErrorMsg(err.message || "Eroare la publicare.");
      setStep("suggestions");
    }
  };

  const removeTag = (tag: string) => setTagsDraft((arr) => arr.filter((t) => t !== tag));

  const suggestHashtags = async () => {
    setHashtagLoading(true);
    try {
      const res = await fetch("/api/ai/suggest-hashtags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", description }),
      });
      const j = await res.json();
      if (res.ok && Array.isArray(j.hashtags)) {
        setSuggestedHashtags(j.hashtags);
      }
    } catch {
      // silent
    } finally {
      setHashtagLoading(false);
    }
  };

  // ──────────────────────────────── RENDER ────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-white p-4 sm:p-6 pb-24">
      <div className="max-w-xl mx-auto">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-black">Încarcă Clip Nou</h1>
          <Link href="/creator/dashboard" className="text-sm font-bold text-white/50 hover:text-white transition">
            Anulează
          </Link>
        </header>

        {errorMsg && (
          <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-bold p-4 rounded-xl">
            {errorMsg}
          </div>
        )}

        {step === "success" ? (
          <SuccessCard />
        ) : step === "suggestions" || step === "publishing" ? (
          <SuggestionsStep
            suggestions={suggestions}
            loadingSection={loadingSection}
            hookChoice={hookChoice}
            setHookChoice={setHookChoice}
            captionDraft={captionDraft}
            setCaptionDraft={(v) => {
              setCaptionDraft(v);
              setCaptionEdited(true);
            }}
            tagsDraft={tagsDraft}
            removeTag={removeTag}
            onRegenerate={(focus) => videoId && fetchSuggestions(videoId, true, focus)}
            onPublish={publish}
            publishing={step === "publishing"}
          />
        ) : (
          <PickAndMetadata
            previewUrl={previewUrl}
            file={file}
            description={description}
            setDescription={setDescription}
            productLink={productLink}
            setProductLink={setProductLink}
            audioTrack={audioTrack}
            openAudioPicker={() => setAudioPickerOpen(true)}
            clearAudio={() => setAudioTrack(null)}
            hashtagLoading={hashtagLoading}
            suggestedHashtags={suggestedHashtags}
            suggestHashtags={suggestHashtags}
            onPickFile={() => fileInputRef.current?.click()}
            onPickCamera={() => cameraInputRef.current?.click()}
            onReset={() => {
              setFile(null);
              setPreviewUrl(null);
              setStep("pick");
            }}
            onUpload={startUpload}
            uploading={step === "uploading"}
            progress={progress}
            fileInputRef={fileInputRef}
            cameraInputRef={cameraInputRef}
            onFileChange={handleFileChange}
          />
        )}
      </div>
      <AudioPicker
        open={audioPickerOpen}
        onClose={() => setAudioPickerOpen(false)}
        selectedId={audioTrack?.id || null}
        onSelect={(t) => { setAudioTrack(t); setAudioPickerOpen(false); }}
      />
    </div>
  );
}

// ─── Components ─────────────────────────────────────────────────────────

function SuccessCard() {
  return (
    <div className="bg-[#0D0D0D]/10 border border-[#0D0D0D]/30 rounded-3xl p-10 text-center flex flex-col items-center">
      <CheckCircle size={64} className="text-[#0D0D0D] mb-4" />
      <h2 className="text-2xl font-black mb-2">Clip Publicat!</h2>
      <p className="text-white/60 mb-6">Videoclipul tău este în feed.</p>
    </div>
  );
}

function PickAndMetadata(props: {
  previewUrl: string | null;
  file: File | null;
  description: string;
  setDescription: (v: string) => void;
  productLink: string;
  setProductLink: (v: string) => void;
  audioTrack: AudioTrackDTO | null;
  openAudioPicker: () => void;
  clearAudio: () => void;
  hashtagLoading: boolean;
  suggestedHashtags: string[];
  suggestHashtags: () => void;
  onPickFile: () => void;
  onPickCamera: () => void;
  onReset: () => void;
  onUpload: () => void;
  uploading: boolean;
  progress: number;
  fileInputRef: React.RefObject<HTMLInputElement>;
  cameraInputRef: React.RefObject<HTMLInputElement>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const {
    previewUrl, file, description, setDescription, productLink, setProductLink,
    audioTrack, openAudioPicker, clearAudio,
    hashtagLoading, suggestedHashtags, suggestHashtags,
    onPickFile, onPickCamera, onReset, onUpload, uploading, progress,
    fileInputRef, cameraInputRef, onFileChange,
  } = props;

  return (
    <div className="space-y-6">
      {!previewUrl ? (
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={onPickCamera}
            className="bg-white/[0.04] hover:bg-white/[0.08] transition border border-white/10 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center group"
          >
            <div className="w-16 h-16 rounded-full bg-[#FE2C55]/20 text-[#FE2C55] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Camera size={32} />
            </div>
            <h3 className="font-bold mb-1">Filmează acum</h3>
            <p className="text-xs text-white/40">Deschide camera</p>
          </button>
          <button
            onClick={onPickFile}
            className="bg-white/[0.04] hover:bg-white/[0.08] transition border border-white/10 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center group"
          >
            <div className="w-16 h-16 rounded-full bg-white/10 text-white flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <UploadCloud size={32} />
            </div>
            <h3 className="font-bold mb-1">Alege din galerie</h3>
            <p className="text-xs text-white/40">MP4, max 100MB</p>
          </button>
          <input type="file" accept="video/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={onFileChange} />
          <input type="file" accept="video/mp4,video/quicktime" className="hidden" ref={fileInputRef} onChange={onFileChange} />
        </div>
      ) : (
        <div className="relative aspect-[9/16] bg-black rounded-3xl overflow-hidden border border-white/10 mx-auto max-w-xs shadow-2xl">
          <video src={previewUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
          <button onClick={onReset} className="absolute top-4 right-4 bg-black/50 backdrop-blur-md rounded-full px-4 py-2 text-xs font-bold text-white hover:bg-white/20 transition">
            Schimbă
          </button>
          <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 text-white/80">
            <Video size={16} />
            <span className="text-xs font-bold truncate">{file?.name}</span>
          </div>
        </div>
      )}

      <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 space-y-6">
        <div>
          <label className="text-sm font-bold text-white/60 mb-2 flex items-center gap-2">
            <LinkIcon size={14} /> Link Produs (Opțional)
          </label>
          <input
            type="url"
            value={productLink}
            onChange={(e) => setProductLink(e.target.value)}
            placeholder="https://swypik.com/product/..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#0D0D0D] transition"
          />
        </div>
        <div>
          <label className="text-sm font-bold text-white/60 mb-2 block">Descriere (opțional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Câteva cuvinte despre clip. AI-ul îl va folosi ca să genereze hook-uri, caption și tags."
            rows={4}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#0D0D0D] transition resize-none"
          />
        </div>

        {/* Audio Track */}
        <div>
          <label className="text-sm font-bold text-white/60 mb-2 flex items-center gap-2">
            <Music size={14} /> Muzică (opțional)
          </label>
          {audioTrack ? (
            <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
              <Music size={16} className="text-[#FE2C55] shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{audioTrack.title}</p>
                <p className="truncate text-xs text-white/50">{audioTrack.artist}</p>
              </div>
              <button
                type="button"
                onClick={openAudioPicker}
                className="text-xs font-bold text-white/70 hover:text-white"
              >
                Schimbă
              </button>
              <button
                type="button"
                onClick={clearAudio}
                className="rounded-lg p-1 text-white/50 hover:text-white"
                aria-label="Elimină"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={openAudioPicker}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] py-3 text-sm font-bold text-white/70 hover:bg-white/[0.05] hover:text-white transition"
            >
              <Music size={14} /> Alege un track audio
            </button>
          )}
        </div>

        {/* AI Hashtags */}
        <div>
          <label className="text-sm font-bold text-white/60 mb-2 flex items-center gap-2">
            <Hash size={14} /> Hashtag-uri AI (sugerate)
          </label>
          <button
            type="button"
            onClick={suggestHashtags}
            disabled={hashtagLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50 py-2.5 text-xs font-bold text-white transition"
          >
            {hashtagLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            Sugerează hashtag-uri din descriere
          </button>
          {suggestedHashtags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestedHashtags.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    if (!description.includes(h)) {
                      setDescription((description ? description.trim() + " " : "") + h);
                    }
                  }}
                  className="rounded-full bg-[#FE2C55]/15 px-3 py-1 text-xs font-bold text-[#FE2C55] hover:bg-[#FE2C55]/25 transition"
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onUpload}
        disabled={!file || uploading}
        className="w-full bg-[#FE2C55] hover:bg-[#E0264A] disabled:bg-white/10 disabled:text-white/40 text-white font-black text-lg py-4 rounded-2xl transition shadow-[0_0_20px_rgba(254,44,85,0.3)] active:scale-95 flex items-center justify-center gap-2"
      >
        {uploading ? (
          <>
            <Loader2 size={20} className="animate-spin" /> Se încarcă... {progress}%
          </>
        ) : (
          <>Continuă</>
        )}
      </button>
      {uploading && (
        <div className="w-full bg-white/10 rounded-full h-1.5 mt-2 overflow-hidden">
          <div className="bg-[#FE2C55] h-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

function SuggestionsStep(props: {
  suggestions: Suggestions;
  loadingSection: null | "all" | "hooks" | "caption" | "tags";
  hookChoice: number;
  setHookChoice: (n: number) => void;
  captionDraft: string;
  setCaptionDraft: (v: string) => void;
  tagsDraft: string[];
  removeTag: (t: string) => void;
  onRegenerate: (focus: "hooks" | "caption" | "tags" | "all") => void;
  onPublish: () => void;
  publishing: boolean;
}) {
  const { suggestions, loadingSection, hookChoice, setHookChoice, captionDraft, setCaptionDraft, tagsDraft, removeTag, onRegenerate, onPublish, publishing } = props;

  const loadingAll = loadingSection === "all";
  const showHooksSkeleton = loadingAll || (loadingSection === "hooks");

  return (
    <div className="space-y-6">
      {/* Hooks */}
      <Section
        title="Alege un hook"
        icon={<Sparkles size={14} />}
        onRegenerate={() => onRegenerate("hooks")}
        loading={loadingSection === "hooks"}
      >
        {showHooksSkeleton && suggestions.hooks.length === 0 ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {suggestions.hooks.map((h, i) => (
              <label
                key={i}
                className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition ${
                  hookChoice === i ? "bg-[#0D0D0D]/10 border-[#0D0D0D]/40" : "bg-white/5 border-white/10 hover:bg-white/10"
                }`}
              >
                <input type="radio" name="hook" className="mt-1 accent-[#0D0D0D]" checked={hookChoice === i} onChange={() => setHookChoice(i)} />
                <span className="text-sm leading-relaxed">{h}</span>
              </label>
            ))}
          </div>
        )}
      </Section>

      {/* Caption */}
      <Section
        title="Caption"
        icon={<Sparkles size={14} />}
        onRegenerate={() => onRegenerate("caption")}
        loading={loadingSection === "caption"}
      >
        {loadingAll && !captionDraft ? (
          <div className="h-24 bg-white/5 rounded-xl animate-pulse" />
        ) : (
          <textarea
            value={captionDraft}
            onChange={(e) => setCaptionDraft(e.target.value)}
            rows={3}
            maxLength={280}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#0D0D0D] transition resize-none"
          />
        )}
        <div className="text-right text-xs text-white/40 mt-1">{captionDraft.length}/280</div>
      </Section>

      {/* Tags */}
      <Section
        title="Hashtags"
        icon={<Sparkles size={14} />}
        onRegenerate={() => onRegenerate("tags")}
        loading={loadingSection === "tags"}
      >
        {loadingAll && tagsDraft.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-7 w-20 bg-white/5 rounded-full animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tagsDraft.map((t) => (
              <span key={t} className="flex items-center gap-1.5 bg-[#0D0D0D]/15 text-[#0D0D0D] text-xs font-bold px-3 py-1.5 rounded-full">
                {t}
                <button onClick={() => removeTag(t)} className="hover:text-white">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Collection */}
      {suggestions.suggested_collection && (
        <div className="bg-gradient-to-r from-[#FE2C55]/10 to-transparent border border-[#FE2C55]/20 p-4 rounded-2xl">
          <p className="text-xs font-bold text-[#FE2C55] uppercase tracking-wider mb-1">Smart Collection</p>
          <p className="text-sm">{suggestions.suggested_collection}</p>
        </div>
      )}

      <button
        onClick={onPublish}
        disabled={publishing || !suggestions.hooks.length}
        className="w-full bg-[#FE2C55] hover:bg-[#E0264A] disabled:bg-white/10 disabled:text-white/40 text-white font-black text-lg py-4 rounded-2xl transition shadow-[0_0_20px_rgba(254,44,85,0.3)] active:scale-95 flex items-center justify-center gap-2"
      >
        {publishing ? (
          <>
            <Loader2 size={20} className="animate-spin" /> Se publică...
          </>
        ) : (
          <>Publică Clipul</>
        )}
      </button>
    </div>
  );
}

function Section(props: {
  title: string;
  icon: React.ReactNode;
  loading: boolean;
  onRegenerate: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold flex items-center gap-2 text-white/80">
          {props.icon} {props.title}
        </h3>
        <button
          onClick={props.onRegenerate}
          disabled={props.loading}
          className="flex items-center gap-1.5 text-xs font-bold text-[#0D0D0D] bg-[#0D0D0D]/10 px-3 py-1.5 rounded-lg hover:bg-[#0D0D0D]/20 transition disabled:opacity-50"
        >
          {props.loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Regenerează
        </button>
      </div>
      {props.children}
    </div>
  );
}
