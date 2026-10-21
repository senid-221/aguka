/**
 * Dependency-free image inspection used as supporting evidence for payment
 * proofs. It reports what the bytes actually say: format consistency, decoded
 * dimensions and embedded editing metadata.
 *
 * Deliberate limits, stated so nobody over-trusts the output:
 * - no pixel-level tamper detection (error-level analysis, clone detection) runs
 *   here; that needs a decoding pipeline or an external forensics service
 * - text extraction (amount, reference, payee) is produced by the OCR adapter,
 *   not by this module
 */

export type ImageFormat = 'PNG' | 'JPEG' | 'GIF' | 'WEBP' | 'BMP' | 'UNKNOWN';

export interface ImageProbe {
  format: ImageFormat;
  width: number | null;
  height: number | null;
  metadata: Record<string, string>;
  hasPhotoshopIrb: boolean;
  hasXmp: boolean;
  stripCount: number;
}

const SOFTWARE_MARKERS = [
  'photoshop',
  'adobe',
  'gimp',
  'paint.net',
  'pixellab',
  'canva',
  'inshot',
  'snapp',
  'lightroom',
  'affinity',
  'corel',
  'fotor',
  'picsart',
  'svg edit',
  'photopea',
];

function readCString(view: Buffer, start: number, length: number): string {
  return view
    .slice(start, start + length)
    .toString('latin1')
    .replace(/\u0000+$/, '')
    .trim();
}

function indexOfZero(view: Buffer, from: number, to: number): number {
  for (let i = from; i < to; i++) {
    if (view[i] === 0) return i;
  }
  return -1;
}

function probePng(buf: Buffer, probe: ImageProbe): void {
  let offset = 8; // signature
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = readCString(buf, offset + 4, 4);
    const dataStart = offset + 8;
    if (length < 0 || dataStart + length > buf.length) break;
    probe.stripCount++;

    if (type === 'IHDR') {
      probe.width = buf.readUInt32BE(dataStart);
      probe.height = buf.readUInt32BE(dataStart + 4);
    } else if (type === 'tEXt') {
      const nul = indexOfZero(buf, dataStart, dataStart + length);
      if (nul > dataStart) {
        const key = readCString(buf, dataStart, nul - dataStart);
        const value = buf.slice(nul + 1, dataStart + length).toString('latin1').trim();
        if (key) probe.metadata[key] = value.slice(0, 200);
      }
    } else if (type === 'iTXt') {
      const nul = indexOfZero(buf, dataStart, dataStart + length);
      if (nul > dataStart) {
        const key = readCString(buf, dataStart, nul - dataStart);
        // skip compression flag + method + language tag + translated keyword
        let cursor = nul + 3;
        const nextNul = indexOfZero(buf, cursor, dataStart + length);
        if (nextNul > 0) cursor = nextNul + 1;
        const secondNul = indexOfZero(buf, cursor, dataStart + length);
        if (secondNul > 0) cursor = secondNul + 1;
        probe.metadata[key || 'iTXt'] = buf.slice(cursor, dataStart + length).toString('latin1').trim().slice(0, 200);
      }
    } else if (type === 'eXIf') {
      parseTiff(buf.slice(dataStart, dataStart + length), probe);
    }

    offset = dataStart + length + 4; // data + CRC
  }
}

function parseTiff(tiff: Buffer, probe: ImageProbe): void {
  if (tiff.length < 8) return;
  const little = tiff.readUInt16LE(0) === 0x4949;
  const read16 = (p: number) => (little ? tiff.readUInt16LE(p) : tiff.readUInt16BE(p));
  const read32 = (p: number) => (little ? tiff.readUInt32LE(p) : tiff.readUInt32BE(p));
  let ifd = read32(4);
  let guard = 0;

  while (ifd + 2 < tiff.length && guard++ < 4) {
    const count = read16(ifd);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > tiff.length) break;
      const tag = read16(entry);
      const type = read16(entry + 2);
      const components = read32(entry + 4);
      const names: Record<number, string> = {
        0x010f: 'Make',
        0x0110: 'Model',
        0x0131: 'Software',
        0x0132: 'DateTime',
        0x0213: 'YCbCrPositioning',
        0x8769: 'ExifIFD',
      };
      const label = names[tag];
      if (!label) continue;
      const bytesPerValue = type === 2 || type === 1 ? 1 : type === 3 ? 2 : 4;
      const size = components * bytesPerValue;
      const valuePos = size <= 4 ? entry + 8 : read32(entry + 8);
      if (valuePos + size > tiff.length) continue;
      const value = readCString(tiff, valuePos, Math.min(size, 120));
      if (value) probe.metadata[label] = value.slice(0, 200);
    }
    const next = ifd + 2 + count * 12;
    if (next + 4 > tiff.length) break;
    ifd = read32(next);
  }
}

