import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
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
  email?: string
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
    ...(input.email?.trim() ? { email: input.email.trim().slice(0, 200) } : {}),
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

/** The client's own booking, for the client-side chat header. */
export async function getMyBooking(clientUid: string): Promise<Booking | null> {
  const snap = await getDocs(
    query(collection(getDb(), 'bookings'), where('clientUid', '==', clientUid), limit(1)),
  )
  const first = snap.docs[0]
  return first ? toBooking(first.id, first.data()) : null
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
export async function approveBooking(
  booking: Booking,
  adminUid: string,
  desiredUsername: string,
): Promise<ApprovalResult> {
  const username = normalizeUsername(desiredUsername)
  if (!username) throw new Error('Pick a username of at least one character.')
  if (await isUsernameTaken(username)) {
    throw new Error(`The username "${username}" is already taken.`)
  }

  const password = generatePassphrase()
  const clientUid = await createAccountOutOfBand(usernameToEmail(username), password)

  const db = getDb()
  const conversationRef = doc(collection(db, 'conversations'))
  const batch = writeBatch(db)

  batch.set(doc(db, 'users', clientUid), {
    username,
    displayName: booking.name,
    ...(booking.email ? { email: booking.email } : {}),
    role: 'client',
    bookingId: booking.id,
    createdAt: serverTimestamp(),
  })

  batch.set(doc(db, 'usernames', username), { uid: clientUid })

  batch.set(conversationRef, {
    bookingId: booking.id,
    participants: [adminUid, clientUid],
    createdAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
  })

  // A merge, not a rewrite: the rules reject any change to name/trackSlug/createdAt.
  batch.update(doc(db, 'bookings', booking.id), {
    status: 'approved',
    clientUid,
    conversationId: conversationRef.id,
    approvedAt: serverTimestamp(),
  })

  await batch.commit()

  return { username, password, conversationId: conversationRef.id }
}

export async function declineBooking(bookingId: string): Promise<void> {
  await updateDoc(doc(getDb(), 'bookings', bookingId), { status: 'declined' })
}
