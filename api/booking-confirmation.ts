import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { sendBookingConfirmation, type Mailer, type Store } from './_lib/confirmation'

/**
 * POST /api/booking-confirmation  { bookingId }
 *
 * Runs on Vercel, not in Firebase — so it needs no Blaze plan, and the Resend
 * key lives in a server-only environment variable that never reaches the
 * browser. That is the whole reason this exists rather than sending from the
 * client: any key in the bundle can be lifted and used to send mail as you.
 *
 * Environment (Vercel > Settings > Environment Variables, NOT prefixed VITE_):
 *   RESEND_API_KEY              re_...
 *   MAIL_FROM                   "Anna Nefedova <hello@body-fans.com>"
 *   FIREBASE_SERVICE_ACCOUNT    base64 of the service account JSON
 */

function db() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    if (raw) {
      const json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
      initializeApp({ credential: cert(json), projectId: json.project_id })
    } else {
      // No credential needed when FIRESTORE_EMULATOR_HOST is set, which is how
      // the tests run this.
      initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'body-fans' })
    }
  }
  return getFirestore(getApp())
}

export const firestoreStore = (): Store => {
  const store = db()
  return {
    async get(bookingId) {
      const snap = await store.collection('bookings').doc(bookingId).get()
      return snap.exists ? (snap.data() as Record<string, unknown>) : null
    },
    async markSent(bookingId) {
      await store
        .collection('bookings')
        .doc(bookingId)
        .update({ confirmationSentAt: FieldValue.serverTimestamp() })
    },
  }
}

export const resendMailer = (): Mailer => async (msg) => {
  const key = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  if (!key || !from) throw new Error('RESEND_API_KEY or MAIL_FROM is not set')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    }),
  })

  if (!res.ok) {
    throw new Error(`resend responded ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    return res.status(405).json({ error: 'method not allowed' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const result = await sendBookingConfirmation(
      firestoreStore(),
      resendMailer(),
      body?.bookingId,
    )
    if (!result.ok) return res.status(result.status).json({ error: result.error })
    return res.status(202).json({ ok: true })
  } catch (e) {
    // The caller learns nothing: a booking confirmation is not worth leaking
    // provider errors over, and the client treats any failure the same way.
    console.error('booking-confirmation failed', e)
    return res.status(500).json({ error: 'could not send confirmation' })
  }
}
