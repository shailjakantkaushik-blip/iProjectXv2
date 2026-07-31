/**
 * Encryption for integration API tokens.
 * Uses INTEGRATIONS_SECRETS_KEK if set, else BYOD_SECRETS_KEK (≥32 chars).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function getKek(): Buffer {
  const raw =
    process.env.INTEGRATIONS_SECRETS_KEK?.trim() ||
    process.env.BYOD_SECRETS_KEK?.trim();
  if (!raw || raw.length < 32) {
    throw new Error(
      "Set INTEGRATIONS_SECRETS_KEK or BYOD_SECRETS_KEK (≥32 characters) to store integration secrets.",
    );
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export function isIntegrationsKekConfigured(): boolean {
  const raw =
    process.env.INTEGRATIONS_SECRETS_KEK?.trim() ||
    process.env.BYOD_SECRETS_KEK?.trim();
  return Boolean(raw && raw.length >= 32);
}

export function encryptIntegrationSecret(plaintext: string): {
  ciphertext: string;
  nonce: string;
} {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKek(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString("base64"),
    nonce: iv.toString("base64"),
  };
}

export function decryptIntegrationSecret(ciphertextB64: string, nonceB64: string): string {
  const buf = Buffer.from(ciphertextB64, "base64");
  if (buf.length < 17) throw new Error("Invalid integration secret ciphertext");
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", getKek(), Buffer.from(nonceB64, "base64"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function secretHint(secret: string): string {
  const s = secret.trim();
  if (s.length <= 4) return "••••";
  return `••••${s.slice(-4)}`;
}
