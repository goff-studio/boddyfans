/**
 * Message encryption for the chat.
 *
 * CURRENTLY UNUSED. Messages are stored in plaintext by decision. This module
 * and its tests are kept because the decision is expected to reverse; the two
 * call sites that switch it on are marked ENCRYPTION SEAM in ./client.ts, and
 * `text` in firestore.rules would need to become the SealedMessage shape.
 *
 * Envelope scheme:
 *   - Each conversation has a random 256-bit data key (DEK).
 *   - The DEK is stored only in wrapped form (encrypted by a KEK in Cloud KMS)
 *     and is handed to an authorised client by a callable Function.
 *   - Message bodies are sealed with AES-256-GCM under that DEK before they
 *     ever reach Firestore.
 *
 * This is deliberately NOT end-to-end: the backend can unwrap the DEK, so the
 * practice can read its own history and meet record-keeping duties. What it
 * removes is cleartext at rest — nobody reading the database, a backup, or the
 * console sees message contents.
 *
 * What it does not hide: participants, timestamps, message counts and
 * approximate lengths. Those stay queryable, which is what makes the chat work.
 */

const ALGO = 'AES-GCM'
const KEY_BITS = 256
/** 96 bits is the GCM-recommended nonce size; other sizes cost an extra hash. */
const IV_BYTES = 12

/**
 * Byte buffers handed to WebCrypto must be backed by a real ArrayBuffer, not
 * the SharedArrayBuffer that a bare `Uint8Array` also permits — TypeScript 5.7+
 * distinguishes the two and `BufferSource` only accepts the former.
 */
export type Bytes = Uint8Array<ArrayBuffer>

/** Ciphertext as stored in Firestore. No field here is secret. */
export type SealedMessage = {
  /** Key version, so a rotated DEK can still read old messages. */
  v: number
  /** Base64 nonce. Random per message, never reused under one key. */
  iv: string
  /** Base64 AES-GCM output, authentication tag included. */
  ct: string
}

export type MessageContext = {
  conversationId: string
  messageId: string
  senderUid: string
}

/* --- base64 (works in browsers and in Node) -------------------------------- */

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  // Chunked: String.fromCharCode(...bigArray) exceeds the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

export function fromBase64(b64: string): Bytes {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/* --- keys ----------------------------------------------------------------- */

/** Fresh conversation key. Generated once, then wrapped and stored. */
export async function generateConversationKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALGO, length: KEY_BITS }, true, [
    'encrypt',
    'decrypt',
  ])
}

/**
 * Import a DEK handed over by the key Function.
 *
 * Imported as non-extractable, so the raw bytes cannot be read back out of the
 * handle afterwards — application code, or anything injected into it, cannot
 * exfiltrate the key material once it is imported.
 */
export async function importConversationKey(raw: Bytes): Promise<CryptoKey> {
  if (raw.length !== KEY_BITS / 8) {
    throw new Error(`conversation key must be ${KEY_BITS / 8} bytes, got ${raw.length}`)
  }
  return crypto.subtle.importKey('raw', raw, ALGO, false, ['encrypt', 'decrypt'])
}

/** Only for a freshly generated key that needs wrapping. Never for wire keys. */
export async function exportConversationKey(key: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key))
}

/* --- sealing -------------------------------------------------------------- */

/**
 * Additional authenticated data: not encrypted, but covered by the auth tag.
 * A ciphertext lifted into another conversation, message slot or sender fails
 * to open. Without this, GCM would happily decrypt a copy-pasted row.
 *
 * Fields are joined by a space and must not contain one, so the concatenation
 * cannot be made ambiguous by a crafted id.
 */
function aad(ctx: MessageContext, version: number): Bytes {
  const parts = [ctx.conversationId, ctx.messageId, ctx.senderUid, String(version)]
  if (parts.some((p) => p.length === 0 || p.includes(' '))) {
    throw new Error('message context fields must be non-empty and contain no spaces')
  }
  return new TextEncoder().encode(parts.join(' '))
}

export async function sealMessage(
  key: CryptoKey,
  version: number,
  ctx: MessageContext,
  plaintext: string,
): Promise<SealedMessage> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ct = await crypto.subtle.encrypt(
    { name: ALGO, iv, additionalData: aad(ctx, version) },
    key,
    new TextEncoder().encode(plaintext),
  )
  return { v: version, iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) }
}

/**
 * Rejects on a tampered ciphertext, a wrong key, or a context that differs
 * from the one it was sealed under. Treat a throw as "this message is not
 * displayable", never as "show it raw".
 */
export async function openMessage(
  key: CryptoKey,
  sealed: SealedMessage,
  ctx: MessageContext,
): Promise<string> {
  const iv = fromBase64(sealed.iv)
  if (iv.length !== IV_BYTES) throw new Error('bad nonce length')
  const pt = await crypto.subtle.decrypt(
    { name: ALGO, iv, additionalData: aad(ctx, sealed.v) },
    key,
    fromBase64(sealed.ct),
  )
  return new TextDecoder().decode(pt)
}
