/**
 * Zod schemas — Swypik Go (curse).
 *
 * Fișier separat de `schemas.ts` intenționat: `schemas.ts` e editat de mai
 * mulți agenți în paralel; verticala Go își ține contractele aici.
 */
import { z } from "zod";

export const VEHICLE_CLASSES = ["economy", "comfort", "van"] as const;
export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

export const RIDE_STATUSES = [
  "requested",
  "searching",
  "accepted",
  "arriving",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

const PointSchema = z.object({
  address: z.string().trim().min(3, "Adresă prea scurtă").max(300),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const RideEstimateSchema = z.object({
  pickup: PointSchema,
  dropoff: PointSchema,
  vehicle_class: z.enum(VEHICLE_CLASSES).default("economy"),
  city: z.string().trim().min(2).max(120).default("București"),
  country: z.string().trim().length(2).default("RO"),
});

export const RideCreateSchema = RideEstimateSchema.extend({
  payment_method: z.enum(["cash", "card", "wallet"]).default("cash"),
  notes: z.string().trim().max(500).optional(),
});

export const RideStatusPatchSchema = z.object({
  status: z.enum(["arriving", "in_progress", "completed", "cancelled"]),
  reason: z.string().trim().max(300).optional(),
});

export const RideRatingSchema = z.object({
  stars: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});
