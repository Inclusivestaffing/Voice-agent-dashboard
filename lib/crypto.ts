// AES-256-GCM encryption for Retell API keys at rest.
// Key source, in order:
//  1. ENCRYPTION_KEY: 32 random bytes, base64-encoded (openssl rand -base64 32). Preferred.
//  2. Otherwise, derived (HKDF-SHA256) from the Vercel storage token (KV_REST_API_TOKEN), which
//     Vercel injects automatically when Upstash Redis is connected. That way the live site works
//     without anyone creating a key by hand; data leaked from the store alone stays unreadable.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export function encryptionKey(): Buffer | null {
  const k = process.env.ENCRYPTION_KEY;
  if (k) {
    const buf = Buffer.from(k, "base64");
    return buf.length === 32 ? buf : null;
  }
  const storeToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (storeToken && storeToken.length >= 16) {
    return Buffer.from(hkdfSync("sha256", storeToken, "voice-analytics", "retell-connection-encryption-v1", 32));
  }
  return null;
}

function key(): Buffer {
  const k = encryptionKey();
  if (!k) throw new Error("No encryption key: set ENCRYPTION_KEY (32 bytes, base64) or connect Vercel storage.");
  return k;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1") throw new Error("Unknown ciphertext version");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
