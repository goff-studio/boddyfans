/**
 * Client-side image preparation, for both bank receipts and chat images.
 *
 * There is no Cloud Storage (it needs Blaze), so images live inside Firestore
 * documents as base64. That imposes a hard ceiling: a document is capped at
 * 1 MiB *including* field names, and base64 inflates bytes by 4/3. So the raw
 * byte budget is roughly 770KB, and anything bigger has to be re-encoded down
 * or refused — never truncated.
 *
 * `MAX_*_BYTES` below are raw, pre-encoding. Keep them in step with the caps in
 * firestore.rules; the rules are what actually stop an oversized write.
 */

/** Receipts get the larger budget: they are read once, and legibility matters. */
export const MAX_RECEIPT_BYTES = 700_000
/** Chat images are viewed inline, so a tighter budget keeps the thread quick. */
export const MAX_CHAT_IMAGE_BYTES = 600_000

/** Base64 length ceiling the rules enforce, derived from the byte budgets. */
export const maxBase64Length = (rawBytes: number) => Math.ceil(rawBytes / 3) * 4

export type StoredImage = {
  contentType: string
  /** Raw byte length, before base64. */
  size: number
  dataBase64: string
}

export const ACCEPTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
]

export const ACCEPTED_RECEIPT_TYPES = [...ACCEPTED_IMAGE_TYPES, 'application/pdf']

/** Types that may be stored as-is when re-encoding was not possible. */
const STORABLE_AS_IS = ['image/png', 'image/jpeg', 'image/webp']

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

async function fileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

/**
 * Draw to a canvas at a bounded size and re-encode as JPEG, stepping quality
 * down until it fits. Returns null when the browser cannot decode the file at
 * all — a HEIC outside Safari, typically.
 */
async function reencode(
  file: File,
  maxEdge: number,
  maxBytes: number,
): Promise<StoredImage | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => resolve(null)
      el.src = url
    })
    if (!img || !img.naturalWidth) return null

    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // White ground: flattening a transparent PNG into JPEG would otherwise
    // turn the transparent parts black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)

    for (const quality of [0.82, 0.7, 0.6, 0.45, 0.35]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      )
      if (!blob) continue
      if (blob.size <= maxBytes) {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        return {
          contentType: 'image/jpeg',
          size: bytes.length,
          dataBase64: toBase64(bytes),
        }
      }
    }
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

export type PrepareResult =
  | { ok: true; image: StoredImage }
  | { ok: false; reason: string }

async function prepare(
  file: File,
  { maxEdge, maxBytes, accepted, allowPdf }: {
    maxEdge: number
    maxBytes: number
    accepted: string[]
    allowPdf: boolean
  },
): Promise<PrepareResult> {
  if (!accepted.includes(file.type)) {
    return {
      ok: false,
      reason: allowPdf
        ? 'Use a photo, screenshot or PDF.'
        : 'That file is not an image. Use a PNG, JPEG or HEIC.',
    }
  }

  if (file.type === 'application/pdf') {
    // A PDF cannot be re-compressed in the browser: it fits or it does not.
    const bytes = await fileBytes(file)
    if (bytes.length > maxBytes) {
      return {
        ok: false,
        reason: 'That PDF is too large to attach. A screenshot works better.',
      }
    }
    return {
      ok: true,
      image: {
        contentType: 'application/pdf',
        size: bytes.length,
        dataBase64: toBase64(bytes),
      },
    }
  }

  const shrunk = await reencode(file, maxEdge, maxBytes)
  if (shrunk) return { ok: true, image: shrunk }

  const bytes = await fileBytes(file)
  if (STORABLE_AS_IS.includes(file.type) && bytes.length <= maxBytes) {
    return {
      ok: true,
      image: { contentType: file.type, size: bytes.length, dataBase64: toBase64(bytes) },
    }
  }
  return {
    ok: false,
    reason: 'That image could not be read. A PNG or JPEG works best.',
  }
}

export function prepareReceipt(file: File): Promise<PrepareResult> {
  return prepare(file, {
    maxEdge: 1400,
    maxBytes: MAX_RECEIPT_BYTES,
    accepted: ACCEPTED_RECEIPT_TYPES,
    allowPdf: true,
  })
}

export function prepareChatImage(file: File): Promise<PrepareResult> {
  return prepare(file, {
    maxEdge: 1200,
    maxBytes: MAX_CHAT_IMAGE_BYTES,
    accepted: ACCEPTED_IMAGE_TYPES,
    allowPdf: false,
  })
}

export function imageDataUrl(i: { contentType: string; dataBase64: string }): string {
  return `data:${i.contentType};base64,${i.dataBase64}`
}