function probeJpeg(buf: Buffer, probe: ImageProbe): void {
  let offset = 2;
  while (offset + 4 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end
    const segmentLength = buf.readUInt16BE(offset + 2);
    const dataStart = offset + 4;
    if (segmentLength < 2 || dataStart + segmentLength - 2 > buf.length) break;
    probe.stripCount++;

    if (marker >= 0xe0 && marker <= 0xef) {
      const identifier = readCString(buf, dataStart, Math.min(30, segmentLength - 2));
      const lower = identifier.toLowerCase();
      if (lower.startsWith('exif')) {
        parseTiff(buf.slice(dataStart + 6, dataStart + segmentLength - 2), probe);
      } else if (lower.startsWith('photoshop')) {
        probe.hasPhotoshopIrb = true;
      } else if (lower.includes('ns.adobe.com/xap')) {
        probe.hasXmp = true;
        probe.metadata['XMP'] = 'present';
      }
    } else if (marker === 0xfe) {
      probe.metadata['Comment'] = readCString(buf, dataStart, Math.min(120, segmentLength - 2));
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      probe.height = buf.readUInt16BE(dataStart + 1);
      probe.width = buf.readUInt16BE(dataStart + 3);
    }
    offset = dataStart + segmentLength - 2;
  }
}

function probeWebp(buf: Buffer, probe: ImageProbe): void {
  if (buf.length < 30) return;
  const fourcc = readCString(buf, 12, 4);
  if (fourcc === 'VP8X') {
    probe.width = 1 + buf.readUIntLE(24, 3);
    probe.height = 1 + buf.readUIntLE(27, 3);
  } else if (fourcc === 'VP8 ') {
    probe.width = buf.readUInt16LE(26) & 0x3fff;
    probe.height = buf.readUInt16LE(28) & 0x3fff;
  } else if (fourcc === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    probe.width = (bits & 0x3fff) + 1;
    probe.height = ((bits >> 14) & 0x3fff) + 1;
  }
}

export function probeImage(buf: Buffer): ImageProbe {
  const probe: ImageProbe = {
    format: 'UNKNOWN',
    width: null,
    height: null,
    metadata: {},
    hasPhotoshopIrb: false,
    hasXmp: false,
    stripCount: 0,
  };
  if (buf.length < 12) return probe;

  if (buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') {
    probe.format = 'PNG';
    probePng(buf, probe);
  } else if (buf[0] === 0xff && buf[1] === 0xd8) {
    probe.format = 'JPEG';
    probeJpeg(buf, probe);
  } else if (buf.subarray(0, 3).toString('latin1') === 'GIF') {
    probe.format = 'GIF';
    probe.width = buf.readUInt16LE(6);
    probe.height = buf.readUInt16LE(8);
  } else if (buf.subarray(0, 2).toString('latin1') === 'BM') {
    probe.format = 'BMP';
    probe.width = buf.readInt32LE(18);
    probe.height = Math.abs(buf.readInt32LE(22));
  } else if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    probe.format = 'WEBP';
    probeWebp(buf, probe);
  }

  return probe;
}

export interface ForensicFinding {
  code: string;
  detail: string;
  severity: 'INFO' | 'WARN' | 'HIGH';
  weight: number;
}

/**
 * Turns a probe plus the order context into weighted signals. Scores are
 * indicative only: they decide review priority, never payment verification.
 */
