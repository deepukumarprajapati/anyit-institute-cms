import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const optionalPincode = z
  .string()
  .trim()
  .max(6)
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine((value) => !value || /^\d{6}$/.test(value), 'Pincode must be 6 digits');

const optionalCoord = (min: number, max: number) =>
  z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) return undefined;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : value;
  }, z.number().min(min).max(max).optional());

export const campusDetailsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(16),
  address: optionalText(300),
  phone: optionalText(20),
  pincode: optionalPincode,
  schoolCode: optionalText(32),
  mapUrl: optionalText(500),
  latitude: optionalCoord(-90, 90),
  longitude: optionalCoord(-180, 180),
  imageUrl: optionalText(500),
  isPrimary: z.boolean().optional(),
});

export const campusUpdateSchema = campusDetailsSchema.partial();

export type CampusDetails = z.infer<typeof campusDetailsSchema>;

export function stripHeadOfficeOnlyFields<T extends { schoolCode?: string }>(
  body: T,
  isPrimary: boolean
): T {
  if (!isPrimary) return body;
  return { ...body, schoolCode: undefined };
}
