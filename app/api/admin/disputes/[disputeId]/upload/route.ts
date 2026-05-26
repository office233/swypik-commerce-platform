/**
 * Admin: upload a file to Stripe as dispute evidence and return the file_id.
 * POST /api/admin/disputes/:disputeId/upload  multipart/form-data
 *   field "file":     the binary file (max 5MB)
 *   field "purpose":  optional, defaults to "dispute_evidence"
 *
 * Returns { success, file_id } — caller then includes file_id in the evidence
 * field (e.g. receipt, shipping_documentation, customer_signature) via the
 * existing POST /api/admin/disputes endpoint.
 */
import { NextResponse } from "next/server";
import { hasAdminSession } from "@/lib/security/admin-auth";
import { getStripe } from "@/lib/stripe/checkout";
import { dbQuery } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ disputeId: string }> },
) {
  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 403 });
  }
  const { disputeId } = await params;
  if (!/^dp_[A-Za-z0-9]+$/.test(disputeId)) {
    return NextResponse.json({ error: "disputeId invalid" }, { status: 400 });
  }

  const { rows } = await dbQuery<{ id: string }>(
    `SELECT id::text FROM stripe_disputes WHERE dispute_id = $1 LIMIT 1`,
    [disputeId],
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: "Dispute inexistent" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Body trebuie multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "Lipsește field 'file'" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File depășește ${MAX_BYTES / 1024 / 1024}MB` }, { status: 413 });
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIMES.has(mime)) {
    return NextResponse.json({ error: `MIME type ${mime} nepermis` }, { status: 415 });
  }
  const filename = (file as any).name || `dispute-evidence.${mime.split("/")[1] || "bin"}`;
  const purpose = (form.get("purpose") as string) || "dispute_evidence";

  try {
    const stripe = getStripe();
    const buf = Buffer.from(await file.arrayBuffer());
    const uploaded = await stripe.files.create({
      purpose: purpose as any,
      file: {
        data: buf,
        name: filename,
        type: mime,
      },
    });

    logger.info(
      { disputeId, fileId: uploaded.id, size: file.size, mime, filename },
      "[Admin] Dispute file uploaded to Stripe",
    );

    return NextResponse.json({ success: true, file_id: uploaded.id, filename, size: file.size, mime });
  } catch (err: any) {
    logger.error({ err, disputeId }, "[Admin] Stripe files.create failed");
    return NextResponse.json({ error: err?.message || "Stripe API error" }, { status: 502 });
  }
}
