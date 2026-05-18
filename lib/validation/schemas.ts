import { z } from "zod";

/**
 * Validation schemas for mutating API routes.
 * Use `Schema.safeParse(body)` and return 400 with `error.issues` on failure.
 */

export const CheckoutItemSchema = z.object({
  productId: z.string().trim().min(1).max(128).optional(),
  pgId: z.string().trim().min(1).max(128).optional(),
  quantity: z.number().int().min(1).max(10).default(1),
  skuId: z.string().trim().max(128).optional(),
  variantId: z.string().trim().max(128).optional(),
  videoId: z.string().trim().max(64).optional(),
}).refine((it) => Boolean(it.productId || it.pgId), {
  message: "productId or pgId required",
  path: ["productId"],
});

export const CheckoutCreateIntentSchema = z.object({
  products: z.array(CheckoutItemSchema).min(1, "Coșul este gol.").max(50, "Maxim 50 produse per comandă."),
  idempotencyKey: z.string().max(128).optional(),
});

export type CheckoutCreateIntentInput = z.infer<typeof CheckoutCreateIntentSchema>;

/**
 * Helper: parse a request body with a zod schema. Returns either the parsed
 * data or a NextResponse-friendly error payload (use it as { error, status: 400 }).
 */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown):
  | { ok: true; data: z.infer<T> }
  | { ok: false; error: string; issues: z.ZodIssue[] } {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    error: result.error.issues[0]?.message ?? "Invalid request body",
    issues: result.error.issues,
  };
}

// Allowed values mirror commerce_orders_status_check enum.
export const OrderStatusEnum = z.enum([
  "pending", "authorized", "paid", "fulfilled", "delivered",
  "return_requested", "cancelled", "refunded", "failed", "disputed",
]);

export const AdminOrderPatchSchema = z.object({
  orderId: z.string().uuid("orderId must be a valid UUID"),
  status: OrderStatusEnum.optional(),
  trackingNumber: z.string().trim().min(1).max(128).optional(),
  trackingUrl: z.string().url("trackingUrl must be a valid URL").max(512).optional(),
  fulfillmentStatus: z.enum([
    "pending", "processing", "shipped", "fulfilled", "delivered", "failed",
  ]).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type AdminOrderPatchInput = z.infer<typeof AdminOrderPatchSchema>;

export const SellerOrderTrackingSchema = z.object({
  order_id: z.string().uuid("order_id must be a valid UUID"),
  tracking_number: z.string().trim().min(3, "tracking_number too short").max(120, "tracking_number too long"),
  tracking_url: z.string().url("tracking_url must be a valid URL").max(512).optional(),
});
export type SellerOrderTrackingInput = z.infer<typeof SellerOrderTrackingSchema>;

export const CreatorUploadSessionCreateSchema = z.object({
  filename: z.string().trim().min(1, "filename is required").max(255),
  contentType: z.string().trim().max(128).optional(),
  sizeBytes: z.coerce.number().finite().positive("sizeBytes must be positive").max(1024 * 1024 * 1024, "sizeBytes exceeds 1GB"),
  title: z.string().trim().max(180).optional(),
  description: z.string().trim().max(5000).optional(),
  caption: z.string().trim().max(5000).optional(),
  challengeId: z.string().trim().max(128).optional(),
  productId: z.string().trim().max(128).optional(),
  source: z.string().trim().max(64).optional(),
  hashtags: z.unknown().optional(),
  audioTrackId: z.unknown().optional(),
}).passthrough();
export type CreatorUploadSessionCreateInput = z.infer<typeof CreatorUploadSessionCreateSchema>;

const UploadSessionIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/, "Invalid upload session id");

export const CreatorUploadSessionCompleteSchema = z.object({
  sessionId: UploadSessionIdSchema.optional(),
  uploadId: UploadSessionIdSchema.optional(),
  action: z.literal("complete").optional(),
}).passthrough();
export type CreatorUploadSessionCompleteInput = z.infer<typeof CreatorUploadSessionCompleteSchema>;

export const SellerApplicationSchema = z.object({
  companyName: z.string().trim().min(2, "companyName is required").max(160),
  cui: z.string().trim().min(2, "cui is required").max(64),
  email: z.string().trim().email("email must be valid").max(254),
  phone: z.string().trim().min(6, "phone is required").max(32),
  productType: z.string().trim().min(2, "productType is required").max(120),
});
export type SellerApplicationInput = z.infer<typeof SellerApplicationSchema>;

export const VideoProductVoteSchema = z.object({
  productId: z.string().uuid("productId must be a valid UUID"),
  vote: z.enum(["worth_it", "not_worth_it"]),
  sessionId: z.string().trim().min(8).max(80).optional(),
});
export type VideoProductVoteInput = z.infer<typeof VideoProductVoteSchema>;
