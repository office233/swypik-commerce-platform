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

// Permissive Checkout shape used by /api/checkout/route.ts (legacy clients
// send `items`/`products`/`product` with mixed fields). Server enforces price
// from DB regardless, so we only validate types + caps here.
export const CheckoutRawItemSchema = z.object({
  productId: z.union([z.string(), z.number()]).optional(),
  pgId: z.union([z.string(), z.number()]).optional(),
  quantity: z.union([z.number(), z.string()]).optional(),
  skuId: z.union([z.string(), z.number()]).optional(),
  variantId: z.union([z.string(), z.number()]).optional(),
  videoId: z.union([z.string(), z.number()]).optional(),
}).passthrough();

export const CheckoutPostBodySchema = z.object({
  items: z.array(CheckoutRawItemSchema).max(50).optional(),
  products: z.array(CheckoutRawItemSchema).max(50).optional(),
  product: CheckoutRawItemSchema.optional(),
  customer: z.object({
    email: z.string().email().max(254).optional(),
  }).passthrough().optional(),
}).passthrough();

// Seller auth: action-based body (login/request_otp/verify_otp).
export const SellerAuthBodySchema = z.object({
  action: z.enum(["login", "request_otp", "verify_otp"]),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  token: z.string().trim().regex(/^\d{6}$/, "Cod invalid").optional(),
});
export type SellerAuthBody = z.infer<typeof SellerAuthBodySchema>;

// User profile PATCH.
export const UserProfilePatchSchema = z.object({
  display_name: z.string().trim().min(1).max(50).optional(),
  bio: z.string().trim().max(300).nullable().optional(),
  username: z.string().trim().toLowerCase().min(3).max(30).regex(/^[a-z0-9_]+$/, "username invalid").optional(),
}).refine((b) => b.display_name !== undefined || b.bio !== undefined || b.username !== undefined, {
  message: "Nimic de actualizat",
});

// 2FA disable / regenerate-backup: password only.
export const TwoFactorPasswordSchema = z.object({
  password: z.string().min(1, "Parola este obligatorie.").max(256),
});

// 2FA enable: 6-digit token.
export const TwoFactorTokenSchema = z.object({
  token: z.string().trim().regex(/^\d{6}$/, "Codul trebuie să aibă 6 cifre."),
});

// Address PATCH (all fields optional, length-capped).
export const AddressPatchSchema = z.object({
  label: z.string().trim().max(60).nullable().optional(),
  recipient_name: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  line1: z.string().trim().max(200).nullable().optional(),
  line2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  postal_code: z.string().trim().max(20).nullable().optional(),
  country_code: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/, "country_code must be ISO-3166-1 alpha-2").nullable().optional(),
  set_default: z.boolean().optional(),
}).strict();

// Adult content opt-in toggle.
export const AdultOptInSchema = z.object({
  optIn: z.boolean(),
});

// Arena post vote.
export const PostVoteSchema = z.object({
  optionKey: z.string().trim().min(1).max(64),
});

// Video comment POST.
export const VideoCommentPostSchema = z.object({
  text: z.string().trim().max(2000).optional(),
  body: z.string().trim().max(2000).optional(),
  comment: z.string().trim().max(2000).optional(),
  parent_comment_id: z.string().trim().max(64).nullable().optional(),
}).passthrough();

// Video report (UI-facing endpoint /api/videos/[id]/report).
export const VideoReportPostSchema = z.object({
  category: z.string().trim().toLowerCase().min(1).max(40),
  details: z.string().trim().max(1000).nullable().optional(),
});

