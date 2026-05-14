/**
 * Upload pentru un Reel înregistrat în browser.
 * Folosește implementarea resumable (multipart S3) când fișierul depășește
 * pragul de 8MB; altfel face un single PUT prin presigned URL.
 *
 * Persistă blob-ul în IndexedDB cu cheia = sessionId pentru a permite
 * reluarea uploadului după reload/crash. Se șterge la succes.
 */

import { uploadReelResumable, markBlobInIdb } from "./resumable-upload";
import { saveBlob, deleteBlob } from "./blob-store";

export interface UploadReelMeta {
  description?: string;
  productUrl?: string;
  audioTrackId?: number;
}

export interface UploadReelResult {
  videoId: string;
  sessionId: string;
}

export async function uploadReel(
  blob: Blob,
  meta: UploadReelMeta,
  onProgress: (pct: number) => void,
  onSessionCreated?: (sessionId: string) => void,
): Promise<UploadReelResult> {
  if (!blob || blob.size === 0) {
    throw new Error("Clipul este gol.");
  }

  const result = await uploadReelResumable(
    blob,
    {
      description: meta.description,
      productUrl: meta.productUrl,
      audioTrackId: meta.audioTrackId,
    },
    onProgress,
    {
      onSessionCreated: async (sessionId) => {
        if (onSessionCreated) {
          try {
            onSessionCreated(sessionId);
          } catch {
            /* ignore */
          }
        }
        try {
          await saveBlob(sessionId, blob);
        } catch {
          /* IDB indisponibil — marchează flag-ul ca să nu afișăm "Reia" */
          try {
            markBlobInIdb(sessionId, false);
          } catch {
            /* ignore */
          }
        }
      },
    },
  );

  // La succes, eliberează blob-ul din IDB
  try {
    await deleteBlob(result.sessionId);
  } catch {
    /* ignore */
  }

  return result;
}
