import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid misread digits

function token(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${token(6).toLowerCase()}`;
}

/**
 * Payment reference shown to the customer and quoted in the MoMo transfer.
 * Readable over the phone and unguessable.
 */
export function newPaymentReference(): string {
  return `AGK${token(4)}${token(4)}`;
}