// Chat POST.
export const ChatPostSchema = z.object({
  message: z.string().max(4000).optional(),
  sessionId: z.string().max(128).optional(),
  directCjQuery: z.string().max(500).optional(),
  chatHistory: z.array(z.unknown()).max(50).optional(),
  productContext: z.array(z.unknown()).max(50).optional(),
  shoppingSession: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

// Live stream chat message.
export const LiveChatMessageSchema = z.object({
  message: z.string().trim().min(1, "Mesaj gol").max(500),
});

// Live stream poll create.
export const LivePollCreateSchema = z.object({
  question: z.string().trim().min(1).max(280),
  options: z.array(z.string().trim().min(1).max(120)).min(2).max(10),
});

// Feed action.
export const FeedActionSchema = z.object({
  video_id: z.string().trim().min(1).max(64),
  action: z.enum(["more_like_this", "not_interested", "follow_creator", "unfollow"]),
});

// Feed events batch (envelope only — items validated downstream).
export const FeedEventsBatchSchema = z.object({
  events: z.array(z.unknown()).max(50).optional(),
}).passthrough();

// Video feedback.
export const VideoFeedbackSchema = z.object({
  action: z.enum(["more_like_this", "not_interested"]),
});

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

/* ===========================================================================
 * Public mutating endpoints (added 2026-05-26)
 * Centralized schemas — keep route handlers thin.
 * =========================================================================== */

export const VideoCommentCreateSchema = z.object({
  body: z.string().trim().min(1, "Comentariul nu poate fi gol").max(2000, "Maxim 2000 caractere"),
  parent_id: z.string().uuid().nullable().optional(),
  reply_to_user_id: z.string().uuid().nullable().optional(),
});
export type VideoCommentCreateInput = z.infer<typeof VideoCommentCreateSchema>;

export const VideoReportSchema = z.object({
  reason: z.enum([
    "spam", "harassment", "hate_speech", "violence", "nudity",
    "self_harm", "misinformation", "copyright", "scam", "underage", "other",
  ]),
  description: z.string().trim().max(2000).optional(),
});
export type VideoReportInput = z.infer<typeof VideoReportSchema>;

export const VideoShareSchema = z.object({
  channel: z.enum([
    "copy_link", "native_share", "email", "sms", "whatsapp",
    "facebook", "instagram", "tiktok", "x", "other",
  ]).default("other"),
  referrer_url: z.string().url().max(500).optional().nullable(),
  destination_url: z.string().url().max(500).optional().nullable(),
});
export type VideoShareInput = z.infer<typeof VideoShareSchema>;

export const CartItemAddSchema = z.object({
  productId: z.string().trim().min(1, "productId required").max(128),
  variantId: z.string().trim().max(128).optional().nullable(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  title: z.string().max(300).optional(),
  image: z.string().url().max(1024).optional(),
  priceCents: z.coerce.number().int().min(0).max(100_000_000).optional(),
  currency: z.string().trim().length(3).optional(),
});
export type CartItemAddInput = z.infer<typeof CartItemAddSchema>;

export const CartItemPatchSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(99),
});
export type CartItemPatchInput = z.infer<typeof CartItemPatchSchema>;

export const DmConversationCreateSchema = z.object({
  peer_user_id: z.string().uuid("peer_user_id must be a valid UUID"),
});
export type DmConversationCreateInput = z.infer<typeof DmConversationCreateSchema>;

export const DmMessageCreateSchema = z.object({
  body: z.string().trim().min(1, "Mesajul nu poate fi gol").max(4000, "Maxim 4000 caractere"),
  media_url: z.string().url().max(1024).optional().nullable(),
  reply_to_message_id: z.string().uuid().optional().nullable(),
});
export type DmMessageCreateInput = z.infer<typeof DmMessageCreateSchema>;

export const NotificationsMarkReadSchema = z.union([
  z.object({ markAll: z.literal(true) }),
  z.object({ ids: z.array(z.string().regex(/^\d+$/, "id must be numeric")).min(1).max(100) }),
]);
export type NotificationsMarkReadInput = z.infer<typeof NotificationsMarkReadSchema>;

const ALLOWED_COUNTRY_CODES = [
  "RO", "MD", "BG", "HU", "DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "GB",
] as const;

export const UserAddressCreateSchema = z.object({
  label: z.string().trim().max(80).nullable().optional(),
  recipient_name: z.string().trim().min(1, "Numele destinatarului este obligatoriu").max(160),
  phone: z.string().trim().min(6).max(32).nullable().optional(),
  line1: z.string().trim().min(1, "Strada (linia 1) este obligatorie").max(200),
  line2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(1, "Orașul este obligatoriu").max(120),
  region: z.string().trim().max(120).nullable().optional(),
  postal_code: z.string().trim().min(2, "Codul poștal este obligatoriu").max(20),
  country_code: z.enum(ALLOWED_COUNTRY_CODES).default("RO"),
  is_default: z.coerce.boolean().optional(),
});
export type UserAddressCreateInput = z.infer<typeof UserAddressCreateSchema>;

export const UserAddressPatchSchema = UserAddressCreateSchema.partial();
export type UserAddressPatchInput = z.infer<typeof UserAddressPatchSchema>;

export const VideoEventSchema = z.object({
  event_type: z.enum([
    "impression", "view_start", "view_end", "skip_fast", "watch_complete",
    "rewatch", "pause", "resume", "seek", "like", "unlike", "save", "unsave",
    "share", "comment", "follow", "unfollow", "product_click", "add_to_cart",
    "purchase", "more_like_this", "not_interested", "report",
  ]),
  watch_duration_ms: z.coerce.number().int().min(0).max(86_400_000).optional().nullable(),
  video_duration_ms: z.coerce.number().int().min(0).max(86_400_000).optional().nullable(),
  completion_pct: z.coerce.number().min(0).max(100).optional().nullable(),
  session_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type VideoEventInput = z.infer<typeof VideoEventSchema>;

export const OrderReturnRequestSchema = z.object({
  reason: z.string().trim().min(5, "Motivul returului este obligatoriu (minim 5 caractere)").max(2000),
  token: z.string().trim().min(8, "Token de autentificare lipsă").max(256),
  evidenceUrls: z.array(z.string().url().max(1024)).max(4).optional(),
});
export type OrderReturnRequestInput = z.infer<typeof OrderReturnRequestSchema>;

export const ApplySellerSchema = SellerApplicationSchema;

