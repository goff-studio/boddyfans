import test, { before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  getDocs,
} from 'firebase/firestore'

/**
 * Rules tests, run against the Firestore emulator (`npm run test:rules`).
 *
 * The load-bearing case is `a merely-authenticated account can read nothing`.
 * Public sign-up cannot be switched off on the Spark plan, so the whole
 * security model rests on authentication alone granting no access. If that test
 * ever goes red, the project is open.
 */

const PROJECT = 'body-fans-rules-test'
const ADMIN = 'uid_anna'
const CLIENT_A = 'uid_client_a'
const CLIENT_B = 'uid_client_b'
const STRANGER = 'uid_selfsignup'

let env: RulesTestEnvironment

const booking = (over: Record<string, unknown> = {}) => ({
  name: 'Giulia',
  email: 'giulia@example.com',
  trackSlug: 'connect',
  preferredAt: '2026-10-14T18:30',
  reference: 'CHAT · GIULIA',
  status: 'pending',
  createdAt: serverTimestamp(),
  ...over,
})

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
  })

  // The emulator keeps data between runs, so a second run would see documents
  // from the first — and `setDoc` on an existing document is an *update*, which
  // the immutability rules correctly deny. That looked like four rule failures
  // when it was really stale state.
  await env.clearFirestore()

  // Seed as god-mode: admin membership, profiles, a conversation, a message.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'admins', ADMIN), { createdAt: new Date() })
    await setDoc(doc(db, 'users', CLIENT_A), { username: 'a', role: 'client' })
    await setDoc(doc(db, 'users', CLIENT_B), { username: 'b', role: 'client' })
    await setDoc(doc(db, 'bookings', 'bk_a'), {
      ...booking({ createdAt: new Date() }),
      status: 'approved',
      clientUid: CLIENT_A,
      conversationId: 'conv_a',
    })
    await setDoc(doc(db, 'bookings', 'bk_a', 'private', 'receipt'), {
      contentType: 'image/png',
      size: 1234,
      dataBase64: 'aGVsbG8=',
      createdAt: new Date(),
    })
    await setDoc(doc(db, 'conversations', 'conv_a'), {
      bookingId: 'bk_a',
      participants: [ADMIN, CLIENT_A],
      status: 'open',
      createdAt: new Date(),
      lastMessageAt: new Date(),
    })
    // A second conversation, closed, to prove the write gate.
    await setDoc(doc(db, 'conversations', 'conv_shut'), {
      bookingId: 'bk_a',
      participants: [ADMIN, CLIENT_A],
      status: 'closed',
      createdAt: new Date(),
      lastMessageAt: new Date(),
    })
    await setDoc(doc(db, 'clientsByEmail', 'giulia@example.com'), {
      uid: CLIENT_A,
      username: 'a',
      conversationId: 'conv_a',
    })
    await setDoc(doc(db, 'conversations', 'conv_a', 'messages', 'm1'), {
      senderUid: ADMIN,
      sentAt: new Date(),
      text: 'existing',
    })
  })
})

after(async () => {
  await env?.cleanup()
})

const anon = () => env.unauthenticatedContext().firestore()
const as = (uid: string) => env.authenticatedContext(uid).firestore()

/* --- the public booking form ---------------------------------------------- */

test('anonymous visitor can create a pending booking', async () => {
  await assertSucceeds(setDoc(doc(anon(), 'bookings', 'bk_new'), booking()))
})

test('anonymous visitor cannot read any booking', async () => {
  await assertFails(getDoc(doc(anon(), 'bookings', 'bk_a')))
  await assertFails(getDocs(collection(anon(), 'bookings')))
})

test('anonymous visitor cannot self-approve', async () => {
  await assertFails(
    setDoc(doc(anon(), 'bookings', 'bk_evil1'), booking({ status: 'approved' })),
  )
  await assertFails(
    setDoc(doc(anon(), 'bookings', 'bk_evil2'), booking({ clientUid: STRANGER })),
  )
  await assertFails(
    setDoc(doc(anon(), 'bookings', 'bk_evil3'), booking({ conversationId: 'conv_a' })),
  )
})

test('anonymous visitor cannot smuggle extra fields or oversized values', async () => {
  await assertFails(setDoc(doc(anon(), 'bookings', 'bk_evil4'), booking({ isAdmin: true })))
  await assertFails(setDoc(doc(anon(), 'bookings', 'bk_evil5'), booking({ name: 'x'.repeat(81) })))
})

