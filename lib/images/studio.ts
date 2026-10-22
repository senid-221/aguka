/**
 * The Image Studio: turns a person's words, or a photo they sent, into a
 * passport-shaped JPEG.
 *
 * The model only supplies pixels; the 35x45 proportion, the pixel size and the
 * file itself are produced in code and stored in the private data directory,
 * outside the web root and with a retention deadline. An uploaded photo is used
 * as input and is never written to disk afterwards.
 */

import sharp from 'sharp';
import { logger } from '@/lib/logging/logger';
import { repo } from '@/lib/db/repository';
import { durableStore } from '@/lib/db/store';
import { requestImage, type ImageResult } from '@/lib/images/provider';
import { imageRetentionDays, passportHeightPx, passportWidthPx } from '@/lib/images/spec';

const REQUESTED_WIDTH = passportWidthPx();
const PASSPORT_HEIGHT = passportHeightPx();

/** What health and the admin screens report instead of guessing. */
export function studioOutputSpec(): { width: number; height: number; retentionDays: number } {
  return { width: REQUESTED_WIDTH, height: PASSPORT_HEIGHT, retentionDays: imageRetentionDays() };
}

function taskOperationFor(text: string): 'PASSPORT_CROP' | 'ENHANCE_CV_PHOTO' | 'REMOVE_BG' {
  const t = text.toLowerCase();
  if (t.includes('background') || t.includes('inyuma') || t.includes('isura')) return 'REMOVE_BG';
  if (t.includes('cv') || t.includes('resume')) return 'ENHANCE_CV_PHOTO';
  return 'PASSPORT_CROP';
}

/**
 * The instruction handed to the image model. It asks for a portrait that meets
 * the published Rwandan passport standard; it cannot promise pixel accuracy, so
 * the exact crop happens below with sharp.
 */
export function buildStudioPrompt(request: string, editing: boolean): string {
  const standards =
    'Head centred and facing the camera, neutral expression, eyes open, plain uniform light-grey ' +
    'background, even lighting with no shadows on the face, no glasses reflection, no headwear unless ' +
    'religiously required, framing for the 35mm wide by 45mm high Rwandan passport ratio with the face ' +
    'occupying about 70 to 80 percent of the height.';
  const ask = request.trim().slice(0, 400);

  if (editing) {
    return (
      `Retouch the attached photo of this person into a compliant passport photograph. ${standards} ` +
      `Keep the person's identity, face, skin tone and clothing recognisable and unchanged except for ` +
      `the background and framing. Their request was: "${ask}". Do not add text, watermarks or borders.`
    );
  }
  return (
    `Create a passport-style portrait photograph. ${standards} Their request was: "${ask}". ` +
    `If the request names a real identifiable person you do not have a photo of, produce a generic ` +
    `illustrative portrait instead and never a likeness of a real individual. Do not add text, ` +
    `watermarks or borders.`
  );
}

export interface StudioSuccess {
  ok: true;
  taskId: string;
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  provider: string;
  model: string;
  expiresAt: string;
}

export type StudioResult = StudioSuccess | { ok: false; error: string; provider: string; model: string };

/**
 * What the delivery layer needs: where the private file lives and how to
 * describe it. The bytes are read back from the data directory on send.
 */
export interface ImageAttachment {
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  taskId: string;
  expiresAt: string;
}

export function attachmentOf(success: StudioSuccess): ImageAttachment {
  return {
    storageKey: success.storageKey,
    mimeType: success.mimeType,
    width: success.width,
    height: success.height,
    taskId: success.taskId,
    expiresAt: success.expiresAt,
  };
}

export async function runImageStudio(options: {
  userId: string;
  userName: string;
  request: string;
  reference?: { buffer: Buffer; mimeType: string } | null;
}): Promise<StudioResult> {
  const prompt = buildStudioPrompt(options.request, Boolean(options.reference));
  const generated: ImageResult = await requestImage({ prompt, reference: options.reference ?? null });

  if (!generated.ok) {
    return { ok: false, error: generated.error, provider: generated.provider, model: generated.model };
  }

  let pixels: Buffer;
  let width = REQUESTED_WIDTH;
  let height = PASSPORT_HEIGHT;
  try {
    const pipeline = sharp(generated.image.buffer).resize(REQUESTED_WIDTH, PASSPORT_HEIGHT, {
      fit: 'cover',
      position: 'north',
    });
    const rendered = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    pixels = rendered.data;
    width = rendered.info.width;
    height = rendered.info.height;
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error('IMAGE_CROP_FAILED', err instanceof Error ? err : new Error(reason), {
      metadata: { userId: options.userId },
    });
    return {
      ok: false,
      error: `The image came back but could not be cropped to the passport ratio: ${reason}`,
      provider: generated.image.provider,
      model: generated.image.model,
    };
  }

  const stored = durableStore.saveBinary(pixels, 'image/jpeg');
  const days = imageRetentionDays();
  const task = repo.createMediaTask({
    userId: options.userId,
    userName: options.userName,
    operation: taskOperationFor(options.request),
    originalUrl: options.reference ? 'input:person-uploaded-photo-not-stored' : 'input:text-prompt',
    retentionDays: days,
  });
  repo.updateMediaTask(task.id, {
    status: 'COMPLETED',
    processedUrl: `stored:${stored.key}`,
    completedAt: new Date().toISOString(),
  });

  logger.info('IMAGE_STUDIO_COMPLETED', `Produced ${width}x${height} JPEG for ${options.userId}`, {
    metadata: {
      taskId: task.id,
      provider: generated.image.provider,
      model: generated.image.model,
      sizeBytes: stored.sizeBytes,
      expires: new Date(Date.now() + days * 86_400_000).toISOString(),
    },
  });

  return {
    ok: true,
    taskId: task.id,
    storageKey: stored.key,
    mimeType: 'image/jpeg',
    width,
    height,
    sizeBytes: stored.sizeBytes,
    provider: generated.image.provider,
    model: generated.image.model,
    expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
  };
}
