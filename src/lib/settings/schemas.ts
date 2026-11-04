import { z } from "zod";

const optionalPositiveInt = z.preprocess((v) => {
  if (v === "" || v === undefined || v === null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}, z.number().int().positive().optional());

const optionalNonNegInt = z.preprocess((v) => {
  if (v === "" || v === undefined || v === null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}, z.number().int().nonnegative().optional());

export const accessModeSchema = z.enum([
  "on_shelf",
  "brought_in_for_case",
  "not_kept_in_stock",
]);

export const storageTypeSchema = z.enum([
  "shelf",
  "room",
  "central",
  "controlled",
]);

export const createVendorSchema = z.object({
  name: z.string().trim().min(1, "Vendor name is required"),
  externalId: z.string().trim().optional(),
});

export const createProductSchema = z.object({
  vendorId: z.coerce.number().int().positive(),
  catalogNumber: z.string().trim().min(1, "Catalog number is required"),
  description: z.string().trim().min(1, "Description is required"),
  category: z.string().trim().optional(),
  gtin: z.string().trim().optional(),
  hibc: z.string().trim().optional(),
  catalogIdentifier: z.string().trim().optional(),
});

export const createStorageLocationSchema = z.object({
  name: z.string().trim().min(1, "Location name is required"),
  departmentId: optionalPositiveInt,
  storageType: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    storageTypeSchema.optional(),
  ),
});

export const upsertProductAccessSchema = z.object({
  productId: z.coerce.number().int().positive(),
  departmentId: z.coerce.number().int().positive(),
  accessMode: accessModeSchema,
  locationId: optionalPositiveInt,
  parLevel: optionalNonNegInt,
});

export const createExpiryRuleSchema = z.object({
  vendorId: optionalPositiveInt,
  daysBefore: z.coerce.number().int().positive().default(60),
  vendorPaysExpired: z.preprocess((v) => {
    if (v === true || v === 1 || v === "1" || v === "on") return 1;
    return 0;
  }, z.union([z.literal(0), z.literal(1)])),
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreateStorageLocationInput = z.infer<
  typeof createStorageLocationSchema
>;
export type UpsertProductAccessInput = z.infer<typeof upsertProductAccessSchema>;
export type CreateExpiryRuleInput = z.infer<typeof createExpiryRuleSchema>;
