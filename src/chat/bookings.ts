import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import {
  createAccountOutOfBand,
  generatePassphrase,
  getDb,
  normalizeUsername,
  usernameToEmail,
} from '../firebase'
import type { PreparedReceipt } from './receipt'

/**
 * Bookings: the public write, the admin's list, and approval.
 *
 * Approval is the one operation that must not half-happen — see `approveBooking`.
 */

export type BookingStatus = 'pending' | 'approved' | 'declined'

export type Booking = {
  id: string
  name: string
  email?: string
  trackSlug: string
  /** Raw datetime-local string, kept verbatim as the client typed it. */
  preferredAt: string
  reference: string
  status: BookingStatus
  clientUid?: string
  conversationId?: string
  createdAt: Date | null
  approvedAt: Date | null
}

const asDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null)

function toBooking(id: string, d: Record<string, unknown>): Booking {
  return {
    id,
    name: String(d.name ?? ''),
    email: d.email ? String(d.email) : undefined,
    trackSlug: String(d.trackSlug ?? ''),
    preferredAt: String(d.preferredAt ?? ''),
    reference: String(d.reference ?? ''),
    status: (d.status as BookingStatus) ?? 'pending',
    clientUid: d.clientUid ? String(d.clientUid) : undefined,
    conversationId: d.conversationId ? String(d.conversationId) : undefined,
    createdAt: asDate(d.createdAt),
    approvedAt: asDate(d.approvedAt),
  }
}

/* --- public write --------------------------------------------------------- */

export type NewBooking = {
  name: string
  /** Required: it is how a returning client is matched to their existing chat. */
  email: string
  trackSlug: string
  preferredAt: string
  reference: string
  receipt: PreparedReceipt
}

/**
 * Called from the public form by an unauthenticated visitor.
 *
 * The field set here must match `validNewBooking()` in firestore.rules exactly —
 * the rules pin the allowed keys, so an extra field fails the whole write rather
 * than being dropped.
 */
export async function submitBooking(input: NewBooking): Promise<string> {
  const db = getDb()
  const ref = doc(collection(db, 'bookings'))

  await setDoc(ref, {
    name: input.name.trim().slice(0, 80),
    email: normalizeEmail(input.email),
    trackSlug: input.trackSlug,
    preferredAt: input.preferredAt,
    reference: input.reference,
    status: 'pending',
    createdAt: serverTimestamp(),
  })

  // Separate document, so listing bookings never loads the base64 payload.
  await setDoc(doc(db, 'bookings', ref.id, 'private', 'receipt'), {
    contentType: input.receipt.contentType,
    size: input.receipt.size,
    dataBase64: input.receipt.dataBase64,
    createdAt: serverTimestamp(),
  })

  return ref.id
}

/* --- admin reads --------------------------------------------------------- */

/**
 * Every booking, newest first. Status filtering happens in the caller.
 *
 * A `where('status', ...)` combined with `orderBy('createdAt', ...)` would need
 * a composite index — which means a console step, and a query that fails until
 * somebody does it. At this volume filtering 200 documents in memory costs
 * nothing and makes switching tabs instant. Revisit if bookings ever outgrow
 * the page size, at which point the index and a paginated query are worth it.
 */
export function watchBookings(
  onChange: (bookings: Booking[]) => void,
  onError: (e: unknown) => void,
): () => void {
  const q = query(collection(getDb(), 'bookings'), orderBy('createdAt', 'desc'), limit(200))

  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => toBooking(d.id, d.data()))),
    onError,
  )
}

export async function getBooking(id: string): Promise<Booking | null> {
  const snap = await getDoc(doc(getDb(), 'bookings', id))
  return snap.exists() ? toBooking(snap.id, snap.data()) : null
}

export async function getReceipt(
  bookingId: string,
): Promise<{ contentType: string; dataBase64: string; size: number } | null> {
  const snap = await getDoc(doc(getDb(), 'bookings', bookingId, 'private', 'receipt'))
  if (!snap.exists()) return null
  const d = snap.data()
  return {
    contentType: String(d.contentType),
    dataBase64: String(d.dataBase64),
    size: Number(d.size ?? 0),
  }
}

