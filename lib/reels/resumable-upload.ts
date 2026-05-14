/**
 * Resumable upload client folosind S3 multipart prin endpoint-urile
 * /api/creator/upload-session (POST init multipart, GET ?action=part, PATCH complete/abort).
 *
 * Persistă starea în localStorage sub cheia `swypik:reel-upload:{sessionId}`
 * pentru a putea relua upload-ul după un refresh sau o pierdere de conexiune.
 */

export interface ResumableUploadMeta {
  description?: string;
  productUrl?: string;
  filename?: string;
  audioTrackId?: number;
}

export interface ResumableUploadResult {
  videoId: string;
  sessionId: string;
}

export interface ResumableUploadOptions {
  signal?: AbortSignal;
  concurrency?: number;
  onSessionCreated?: (sessionId: string) => void | Promise<void>;
}

export interface PendingUploadState {
  sessionId: string;
  videoId: string;
  objectKey: string;
  multipartUploadId: string;
  partSize: number;
  totalParts: number;
  blobSize: number;
  blobType: string;
  uploadedParts: Record<string, string>; // partNumber -> etag
  createdAt: number;
  blobInIdb?: boolean;
}

const PART_SIZE_DEFAULT = 8 * 1024 * 1024; // 8MB
const MULTIPART_THRESHOLD = 8 * 1024 * 1024;
const CONCURRENCY_DEFAULT = 3;
const MAX_RETRIES = 3;
const LS_PREFIX = "swypik:reel-upload:";

function lsKey(sessionId: string): string {
  return `${LS_PREFIX}${sessionId}`;
}

function loadState(sessionId: string): PendingUploadState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(lsKey(sessionId));
    return raw ? (JSON.parse(raw) as PendingUploadState) : null;
  } catch {
    return null;
  }
}

function saveState(state: PendingUploadState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lsKey(state.sessionId), JSON.stringify(state));
  } catch {
    /* quota — ignore */
  }
}

function deleteState(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(lsKey(sessionId));
  } catch {
    /* ignore */
  }
}

export function markBlobInIdb(sessionId: string, value: boolean): void {
  const state = loadState(sessionId);
  if (!state) return;
  state.blobInIdb = value;
  saveState(state);
}

export function listPendingReelUploads(): PendingUploadState[] {
  if (typeof window === "undefined") return [];
  const out: PendingUploadState[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(LS_PREFIX)) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) out.push(JSON.parse(raw) as PendingUploadState);
    } catch {
      /* skip corrupt */
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

function extFromMime(type: string): string {
  if (type.includes("mp4")) return "mp4";
  if (type.includes("webm")) return "webm";
  return "bin";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

interface InitMultipartResponse {
  sessionId: string;
  videoId: string;
  assetId: string;
  objectKey: string;
  bucket: string;
  multipartUploadId: string;
  partSize: number;
  expiresAt?: string;
  multipart: true;
}

interface SinglePutResponse {
  uploadUrl: string;
  sessionId: string;
  videoId: string;
  method?: string;
  headers?: Record<string, string>;
  multipart?: false;
}

async function initSession(
  blob: Blob,
  meta: ResumableUploadMeta,
  multipart: boolean,
  signal?: AbortSignal
): Promise<InitMultipartResponse | SinglePutResponse> {
  const ext = extFromMime(blob.type || "video/webm");
  const filename = meta.filename || `reel-${Date.now()}.${ext}`;
  const contentType = blob.type || "video/webm";
  const res = await fetch("/api/creator/upload-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal,
    body: JSON.stringify({
      filename,
      contentType,
      sizeBytes: blob.size,
      description: meta.description,
      productRefs: meta.productUrl ? [{ url: meta.productUrl }] : [],
      audioTrackId: meta.audioTrackId,
      multipart,
      metadata: {
        source: "reels-recorder",
        recorder_version: 2,
      },
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(data.error || "Eroare la crearea sesiunii de upload."));
  }
  return data as unknown as InitMultipartResponse | SinglePutResponse;
}

async function getPresignedPartUrl(
  sessionId: string,
  partNumber: number,
  signal?: AbortSignal
): Promise<string> {
  const url = `/api/creator/upload-session?id=${encodeURIComponent(sessionId)}&action=part&partNumber=${partNumber}`;
  const res = await fetch(url, { credentials: "include", signal });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error || `Nu am putut obține URL pentru partea ${partNumber}.`);
  }
  return data.url;
}

class PartUploadError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

function putPart(url: string, chunk: Blob, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    try {
      xhr.setRequestHeader("Content-Type", chunk.type || "application/octet-stream");
    } catch {
      /* ignore */
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag") || xhr.getResponseHeader("etag");
        if (!etag) {
          reject(new PartUploadError("ETag lipsă în răspunsul de la storage.", false));
          return;
        }
        // Trimite ETag-ul exact cum vine de la R2/S3 (cu quotes).
        // Serverul normalizează la formatul corect înainte de CompleteMultipartUpload.
        resolve(etag);
      } else if (xhr.status >= 500) {
        reject(new PartUploadError(`Server error ${xhr.status}`, true));
      } else {
        reject(new PartUploadError(`HTTP ${xhr.status}`, false));
      }
    };
    xhr.onerror = () => reject(new PartUploadError("Eroare de rețea.", true));
    xhr.ontimeout = () => reject(new PartUploadError("Timeout.", true));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(chunk);
  });
}

