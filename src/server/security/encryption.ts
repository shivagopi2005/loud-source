import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard for AES-GCM
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY_HEX;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY_HEX must be a 64-character (32-byte) hex string in environment variables.'
    );
  }
  return Buffer.from(hex, 'hex');
}

export interface EncryptedPayload {
  iv: string;
  tag: string;
  ciphertext: string;
  version: number;
}

/**
 * Encrypt sensitive plaintext string using AES-256-GCM.
 * Never stores or returns plaintext in DB.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const tag = cipher.getAuthTag().toString('hex');

  const payload: EncryptedPayload = {
    iv: iv.toString('hex'),
    tag,
    ciphertext,
    version: 1,
  };

  return JSON.stringify(payload);
}

/**
 * Decrypt stored AES-256-GCM secret string.
 * Validates integrity via GCM authentication tag.
 */
export function decryptSecret(secretReference: string): string {
  if (!secretReference) {
    throw new Error('Secret reference cannot be empty');
  }

  try {
    const payload: EncryptedPayload = JSON.parse(secretReference);
    const key = getEncryptionKey();
    const iv = Buffer.from(payload.iv, 'hex');
    const tag = Buffer.from(payload.tag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(tag);

    let plaintext = decipher.update(payload.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  } catch (err) {
    throw new Error('Failed to decrypt secret: invalid or tampered ciphertext');
  }
}

/**
 * Mask a Discord bot token for safe frontend presentation.
 * Returns only the prefix and the last 4 characters.
 */
export function maskToken(token: string): string {
  if (!token || token.length < 10) return '********';
  const prefix = token.slice(0, 4);
  const suffix = token.slice(-4);
  return `${prefix}${'*'.repeat(token.length - 8)}${suffix}`;
}
