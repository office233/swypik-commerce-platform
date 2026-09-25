"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadApiError, uploadApi, videoApi } from "@/lib/upload/api";
import { activeUploads } from "@/lib/upload/draft-store";
import { uploadMultipart, xhrPutPart } from "@/lib/upload/multipart-client";
import { canonicalVideoType } from "@/lib/video/limits";
import { useProcessingStatus } from "./useProcessingStatus";

export type Trim = { startMs: number | null; endMs: number | null };

export type UploadState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "uploading"; loaded: number; total: number }
  | { kind: "uploaded" }
  | { kind: "completing" }
  | { kind: "processing" }
  | { kind: "ready" }
  | { kind: "failed"; stage: "upload" | "processing"; code: string; retryable: boolean }
  | { kind: "cancelled" };

type Session = { sessionId: string; videoId: string; partSize: number; totalParts: number };

const QUEUE_RETRY_MS = 5_000;
const QUEUE_RETRIES = 6;

function errorCode(err: unknown): string {
  if (err instanceof UploadApiError) return err.code;
  if ((err as { name?: string })?.name === "PartUploadError") return "part_failed";
  return "upload_failed";
}

/**
 * Tot ciclul unui upload: sesiune → părți (progres real, retry, anulare,
 * reluare) → complete (după ce creatorul a confirmat tăierea) → procesare
 * (stare reală de la worker) → gata / eroare cu „Reîncearcă”.
 */
export function useUploadController() {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [session, setSession] = useState<Session | null>(null);
  const [trimConfirmed, setTrimConfirmed] = useState(false);
  const [pollKey, setPollKey] = useState(0);
  const fileRef = useRef<Blob | null>(null);
  const trimRef = useRef<Trim>({ startMs: null, endMs: null });
  const abortRef = useRef<AbortController | null>(null);

  const runParts = useCallback(async (s: Session, file: Blob) => {
    const ctl = new AbortController();
    abortRef.current = ctl;
    setState({ kind: "uploading", loaded: 0, total: file.size });
    try {
      await uploadMultipart(
        {
          file,
          partSize: s.partSize,
          totalParts: s.totalParts,
          signal: ctl.signal,
          onProgress: (loaded, total) => setState({ kind: "uploading", loaded, total }),
        },
        {
          signParts: (numbers) => uploadApi.signParts(s.sessionId, numbers),
          listParts: () => uploadApi.listParts(s.sessionId).then((r) => r.uploaded),
          putPart: xhrPutPart,
        },
      );
      setState({ kind: "uploaded" });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      const code = errorCode(err);
      const retryable = !["session_closed", "session_expired", "not_found"].includes(code);
      setState({ kind: "failed", stage: "upload", code, retryable });
    }
  }, []);

  const start = useCallback(
    async (file: File | Blob, source: "gallery" | "camera", name: string) => {
      fileRef.current = file;
      setTrimConfirmed(false);
      setState({ kind: "starting" });
      try {
        const created = await uploadApi.createSession({
          filename: name,
          contentType: canonicalVideoType(file.type, name),
          sizeBytes: file.size,
          source,
        });
        setSession(created);
        void activeUploads.remember(
          { sessionId: created.sessionId, videoId: created.videoId, name, size: file.size, savedAt: Date.now() },
          file,
        );
        await runParts(created, file);
        return created;
      } catch (err) {
        setState({ kind: "failed", stage: "upload", code: errorCode(err), retryable: true });
        return null;
      }
    },
    [runParts],
  );

  /** Reia o sesiune neterminată (fișierul vine din IndexedDB sau e re-ales de user). */
  const resume = useCallback(
    async (sessionId: string, videoId: string, file: Blob) => {
      fileRef.current = file;
      try {
        const parts = await uploadApi.listParts(sessionId);
        const s = { sessionId, videoId, partSize: parts.partSize, totalParts: parts.totalParts };
        setSession(s);
        await runParts(s, file);
        return s;
      } catch (err) {
        setState({ kind: "failed", stage: "upload", code: errorCode(err), retryable: false });
        return null;
      }
    },
    [runParts],
  );

  /** Deschide un clip deja urcat (draft reluat din /creator/drafts). */
  const attach = useCallback(async (sessionId: string, videoId: string) => {
    setSession({ sessionId, videoId, partSize: 0, totalParts: 0 });
    setTrimConfirmed(true);
    try {
      const s = await uploadApi.status(sessionId);
      if (s.phase === "ready") setState({ kind: "ready" });
      else if (s.phase === "failed") {
        setState({ kind: "failed", stage: "processing", code: s.errorCode ?? "internal_error", retryable: s.canRetry });
      } else if (s.phase === "uploading") setState({ kind: "failed", stage: "upload", code: "upload_incomplete", retryable: false });
      else setState({ kind: "processing" });
    } catch (err) {
      setState({ kind: "failed", stage: "processing", code: errorCode(err), retryable: false });
    }
  }, []);

  const complete = useCallback(async (s: Session) => {
    setState({ kind: "completing" });
    for (let attempt = 1; ; attempt += 1) {
      try {
        const res = await uploadApi.complete(s.sessionId, trimRef.current);
        void activeUploads.forget(s.sessionId);
        setState(res.status === "ready" ? { kind: "ready" } : { kind: "processing" });
        return;
      } catch (err) {
        const code = errorCode(err);
        if (code === "queue_unavailable" && attempt < QUEUE_RETRIES) {
          await new Promise((r) => setTimeout(r, QUEUE_RETRY_MS));
          continue;
        }
        setState({ kind: "failed", stage: "upload", code, retryable: code !== "session_closed" });
        return;
      }
    }
  }, []);

  // Procesarea pornește când fișierul e urcat ȘI creatorul a confirmat tăierea.
  useEffect(() => {
    if (state.kind === "uploaded" && trimConfirmed && session) void complete(session);
  }, [state.kind, trimConfirmed, session, complete]);

  const polling = state.kind === "processing";
  const status = useProcessingStatus(session?.sessionId ?? null, polling, pollKey);
  useEffect(() => {
    if (!polling || !status) return;
    if (status.phase === "ready") setState({ kind: "ready" });
    else if (status.phase === "failed") {
      setState({ kind: "failed", stage: "processing", code: status.errorCode ?? "internal_error", retryable: status.canRetry });
    }
  }, [polling, status]);

  const cancel = useCallback(async () => {
    abortRef.current?.abort();
    if (session) {
      await uploadApi.abort(session.sessionId).catch(() => undefined);
      void activeUploads.forget(session.sessionId);
    }
    setState({ kind: "cancelled" });
  }, [session]);

  const retry = useCallback(async () => {
    if (!session) return;
    if (state.kind === "failed" && state.stage === "processing") {
      try {
        await videoApi.reprocess(session.videoId);
        setPollKey((k) => k + 1);
        setState({ kind: "processing" });
      } catch (err) {
        setState({ kind: "failed", stage: "processing", code: errorCode(err), retryable: false });
      }
      return;
    }
    if (fileRef.current) await runParts(session, fileRef.current);
  }, [session, state, runParts]);

  const confirmTrim = useCallback((trim: Trim) => {
    trimRef.current = trim;
    setTrimConfirmed(true);
  }, []);

  // Nu lăsa userul să închidă tab-ul în mijlocul uploadului.
  const busy = state.kind === "starting" || state.kind === "uploading" || state.kind === "completing";
  useEffect(() => {
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { state, session, status, trimConfirmed, start, resume, attach, cancel, retry, confirmTrim, busy };
}

export type UploadController = ReturnType<typeof useUploadController>;
