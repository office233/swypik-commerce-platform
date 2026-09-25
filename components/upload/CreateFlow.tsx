"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "@/lib/i18n/navigation";
import { UploadApiError, pickerApi, videoApi } from "@/lib/upload/api";
import { toVideoPatch, type PublishIntent } from "@/lib/upload/details";
import { detailsDraft } from "@/lib/upload/draft-store";
import { probeVideoFile, type ProbedFile } from "@/lib/upload/media";
import { defaultTrim, trimForServer, type TrimRange } from "@/lib/upload/trim";
import { checkVideoDuration, checkVideoFile } from "@/lib/video/limits";
import { CameraCapture } from "./CameraCapture";
import { DetailsStep } from "./DetailsStep";
import { EditStep } from "./EditStep";
import { PickStep, type ResumeRequest } from "./PickStep";
import { UploadStatusCard } from "./UploadStatusCard";
import { detailsFromVideo, useDetailsForm } from "./useDetailsForm";
import { useErrorText } from "./useErrorText";
import { useUploadController } from "./useUploadController";

type Step = "pick" | "camera" | "edit" | "details";

const STEP_NUMBER: Record<Step, number> = { pick: 1, camera: 1, edit: 2, details: 3 };

/**
 * Fluxul unic de creare video (mobil întâi): alege/filmează → taie + copertă →
 * detalii → publică. Uploadul pornește imediat după alegere și rulează în
 * fundal cât creatorul editează; procesarea pornește după confirmarea tăierii.
 */