/**
 * The client's chat pointer, read from their own profile.
 *
 * Deliberately not a query over bookings: a returning client has several, so
 * picking the newest would need `where(clientUid) + orderBy(createdAt)` and
 * therefore a composite index. The profile already knows.
 */
export async function getMyChat(
  clientUid: string,
): Promise<{ conversationId: string; status: 'open' | 'closed' } | null> {
  const profile = await getDoc(doc(getDb(), 'users', clientUid))
  const conversationId = profile.data()?.conversationId
  if (typeof conversationId !== 'string' || !conversationId) return null
  return { conversationId, status: await getConversationStatus(conversationId) }
}

/* --- client identity ----------------------------------------------------- */

/**
 * Email is the identity key, so it must normalise to exactly one form.
 * Lowercased and trimmed; used verbatim as a document id, which is safe because
 * an address cannot contain a slash.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 200)
}

export type ExistingClient = { uid: string; username: string; conversationId: string }

/** Who this address already belongs to, if anyone. */
export async function findClientByEmail(email: string): Promise<ExistingClient | null> {
  const key = normalizeEmail(email)
  if (!key) return null
  const snap = await getDoc(doc(getDb(), 'clientsByEmail', key))
  if (!snap.exists()) return null
  const d = snap.data()
  return {
    uid: String(d.uid),
    username: String(d.username),
    conversationId: String(d.conversationId),
  }
}

/** Close a chat: the client can no longer write. Anna still can. */
export async function setChatOpen(conversationId: string, open: boolean): Promise<void> {
  await updateDoc(doc(getDb(), 'conversations', conversationId), {
    status: open ? 'open' : 'closed',
  })
}

export async function getConversationStatus(
  conversationId: string,
): Promise<'open' | 'closed'> {
  const snap = await getDoc(doc(getDb(), 'conversations', conversationId))
  return (snap.data()?.status as 'open' | 'closed') ?? 'open'
}

/* --- approval ------------------------------------------------------------ */

export type ApprovalResult = {
  username: string
  password: string
  conversationId: string
}

export async function isUsernameTaken(username: string): Promise<boolean> {
  const u = normalizeUsername(username)
  if (!u) return true
  const snap = await getDoc(doc(getDb(), 'usernames', u))
  return snap.exists()
}

/**
 * Approve a booking: mint the client's account and open the private chat.
 *
 * Ordering matters. The auth account is created first because it is the only
 * step that cannot be rolled back — Firebase has no client-side "delete another
 * user". Everything after it goes in a single batch, so a failure cannot leave a
 * booking approved with no conversation, or a profile with no username
 * reservation. If the batch fails, the orphan is an auth account with no
 * profile: harmless, since a profile-less account can read nothing at all.
 *
 * The password is returned once and never stored.
 */
export type ApprovalOutcome =
  | { kind: 'created'; credentials: ApprovalResult }
  /** Returning client: reconnected to their existing login and chat. */
  | { kind: 'reconnected'; username: string; conversationId: string }

/**
 * Approve a booking: connect it to a chat the client can reach.
 *
 * Two paths, decided by the booking email:
 *
 *   - **Returning client** — reuse their account and conversation, reopen it,
 *     and point the new booking at it. No new account, and deliberately no new
 *     password: their existing login still works, and rotating it silently
 *     would lock them out of a chat they can already see.
 *   - **New client** — provision an account as before.
 *
 * Account creation comes first because it is the only step that cannot be
 * rolled back client-side; everything after is one batch, so a failure cannot
 * leave a booking approved with no reachable chat.
 */
