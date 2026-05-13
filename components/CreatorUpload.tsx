"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Loader2, Upload, X } from "lucide-react";

type UploadStatus = "idle" | "uploading" | "ready" | "error";

type Props = {
  className?: string;
};

export default function CreatorUpload({ className = "" }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [productId, setProductId] = useState("");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState("");
  const creatorId = "web-creator";

  const close = () => {
    setOpen(false);
    setStatus("idle");
    setMessage("");
  };

  const submitUpload = async () => {
    const numericProductId = Number(productId);
    if (!file) {
      setStatus("error");
      setMessage("Choose a video file.");
      return;
    }
    if (!Number.isFinite(numericProductId) || numericProductId <= 0) {
      setStatus("error");
      setMessage("Product ID is required.");
      return;
    }

    setStatus("uploading");
    setMessage("");

    try {
      const initRes = await fetch("/api/v1/videos/uploads/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || "video/mp4",
          size_bytes: file.size,
          product_id: String(numericProductId),
          creator_id: creatorId,
        }),
      });
      const initData = await initRes.json().catch(() => ({}));
      if (!initRes.ok) throw new Error(initData?.error?.message || initData?.error || "Upload init failed.");

      const uploadHeaders = new Headers(initData.headers || {});
      if (!uploadHeaders.has("Content-Type")) uploadHeaders.set("Content-Type", file.type || "video/mp4");

      const mediaRes = await fetch(String(initData.upload_url), {
        method: String(initData.method || "PUT"),
        headers: uploadHeaders,
        body: file,
      });
      if (!mediaRes.ok) throw new Error("Media upload failed.");

      const completeRes = await fetch("/api/v1/videos/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_id: initData.upload_id,
          video_url: String(initData.video_url || initData.public_url || initData.upload_url),
          creator_id: creatorId,
        }),
      });
      const completeData = await completeRes.json().catch(() => ({}));
      if (!completeRes.ok) {
        throw new Error(completeData?.error?.message || completeData?.error || "Upload complete failed.");
      }

      setStatus("ready");
      setMessage("Video saved.");
      setFile(null);
      setProductId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || "Upload failed.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`rounded-full bg-black/50 p-2.5 text-white backdrop-blur-sm active:scale-90 transition-transform ${className}`}
        style={{ touchAction: "manipulation" }}
        aria-label="Upload video"
      >
        <Upload size={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 px-3 pb-3">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-black text-[#0D0D0D]">Creator upload</h3>
              <button
                type="button"
                onClick={close}
                className="rounded-full bg-[#F7F7F8] p-2 text-[#6E6E80]"
                style={{ touchAction: "manipulation" }}
                aria-label="Close upload"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase text-[#6E6E80]">
                Product ID
                <input
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                  inputMode="numeric"
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-3 py-3 text-sm font-bold text-[#0D0D0D] outline-none focus:border-[#10A37F]"
                />
              </label>

              <label className="block text-xs font-bold uppercase text-[#6E6E80]">
                Video
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-3 py-3 text-sm font-bold text-[#0D0D0D] file:mr-3 file:rounded-lg file:border-0 file:bg-[#0D0D0D] file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
                />
              </label>

              {message && (
                <p className={`text-sm font-bold ${status === "error" ? "text-[#EF4444]" : "text-[#10A37F]"}`}>
                  {message}
                </p>
              )}

              <button
                type="button"
                onClick={submitUpload}
                disabled={status === "uploading"}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#10A37F] py-3 text-sm font-black text-white disabled:opacity-60"
                style={{ touchAction: "manipulation" }}
              >
                {status === "uploading" ? <Loader2 size={16} className="animate-spin" /> : status === "ready" ? <CheckCircle2 size={16} /> : <Upload size={16} />}
                {status === "uploading" ? "Uploading" : status === "ready" ? "Ready" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
