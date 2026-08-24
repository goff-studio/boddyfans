import test from 'node:test'
import assert from 'node:assert/strict'
import {
  exportConversationKey,
  fromBase64,
  generateConversationKey,
  importConversationKey,
  openMessage,
  sealMessage,
  toBase64,
  type MessageContext,
} from './crypto'

const CTX: MessageContext = {
  conversationId: 'conv_abc123',
  messageId: 'msg_000111',
  senderUid: 'uid_anna',
}

test('round-trips a message', async () => {
  const key = await generateConversationKey()
  const sealed = await sealMessage(key, 1, CTX, 'knee feels better today')
  assert.equal(await openMessage(key, sealed, CTX), 'knee feels better today')
})

test('round-trips unicode and long bodies', async () => {
  const key = await generateConversationKey()
  const body = 'ciao 🙂 ' + 'à'.repeat(20_000)
  const sealed = await sealMessage(key, 1, CTX, body)
  assert.equal(await openMessage(key, sealed, CTX), body)
})

test('stores no plaintext', async () => {
  const key = await generateConversationKey()
  const secret = 'lower back pain since Tuesday'
  const sealed = await sealMessage(key, 1, CTX, secret)
  const blob = JSON.stringify(sealed)
  assert.ok(!blob.includes(secret))
  assert.ok(!blob.includes('lower back'))
  // ciphertext must not be a recognisable encoding of the plaintext either
  assert.ok(!blob.includes(Buffer.from(secret).toString('base64')))
})

test('uses a fresh nonce every time', async () => {
  const key = await generateConversationKey()
  const ivs = new Set<string>()
  const cts = new Set<string>()
  for (let i = 0; i < 500; i++) {
    const s = await sealMessage(key, 1, { ...CTX, messageId: `msg_${i}` }, 'same text')
    ivs.add(s.iv)
    cts.add(s.ct)
  }
  assert.equal(ivs.size, 500, 'nonce reuse under one key breaks AES-GCM entirely')
  assert.equal(cts.size, 500, 'identical plaintext must not produce identical ciphertext')
})

test('rejects a tampered ciphertext', async () => {
  const key = await generateConversationKey()
  const sealed = await sealMessage(key, 1, CTX, 'transfer sent')
  const bytes = fromBase64(sealed.ct)
  bytes[0] ^= 0x01
  await assert.rejects(() => openMessage(key, { ...sealed, ct: toBase64(bytes) }, CTX))
})

test('rejects a tampered nonce', async () => {
  const key = await generateConversationKey()
  const sealed = await sealMessage(key, 1, CTX, 'transfer sent')
  const iv = fromBase64(sealed.iv)
  iv[0] ^= 0x01
  await assert.rejects(() => openMessage(key, { ...sealed, iv: toBase64(iv) }, CTX))
})

test('rejects the wrong key', async () => {
  const a = await generateConversationKey()
  const b = await generateConversationKey()
  const sealed = await sealMessage(a, 1, CTX, 'private')
  await assert.rejects(() => openMessage(b, sealed, CTX))
})

// The whole point of the AAD: a row copied between conversations must not open.
test('rejects a ciphertext moved to another conversation', async () => {
  const key = await generateConversationKey()
  const sealed = await sealMessage(key, 1, CTX, 'private')
  await assert.rejects(() =>
    openMessage(key, sealed, { ...CTX, conversationId: 'conv_other' }),
  )
})

test('rejects a ciphertext moved to another message slot', async () => {
  const key = await generateConversationKey()
  const sealed = await sealMessage(key, 1, CTX, 'private')
  await assert.rejects(() => openMessage(key, sealed, { ...CTX, messageId: 'msg_999' }))
})

test('rejects a ciphertext reattributed to another sender', async () => {
  const key = await generateConversationKey()
  const sealed = await sealMessage(key, 1, CTX, 'private')
  await assert.rejects(() => openMessage(key, sealed, { ...CTX, senderUid: 'uid_other' }))
})

test('rejects a downgraded key version', async () => {
  const key = await generateConversationKey()
  const sealed = await sealMessage(key, 2, CTX, 'private')
  await assert.rejects(() => openMessage(key, { ...sealed, v: 1 }, CTX))
})

test('refuses ambiguous context fields', async () => {
  const key = await generateConversationKey()
  await assert.rejects(() => sealMessage(key, 1, { ...CTX, messageId: 'has space' }, 'x'))
  await assert.rejects(() => sealMessage(key, 1, { ...CTX, conversationId: '' }, 'x'))
})

test('imported keys are non-extractable', async () => {
  const raw = await exportConversationKey(await generateConversationKey())
  const imported = await importConversationKey(raw)
  assert.equal(imported.extractable, false)
  await assert.rejects(() => crypto.subtle.exportKey('raw', imported))
})

test('rejects a key of the wrong length', async () => {
  await assert.rejects(() => importConversationKey(new Uint8Array(16)))
})

test('an exported key still decrypts after re-import', async () => {
  const key = await generateConversationKey()
  const sealed = await sealMessage(key, 1, CTX, 'survives a wrap/unwrap cycle')
  const reimported = await importConversationKey(await exportConversationKey(key))
  assert.equal(await openMessage(reimported, sealed, CTX), 'survives a wrap/unwrap cycle')
})

test('base64 round-trips arbitrary bytes past the chunk boundary', async () => {
  // Larger than the 0x8000 chunk in toBase64, and filled in 64KB slices
  // because getRandomValues rejects requests over 65,536 bytes.
  const bytes = new Uint8Array(100_000)
  for (let i = 0; i < bytes.length; i += 65_536) {
    crypto.getRandomValues(bytes.subarray(i, Math.min(i + 65_536, bytes.length)))
  }
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes)
})

test('base64 handles empty and single-byte inputs', async () => {
  assert.deepEqual(fromBase64(toBase64(new Uint8Array(0))), new Uint8Array(0))
  assert.deepEqual(fromBase64(toBase64(new Uint8Array([0]))), new Uint8Array([0]))
  assert.deepEqual(fromBase64(toBase64(new Uint8Array([255]))), new Uint8Array([255]))
})
