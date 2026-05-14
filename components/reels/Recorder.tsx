"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, SwitchCamera, Loader2, Sparkles, Timer, Music } from "lucide-react";
import { useCamera } from "@/lib/reels/use-camera";
import { useRecorder } from "@/lib/reels/use-recorder";
import { uploadReel } from "@/lib/reels/upload-reel";
import {
  listPendingReelUploads,
  resumeReelUpload,
  cancelReelUpload,
  type PendingUploadState,
} from "@/lib/reels/resumable-upload";
import { loadBlob, deleteBlob } from "@/lib/reels/blob-store";
import { FILTER_PRESETS, getFilter, type FilterId } from "@/lib/reels/filters";
import { createFilteredStream } from "@/lib/reels/canvas-pipeline";
import AudioPicker, { type AudioTrackDTO } from "@/components/reels/AudioPicker";

const MAX_DURATION_MS = 60_000; // 60s pentru MVP
const COUNTDOWN_OPTIONS = [0, 3, 10] as const;
type CountdownSec = (typeof COUNTDOWN_OPTIONS)[number];

type Phase = "capture" | "meta" | "uploading" | "done";

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function Recorder() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  const [phase, setPhase] = useState<Phase>("capture");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [audioTrack, setAudioTrack] = useState<AudioTrackDTO | null>(null);
  const [showAudioPicker, setShowAudioPicker] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<PendingUploadState[]>([]);
  const activeUploadSessionRef = useRef<string | null>(null);

  // M3: filter + countdown duration
  const [filterId, setFilterId] = useState<FilterId>("none");
  const [countdownSec, setCountdownSec] = useState<CountdownSec>(3);
  const [showFilters, setShowFilters] = useState(false);
  const pipelineRef = useRef<{ stop: () => void } | null>(null);

  const camera = useCamera({ facing: "user" });

  const filterCss = useMemo(() => getFilter(filterId).css, [filterId]);

  // Stream override pentru recorder: dacă filter != none, bake-uim via canvas
  const getRecordingStream = useCallback(
    (cam: MediaStream): MediaStream => {
      // cleanup pipeline anterior (idempotent)
      if (pipelineRef.current) {
        try {
          pipelineRef.current.stop();
        } catch {
          /* ignore */
        }
        pipelineRef.current = null;
      }
      if (filterId === "none") return cam;
      try {
        const p = createFilteredStream(cam, filterCss, 30);
        pipelineRef.current = { stop: p.stop };
        return p.outputStream;
      } catch {
        // fallback la stream-ul brut dacă canvas pipeline pică
        return cam;
      }
    },
    [filterId, filterCss],
  );

  // cleanup pipeline când componenta se demontează
  useEffect(() => {
    return () => {
      if (pipelineRef.current) {
        try {
          pipelineRef.current.stop();
        } catch {
          /* ignore */
        }
        pipelineRef.current = null;
      }
    };
  }, []);

  const handleComplete = useCallback((b: Blob) => {
    setBlob(b);
    const url = URL.createObjectURL(b);
    setPreviewUrl(url);
    // pipeline-ul canvas nu mai e necesar după ce avem blob-ul final
    if (pipelineRef.current) {
      try {
        pipelineRef.current.stop();
      } catch {
        /* ignore */
      }
      pipelineRef.current = null;
    }
  }, []);

  const recorder = useRecorder(camera.stream, {
    maxDurationMs: MAX_DURATION_MS,
    onComplete: handleComplete,
    getRecordingStream,
    countdownSeconds: countdownSec,
  });

  // attach live preview
  useEffect(() => {
    if (phase === "capture" && videoRef.current) {
      camera.attachVideo(videoRef.current);
    }
  }, [phase, camera]);

  // cleanup blob URL
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // disable body scroll while mounted
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // detectează upload-uri neterminate la mount
  useEffect(() => {
    setPendingUploads(listPendingReelUploads());
  }, []);

  const handleResumeUpload = useCallback(async (sessionId: string) => {
    setErrorMsg(null);
    let savedBlob: Blob | null = null;
    try {
      savedBlob = await loadBlob(sessionId);
    } catch {
      savedBlob = null;
    }
    if (!savedBlob) {
      setErrorMsg(
        "Fișierul original nu mai este disponibil. Te rugăm să anulezi acest upload.",
      );
      return;
    }
    setPhase("uploading");
    setUploadPct(0);
    try {
      await resumeReelUpload(sessionId, savedBlob, (pct) => setUploadPct(pct));
      await deleteBlob(sessionId).catch(() => undefined);
      setPendingUploads((prev) => prev.filter((p) => p.sessionId !== sessionId));
      setPhase("done");
      setTimeout(() => router.push("/creator"), 800);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setErrorMsg(err?.message || "Reluarea a eșuat.");
      setPhase("capture");
    }
  }, [router]);

  const handleCancelPending = useCallback(async (sessionId: string) => {
    await cancelReelUpload(sessionId);
    await deleteBlob(sessionId).catch(() => undefined);
    setPendingUploads((prev) => prev.filter((p) => p.sessionId !== sessionId));
  }, []);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const handleRecordButton = useCallback(() => {
    if (recorder.state === "idle") {
      recorder.startCountdown();
    } else if (recorder.state === "recording") {
      recorder.pause();
    } else if (recorder.state === "paused") {
      recorder.resume();
    }
  }, [recorder]);

  const handleFinalize = useCallback(() => {
    recorder.stop();
  }, [recorder]);

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null);
    setPreviewUrl(null);
    recorder.reset();
  }, [previewUrl, recorder]);

  const handleUseClip = useCallback(() => {
    setPhase("meta");
  }, []);

  const handlePublish = useCallback(async () => {
    if (!blob) return;
    setErrorMsg(null);
    setPhase("uploading");
    setUploadPct(0);
    activeUploadSessionRef.current = null;
    try {
      await uploadReel(
        blob,
        {
          description: description.trim() || undefined,
          productUrl: productUrl.trim() || undefined,
          audioTrackId: audioTrack?.id,
        },
        (pct) => setUploadPct(pct),
        (sessionId) => {
          activeUploadSessionRef.current = sessionId;
        },
      );
      activeUploadSessionRef.current = null;
      setPhase("done");
      // mic delay ca utilizatorul să vadă 100%
      setTimeout(() => router.push("/creator"), 800);
    } catch (e: unknown) {
      const err = e as { message?: string; name?: string };
      // Curăță sesiunea multipart pendentă pe R2 dacă a fost deja creată
      const sid = activeUploadSessionRef.current;
      if (sid && err?.name !== "AbortError") {
        try {
          await cancelReelUpload(sid);
        } catch {
          /* best effort */
        }
        try {
          await deleteBlob(sid);
        } catch {
          /* ignore */
        }
      }
      activeUploadSessionRef.current = null;
      setErrorMsg(err?.message || "Eroare la încărcare.");
      setPhase("meta");
    }
  }, [blob, description, productUrl, audioTrack, router]);

  // ─── DENIED / UNAVAILABLE ──────────────────────────────────
  if (camera.status === "denied" || camera.status === "unavailable") {
    return (
      <div className="fixed inset-0 z-[60] bg-black text-white flex flex-col items-center justify-center px-6 text-center">
        <button
          onClick={handleClose}
          aria-label="Închide"
          className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center rounded-full bg-white/10"
        >
          <X size={22} />
        </button>
        <div className="max-w-sm space-y-4">
          <h1 className="text-xl font-bold">
            {camera.status === "denied"
              ? "Acces cameră refuzat"
              : "Camera indisponibilă"}
          </h1>
          <p className="text-white/70 text-sm">
            {camera.status === "denied"
              ? "Activează permisiunea pentru cameră și microfon din setările browserului, apoi reîncearcă."
              : camera.error ||
                "Nu am putut accesa o cameră compatibilă pe acest dispozitiv."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-white text-black font-bold py-3 rounded-2xl"
          >
            Reîncearcă
          </button>
        </div>
      </div>
    );
  }

  // ─── META STEP ──────────────────────────────────────────────
  if (phase === "meta") {
    return (
      <div className="fixed inset-0 z-[60] bg-black text-white overflow-y-auto">
        <div className="sticky top-0 h-12 px-3 flex items-center justify-between bg-black/80 backdrop-blur-xl border-b border-white/10">
          <button
            onClick={() => setPhase("capture")}
            aria-label="Înapoi"
            className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10"
          >
            <X size={20} />
          </button>
          <span className="text-sm font-bold">Detalii Reel</span>
          <span className="w-11" />
        </div>

        <div className="max-w-md mx-auto p-4 space-y-5 pb-32">
          {previewUrl && (
            <div className="relative aspect-[9/16] w-full max-w-[260px] mx-auto bg-black rounded-2xl overflow-hidden border border-white/10">
              <video
                src={previewUrl}
                className="w-full h-full object-cover"
                playsInline
                loop
                muted
                autoPlay
              />
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3 rounded-xl">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-white/60 mb-1.5 block uppercase tracking-wider">
              Descriere
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 280))}
              rows={3}
              maxLength={280}
              placeholder="Spune ceva despre clipul tău..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-white/30 resize-none"
            />
            <div className="text-right text-[11px] text-white/40 mt-1">
              {description.length}/280
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-white/60 mb-1.5 block uppercase tracking-wider">
              Link produs (opțional)
            </label>
            <input
              type="url"
              inputMode="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://swypik.com/product/..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-white/30"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-white/60 mb-1.5 block uppercase tracking-wider">
              Piesă (opțional)
            </label>
            <button
              type="button"
              onClick={() => setShowAudioPicker(true)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm flex items-center gap-3 active:scale-[0.99] transition text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {audioTrack?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={audioTrack.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music size={18} className="text-white/60" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                {audioTrack ? (
                  <>
                    <div className="text-sm font-bold truncate">{audioTrack.title}</div>
                    <div className="text-[11px] text-white/50 truncate">{audioTrack.artist}</div>
                  </>
                ) : (
                  <div className="text-sm text-white/60">Adaugă o piesă</div>
                )}
              </div>
              <span className="text-[11px] font-bold text-white/40">
                {audioTrack ? "Schimbă" : "Alege"}
              </span>
            </button>
            {audioTrack?.attributionUrl && (
              <div className="text-[10px] text-white/30 mt-1.5">
                Sursă:{" "}
                <a
                  href={audioTrack.attributionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Jamendo
                </a>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleRetake}
              className="flex-1 border border-white/30 text-white font-bold py-3.5 rounded-2xl active:scale-95 transition"
            >
              Refilmează
            </button>
            <button
              onClick={handlePublish}
              className="flex-1 bg-white text-black font-bold py-3.5 rounded-2xl active:scale-95 transition"
            >
              Publică
            </button>
          </div>
        </div>

        <AudioPicker
          open={showAudioPicker}
          onClose={() => setShowAudioPicker(false)}
          selectedId={audioTrack?.id ?? null}
          onSelect={(t) => setAudioTrack(t)}
        />
      </div>
    );
  }

  // ─── UPLOADING / DONE ───────────────────────────────────────
  if (phase === "uploading" || phase === "done") {
    return (
      <div className="fixed inset-0 z-[60] bg-black">
        <UploadingOverlay pct={uploadPct} done={phase === "done"} />
      </div>
    );
  }

  // ─── CAPTURE ───────────────────────────────────────────────
  const isPreview = recorder.state === "preview" && previewUrl;
  const isRecording = recorder.state === "recording";
  const isPaused = recorder.state === "paused";
  const isCountdown = recorder.state === "countdown";
  const isIdle = recorder.state === "idle";
  const progressPct = (isRecording || isPaused)
    ? Math.min(100, (recorder.elapsedMs / MAX_DURATION_MS) * 100)
    : 0;
  const hasContent = recorder.elapsedMs > 0 && (isRecording || isPaused);

  return (
    <div className="fixed inset-0 z-[60] bg-black text-white overflow-hidden">
      {/* video layer */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-full h-full max-h-screen aspect-[9/16] mx-auto">
          {isPreview ? (
            <video
              ref={previewVideoRef}
              src={previewUrl || undefined}
              className="absolute inset-0 w-full h-full object-cover bg-black"
              playsInline
              loop
              autoPlay
              controls
            />
          ) : (
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover bg-black"
              autoPlay
              playsInline
              muted
              style={{ filter: filterCss }}
            />
          )}
        </div>
      </div>

      {/* countdown overlay */}
      {isCountdown && recorder.countdownValue > 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-white text-9xl font-black drop-shadow-2xl">
            {recorder.countdownValue}
          </span>
        </div>
      )}

      {/* banner upload neterminat */}
      {pendingUploads.length > 0 && isIdle && !isRecording && !isCountdown && !isPreview && (
        <div className="absolute top-14 inset-x-3 z-20 bg-yellow-500/15 border border-yellow-500/40 backdrop-blur-md rounded-2xl p-3 text-white text-sm">
          <div className="font-bold mb-1">Ai un upload neterminat</div>
          <div className="text-white/80 text-xs mb-2">
            {pendingUploads.length === 1
              ? "Un clip nu a fost finalizat. Vrei să reiei sau să anulezi?"
              : `${pendingUploads.length} clipuri nu au fost finalizate.`}
          </div>
          <div className="flex gap-2">
            {pendingUploads[0].blobInIdb !== false && (
              <button
                onClick={() => void handleResumeUpload(pendingUploads[0].sessionId)}
                className="flex-1 bg-white text-black font-bold py-2 rounded-xl text-xs active:scale-95"
              >
                Reia
              </button>
            )}
            <button
              onClick={() => void handleCancelPending(pendingUploads[0].sessionId)}
              className="flex-1 border border-white/40 text-white font-bold py-2 rounded-xl text-xs active:scale-95"
            >
              Anulează
            </button>
          </div>
        </div>
      )}

      {/* top bar */}
      <div className="absolute top-0 inset-x-0 h-12 px-3 flex items-center justify-between z-10"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <button
          onClick={handleClose}
          aria-label="Închide"
          className="w-11 h-11 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-md"
        >
          <X size={22} />
        </button>
        {!isPreview && !isRecording && !isCountdown && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // ciclează 0 → 3 → 10 → 0
                const idx = COUNTDOWN_OPTIONS.indexOf(countdownSec);
                const next = COUNTDOWN_OPTIONS[(idx + 1) % COUNTDOWN_OPTIONS.length];
                setCountdownSec(next);
              }}
              aria-label={`Timer ${countdownSec}s`}
              className="h-11 px-3 flex items-center gap-1.5 rounded-full bg-black/50 backdrop-blur-md text-xs font-bold"
            >
              <Timer size={18} />
              {countdownSec === 0 ? "Off" : `${countdownSec}s`}
            </button>
            <button
              onClick={() => setShowFilters((v) => !v)}
              aria-label="Filtre"
              aria-pressed={showFilters}
              className={`w-11 h-11 flex items-center justify-center rounded-full backdrop-blur-md ${
                showFilters || filterId !== "none"
                  ? "bg-white text-black"
                  : "bg-black/50 text-white"
              }`}
            >
              <Sparkles size={20} />
            </button>
            <button
              onClick={() => void camera.switchFacing()}
              aria-label="Schimbă camera"
              className="w-11 h-11 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-md"
            >
              <SwitchCamera size={22} />
            </button>
          </div>
        )}
      </div>

      {/* filter chips panel */}
      {showFilters && !isPreview && !isRecording && !isCountdown && (
        <div
          className="absolute inset-x-0 z-10 px-3"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 9rem)" }}
        >
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
            {FILTER_PRESETS.map((f) => {
              const active = f.id === filterId;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilterId(f.id)}
                  className={`shrink-0 snap-start px-3.5 h-9 rounded-full text-xs font-bold backdrop-blur-md border transition active:scale-95 ${
                    active
                      ? "bg-white text-black border-white"
                      : "bg-black/50 text-white border-white/20"
                  }`}
                  aria-pressed={active}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* timer + bottom controls */}
      {!isPreview && (
        <div className="absolute bottom-0 inset-x-0 h-36 flex flex-col items-center justify-center z-10"
          style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
        >
          {(isRecording || isPaused || isCountdown) && (
            <div className="mb-3 text-white text-sm font-mono font-bold bg-black/40 px-3 py-1 rounded-full flex items-center gap-2">
              {isPaused && (
                <span className="inline-block w-1.5 h-1.5 bg-yellow-400 rounded-full" />
              )}
              {formatTime(recorder.elapsedMs)} / {formatTime(MAX_DURATION_MS)}
            </div>
          )}

          <div className="flex items-center gap-6">
            {/* Done button — vizibil când există segmente înregistrate */}
            <div className="w-14">
              {hasContent && (
                <button
                  onClick={handleFinalize}
                  aria-label="Finalizează"
                  className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs active:scale-95"
                >
                  Gata
                </button>
              )}
            </div>

            <RecordButton
              state={recorder.state}
              countdownValue={recorder.countdownValue}
              progressPct={progressPct}
              segments={recorder.segments}
              maxMs={MAX_DURATION_MS}
              disabled={camera.status !== "ready"}
              onClick={handleRecordButton}
            />

            {/* spacer simetric */}
            <div className="w-14" />
          </div>

          {isIdle && camera.status !== "ready" && (
            <div className="mt-3 text-xs text-white/60">
              {camera.status === "requesting"
                ? "Se pregătește camera..."
                : "Cameră indisponibilă"}
            </div>
          )}
        </div>
      )}

      {/* preview controls */}
      {isPreview && (
        <div className="absolute bottom-0 inset-x-0 px-4 pb-6 pt-4 bg-gradient-to-t from-black/80 to-transparent z-10"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex gap-3 max-w-md mx-auto">
            <button
              onClick={handleRetake}
              className="flex-1 border border-white text-white font-bold py-3.5 rounded-2xl active:scale-95 transition"
            >
              Refilmează
            </button>
            <button
              onClick={handleUseClip}
              className="flex-1 bg-white text-black font-bold py-3.5 rounded-2xl active:scale-95 transition"
            >
              Folosește
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function RecordButton(props: {
  state: ReturnType<typeof useRecorder>["state"];
  countdownValue: number;
  progressPct: number;
  segments: ReturnType<typeof useRecorder>["segments"];
  maxMs: number;
  disabled: boolean;
  onClick: () => void;
}) {
  const { state, countdownValue, progressPct, segments, maxMs, disabled, onClick } = props;
  const size = 80;
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = useMemo(() => (progressPct / 100) * c, [progressPct, c]);

  const isRec = state === "recording";
  const isPaused = state === "paused";
  const isCountdown = state === "countdown";
  const showRing = isRec || isPaused;

  const ariaLabel = isRec
    ? "Pune pauză"
    : isPaused
    ? "Continuă înregistrarea"
    : "Pornește înregistrarea";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || state === "stopping"}
      aria-label={ariaLabel}
      className="relative flex items-center justify-center disabled:opacity-50"
      style={{ width: size, height: size }}
    >
      {/* progress ring + segment markers */}
      {showRing && (
        <svg
          width={size}
          height={size}
          className="absolute inset-0 -rotate-90 pointer-events-none"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={4}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={isPaused ? "#FACC15" : "#FE2C55"}
            strokeWidth={4}
            strokeDasharray={`${dash} ${c}`}
            strokeLinecap="round"
          />
          {/* segment markers — mici tick-uri albe la fiecare pause */}
          {segments.map((seg, idx) => {
            const frac = Math.min(1, seg.endMs / maxMs);
            const angle = frac * 2 * Math.PI;
            const cx = size / 2 + r * Math.cos(angle);
            const cy = size / 2 + r * Math.sin(angle);
            return (
              <circle
                key={idx}
                cx={cx}
                cy={cy}
                r={2.5}
                fill="#fff"
              />
            );
          })}
        </svg>
      )}

      {/* outline */}
      <span
        className={`absolute inset-0 rounded-full border-[3px] ${
          showRing ? "border-transparent" : "border-white"
        }`}
      />

      {/* inner */}
      {isCountdown && countdownValue > 0 ? (
        <span className="text-white font-black text-2xl">{countdownValue}</span>
      ) : isRec ? (
        <span className="w-7 h-7 bg-white rounded-md" />
      ) : isPaused ? (
        <span className="w-6 h-6 bg-[#FE2C55] rounded-full" />
      ) : (
        <span className="w-6 h-6 bg-[#FE2C55] rounded-full" />
      )}
    </button>
  );
}

function UploadingOverlay(props: { pct: number; done: boolean }) {
  const { pct, done } = props;
  const size = 120;
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center text-white">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={6}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#10A37F"
            strokeWidth={6}
            strokeDasharray={`${dash} ${c}`}
            strokeLinecap="round"
            className="transition-[stroke-dasharray] duration-200"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {done ? (
            <span className="text-3xl">✓</span>
          ) : (
            <span className="text-2xl font-black">{pct}%</span>
          )}
        </div>
      </div>
      <div className="mt-5 text-sm font-bold flex items-center gap-2">
        {!done && <Loader2 size={16} className="animate-spin" />}
        {done ? "Gata! Te ducem la dashboard..." : `Se încarcă... ${pct}%`}
      </div>
    </div>
  );
}
