"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Square, RotateCcw, Check, X } from "lucide-react";
import { haptic } from "@/lib/haptic";

type Phase = "init" | "ready" | "recording" | "preview" | "uploading" | "denied" | "error";

export default function RecordPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [phase, setPhase] = useState<Phase>("init");
  const [errMsg, setErrMsg] = useState<string>("");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPhase("ready");
      } catch (e: any) {
        if (e?.name === "NotAllowedError") setPhase("denied");
        else {
          setErrMsg(e?.message || "Camera indisponibilă");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickMime(): string {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    for (const c of candidates) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
    return "";
  }

  function startRec() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mimeType = pickMime();
    const rec = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      setRecordedBlob(blob);
      setBlobUrl(url);
      setPhase("preview");
      haptic("success");
    };
    recorderRef.current = rec;
    rec.start();
    setPhase("recording");
    haptic("tap");
  }

  function stopRec() {
    recorderRef.current?.stop();
  }

  function retry() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setRecordedBlob(null);
    setPhase("ready");
  }

  async function continueUpload() {
    if (!recordedBlob) return;
    setPhase("uploading");
    try {
      const sessRes = await fetch("/api/upload/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: recordedBlob.type, size: recordedBlob.size }) });
      if (!sessRes.ok) throw new Error("Sesiune upload eșuată (" + sessRes.status + ")");
      const sess = await sessRes.json();
      if (sess?.uploadUrl) {
        const put = await fetch(sess.uploadUrl, { method: "PUT", body: recordedBlob, headers: { "Content-Type": recordedBlob.type } });
        if (!put.ok) throw new Error("Upload eșuat (" + put.status + ")");
      }
      router.push(sess?.continueUrl || "/account?upload=ok");
    } catch (e: any) {
      setErrMsg(e?.message || "Eroare la upload");
      setPhase("error");
    }
  }

  if (phase === "denied")
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-6 text-center">
        <Camera size={48} className="mb-4 opacity-60" />
        <h1 className="text-xl font-bold mb-2">Avem nevoie de camera</h1>
        <p className="text-sm opacity-80 mb-6">Activează permisiunile camerei și microfonului din setările browser-ului.</p>
        <button onClick={() => router.push("/")} className="px-5 py-2 rounded-full bg-white text-black font-semibold">Înapoi acasă</button>
      </main>
    );

  return (
    <main className="fixed inset-0 bg-black text-white flex flex-col">
      <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 w-full h-full object-cover ${phase === "preview" ? "hidden" : ""}`} />
      {blobUrl && phase === "preview" && (
        <video src={blobUrl} controls autoPlay loop playsInline className="absolute inset-0 w-full h-full object-cover" />
      )}

      <div className="relative z-10 flex items-center justify-between p-4">
        <button onClick={() => router.back()} aria-label="Închide" className="w-10 h-10 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
          <X size={22} />
        </button>
        {phase === "recording" && <span className="px-3 py-1 rounded-full bg-red-600 text-xs font-bold animate-pulse">REC</span>}
      </div>

      <div className="relative z-10 mt-auto p-6 pb-10 flex items-center justify-center gap-8" style={{ paddingBottom: "max(40px, calc(env(safe-area-inset-bottom) + 24px))" }}>
        {phase === "ready" && (
          <button onClick={startRec} aria-label="Înregistrează" className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition">
            <span className="w-14 h-14 rounded-full bg-red-600" />
          </button>
        )}
        {phase === "recording" && (
          <button onClick={stopRec} aria-label="Stop" className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition">
            <Square size={36} className="text-red-600 fill-red-600" />
          </button>
        )}
        {phase === "preview" && (
          <>
            <button onClick={retry} aria-label="Reia" className="w-14 h-14 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
              <RotateCcw size={22} />
            </button>
            <button onClick={continueUpload} aria-label="Continuă" className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center active:scale-95 transition">
              <Check size={36} strokeWidth={3} />
            </button>
          </>
        )}
        {phase === "uploading" && <span className="text-sm">Se încarcă…</span>}
        {phase === "error" && <span className="text-sm text-red-400">{errMsg}</span>}
      </div>
    </main>
  );
}