export function analyseProof(
  buf: Buffer,
  probe: ImageProbe,
  ctx: { declaredMimeType: string; fileName: string; reference: string; amount: number; payeeName: string }
): ForensicFinding[] {
  const findings: ForensicFinding[] = [];

  const mimeFormat: Record<string, ImageFormat> = {
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
    'image/jpg': 'JPEG',
    'image/webp': 'WEBP',
    'image/gif': 'GIF',
    'image/bmp': 'BMP',
  };
  const declared = mimeFormat[ctx.declaredMimeType.toLowerCase()];
  if (probe.format === 'UNKNOWN') {
    findings.push({
      code: 'NOT_A_READABLE_IMAGE',
      detail: 'The uploaded bytes do not start with a PNG, JPEG, GIF, BMP or WebP signature.',
      severity: 'HIGH',
      weight: 40,
    });
  } else if (declared && declared !== probe.format) {
    findings.push({
      code: 'FORMAT_MISMATCH',
      detail: `Declared as ${ctx.declaredMimeType} but the bytes are ${probe.format}.`,
      severity: 'WARN',
      weight: 15,
    });
  }

  const software = (ctx.fileName || '').toLowerCase();
  const metaText = Object.values(probe.metadata).join(' ').toLowerCase();
  const editingHit = SOFTWARE_MARKERS.find((m) => metaText.includes(m) || software.includes(m));
  if (editingHit) {
    findings.push({
      code: 'EDITING_SOFTWARE_TAG',
      detail: `An editor signature was found ("${editingHit}") in the file name or embedded metadata.`,
      severity: 'HIGH',
      weight: 30,
    });
  }
  if (probe.hasPhotoshopIrb) {
    findings.push({ code: 'PHOTOSHOP_IRB', detail: 'The file carries a Photoshop resource block.', severity: 'HIGH', weight: 30 });
  }
  if (probe.hasXmp) {
    findings.push({
      code: 'XMP_PRESENT',
      detail: 'XMP packet present — common in images exported from an editing app; check the history it records.',
      severity: 'WARN',
      weight: 12,
    });
  }

  if (probe.format !== 'UNKNOWN' && (probe.width == null || probe.height == null)) {
    findings.push({
      code: 'NO_DIMENSIONS',
      detail: 'Dimensions could not be decoded from the image header.',
      severity: 'WARN',
      weight: 10,
    });
  } else if (probe.width && probe.height) {
    if (probe.width < 240 || probe.height < 240) {
      findings.push({
        code: 'TINY_IMAGE',
        detail: `${probe.width}x${probe.height}: too small to hold a legible MoMo receipt — likely a crop or thumbnail.`,
        severity: 'WARN',
        weight: 15,
      });
    } else {
      findings.push({
        code: 'DIMENSIONS',
        detail: `Decoded size ${probe.width}x${probe.height}.`,
        severity: 'INFO',
        weight: 0,
      });
    }
  }

  const stripped = probe.format === 'JPEG' && !probe.metadata['Software'] && !probe.metadata['Make'] && !probe.metadata['DateTime'];
  if (stripped) {
    findings.push({
      code: 'EXIF_STRIPPED',
      detail: 'The JPEG carries no camera or software metadata. Normal for a re-shared screenshot, worth confirming with the OCR text.',
      severity: 'INFO',
      weight: 5,
    });
  }

  if (ctx.fileName && /edited|copy of|modified|final|\bv\d+\b/i.test(ctx.fileName)) {
    findings.push({
      code: 'FILENAME_HINT',
      detail: `File name "${ctx.fileName}" suggests a modified copy.`,
      severity: 'WARN',
      weight: 10,
    });
  }

  if (buf.length > 8 * 1024 * 1024) {
    findings.push({ code: 'LARGE_FILE', detail: 'File exceeds 8 MB.', severity: 'INFO', weight: 2 });
  }

  const referenceInName = ctx.reference && ctx.fileName.toLowerCase().includes(ctx.reference.toLowerCase());
  if (referenceInName) {
    findings.push({
      code: 'REFERENCE_IN_FILENAME',
      detail: `The order reference appears in the file name, which can happen when a receipt is renamed by hand.`,
      severity: 'INFO',
      weight: 0,
    });
  }

  return findings;
}

export function riskFrom(findings: ForensicFinding[]): { score: number; band: 'LOW' | 'MEDIUM' | 'HIGH' } {
  const score = findings.reduce((n, f) => n + f.weight, 0);
  const band = score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';
  return { score, band };
}
