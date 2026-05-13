"use client";

import { useState, useRef } from "react";
import { Video, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

const ADMIN_CREATOR_ID =
  process.env.NEXT_PUBLIC_ADMIN_CREATOR_ID || "00000000-0000-4000-8000-000000000001";

export default function VideoUploader({ productId }: { productId: string }) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setError("Please select a valid video file.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(false);
    setProgress(10);

    try {
      // 1. Init Upload via Go API
      const initRes = await fetch("/api/v1/videos/uploads/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creator_id: ADMIN_CREATOR_ID,
          product_id: productId,
          filename: file.name,
          content_type: file.type,
          size_bytes: file.size,
          checksum_sha: "", // Could generate SHA-256 on client, but omitting for now
          original_name: file.name,
        }),
      });

      if (!initRes.ok) throw new Error("Failed to initialize upload.");
      const { upload_id, upload_url, method, headers } = await initRes.json();
      setProgress(30);

      // 2. Upload directly to S3/R2 presigned URL
      const uploadRes = await fetch(upload_url, {
        method,
        headers: {
          ...headers,
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadRes.ok) throw new Error("Failed to upload video to storage.");
      setProgress(80);

      // 3. Complete Upload via Go API
      const completeRes = await fetch("/api/v1/videos/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_id,
          creator_id: ADMIN_CREATOR_ID,
        }),
      });

      if (!completeRes.ok) throw new Error("Failed to finalize video processing.");
      setProgress(100);
      setSuccess(true);
      
      // Refresh the page to show the uploaded video state
      setTimeout(() => {
        router.refresh();
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unknown error occurred.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="w-full mt-2">
      <input 
        type="file" 
        accept="video/mp4,video/quicktime,video/webm" 
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      
      {!isUploading && !success && (
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:border-orange-500 hover:text-orange-600 transition-colors flex items-center justify-center gap-2"
        >
          <Video className="w-4 h-4" /> Upload New Video
        </button>
      )}

      {isUploading && (
        <div className="w-full p-4 rounded-xl border border-blue-200 bg-blue-50">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            <span className="text-sm font-bold text-blue-900">Uploading video...</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-2 p-3 rounded-xl border border-red-200 bg-red-50 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="w-full py-3 rounded-xl border border-neutral-100 bg-neutral-100 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-neutral-900" />
          <span className="text-sm font-bold text-neutral-900">Upload complete! Processing...</span>
        </div>
      )}
    </div>
  );
}
