/**
 * The studio's output contract, kept in its own module so health reporting can
 * read it without importing the image pipeline.
 */

/** Passport photos are 35mm wide by 45mm high; pixels follow that ratio. */
export const PASSPORT_RATIO = { widthMm: 35, heightMm: 45 } as const;

export function passportWidthPx(env: Record<string, string | undefined> = process.env): number {
  const parsed = parseInt(env.PASSPORT_PHOTO_WIDTH || '700', 10);
  return Number.isFinite(parsed) && parsed >= 200 && parsed <= 2000 ? parsed : 700;
}

export function passportHeightPx(env: Record<string, string | undefined> = process.env): number {
  return Math.round((passportWidthPx(env) * PASSPORT_RATIO.heightMm) / PASSPORT_RATIO.widthMm);
}

export function imageRetentionDays(env: Record<string, string | undefined> = process.env): number {
  const parsed = parseInt(env.IMAGE_RETENTION_DAYS || '30', 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 365 ? parsed : 30;
}
