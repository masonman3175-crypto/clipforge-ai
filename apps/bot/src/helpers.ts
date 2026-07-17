import crypto from 'node:crypto';

export function generateKey(): string {
  const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `CLIP-${seg()}-${seg()}`;
}

export function hashFingerprint(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}
