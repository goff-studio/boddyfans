/**
 * Booking confirmation email — the logic, kept apart from the HTTP handler so
 * it can be tested against the Firestore emulator with the mailer stubbed.
 *
 * Security shape, and the reason it takes only a booking id:
 *
 *   The request never supplies a recipient. The booking is read server-side and
 *   the mail goes to the address stored on that document. An endpoint that
 *   accepted a `to` field would be an open relay for sending mail from your
 *   domain, which is how a sending reputation gets destroyed.
 *
 * It also never sends credentials. This is a purchase confirmation only.
 */

export type BookingRecord = {
  name?: unknown
  email?: unknown
  trackSlug?: unknown
  preferredAt?: unknown
  reference?: unknown
  status?: unknown
  createdAt?: { toMillis?: () => number } | unknown
  confirmationSentAt?: unknown
}

export type SendResult =
  | { ok: true }
  /** Nothing to do, and not an error: already sent, or nothing to send to. */
  | { ok: true; skipped: string }
  | { ok: false; status: number; error: string }

export type Mailer = (msg: {
  to: string
  subject: string
  html: string
  text: string
}) => Promise<void>

export type Store = {
  get: (bookingId: string) => Promise<BookingRecord | null>
  markSent: (bookingId: string) => Promise<void>
}

/** Replays of an old id are pointless, but bound them anyway. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

const TRACK_NAMES: Record<string, string> = {
  train: 'Train — injury prevention',
  build: 'Build — body sculpting',
  perform: 'Perform — athletic aging',
  recover: 'Recover — rehabilitation',
  connect: '1-on-1 chat — online coaching',
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function prettyWhen(raw: string): string {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function renderEmail(b: {
  name: string
  trackSlug: string
  preferredAt: string
  reference: string
}): { subject: string; html: string; text: string } {
  const track = TRACK_NAMES[b.trackSlug] ?? b.trackSlug
  const when = prettyWhen(b.preferredAt)
  const subject = `We have your booking, ${b.name}`

  // Webfonts are unreliable in mail clients and styles must be inline, so this
  // uses a system stack and the palette rather than the site's stylesheet.
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#faf7f2;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Anna will confirm ${esc(when)} once she has checked your transfer.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border-radius:14px;padding:36px 32px;
                    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td>
          <p style="margin:0 0 26px;font-size:20px;font-weight:600;letter-spacing:-0.01em;color:#0a0a0a;">
            AN <span style="color:#ff5f38;">&bull;</span>
            <span style="font-size:11px;letter-spacing:0.16em;color:#9a9895;">ATELIER</span>
          </p>

          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.1em;color:#ff5f38;">
            BOOKING RECEIVED
          </p>
          <h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;font-weight:600;color:#0a0a0a;">
            Thanks, ${esc(b.name)}.
          </h1>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#3a3938;">
            We have your request. Anna checks the transfer by hand and confirms
            your slot &mdash; you will hear from her directly.
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="border-top:1px solid #e2dfda;margin:0 0 24px;">
            ${[
              ['Session', track],
              ['Requested', when],
              ['Reference', b.reference],
            ]
              .map(
                ([k, v]) => `<tr>
              <td style="padding:13px 0;border-bottom:1px solid #e2dfda;">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#9a9895;">${esc(k)}</div>
                <div style="font-size:16px;color:#0a0a0a;margin-top:3px;">${esc(v)}</div>
              </td></tr>`,
              )
              .join('')}
          </table>

          <p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:#3a3938;">
            Keep the reference on your transfer &mdash; it is how Anna matches your
            payment to this booking.
          </p>
          <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#9a9895;">
            Anna Nefedova &middot; Physiotherapist, coach, trainer &middot; Bologna, Italy<br>
            This is an automatic confirmation. Replying to it will not reach Anna.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const text = [
    `Thanks, ${b.name}.`,
    '',
    'We have your request. Anna checks the transfer by hand and confirms your slot.',
    '',
    `Session:   ${track}`,
    `Requested: ${when}`,
    `Reference: ${b.reference}`,
    '',
    'Keep the reference on your transfer — it is how Anna matches your payment to this booking.',
    '',
    'Anna Nefedova · Physiotherapist, coach, trainer · Bologna, Italy',
    'This is an automatic confirmation. Replying to it will not reach Anna.',
  ].join('\n')

  return { subject, html, text }
}

export async function sendBookingConfirmation(
  store: Store,
  mail: Mailer,
  bookingId: unknown,
  now = Date.now(),
): Promise<SendResult> {
  if (typeof bookingId !== 'string' || !bookingId || bookingId.length > 128) {
    return { ok: false, status: 400, error: 'bookingId is required' }
  }

  const booking = await store.get(bookingId)
  // Deliberately the same response for "no such booking": this endpoint is
  // public, and distinguishing them would make it a booking-id oracle.
  if (!booking) return { ok: true, skipped: 'unknown' }

  if (booking.confirmationSentAt) return { ok: true, skipped: 'already-sent' }
  if (booking.status !== 'pending') return { ok: true, skipped: 'not-pending' }

  const created = (booking.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.()
  if (typeof created === 'number' && now - created > MAX_AGE_MS) {
    return { ok: true, skipped: 'too-old' }
  }

  const to = typeof booking.email === 'string' ? booking.email.trim() : ''
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return { ok: true, skipped: 'no-email' }
  }

  const { subject, html, text } = renderEmail({
    name: typeof booking.name === 'string' ? booking.name : 'there',
    trackSlug: typeof booking.trackSlug === 'string' ? booking.trackSlug : '',
    preferredAt: typeof booking.preferredAt === 'string' ? booking.preferredAt : '',
    reference: typeof booking.reference === 'string' ? booking.reference : '',
  })

  // Marked before sending: a duplicate confirmation is worse than a missing
  // one, and a send failure surfaces in the logs either way.
  await store.markSent(bookingId)
  await mail({ to, subject, html, text })

  return { ok: true }
}
