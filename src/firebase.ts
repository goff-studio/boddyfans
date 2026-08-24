import { initializeApp, deleteApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore'

/**
 * Firebase wiring.
 *
 * Everything here is created on first use rather than at module load, so the
 * marketing routes never construct an app they do not need. The admin and chat
 * chunks are the only importers.
 *
 * The config values are public by design — every Firebase web app ships them.
 * They name the project; `firestore.rules` is what protects the data.
 */

const config: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === '1'

/** Clients sign in with a username; Firebase password auth needs an address. */
const CLIENT_EMAIL_DOMAIN =
  import.meta.env.VITE_CLIENT_EMAIL_DOMAIN || 'clients.example.app'

export function isFirebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId)
}

let app: FirebaseApp | undefined
let auth: Auth | undefined
let db: Firestore | undefined

export function getApp(): FirebaseApp {
  if (!app) {
    if (!isFirebaseConfigured()) {
      throw new Error(
        'Firebase is not configured. Copy .env.example to .env and fill in the VITE_FIREBASE_* values.',
      )
    }
    app = initializeApp(config)
  }
  return app
}

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(getApp())
    if (USE_EMULATORS) connectFirestoreEmulator(db, '127.0.0.1', 8085)
  }
  return db
}

export function getAuthClient(): Auth {
  if (!auth) {
    auth = getAuth(getApp())
    if (USE_EMULATORS) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  }
  return auth
}

/* --- usernames ------------------------------------------------------------ */

/** Lowercase, no spaces — the AAD helpers and the rules both assume this. */
export function normalizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${CLIENT_EMAIL_DOMAIN}`
}

/** Anna signs in with a real address; clients with a bare username. */
export function toLoginEmail(identifier: string): string {
  const id = identifier.trim()
  return id.includes('@') ? id : usernameToEmail(id)
}

/**
 * Creates an auth account without touching the caller's session.
 *
 * `createUserWithEmailAndPassword` signs the new user in on whichever Auth
 * instance it is given — on the primary one that would silently log Anna out
 * mid-approval. A throwaway secondary app keeps her session intact. This is the
 * Spark-plan stand-in for the Admin SDK; on Blaze this moves into a Function so
 * that public sign-up can be switched off entirely.
 */
export async function createAccountOutOfBand(
  email: string,
  password: string,
): Promise<string> {
  const secondary = initializeApp(config, `provision-${crypto.randomUUID()}`)
  try {
    const secondaryAuth = getAuth(secondary)
    if (USE_EMULATORS) {
      connectAuthEmulator(secondaryAuth, 'http://127.0.0.1:9099', { disableWarnings: true })
    }
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    await signOut(secondaryAuth)
    return cred.user.uid
  } finally {
    // Leaking app instances leaks their listeners and IndexedDB handles.
    await deleteApp(secondary)
  }
}

/**
 * Readable passphrase for a client's first sign-in. Shown to Anna once and
 * never stored — she passes it on, and reissues if it is lost.
 */
export function generatePassphrase(): string {
  const words = [
    'anchor', 'basil', 'cedar', 'delta', 'ember', 'fjord', 'gable', 'harbor',
    'indigo', 'juniper', 'kelp', 'lumen', 'marble', 'nectar', 'onyx', 'pilot',
    'quartz', 'ridge', 'saffron', 'tundra', 'umber', 'velvet', 'willow', 'zephyr',
  ]
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length]
  const digits = String(crypto.getRandomValues(new Uint32Array(1))[0] % 100).padStart(2, '0')
  return `${pick()}-${pick()}-${digits}`
}