export default function CreateFlow(props: {
  initialSource: "pick" | "camera";
  draftVideoId?: string;
  missionSlug?: string;
  audioTrackId?: number;
}) {
  const t = useTranslations("videoUpload");
  const router = useRouter();
  const { toast } = useToast();
  const errorText = useErrorText();
  const upload = useUploadController();
  const [step, setStep] = useState<Step>(props.draftVideoId ? "details" : props.initialSource === "camera" ? "camera" : "pick");
  const [fromCamera, setFromCamera] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbedFile | null>(null);
  const [trim, setTrim] = useState<TrimRange | null>(null);
  const [cover, setCover] = useState<{ blob: Blob; url: string } | null>(null);
  const [serverCover, setServerCover] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<PublishIntent | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const coverSent = useRef<Blob | null>(null);
  const videoId = upload.session?.videoId ?? props.draftVideoId ?? null;
  const form = useDetailsForm(videoId, {
    ...(props.missionSlug ? { missionSlug: props.missionSlug } : {}),
    ...(props.audioTrackId ? { audioTrackId: props.audioTrackId } : {}),
  });

  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);

  // Draft reluat din /creator/drafts: detaliile și starea vin de pe server.
  useEffect(() => {
    if (!props.draftVideoId) return;
    videoApi
      .get(props.draftVideoId)
      .then((v) => {
        if (!detailsDraft.load(v.id)) form.replace(detailsFromVideo(v));
        setServerCover(v.thumbnail_url);
        if (v.session_id) void upload.attach(v.session_id, v.id);
      })
      .catch(() => toast({ title: errorText("not_found"), tone: "danger" }));
  }, [props.draftVideoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = useCallback(
    async (file: Blob, name: string, source: "gallery" | "camera") => {
      const problem = checkVideoFile({ name, type: file.type, size: file.size });
      if (problem) return setPickError(errorText(problem === "too_large" ? "file_too_large" : problem === "empty" ? "file_empty" : "unsupported_type"));
      const probed = await probeVideoFile(file);
      if (probed && checkVideoDuration(probed.durationMs) === "too_short") return setPickError(errorText("duration_too_short"));
      setPickError(null);
      setPreviewUrl(URL.createObjectURL(file));
      setProbe(probed);
      setTrim(probed ? defaultTrim(probed.durationMs) : null);
      setFromCamera(source === "camera");
      setStep("edit");
      void upload.start(file, source, name);
    },
    [upload, errorText],
  );

  const resume = useCallback(
    async (req: ResumeRequest) => {
      if (!req.file) return setPickError(t("pick.resumeNeedsFile"));
      setPreviewUrl(URL.createObjectURL(req.file));
      const probed = await probeVideoFile(req.file);
      setProbe(probed);
      setTrim(probed ? defaultTrim(probed.durationMs) : null);
      setStep("edit");
      void upload.resume(req.sessionId, req.videoId, req.file);
    },
    [upload, t],
  );

  // Coperta aleasă se urcă imediat ce există clipul în DB.
  useEffect(() => {
    if (!cover || !videoId || coverSent.current === cover.blob) return;
    coverSent.current = cover.blob;
    videoApi.uploadCover(videoId, cover.blob).catch((err) =>
      toast({ title: errorText(err instanceof UploadApiError ? err.code : null), tone: "danger" }),
    );
  }, [cover, videoId, toast, errorText]);

  const goDetails = () => {
    upload.confirmTrim(trimForServer(trim, probe?.durationMs ?? null));
    setStep("details");
  };

  const submit = async (intent: PublishIntent, scheduledAt?: string) => {
    if (!videoId) return;
    setSubmitting(intent);
    try {
      const res = await videoApi.patch(videoId, toVideoPatch(form.details, intent, scheduledAt));
      detailsDraft.clear(videoId);
      if (intent === "public" && form.details.missionSlug) {
        await pickerApi.submitMission(form.details.missionSlug, videoId).catch(() =>
          toast({ title: t("mission.submitFailed"), tone: "danger" }),
        );
      }
      if (intent === "draft") {
        toast({ title: t("done.draftSaved"), tone: "success" });
        router.push("/creator/drafts");
      } else if (intent === "scheduled") {
        toast({ title: t("done.scheduled"), tone: "success" });
        router.push("/creator/drafts");
      } else {
        const key = res.liveNow ? "done.live" : res.moderationStatus === "pending_review" ? "done.inReview" : "done.processing";
        toast({ title: t(key), tone: "success", duration: 6000 });
        router.push(`/video/${videoId}`);
      }
    } catch (err) {
      toast({ title: errorText(err instanceof UploadApiError ? err.code : null), tone: "danger" });
    } finally {
      setSubmitting(null);
    }
  };

  const cancelAll = async () => {
    await upload.cancel();
    setPreviewUrl(null);
    setCover(null);
    setStep("pick");
  };

  if (step === "camera") {
    return (
      <CameraCapture
        onCaptured={(blob) => void begin(blob, `clip-${Date.now()}.${blob.type.includes("mp4") ? "mp4" : "webm"}`, "camera")}
        onGallery={() => setStep("pick")}
        onClose={() => (props.initialSource === "camera" ? router.back() : setStep("pick"))}
      />
    );
  }

  const status = (
    <UploadStatusCard
      state={upload.state}
      status={upload.status}
      trimConfirmed={upload.trimConfirmed}
      onCancel={() => void cancelAll()}
      onRetry={() => void upload.retry()}
    />
  );
  const failedUpload = upload.state.kind === "failed" && upload.state.stage === "upload";
  // Publicarea cere fișierul complet urcat (procesarea poate fi încă în curs);
  // draftul se poate salva doar când nu mai urcăm (navigarea ar opri uploadul).
  const kind = upload.state.kind;
  const canPublish = Boolean(videoId) && (kind === "completing" || kind === "processing" || kind === "ready");
  const canSaveDraft = Boolean(videoId) && !upload.busy && kind !== "cancelled" && !failedUpload;

  return (
    <div className="min-h-dvh bg-canvas">
      <PageHeader
        back={step === "pick" ? true : undefined}
        menu={false}
        title={t(`steps.${step}`)}
        subtitle={t("stepOf", { n: STEP_NUMBER[step], total: 3 })}
        actions={
          step === "edit" ? (
            <IconButton label={t("discard.open")} onClick={() => setDiscardOpen(true)}>
              <X aria-hidden />
            </IconButton>
          ) : undefined
        }
      />
      <Dialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t("discard.title")}
        description={t("discard.body")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDiscardOpen(false)}>
              {t("discard.keep")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDiscardOpen(false);
                void cancelAll();
              }}
            >
              {t("discard.confirm")}
            </Button>
          </>
        }
      />
      {step === "pick" ? (
        <PickStep onRecord={() => setStep("camera")} onPicked={(f) => void begin(f, f.name, "gallery")} onResume={(r) => void resume(r)} error={pickError} />
      ) : null}
      {step === "edit" && previewUrl ? (
        <EditStep
          previewUrl={previewUrl}
          probe={probe}
          trim={trim}
          onTrim={setTrim}
          coverUrl={cover?.url ?? null}
          onCover={(blob) => setCover({ blob, url: URL.createObjectURL(blob) })}
          onRetake={fromCamera ? () => void cancelAll().then(() => setStep("camera")) : null}
          onNext={goDetails}
          status={status}
        />
      ) : null}
      {step === "details" ? (
        <DetailsStep
          details={form.details}
          update={form.update}
          videoId={videoId}
          coverUrl={cover?.url ?? serverCover}
          durationSec={probe ? Math.round(((trim?.endMs ?? probe.durationMs) - (trim?.startMs ?? 0)) / 1000) : null}
          processingReady={upload.state.kind === "ready"}
          canPublish={canPublish}
          canSaveDraft={canSaveDraft}
          submitting={submitting}
          onSubmit={(intent, at) => void submit(intent, at)}
          status={status}
        />
      ) : null}
    </div>
  );
}
