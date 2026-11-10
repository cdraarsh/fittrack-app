// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decryptApiKey, encryptApiKey, hasEncryptionSecret } from '@/lib/garmin/crypto';
import { GarminNotConfiguredError } from '@/lib/garmin/errors';

const SECRET = 'test-secret-0123456789abcdef';

describe('garmin key crypto', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const a = encryptApiKey('my-garmin-key', SECRET);
    const b = encryptApiKey('my-garmin-key', SECRET);
    expect(a).not.toBe(b);
    expect(a).not.toContain('my-garmin-key');
    expect(decryptApiKey(a, SECRET)).toBe('my-garmin-key');
    expect(decryptApiKey(b, SECRET)).toBe('my-garmin-key');
  });

  it('fails with the wrong secret or tampered ciphertext', () => {
    const enc = encryptApiKey('k', SECRET);
    expect(() => decryptApiKey(enc, 'another-secret-0123456789')).toThrow();
    const parts = enc.split('.');
    parts[3] = Buffer.from('zz').toString('base64url');
    expect(() => decryptApiKey(parts.join('.'), SECRET)).toThrow();
  });

  it('reports a missing secret as not configured', () => {
    expect(hasEncryptionSecret(undefined)).toBe(false);
    expect(() => encryptApiKey('k', undefined)).toThrow(GarminNotConfiguredError);
    expect(() => encryptApiKey('k', 'short')).toThrow(GarminNotConfiguredError);
  });
});
