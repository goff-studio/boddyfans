/**
 * Seeds the local emulators with Anna's admin account.
 *
 * Against the real project these steps are done by hand in the console (see
 * README) because the Spark plan has no Admin SDK. The emulator has no console,
 * so this does the same two things over its REST APIs:
 *
 *   1. create the auth account
 *   2. write admins/{uid}, which is what actually grants the panel
 *
 * Run with the emulators up:  node scripts/seed-emulator.mjs
 */

const PROJECT = process.env.FIREBASE_PROJECT ?? 'body-fans'
const AUTH = process.env.AUTH_EMULATOR ?? '127.0.0.1:9099'
const FIRESTORE = process.env.FIRESTORE_EMULATOR ?? '127.0.0.1:8085'

const EMAIL = process.env.ADMIN_EMAIL ?? 'anna@nefedova.test'
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'atelier-dev-01'

/** The auth emulator binds a second or two after Firestore. Wait for it. */
async function waitForAuth(seconds = 30) {
  for (let i = 0; i < seconds; i++) {
    try {
      await fetch(`http://${AUTH}/`)
      return
    } catch {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  throw new Error(
    `The auth emulator is not answering on ${AUTH}. Start it with: npm run emulators`,
  )
}

async function signUp(email, password) {
  const res = await fetch(
    `http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  )
  const body = await res.json()
  if (!res.ok) {
    // Re-running the seed should be harmless.
    if (body?.error?.message === 'EMAIL_EXISTS') return null
    throw new Error(`signUp failed: ${JSON.stringify(body)}`)
  }
  return body.localId
}

async function lookupUid(email) {
  const res = await fetch(
    `http://${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`,
    {
      method: 'POST',
      // "owner" is the emulator's built-in super-user credential.
      headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
      body: JSON.stringify({}),
    },
  )
  const body = await res.json()
  return (body.userInfo ?? []).find((u) => u.email === email)?.localId ?? null
}

async function writeAdminDoc(uid) {
  const url =
    `http://${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/admins/${uid}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({
      fields: { createdAt: { timestampValue: new Date().toISOString() } },
    }),
  })
  if (!res.ok) throw new Error(`admins doc write failed: ${await res.text()}`)
}

await waitForAuth()
const uid = (await signUp(EMAIL, PASSWORD)) ?? (await lookupUid(EMAIL))
if (!uid) throw new Error('could not determine the admin uid')
await writeAdminDoc(uid)

console.log('Seeded admin')
console.log(`  email    ${EMAIL}`)
console.log(`  password ${PASSWORD}`)
console.log(`  uid      ${uid}  (admins/${uid} written)`)