export async function approveBooking(
  booking: Booking,
  adminUid: string,
  desiredUsername: string,
): Promise<ApprovalOutcome> {
  const db = getDb()
  const email = normalizeEmail(booking.email ?? '')
  if (!email) {
    throw new Error('This booking has no email, so it cannot be linked to a client.')
  }

  const existing = await findClientByEmail(email)

  if (existing) {
    const batch = writeBatch(db)
    // Reopening is the whole point of approving a repeat booking.
    batch.update(doc(db, 'conversations', existing.conversationId), {
      status: 'open',
      bookingId: booking.id,
      lastMessageAt: serverTimestamp(),
    })
    batch.update(doc(db, 'bookings', booking.id), {
      status: 'approved',
      clientUid: existing.uid,
      conversationId: existing.conversationId,
      approvedAt: serverTimestamp(),
    })
    await batch.commit()
    return {
      kind: 'reconnected',
      username: existing.username,
      conversationId: existing.conversationId,
    }
  }

  const username = normalizeUsername(desiredUsername)
  if (!username) throw new Error('Pick a username of at least one character.')
  if (await isUsernameTaken(username)) {
    throw new Error(`The username "${username}" is already taken.`)
  }

  const password = generatePassphrase()
  const clientUid = await createAccountOutOfBand(usernameToEmail(username), password)

  const conversationRef = doc(collection(db, 'conversations'))
  const batch = writeBatch(db)

  batch.set(doc(db, 'users', clientUid), {
    username,
    displayName: booking.name,
    email,
    role: 'client',
    bookingId: booking.id,
    // Held here so the client's screen needs no query over bookings, which
    // would want a composite index it does not otherwise need.
    conversationId: conversationRef.id,
    createdAt: serverTimestamp(),
  })
  batch.set(doc(db, 'usernames', username), { uid: clientUid })
  batch.set(doc(db, 'clientsByEmail', email), {
    uid: clientUid,
    username,
    conversationId: conversationRef.id,
  })
  batch.set(conversationRef, {
    bookingId: booking.id,
    participants: [adminUid, clientUid],
    status: 'open',
    createdAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
  })
  batch.update(doc(db, 'bookings', booking.id), {
    status: 'approved',
    clientUid,
    conversationId: conversationRef.id,
    approvedAt: serverTimestamp(),
  })

  await batch.commit()

  return {
    kind: 'created',
    credentials: { username, password, conversationId: conversationRef.id },
  }
}

/**
 * Issue a fresh login for an already-approved booking.
 *
 * There is no "reset this other user's password" on the Spark plan: that needs
 * the Admin SDK, and `updatePassword` only works for the signed-in user. So a
 * reissue provisions a NEW account and moves the booking and the conversation
 * onto it. Consequences, both surfaced in the UI:
 *
 *   - the username changes (the old email already exists, so it cannot be
 *     reused)
 *   - the previous login stops working, because it is no longer a participant
 *
 * Chat history survives: the conversation document is reused, only its
 * participants change.
 */
export async function reissueAccess(
  booking: Booking,
  adminUid: string,
  desiredUsername: string,
): Promise<ApprovalResult> {
  if (!booking.conversationId) {
    throw new Error('This booking has no chat yet — approve it first.')
  }
  const username = normalizeUsername(desiredUsername)
  if (!username) throw new Error('Pick a username of at least one character.')
  if (await isUsernameTaken(username)) {
    throw new Error(`The username "${username}" is already taken.`)
  }

  const password = generatePassphrase()
  const clientUid = await createAccountOutOfBand(usernameToEmail(username), password)

  const db = getDb()
  const batch = writeBatch(db)

  batch.set(doc(db, 'users', clientUid), {
    username,
    displayName: booking.name,
    ...(booking.email ? { email: booking.email } : {}),
    role: 'client',
    bookingId: booking.id,
    conversationId: booking.conversationId,
    createdAt: serverTimestamp(),
  })
  batch.set(doc(db, 'usernames', username), { uid: clientUid })

  // The email index must follow the new uid, or this client's next booking
  // would reconnect them to the login that was just retired.
  const email = normalizeEmail(booking.email ?? '')
  if (email) {
    batch.set(doc(db, 'clientsByEmail', email), {
      uid: clientUid,
      username,
      conversationId: booking.conversationId,
    })
  }

  // Same conversation, new participant — the old uid loses access here.
  batch.update(doc(db, 'conversations', booking.conversationId), {
    participants: [adminUid, clientUid],
  })
  batch.update(doc(db, 'bookings', booking.id), { clientUid })

  await batch.commit()

  return { username, password, conversationId: booking.conversationId }
}

export async function declineBooking(bookingId: string): Promise<void> {
  await updateDoc(doc(getDb(), 'bookings', bookingId), { status: 'declined' })
}
