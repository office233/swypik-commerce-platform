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
