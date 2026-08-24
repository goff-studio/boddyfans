/**
 * Firestore layout.
 *
 *   conversations/{conversationId}
 *     bookingId: string               // the booking this chat belongs to
 *     participants: [adminUid, clientUid]   // rules check membership against this
 *     createdAt, lastMessageAt
 *
 *   conversations/{conversationId}/messages/{messageId}
 *     senderUid, sentAt, text
 *
 * The conversation deliberately stores no message preview. A preview would be
 * a copy of message text living outside the messages collection, which would
 * quietly defeat encryption the day it is switched back on.
 */

export const CONVERSATIONS = 'conversations'
export const MESSAGES = 'messages'

export const conversationPath = (id: string) => `${CONVERSATIONS}/${id}`
export const messagesPath = (id: string) => `${CONVERSATIONS}/${id}/${MESSAGES}`

export type ConversationDoc = {
  bookingId: string
  participants: string[]
  createdAt: unknown
  lastMessageAt: unknown
}

export type MessageDoc = {
  senderUid: string
  sentAt: unknown
  /**
   * Plaintext, by current decision. When encryption returns this becomes the
   * SealedMessage shape from ./crypto — see the ENCRYPTION SEAM markers in
   * ./client.ts.
   */
  text: string
}

/** A message ready to render. */
export type ChatMessage = {
  id: string
  senderUid: string
  sentAt: Date | null
  /** Null when the body is unreadable — never fall back to raw bytes. */
  text: string | null
  failed: boolean
}

/**
 * Firestore ids are auto-generated and safe for the AAD, but ids that arrive
 * from anywhere else are not. The AAD joins fields with a space, so anything
 * containing one is rejected outright rather than silently changing meaning.
 */
export function assertIdSafe(label: string, id: string): void {
  if (!id || id.includes(' ')) {
    throw new Error(`${label} must be non-empty and contain no spaces: ${JSON.stringify(id)}`)
  }
}
