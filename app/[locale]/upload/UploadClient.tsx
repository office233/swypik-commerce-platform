"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  UploadCloud,
  Video as VideoIcon,
  Camera,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Music,
  Hash,
  Calendar,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AudioPicker, { type AudioTrackDTO } from "@/components/reels/AudioPicker";
import { useTranslations } from "next-intl";

type Step = 1 | 2 | 3;
type TranscodeStatus = "pending" | "processing" | "ready" | "failed" | "uploading";

const MAX_BYTES = 200 * 1024 * 1024;
const ACCEPTED = ["video/mp4", "video/quicktime", "video/webm"];

function extractHashtags(text: string): string[] {
  const m = text.match(/#[\p{L}0-9_]+/gu);
  return m ? Array.from(new Set(m.map((t) => t.toLowerCase()))) : [];
}

export default function UploadClient() {
  const t = useTranslations("upload");
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draft");

  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Step 2 state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [transcodeStatus, setTranscodeStatus] = useState<TranscodeStatus>("pending");
  const [videoId, setVideoId] = useState<string | null>(null);

  // Step 3 metadata
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [allowComments, setAllowComments] = useState(true);
  const [allowDuet, setAllowDuet] = useState(true);
  const [allowStitch, setAllowStitch] = useState(true);
  const [audioTrack, setAudioTrack] = useState<AudioTrackDTO | null>(null);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<{ id: string; title: string; image_url?: string }[]>([]);
  const [productId, setProductId] = useState<string | null>(null);
  const [productTitle, setProductTitle] = useState<string | null>(null);
  // Secunda la care apare overlay-ul "vezi produsul" in player.
  const [overlaySeconds, setOverlaySeconds] = useState("0");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragOverRef = useRef(false);
  const [dragActive, setDragActive] = useState(false);

  const hashtags = useMemo(() => extractHashtags(description), [description]);

  // Load draft if requested
  useEffect(() => {
    if (!draftId) return;
    (async () => {
      try {
        const res = await fetch(`/api/creator/videos/${draftId}`);
        if (!res.ok) return;
        const j = await res.json();
        const v = j.video || j;
        setVideoId(v.id);
        setTitle(v.title || "");
        setDescription(v.description || "");
        setAllowComments(v.allow_comments ?? true);
        setAllowDuet(v.allow_duet ?? true);
        setAllowStitch(v.allow_stitch ?? true);
        setTranscodeStatus("ready");
        setStep(3);
      } catch {
        // ignore
      }
    })();
  }, [draftId]);

  // Polling for transcode
  useEffect(() => {
    if (step !== 2 || !videoId || transcodeStatus === "ready" || transcodeStatus === "failed") return;
    if (transcodeStatus === "uploading") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/creator/videos/${videoId}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        const s: string = j?.video?.status || j?.status || "processing";
        if (cancelled) return;
        if (s === "ready") setTranscodeStatus("ready");
        else if (s === "failed") setTranscodeStatus("failed");
        else setTranscodeStatus("processing");
      } catch {
        // ignore
      }
    };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [step, videoId, transcodeStatus]);

  function pickFile(f: File) {
    if (!ACCEPTED.includes(f.type) && !f.type.startsWith("video/")) {
      setErrorMsg(t("formatInvalid"));
      return;
    }
    if (f.size > MAX_BYTES) {
      setErrorMsg(t("fisierulDepaseste200mb"));
      return;
    }
    setErrorMsg("");
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  }

  async function startUpload() {
    if (!file) return;
    setStep(2);
    setTranscodeStatus("uploading");
    setUploadProgress(0);
    try {
      const sessionRes = await fetch("/api/creator/upload-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      const session = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(session.error || "Eroare sesiune upload.");

      // Upload PUT cu XHR pt progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", session.uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(file);
      });
      setUploadProgress(100);

      const completeRes = await fetch(
        `/api/creator/upload-session?id=${session.sessionId}&action=complete`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: session.sessionId }),
        },
      );
      const completeData = await completeRes.json();
      if (!completeRes.ok) throw new Error(completeData.error || "Eroare finalizare.");
      setVideoId(completeData.videoId || session.videoId);
      setTranscodeStatus("processing");
    } catch (err: any) {
      setErrorMsg(err.message || "Eroare upload.");
      setTranscodeStatus("failed");
    }
  }

  // Product search debounce
  useEffect(() => {
    if (!productQuery.trim()) {
      setProductResults([]);
      return;
    }
    const ctl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(productQuery)}&limit=6`, {
          signal: ctl.signal,
        });
        const j = await res.json();
        setProductResults(j.products || j.items || []);
      } catch {
        // ignore
      }
    }, 250);
    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
  }, [productQuery]);

  async function submit(mode: "draft" | "schedule" | "publish") {
    if (!videoId) {
      setErrorMsg(t("videoIncaNuEProcesat"));
      return;
    }
    if (mode === "schedule" && !scheduledAt) {
      setErrorMsg(t("alegeDataSiOra"));
      return;
    }
    setSubmitting(true);
    setErrorMsg("");
    try {
      const body: any = {
        title: title || undefined,
        description: description || undefined,
        allow_comments: allowComments,
        allow_duet: allowDuet,
        allow_stitch: allowStitch,
        audio_track_id: audioTrack?.id ?? null,
        product_id: productId || null,
        tags: hashtags.map((h) => h.replace(/^#/, "")),
      };
      if (mode === "draft") {
        body.is_draft = true;
        body.visibility = "draft";
      } else if (mode === "schedule") {
        body.is_draft = false;
        body.scheduled_publish_at = new Date(scheduledAt).toISOString();
        body.visibility = "draft";
      } else {
        body.is_draft = false;
        body.scheduled_publish_at = null;
        body.visibility = "public";
      }
      const res = await fetch(`/api/creator/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Eroare salvare.");
      }
      // Overlay "vezi produsul" la timestamp — video_product_links (placement='overlay').
      if (productId) {
        const startMs = Math.max(0, Math.round((parseFloat(overlaySeconds) || 0) * 1000));
        await fetch(`/api/creator/videos/${videoId}/product-tags`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags: [{ product_id: productId, start_ms: startMs, end_ms: null }] }),
        }).catch(() => { });
      }
      // BUG 5 (2026-08-03): dupa publish userul era dus in dashboardul
      // "Swypik Creator", dezorientant. Destinatia fireasca e clipul lui
      // (pagina /v/<id> arata si statusul de procesare); draft-urile raman
      // in dashboardul creator.
      if (mode === "publish") router.push(`/v/${videoId}`);
      else router.push("/creator/drafts");
    } catch (err: any) {
      setErrorMsg(err.message || "Eroare.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#0D0D0D] to-black text-white">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-black/60 border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {step > 1 && step !== 2 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="p-2 -ml-2 rounded-full hover:bg-white/10"
              aria-label={t("inapoi")}
            >
              <ArrowLeft size={20} />
            </button>
          ) : null}
          <h1 className="text-base font-bold">
            {step === 1 ? t("incarcaClip") : step === 2 ? t("procesare") : t("detalii")}
          </h1>
        </div>
        <div className="flex items-center gap-1.5" aria-label={`Pas ${step} din 3`}>
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-1.5 rounded-full transition-all ${n === step ? "w-8 bg-gradient-to-r from-[#7C3AED] to-[#A855F7]" : n < step ? "w-4 bg-white/40" : "w-4 bg-white/10"
                }`}
            />
          ))}
        </div>
        <Link href="/creator" className="text-xs font-bold text-white/50 hover:text-white">

          {t("anuleaza")}
        </Link>
      </header>

      {errorMsg && (
        <div className="mx-4 mt-4 bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-bold p-3 rounded-xl flex items-start justify-between gap-2">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg("")} aria-label={t("inchide")}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="max-w-xl mx-auto px-4 py-6 pb-24">
        {step === 1 && (
          <Step1
            previewUrl={previewUrl}
            file={file}
            dragActive={dragActive}
            setDragActive={setDragActive}
            fileInputRef={fileInputRef}
            onPick={pickFile}
            onDrop={onDrop}
            onContinue={startUpload}
            onChangeFile={() => {
              setFile(null);
              setPreviewUrl(null);
            }}
          />
        )}

        {step === 2 && (
          <Step2
            previewUrl={previewUrl}
            uploadProgress={uploadProgress}
            transcodeStatus={transcodeStatus}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <Step3
            previewUrl={previewUrl}
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            hashtags={hashtags}
            allowComments={allowComments}
            setAllowComments={setAllowComments}
            allowDuet={allowDuet}
            setAllowDuet={setAllowDuet}
            allowStitch={allowStitch}
            setAllowStitch={setAllowStitch}
            audioTrack={audioTrack}
            openAudioPicker={() => setAudioPickerOpen(true)}
            clearAudio={() => setAudioTrack(null)}
            productQuery={productQuery}
            setProductQuery={setProductQuery}
            productResults={productResults}
            productId={productId}
            productTitle={productTitle}
            selectProduct={(p) => {
              setProductId(p.id);
              setProductTitle(p.title);
              setProductResults([]);
              setProductQuery("");
            }}
            clearProduct={() => {
              setProductId(null);
              setProductTitle(null);
            }}
            overlaySeconds={overlaySeconds}
            setOverlaySeconds={setOverlaySeconds}
            scheduleOpen={scheduleOpen}
            setScheduleOpen={setScheduleOpen}
            scheduledAt={scheduledAt}
            setScheduledAt={setScheduledAt}
            submitting={submitting}
            onSaveDraft={() => submit("draft")}
            onSchedule={() => submit("schedule")}
            onPublish={() => submit("publish")}
          />
        )}
      </div>

      <AudioPicker
        open={audioPickerOpen}
        onClose={() => setAudioPickerOpen(false)}
        selectedId={audioTrack?.id || null}
        onSelect={(t) => {
          setAudioTrack(t);
          setAudioPickerOpen(false);
        }}
      />
    </div>
  );
}

// ──────────────────────────────── STEP 1 ────────────────────────────────

function Step1(props: {
  previewUrl: string | null;
  file: File | null;
  dragActive: boolean;
  setDragActive: (v: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onPick: (f: File) => void;
  onDrop: (e: React.DragEvent) => void;
  onContinue: () => void;
  onChangeFile: () => void;
}) {
  const t = useTranslations("upload");
  const { previewUrl, file, dragActive, setDragActive, fileInputRef, onPick, onDrop, onContinue, onChangeFile } = props;

  return (
    <div className="space-y-6">
      {!previewUrl ? (
        <>
          <Link
            href="/reels/record"
            className="relative block rounded-3xl bg-gradient-to-br from-[#EF4444] via-[#EC4899] to-[#A855F7] p-[2px] shadow-lg shadow-[#EC4899]/30 active:scale-[0.99] transition-transform"
          >
            <div className="rounded-[calc(1.5rem-2px)] bg-[#0D0D0D] px-6 py-5 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#EF4444] to-[#EC4899] flex items-center justify-center shadow-lg shrink-0">
                <Camera size={26} className="text-white" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-base font-black text-white">{t("filmeazaCuCamera")}</p>
                <p className="text-xs font-medium text-white/60 mt-0.5">{t("inregistreazaDirectDinBrowser")}</p>
              </div>
              <span className="text-white/40 text-xl">›</span>
            </div>
          </Link>
          <div className="flex items-center gap-3 py-1">
            <div className="flex-1 h-px bg-white/10"></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{t("sauIncarca")}</span>
            <div className="flex-1 h-px bg-white/10"></div>
          </div>
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={`relative rounded-3xl border-2 border-dashed transition-all p-12 flex flex-col items-center justify-center text-center cursor-pointer ${dragActive
                ? "border-[#A855F7] bg-gradient-to-br from-[#7C3AED]/20 to-[#A855F7]/10"
                : "border-white/10 bg-gradient-to-br from-[#7C3AED]/10 to-[#A855F7]/5 hover:border-white/20"
              }`}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#A855F7] flex items-center justify-center mb-5 shadow-lg shadow-[#7C3AED]/40">
              <UploadCloud size={36} className="text-white" />
            </div>
            <h2 className="text-xl font-black mb-2">{t("trageVideoulAici")}</h2>
            <p className="text-sm text-white/60 mb-1">{t("sauApasaPentruA")}</p>
            <p className="text-xs text-white/40">{t("mp4MovSauWebm")}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPick(f);
              }}
            />
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="relative aspect-[9/16] bg-black rounded-3xl overflow-hidden border border-white/10 mx-auto max-w-xs shadow-2xl">
            <video src={previewUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
            <button
              type="button"
              onClick={onChangeFile}
              className="absolute top-4 right-4 bg-black/60 backdrop-blur rounded-full px-4 py-2 text-xs font-bold hover:bg-white/20"
            >

              {t("schimba")}
            </button>
            <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 text-white/80">
              <VideoIcon size={14} />
              <span className="text-xs font-bold truncate">{file?.name}</span>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={!previewUrl}
        onClick={onContinue}
        className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-[#7C3AED]/30 active:scale-[0.98] transition-transform"
      >

        {t("continua")} <ArrowRight size={18} />
      </button>
    </div>
  );
}

// ──────────────────────────────── STEP 2 ────────────────────────────────

function Step2(props: {
  previewUrl: string | null;
  uploadProgress: number;
  transcodeStatus: TranscodeStatus;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("upload");
  const { previewUrl, uploadProgress, transcodeStatus, onBack, onNext } = props;

  const pct =
    transcodeStatus === "uploading"
      ? uploadProgress
      : transcodeStatus === "processing"
        ? Math.min(95, 100 + (Date.now() % 10))
        : transcodeStatus === "ready"
          ? 100
          : transcodeStatus === "failed"
            ? 100
            : 0;

  const label =
    transcodeStatus === "uploading"
      ? `Upload ${uploadProgress}%`
      : transcodeStatus === "processing"
        ? "Procesare video..."
        : transcodeStatus === "ready"
          ? "Gata!"
          : transcodeStatus === "failed"
            ? "Eroare la procesare"
            : t("initializare");

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="relative aspect-[9/16] bg-black rounded-3xl overflow-hidden border border-white/10 mx-auto max-w-xs w-full shadow-2xl">
        {previewUrl ? (
          <video src={previewUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/30">
            <VideoIcon size={48} />
          </div>
        )}
      </div>

      <div className="flex flex-col justify-center space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-white/80">{label}</span>
            {transcodeStatus === "ready" && <CheckCircle2 size={18} className="text-[#A855F7]" />}
            {(transcodeStatus === "processing" || transcodeStatus === "uploading") && (
              <Loader2 size={18} className="text-[#A855F7] animate-spin" />
            )}
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${transcodeStatus === "failed"
                  ? "bg-red-500"
                  : "bg-gradient-to-r from-[#7C3AED] to-[#A855F7]"
                }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-white/50">
            {transcodeStatus === "uploading" && t("seTrimiteFisierul")}
            {transcodeStatus === "processing" && t("convertimVideoulHls")}
            {transcodeStatus === "ready" && t("procesareaIncheiata")}
            {transcodeStatus === "failed" && t("aAparutOProblema")}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={transcodeStatus === "uploading"}
            className="flex-1 h-12 rounded-2xl border border-white/15 text-sm font-bold flex items-center justify-center gap-2 hover:bg-white/5 disabled:opacity-30"
          >
            <ArrowLeft size={16} />  {t("inapoi2")}
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={transcodeStatus !== "ready"}
            className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-30 active:scale-[0.98] transition-transform"
          >

            {t("continuaLaDetalii")} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────── STEP 3 ────────────────────────────────

function Step3(props: {
  previewUrl: string | null;
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  hashtags: string[];
  allowComments: boolean;
  setAllowComments: (v: boolean) => void;
  allowDuet: boolean;
  setAllowDuet: (v: boolean) => void;
  allowStitch: boolean;
  setAllowStitch: (v: boolean) => void;
  audioTrack: AudioTrackDTO | null;
  openAudioPicker: () => void;
  clearAudio: () => void;
  productQuery: string;
  setProductQuery: (v: string) => void;
  productResults: { id: string; title: string; image_url?: string }[];
  productId: string | null;
  productTitle: string | null;
  selectProduct: (p: { id: string; title: string }) => void;
  clearProduct: () => void;
  overlaySeconds: string;
  setOverlaySeconds: (v: string) => void;
  scheduleOpen: boolean;
  setScheduleOpen: (v: boolean) => void;
  scheduledAt: string;
  setScheduledAt: (v: string) => void;
  submitting: boolean;
  onSaveDraft: () => void;
  onSchedule: () => void;
  onPublish: () => void;
}) {
  const t = useTranslations("upload");
  const {
    previewUrl,
    title,
    setTitle,
    description,
    setDescription,
    hashtags,
    allowComments,
    setAllowComments,
    allowDuet,
    setAllowDuet,
    allowStitch,
    setAllowStitch,
    audioTrack,
    openAudioPicker,
    clearAudio,
    productQuery,
    setProductQuery,
    productResults,
    productId,
    productTitle,
    selectProduct,
    clearProduct,
    overlaySeconds,
    setOverlaySeconds,
    scheduleOpen,
    setScheduleOpen,
    scheduledAt,
    setScheduledAt,
    submitting,
    onSaveDraft,
    onSchedule,
    onPublish,
  } = props;

  const minDateTime = useMemo(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  return (
    <div className="space-y-5">
      {previewUrl && (
        <div className="flex gap-4 bg-white/[0.03] border border-white/10 rounded-2xl p-3">
          <div className="w-20 aspect-[9/16] bg-black rounded-xl overflow-hidden flex-shrink-0">
            <video src={previewUrl} className="w-full h-full object-cover" autoPlay loop muted playsInline />
          </div>
          <div className="flex-1 text-xs text-white/60 self-center">Previzualizare</div>
        </div>
      )}

      <div>
        <label className="text-sm font-bold text-white/70 mb-2 flex items-center justify-between">
          Titlu <span className="text-xs font-normal text-white/40">{title.length}/100</span>
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 100))}
          placeholder={t("adaugaUnTitluCaptivant")}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#A855F7]"
        />
      </div>

      <div>
        <label className="text-sm font-bold text-white/70 mb-2 block">Descriere</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
          placeholder={t("spuneneDespreClipFoloseste")}
          rows={4}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#A855F7] resize-none"
        />
        {hashtags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {hashtags.map((h) => (
              <span
                key={h}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#A855F7] bg-[#7C3AED]/15 border border-[#7C3AED]/30 rounded-full px-2.5 py-1"
              >
                <Hash size={11} />
                {h.replace(/^#/, "")}
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={openAudioPicker}
        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-white/[0.06]"
      >
        <Music size={18} className="text-[#A855F7]" />
        <div className="flex-1 text-left">
          {audioTrack ? (
            <>
              <p className="text-sm font-bold truncate">{audioTrack.title}</p>
              <p className="text-xs text-white/50 truncate">{audioTrack.artist}</p>
            </>
          ) : (
            <p className="text-sm font-bold text-white/70">{t("adaugaSunet")}</p>
          )}
        </div>
        {audioTrack && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearAudio();
            }}
            className="p-1.5 rounded-full hover:bg-white/10"
            aria-label={t("eliminaSunet")}
          >
            <X size={14} />
          </button>
        )}
      </button>

      <div>
        <label className="text-sm font-bold text-white/70 mb-2 block">{t("tagProdusOptional")}</label>
        {productId ? (
          <div className="space-y-2">
            <div className="bg-white/5 border border-[#A855F7]/40 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-bold truncate">{productTitle}</span>
              <button
                type="button"
                onClick={clearProduct}
                className="p-1.5 rounded-full hover:bg-white/10"
                aria-label={t("eliminaProdus")}
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-white/50 whitespace-nowrap" htmlFor="overlay-seconds">
                Overlay &bdquo;vezi produsul&rdquo; la secunda
              </label>
              <input
                id="overlay-seconds"
                type="number"
                min={0}
                step={1}
                value={overlaySeconds}
                onChange={(e) => setOverlaySeconds(e.target.value)}
                className="w-24 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#A855F7]"
              />
            </div>
          </div>
        ) : (
          <>
            <input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder={t("cautaProdusDinMarketplace")}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#A855F7]"
            />
            {productResults.length > 0 && (
              <div className="mt-2 bg-[#0D0D0D] border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden max-h-60 overflow-y-auto">
                {productResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectProduct(p)}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-white/5 truncate"
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl divide-y divide-white/5">
        <Toggle label="Permite comentarii" value={allowComments} onChange={setAllowComments} />
        <Toggle label="Permite Duet" value={allowDuet} onChange={setAllowDuet} />
        <Toggle label="Permite Stitch" value={allowStitch} onChange={setAllowStitch} />
      </div>

      {scheduleOpen && (
        <div className="bg-white/[0.03] border border-[#A855F7]/30 rounded-xl p-4 space-y-3">
          <label className="text-sm font-bold text-white/80 flex items-center gap-2">
            <Calendar size={16} />  {t("programeazaPublicarea")}
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            min={minDateTime}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#A855F7]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setScheduleOpen(false);
                setScheduledAt("");
              }}
              className="flex-1 h-11 rounded-xl border border-white/15 text-sm font-bold hover:bg-white/5"
            >

              {t("anuleaza2")}
            </button>
            <button
              type="button"
              onClick={onSchedule}
              disabled={submitting || !scheduledAt}
              className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-sm font-bold disabled:opacity-30"
            >
              {submitting ? t("seProgrameaza") : t("confirmaUpl")}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 pt-2">
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={submitting}
          className="h-12 rounded-xl border border-white/15 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-white/5 disabled:opacity-30"
        >
          <Save size={14} />  {t("schita")}
        </button>
        <button
          type="button"
          onClick={() => setScheduleOpen(!scheduleOpen)}
          disabled={submitting}
          className="h-12 rounded-xl border border-white/15 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-white/5 disabled:opacity-30"
        >
          <Calendar size={14} />  {t("programeaza")}
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={submitting}
          className="h-12 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#A855F7] text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-30 active:scale-[0.98] transition-transform shadow-lg shadow-[#7C3AED]/30"
        >
          <Sparkles size={14} />  {t("publica")}
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between px-4 py-3 cursor-pointer">
      <span className="text-sm font-medium text-white/80">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors ${value ? "bg-gradient-to-r from-[#7C3AED] to-[#A855F7]" : "bg-white/15"
          }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${value ? "translate-x-5" : ""
            }`}
        />
      </button>
    </label>
  );
}