test('anonymous visitor cannot modify an existing booking', async () => {
  await assertFails(
    setDoc(doc(anon(), 'bookings', 'bk_a'), booking({ status: 'approved' })),
  )
})

/* --- the load-bearing test ------------------------------------------------ */

test('a merely-authenticated account can read nothing', async () => {
  const db = as(STRANGER)
  await assertFails(getDoc(doc(db, 'bookings', 'bk_a')))
  await assertFails(getDoc(doc(db, 'conversations', 'conv_a')))
  await assertFails(getDoc(doc(db, 'conversations', 'conv_a', 'messages', 'm1')))
  await assertFails(getDoc(doc(db, 'users', CLIENT_A)))
  await assertFails(getDoc(doc(db, 'bookings', 'bk_a', 'private', 'receipt')))
})

test('anyone signed in may check their own admin record, but not another\u2019s', async () => {
  // Reading your own (absent) admins doc must be ALLOWED — the client asks
  // "am I an admin?" on every sign-in, and a denial there is indistinguishable
  // from an error.
  await assertSucceeds(getDoc(doc(as(STRANGER), 'admins', STRANGER)))
  await assertFails(getDoc(doc(as(STRANGER), 'admins', ADMIN)))
  await assertSucceeds(getDoc(doc(as(CLIENT_A), 'admins', CLIENT_A)))
})

test('a stranger cannot grant themselves admin or a profile', async () => {
  await assertFails(setDoc(doc(as(STRANGER), 'admins', STRANGER), { createdAt: new Date() }))
  await assertFails(
    setDoc(doc(as(STRANGER), 'users', STRANGER), { username: 'x', role: 'client' }),
  )
})

/* --- client isolation ----------------------------------------------------- */

test('a client reads their own booking but not another client’s', async () => {
  await assertSucceeds(getDoc(doc(as(CLIENT_A), 'bookings', 'bk_a')))
  await assertFails(getDoc(doc(as(CLIENT_B), 'bookings', 'bk_a')))
})

test('a client cannot read a conversation they are not in', async () => {
  await assertSucceeds(getDoc(doc(as(CLIENT_A), 'conversations', 'conv_a')))
  await assertFails(getDoc(doc(as(CLIENT_B), 'conversations', 'conv_a')))
  await assertFails(getDoc(doc(as(CLIENT_B), 'conversations', 'conv_a', 'messages', 'm1')))
})

test('a client cannot read the bank receipt', async () => {
  await assertFails(getDoc(doc(as(CLIENT_A), 'bookings', 'bk_a', 'private', 'receipt')))
  await assertSucceeds(getDoc(doc(as(ADMIN), 'bookings', 'bk_a', 'private', 'receipt')))
})

test('a client cannot approve their own booking', async () => {
  await assertFails(
    setDoc(doc(as(CLIENT_A), 'bookings', 'bk_a'), booking({ status: 'approved' })),
  )
})

/* --- messages ------------------------------------------------------------- */

test('a participant can post as themselves', async () => {
  await assertSucceeds(
    setDoc(doc(as(CLIENT_A), 'conversations', 'conv_a', 'messages', 'm_a'), {
      senderUid: CLIENT_A,
      sentAt: serverTimestamp(),
      text: 'my knee is better',
    }),
  )
})

test('a participant cannot post as someone else', async () => {
  await assertFails(
    setDoc(doc(as(CLIENT_A), 'conversations', 'conv_a', 'messages', 'm_spoof'), {
      senderUid: ADMIN,
      sentAt: serverTimestamp(),
      text: 'from Anna, allegedly',
    }),
  )
})

test('a non-participant cannot post at all', async () => {
  await assertFails(
    setDoc(doc(as(CLIENT_B), 'conversations', 'conv_a', 'messages', 'm_x'), {
      senderUid: CLIENT_B,
      sentAt: serverTimestamp(),
      text: 'hello?',
    }),
  )
})

test('messages are immutable, even for the admin', async () => {
  await assertFails(
    setDoc(doc(as(ADMIN), 'conversations', 'conv_a', 'messages', 'm1'), {
      senderUid: ADMIN,
      sentAt: serverTimestamp(),
      text: 'rewritten history',
    }),
  )
  await assertFails(
    setDoc(doc(as(CLIENT_A), 'conversations', 'conv_a', 'messages', 'm1'), {
      senderUid: CLIENT_A,
      sentAt: serverTimestamp(),
      text: 'rewritten history',
    }),
  )
})

