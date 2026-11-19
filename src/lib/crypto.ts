import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getAuthSecret } from "./auth";

/** Encrypt secrets before they are stored (WhatsApp access tokens).
 *
 * AES-256-GCM with a key derived from AUTH_SECRET, so the database
 * alone never holds a usable token. Stored format:
 *   enc:v1:<iv>:<authTag>:<ciphertext>   (each part base64url)
 * The version tag lets a future change swap algorithms without
 * breaking old rows. */

const PREFIX = "enc:v1:";

function encryptionKey(): Buffer {
  // SHA-256 of the app secret gives a stable 32-byte key. Rotating
  // AUTH_SECRET therefore also rotates this key — old tokens would
  // need to be re-entered, which is the safe failure mode.
  return createHash("sha256").update(getAuthSecret()).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(":")
  );
}

/** Returns null for anything that is not a value we encrypted. */
export function decryptSecret(stored: string): string | null {
  if (!stored.startsWith(PREFIX)) return null;
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
