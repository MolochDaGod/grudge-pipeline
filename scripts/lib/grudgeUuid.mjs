/**
 * Deterministic asset grudgeUuid — SSOT with browser uuid-verify.js
 * UUID-v5 style: SHA-1("grudge-asset:" + r2Key) → formatted UUID
 */
import crypto from 'crypto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(s) {
  return typeof s === 'string' && UUID_RE.test(s.trim());
}

export function normalizeR2Key(r2Key) {
  return String(r2Key || '')
    .replace(/\\/g, '/')
    .replace(/^\//, '')
    .trim();
}

/**
 * @param {string} r2Key relative R2 path e.g. models/codex/.../anvil.glb
 * @returns {string|null}
 */
export function grudgeUuidFromR2Key(r2Key) {
  const key = normalizeR2Key(r2Key);
  if (!key) return null;
  const hash = crypto.createHash('sha1').update(`grudge-asset:${key}`, 'utf8').digest();
  const b = Buffer.from(hash);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC variant
  const hex = b.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function verifyPair(r2Key, declaredUuid) {
  const expected = grudgeUuidFromR2Key(r2Key);
  if (!expected) {
    return { status: 'missing', expected: null, message: 'Empty r2Key' };
  }
  if (!declaredUuid) {
    return { status: 'derived', expected, uuid: expected, message: 'No declared UUID — use derived' };
  }
  if (!isValidUuid(declaredUuid)) {
    return { status: 'invalid', expected, uuid: declaredUuid, message: 'Invalid UUID format' };
  }
  if (declaredUuid.toLowerCase() !== expected.toLowerCase()) {
    return {
      status: 'mismatch',
      expected,
      uuid: declaredUuid,
      message: 'Declared UUID ≠ hash(grudge-asset:r2Key)',
    };
  }
  return { status: 'ok', expected, uuid: declaredUuid, message: 'Matches r2Key hash' };
}
