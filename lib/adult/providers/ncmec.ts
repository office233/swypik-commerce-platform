/**
 * NCMEC CyberTipline reporting — STUB.
 *
 * If automated moderation flags suspected CSAM (or a human reviewer
 * confirms), US law (18 U.S.C. §2258A) REQUIRES a CyberTipline report
 * for any provider with US users — and we cannot block US.
 *
 * Reporting flow (real):
 *   1) Preserve the media + metadata (do NOT delete).
 *   2) Block public access immediately.
 *   3) File a CyberTipline report via the NCMEC API or web form.
 *   4) Cooperate with law enforcement requests; retain for 90 days
 *      after the report.
 *
 * NEVER attempt to identify the subject in code; that's law enforcement.
 */

export interface CSAMReportPayload {
  postId: string;
  creatorUserId: string;
  uploaderIp: string | null;
  uploaderUa: string | null;
  detectedAt: Date;
  aiVerdict: unknown;
  humanVerdict?: string;
  mediaKeys: string[];
}

export interface CSAMReportResult {
  reportRef: string;
  filedAt: Date;
}

export function ncmecConfigured(): boolean {
  return Boolean(process.env.NCMEC_API_KEY && process.env.NCMEC_REPORTER_ID);
}

/**
 * File a CyberTipline report. Until the real adapter is wired, this
 * function still writes to `adult.audit_log` so an operator can act
 * manually. The caller must ALSO block the content out-of-band.
 */
export async function fileCsamReport(payload: CSAMReportPayload): Promise<CSAMReportResult> {
  const { writeAudit } = await import("@/lib/adult/audit");
  await writeAudit({
    actorUserId: null,
    action: "csam.detected_pending_report",
    targetType: "post",
    targetId: payload.postId,
    reason: "Automatic CSAM flag — manual NCMEC CyberTipline filing REQUIRED.",
    afterState: payload,
  });
  if (!ncmecConfigured()) {
    return {
      reportRef: `manual-${payload.postId}`,
      filedAt: new Date(),
    };
  }
  throw new Error("NCMEC adapter not wired — replace this stub.");
}
