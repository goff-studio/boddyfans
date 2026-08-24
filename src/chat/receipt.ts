/**
 * Receipt preparation.
 *
 * Cloud Storage generally needs the Blaze plan on a new project, so receipts go
 * into Firestore instead — which caps a document at 1 MiB *including* field
 * names and base64's ~33% overhead. So images are re-encoded down to a size
 * that reliably fits, and anything that still will not fit is refused with an
 * explanation rather than silently truncated.
 *
 * When this moves to Cloud Storage, only `prepareReceipt` needs replacing.
 */

/** Leaves ~120KB of headroom under the 1 MiB document ceiling. */
const MAX_STORED_BYTES = 900_000
/** Long edge, in CSS pixels. A transfer confirmation stays legible well below this. */
const MAX_EDGE = 1400

export type PreparedReceipt = {
  contentType: string
  size: number
  dataBase64: string
}

export const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'application/pdf',
]

/** Stored types, after conversion. HEIC is re-encoded, so it is not here. */
const STORABLE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']

function toBase64(bytes: Uint8Array): string {
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
 * Draws the image to a canvas at a bounded size and re-encodes as JPEG,
 * stepping quality down until it fits. Returns null if the browser cannot
 * decode it at all (a HEIC on a non-Safari browser, typically).
 */
async function downscale(file: File): Promise<PreparedReceipt | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => resolve(null)
      el.src = url
    })
    if (!img || !img.naturalWidth) return null

    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    // Receipts are screenshots of text; a white ground avoids a black
    // background where a transparent PNG gets flattened into JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)

    for (const quality of [0.82, 0.7, 0.6, 0.45]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      )
      if (!blob) continue
      if (blob.size <= MAX_STORED_BYTES) {
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
  | { ok: true; receipt: PreparedReceipt }
  | { ok: false; reason: string }

export async function prepareReceipt(file: File): Promise<PrepareResult> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { ok: false, reason: 'Use a photo, screenshot or PDF of the transfer.' }
  }

  if (file.type === 'application/pdf') {
    // A PDF cannot be re-compressed in the browser, so it either fits or it does not.
    const bytes = await fileBytes(file)
    if (bytes.length > MAX_STORED_BYTES) {
      return {
        ok: false,
        reason: 'That PDF is too large to attach. A screenshot of the transfer works better.',
      }
    }
    return {
      ok: true,
      receipt: {
        contentType: 'application/pdf',
        size: bytes.length,
        dataBase64: toBase64(bytes),
      },
    }
  }

  const shrunk = await downscale(file)
  if (shrunk) return { ok: true, receipt: shrunk }

  // Could not decode — fall back to storing it as-is if it is small enough.
  const bytes = await fileBytes(file)
  if (STORABLE_TYPES.includes(file.type) && bytes.length <= MAX_STORED_BYTES) {
    return {
      ok: true,
      receipt: { contentType: file.type, size: bytes.length, dataBase64: toBase64(bytes) },
    }
  }
  return {
    ok: false,
    reason: 'That image could not be read. A PNG or JPEG screenshot works best.',
  }
}

/** For rendering a stored receipt back in the panel. */
export function receiptDataUrl(r: { contentType: string; dataBase64: string }): string {
  return `data:${r.contentType};base64,${r.dataBase64}`
}
