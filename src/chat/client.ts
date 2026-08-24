import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { getDb } from '../firebase'
import { assertIdSafe, messagesPath, type ChatMessage, type MessageDoc } from './schema'

/**
 * Chat reads and writes.
 *
 * Messages are stored in PLAINTEXT for now, by decision. `./crypto.ts` holds a
 * tested AES-GCM implementation for when that changes; the two call sites are
 * marked ENCRYPTION SEAM below. Nothing else in the app needs to know.
 */

export async function sendMessage(
  conversationId: string,
  senderUid: string,
  text: string,
): Promise<void> {
  assertIdSafe('conversationId', conversationId)
  assertIdSafe('senderUid', senderUid)

  const body = text.trim()
  if (!body) return
  // Matches the 4000-character cap in firestore.rules; failing here gives a
  // usable error instead of a permission-denied.
  if (body.length > 4000) throw new Error('That message is too long.')

  const db = getDb()
  const ref = doc(collection(db, messagesPath(conversationId)))
  assertIdSafe('messageId', ref.id)

  // ENCRYPTION SEAM (write): replace `text: body` with
  //   body: await sealMessage(key, version, { conversationId, messageId: ref.id, senderUid }, body)
  // and widen the `text` field in firestore.rules to the sealed shape.
  await setDoc(ref, {
    senderUid,
    sentAt: serverTimestamp(),
    text: body,
  })

  // Best-effort: lets the admin list order by recency. A client cannot write
  // here (the rules only allow the admin), so a failure is expected and ignored
  // rather than surfaced as a send error.
  updateDoc(doc(db, 'conversations', conversationId), {
    lastMessageAt: serverTimestamp(),
  }).catch(() => {})
}

/**
 * Live message list, oldest last. Returns an unsubscribe.
 *
 * Ordered descending in the query so `limit` keeps the most recent page, then
 * reversed for display — ascending with a limit would pin you to the oldest
 * messages instead.
 */
export function watchMessages(
  conversationId: string,
  onChange: (messages: ChatMessage[]) => void,
  onError: (e: unknown) => void,
  pageSize = 200,
): () => void {
  assertIdSafe('conversationId', conversationId)

  const q = query(
    collection(getDb(), messagesPath(conversationId)),
    orderBy('sentAt', 'desc'),
    limit(pageSize),
  )

  return onSnapshot(
    q,
    (snap) => {
      const out = snap.docs.map((d) => {
        const data = d.data() as MessageDoc & { text?: string }
        // ENCRYPTION SEAM (read): when bodies are sealed, decrypt here and set
        // `failed: true` on a rejected auth tag rather than showing raw bytes.
        return {
          id: d.id,
          senderUid: data.senderUid,
          sentAt: data.sentAt instanceof Timestamp ? data.sentAt.toDate() : null,
          text: typeof data.text === 'string' ? data.text : null,
          failed: typeof data.text !== 'string',
        } satisfies ChatMessage
      })
      onChange(out.reverse())
    },
    onError,
  )
}