async function uploadPartWithRetry(
  sessionId: string,
  partNumber: number,
  chunk: Blob,
  signal?: AbortSignal
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const url = await getPresignedPartUrl(sessionId, partNumber, signal);
      const etag = await putPart(url, chunk, signal);
      return etag;
    } catch (err) {
      lastErr = err;
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      if (err instanceof PartUploadError && !err.retryable) {
        throw new Error(`Partea ${partNumber} a eșuat: ${err.message}`);
      }
      if (attempt < MAX_RETRIES - 1) {
        const backoff = 1000 * Math.pow(2, attempt) + Math.random() * 500;
        await sleep(backoff, signal);
      }
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`Partea ${partNumber} a eșuat după ${MAX_RETRIES} încercări: ${msg}`);
}

async function completeSession(
  sessionId: string,
  parts: Array<{ partNumber: number; etag: string }>,
  signal?: AbortSignal
): Promise<{ videoId?: string }> {
  const res = await fetch(
    `/api/creator/upload-session?id=${encodeURIComponent(sessionId)}&action=complete`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      signal,
      body: JSON.stringify({ parts }),
    }
  );
  const data = (await res.json().catch(() => ({}))) as { videoId?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || "Eroare la finalizarea uploadului.");
  }
  return data;
}

export async function cancelReelUpload(sessionId: string): Promise<void> {
  try {
    await fetch(
      `/api/creator/upload-session?id=${encodeURIComponent(sessionId)}&action=abort`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      }
    );
  } catch {
    /* best effort */
  }
  deleteState(sessionId);
}

async function singlePutUpload(
  blob: Blob,
  session: SinglePutResponse,
  onProgress: (pct: number) => void,
  signal?: AbortSignal
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const method = (session.method || "PUT").toUpperCase();
    xhr.open(method, session.uploadUrl, true);
    const headers = session.headers || {};
    for (const [k, v] of Object.entries(headers)) {
      try {
        xhr.setRequestHeader(k, v);
      } catch {
        /* ignore */
      }
    }
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
      try {
        xhr.setRequestHeader("Content-Type", blob.type || "application/octet-stream");
      } catch {
        /* ignore */
      }
    }
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        onProgress(Math.min(99, Math.round((evt.loaded / evt.total) * 99)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload eșuat (HTTP ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Eroare de rețea la upload."));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(blob);
  });
}

