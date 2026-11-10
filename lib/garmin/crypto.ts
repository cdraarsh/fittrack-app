/**
 * AES-256-GCM encryption for the stored Garmin API key.
 * Secret: env GARMIN_KEY_ENC_SECRET (any high-entropy string; a 32-byte key is
 * derived with SHA-256). Format: "v1.<iv>.<tag>.<ciphertext>" (base64url).
 * Server-only — never import from client components.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { GarminNotConfiguredError } from './errors';

const VERSION = 'v1';
const IV_BYTES = 12;

function keyFrom(secret: string | undefined): Buffer {
  if (!secret || secret.length < 16) throw new GarminNotConfiguredError(['GARMIN_KEY_ENC_SECRET']);
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function hasEncryptionSecret(secret = process.env.GARMIN_KEY_ENC_SECRET): boolean {
  return !!secret && secret.length >= 16;
}

export function encryptApiKey(plain: string, secret = process.env.GARMIN_KEY_ENC_SECRET): string {
  const key = keyFrom(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptApiKey(enc: string, secret = process.env.GARMIN_KEY_ENC_SECRET): string {
  const key = keyFrom(secret);
  const [v, iv, tag, ct] = enc.split('.');
  if (v !== VERSION || !iv || !tag || ct === undefined) throw new Error('Unrecognised encrypted key format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}