test('a client-forged timestamp is rejected', async () => {
  await assertFails(
    setDoc(doc(as(CLIENT_A), 'conversations', 'conv_a', 'messages', 'm_ts'), {
      senderUid: CLIENT_A,
      sentAt: new Date(2000, 0, 1),
      text: 'backdated',
    }),
  )
})

test('an oversized message is rejected', async () => {
  await assertFails(
    setDoc(doc(as(CLIENT_A), 'conversations', 'conv_a', 'messages', 'm_big'), {
      senderUid: CLIENT_A,
      sentAt: serverTimestamp(),
      text: 'x'.repeat(4001),
    }),
  )
})

/* --- email is required on a booking -------------------------------------- */

test('a booking without an email is rejected', async () => {
  const { email: _drop, ...noEmail } = booking()
  await assertFails(setDoc(doc(anon(), 'bookings', 'bk_noemail'), noEmail))
})

test('a malformed email is rejected', async () => {
  for (const bad of ['nope', 'a@b', 'a b@c.dd', '@x.yy', 'a@@b.cc']) {
    await assertFails(
      setDoc(doc(anon(), 'bookings', `bk_bad_${bad.length}_${bad.charCodeAt(0)}`),
        booking({ email: bad })),
    )
  }
})

/* --- closed chats -------------------------------------------------------- */

test('a client cannot write to a closed chat', async () => {
  await assertFails(
    setDoc(doc(as(CLIENT_A), 'conversations', 'conv_shut', 'messages', 'm_shut'), {
      senderUid: CLIENT_A,
      sentAt: serverTimestamp(),
      text: 'still here?',
    }),
  )
})

test('a client can still read a closed chat', async () => {
  await assertSucceeds(getDoc(doc(as(CLIENT_A), 'conversations', 'conv_shut')))
})

test('the admin can still write to a closed chat', async () => {
  await assertSucceeds(
    setDoc(doc(as(ADMIN), 'conversations', 'conv_shut', 'messages', 'm_shut_admin'), {
      senderUid: ADMIN,
      sentAt: serverTimestamp(),
      text: 'Closing note — book again any time.',
    }),
  )
})

test('a client cannot reopen their own chat', async () => {
  await assertFails(
    updateDoc(doc(as(CLIENT_A), 'conversations', 'conv_shut'), { status: 'open' }),
  )
})

test('the admin can close and reopen', async () => {
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'conversations', 'conv_a'), { status: 'closed' }))
  await assertSucceeds(updateDoc(doc(as(ADMIN), 'conversations', 'conv_a'), { status: 'open' }))
})

/* --- image messages ------------------------------------------------------- */

const img = (over: Record<string, unknown> = {}) => ({
  contentType: 'image/jpeg',
  size: 1000,
  dataBase64: 'AAAA',
  ...over,
})

test('the admin can send an image', async () => {
  await assertSucceeds(
    setDoc(doc(as(ADMIN), 'conversations', 'conv_a', 'messages', 'm_img'), {
      senderUid: ADMIN,
      sentAt: serverTimestamp(),
      image: img(),
    }),
  )
})

test('a client cannot send an image', async () => {
  await assertFails(
    setDoc(doc(as(CLIENT_A), 'conversations', 'conv_a', 'messages', 'm_img_c'), {
      senderUid: CLIENT_A,
      sentAt: serverTimestamp(),
      image: img(),
    }),
  )
})

// The caps are what keep a base64 payload inside Firestore's 1 MiB document
// limit. If these pass with larger values, the write will fail opaquely later.
test('an oversized image is rejected', async () => {
  await assertFails(
    setDoc(doc(as(ADMIN), 'conversations', 'conv_a', 'messages', 'm_img_big'), {
      senderUid: ADMIN,
      sentAt: serverTimestamp(),
      image: img({ size: 600001 }),
    }),
  )
  await assertFails(
    setDoc(doc(as(ADMIN), 'conversations', 'conv_a', 'messages', 'm_img_b64'), {
      senderUid: ADMIN,
      sentAt: serverTimestamp(),
      image: img({ dataBase64: 'x'.repeat(800001) }),
    }),
  )
})

