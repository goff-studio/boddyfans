/**
 * Receipts share their preparation with chat images — see ./images.ts, which
 * owns the size arithmetic that keeps a base64 payload inside Firestore's 1 MiB
 * document limit.
 */
export {
  prepareReceipt,
  imageDataUrl as receiptDataUrl,
  ACCEPTED_RECEIPT_TYPES as ACCEPTED_TYPES,
  MAX_RECEIPT_BYTES,
  type StoredImage as PreparedReceipt,
  type PrepareResult,
} from './images'