async function runUploadFromState(
  blob: Blob,
  state: PendingUploadState,
  onProgress: (pct: number) => void,
  options: ResumableUploadOptions
): Promise<ResumableUploadResult> {
  const { partSize, totalParts, sessionId } = state;
  const totalBytes = blob.size;
  const concurrency = Math.max(1, options.concurrency ?? CONCURRENCY_DEFAULT);
  const signal = options.signal;

  // Calculează bytes deja încărcați
  let uploadedBytes = 0;
  for (let i = 1; i <= totalParts; i++) {
    if (state.uploadedParts[String(i)]) {
      const isLast = i === totalParts;
      uploadedBytes += isLast ? totalBytes - (totalParts - 1) * partSize : partSize;
    }
  }
  const reportProgress = () => {
    const pct = Math.min(99, Math.floor((uploadedBytes / totalBytes) * 99));
    onProgress(pct);
  };
  reportProgress();

  // Coadă de părți rămase
  const pendingParts: number[] = [];
  for (let i = 1; i <= totalParts; i++) {
    if (!state.uploadedParts[String(i)]) pendingParts.push(i);
  }

  let nextIdx = 0;
  let failure: Error | null = null;

  async function worker() {
    while (true) {
      if (failure || signal?.aborted) return;
      const idx = nextIdx++;
      if (idx >= pendingParts.length) return;
      const partNumber = pendingParts[idx];
      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, totalBytes);
      const chunk = blob.slice(start, end);
      try {
        const etag = await uploadPartWithRetry(sessionId, partNumber, chunk, signal);
        state.uploadedParts[String(partNumber)] = etag;
        saveState(state);
        uploadedBytes += end - start;
        reportProgress();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!failure) failure = err instanceof Error ? err : new Error(String(err));
        return;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, pendingParts.length || 1) }, () => worker());
  await Promise.all(workers);

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  if (failure) {
    throw failure;
  }

  // Finalizează
  const partsList = Object.entries(state.uploadedParts)
    .map(([k, etag]) => ({ partNumber: Number(k), etag }))
    .sort((a, b) => a.partNumber - b.partNumber);

  const result = await completeSession(sessionId, partsList, signal);
  onProgress(100);
  deleteState(sessionId);

  return {
    videoId: result.videoId || state.videoId,
    sessionId: state.sessionId,
  };
}

export async function uploadReelResumable(
  blob: Blob,
  meta: ResumableUploadMeta,
  onProgress: (pct: number) => void,
  options: ResumableUploadOptions = {}
): Promise<ResumableUploadResult> {
  if (!blob || blob.size === 0) {
    throw new Error("Clipul este gol.");
  }

  const useMultipart = blob.size > MULTIPART_THRESHOLD;
  onProgress(1);

  const session = await initSession(blob, meta, useMultipart, options.signal);

  if (!useMultipart || (session as { multipart?: boolean }).multipart !== true) {
    const single = session as SinglePutResponse;
    if (options.onSessionCreated) {
      await options.onSessionCreated(single.sessionId);
    }
    await singlePutUpload(blob, single, onProgress, options.signal);
    const completed = await completeSession(single.sessionId, [], options.signal);
    onProgress(100);
    return {
      videoId: completed.videoId || single.videoId,
      sessionId: single.sessionId,
    };
  }

  const multi = session as InitMultipartResponse;
  const partSize = multi.partSize || PART_SIZE_DEFAULT;
  const totalParts = Math.ceil(blob.size / partSize);

  const state: PendingUploadState = {
    sessionId: multi.sessionId,
    videoId: multi.videoId,
    objectKey: multi.objectKey,
    multipartUploadId: multi.multipartUploadId,
    partSize,
    totalParts,
    blobSize: blob.size,
    blobType: blob.type || "video/webm",
    uploadedParts: {},
    createdAt: Date.now(),
    blobInIdb: true,
  };
  saveState(state);

  if (options.onSessionCreated) {
    await options.onSessionCreated(state.sessionId);
  }

  return runUploadFromState(blob, state, onProgress, options);
}

export async function resumeReelUpload(
  sessionId: string,
  blob: Blob,
  onProgress: (pct: number) => void,
  options: ResumableUploadOptions = {}
): Promise<ResumableUploadResult> {
  const state = loadState(sessionId);
  if (!state) {
    throw new Error("Nu există stare salvată pentru acest upload.");
  }
  if (state.blobSize !== blob.size) {
    throw new Error(
      `Fișierul nu corespunde uploadului salvat (${blob.size} vs ${state.blobSize} octeți).`
    );
  }
  return runUploadFromState(blob, state, onProgress, options);
}