test('a disallowed image type is rejected', async () => {
  await assertFails(
    setDoc(doc(as(ADMIN), 'conversations', 'conv_a', 'messages', 'm_img_svg'), {
      senderUid: ADMIN,
      sentAt: serverTimestamp(),
      image: img({ contentType: 'image/svg+xml' }),
    }),
  )
})

test('a message must carry exactly one of text or image', async () => {
  // both
  await assertFails(
    setDoc(doc(as(ADMIN), 'conversations', 'conv_a', 'messages', 'm_both'), {
      senderUid: ADMIN,
      sentAt: serverTimestamp(),
      text: 'caption',
      image: img(),
    }),
  )
  // neither
  await assertFails(
    setDoc(doc(as(ADMIN), 'conversations', 'conv_a', 'messages', 'm_neither'), {
      senderUid: ADMIN,
      sentAt: serverTimestamp(),
    }),
  )
})

test('an image cannot smuggle extra fields', async () => {
  await assertFails(
    setDoc(doc(as(ADMIN), 'conversations', 'conv_a', 'messages', 'm_img_extra'), {
      senderUid: ADMIN,
      sentAt: serverTimestamp(),
      image: img({ url: 'https://elsewhere.example/x.png' }),
    }),
  )
})

test('an image message is immutable like any other', async () => {
  await assertFails(
    setDoc(doc(as(ADMIN), 'conversations', 'conv_a', 'messages', 'm_img'), {
      senderUid: ADMIN,
      sentAt: serverTimestamp(),
      image: img({ dataBase64: 'BBBB' }),
    }),
  )
})

/* --- admin ---------------------------------------------------------------- */

test('the admin sees bookings and can approve', async () => {
  await assertSucceeds(getDocs(collection(as(ADMIN), 'bookings')))
  // Approval is a merge, not a rewrite — which is what the real approve path
  // does, and what keeps createdAt intact.
  await assertSucceeds(
    updateDoc(doc(as(ADMIN), 'bookings', 'bk_a'), {
      status: 'approved',
      clientUid: CLIENT_A,
      conversationId: 'conv_a',
      approvedAt: serverTimestamp(),
    }),
  )
})

test('not even the admin can backdate a booking', async () => {
  await assertFails(
    updateDoc(doc(as(ADMIN), 'bookings', 'bk_a'), { createdAt: new Date(2000, 0, 1) }),
  )
})

test('the admin cannot set a status outside the allowed set', async () => {
  await assertFails(updateDoc(doc(as(ADMIN), 'bookings', 'bk_a'), { status: 'paid' }))
})

test('not even the admin can rewrite a booking’s identity', async () => {
  await assertFails(
    setDoc(doc(as(ADMIN), 'bookings', 'bk_a'), {
      ...booking({ createdAt: new Date() }),
      name: 'Someone Else',
      status: 'approved',
    }),
  )
})

test('the admin cannot escalate another account to admin', async () => {
  await assertFails(setDoc(doc(as(ADMIN), 'admins', STRANGER), { createdAt: new Date() }))
})

test('username reservations are admin-only, not world-readable', async () => {
  // Open reads here would let anyone enumerate the client list.
  await assertFails(getDoc(doc(anon(), 'usernames', 'giulia')))
  await assertFails(getDoc(doc(as(CLIENT_A), 'usernames', 'giulia')))
  await assertFails(setDoc(doc(as(CLIENT_A), 'usernames', 'stolen'), { uid: CLIENT_A }))
  await assertSucceeds(setDoc(doc(as(ADMIN), 'usernames', 'giulia'), { uid: CLIENT_A }))
})

test('the email index is admin-only', async () => {
  await assertFails(getDoc(doc(anon(), 'clientsByEmail', 'giulia@example.com')))
  await assertFails(getDoc(doc(as(CLIENT_A), 'clientsByEmail', 'giulia@example.com')))
  await assertSucceeds(getDoc(doc(as(ADMIN), 'clientsByEmail', 'giulia@example.com')))
  await assertFails(
    setDoc(doc(as(CLIENT_A), 'clientsByEmail', 'x@y.zz'), { uid: CLIENT_A }),
  )
})

test('undeclared collections are closed', async () => {
  await assertFails(getDoc(doc(as(ADMIN), 'whatever', 'x')))
  await assertFails(setDoc(doc(as(ADMIN), 'whatever', 'x'), { a: 1 }))
})
