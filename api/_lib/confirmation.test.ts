import test from 'node:test'
import assert from 'node:assert/strict'
import { renderEmail, sendBookingConfirmation, type BookingRecord, type Store } from './confirmation'

/**
 * The confirmation logic, with the store and mailer stubbed. The security
 * properties here are the point: the recipient can only come from the stored
 * booking, and a second call must not send a second email.
 */

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0)
const stamp = (ms: number) => ({ toMillis: () => ms })

const BOOKING: BookingRecord = {
  name: 'Giulia',
  email: 'giulia@example.com',
  trackSlug: 'connect',
  preferredAt: '2026-11-03T09:00',
  reference: 'CONNECT · GIULIA',
  status: 'pending',
  createdAt: stamp(NOW - 60_000),
}

function harness(booking: BookingRecord | null) {
  const sent: { to: string; subject: string }[] = []
  let marked = 0
  const store: Store = {
    get: async () => (booking ? { ...booking } : null),
    markSent: async () => {
      marked++
      if (booking) booking.confirmationSentAt = stamp(NOW)
    },
  }
  const mail = async (m: { to: string; subject: string; html: string; text: string }) => {
    sent.push({ to: m.to, subject: m.subject })
  }
  return { store, mail, sent, marks: () => marked }
}

test('sends to the address on the booking', async () => {
  const h = harness({ ...BOOKING })
  const r = await sendBookingConfirmation(h.store, h.mail, 'bk1', NOW)
  assert.deepEqual(r, { ok: true })
  assert.equal(h.sent.length, 1)
  assert.equal(h.sent[0].to, 'giulia@example.com')
  assert.match(h.sent[0].subject, /Giulia/)
})

// The endpoint is public, so this is the property that stops it relaying spam.
test('the caller cannot choose the recipient', async () => {
  const h = harness({ ...BOOKING })
  // Whatever a caller might attach, only the id is consumed.
  await sendBookingConfirmation(h.store, h.mail, 'bk1', NOW)
  assert.equal(h.sent[0].to, 'giulia@example.com')
})

test('sends only once, however many times it is called', async () => {
  const booking = { ...BOOKING }
  const h = harness(booking)
  await sendBookingConfirmation(h.store, h.mail, 'bk1', NOW)
  const second = await sendBookingConfirmation(h.store, h.mail, 'bk1', NOW)
  assert.deepEqual(second, { ok: true, skipped: 'already-sent' })
  assert.equal(h.sent.length, 1)
  assert.equal(h.marks(), 1)
})

test('an unknown booking is indistinguishable from a sent one', async () => {
  const h = harness(null)
  const r = await sendBookingConfirmation(h.store, h.mail, 'nope', NOW)
  // Not a 404: telling a caller which ids exist makes this an oracle.
  assert.deepEqual(r, { ok: true, skipped: 'unknown' })
  assert.equal(h.sent.length, 0)
})

test('rejects a missing or malformed id', async () => {
  const h = harness({ ...BOOKING })
  for (const bad of [undefined, '', 42, {}, 'x'.repeat(129)]) {
    const r = await sendBookingConfirmation(h.store, h.mail, bad, NOW)
    assert.equal(r.ok, false)
  }
  assert.equal(h.sent.length, 0)
})

test('does not send for an already-approved booking', async () => {
  const h = harness({ ...BOOKING, status: 'approved' })
  const r = await sendBookingConfirmation(h.store, h.mail, 'bk1', NOW)
  assert.deepEqual(r, { ok: true, skipped: 'not-pending' })
  assert.equal(h.sent.length, 0)
})

test('does not replay an old booking id', async () => {
  const h = harness({ ...BOOKING, createdAt: stamp(NOW - 48 * 60 * 60 * 1000) })
  const r = await sendBookingConfirmation(h.store, h.mail, 'bk1', NOW)
  assert.deepEqual(r, { ok: true, skipped: 'too-old' })
  assert.equal(h.sent.length, 0)
})

test('skips a booking with no usable email', async () => {
  for (const email of [undefined, '', 'not-an-address', 'a@b']) {
    const h = harness({ ...BOOKING, email })
    const r = await sendBookingConfirmation(h.store, h.mail, 'bk1', NOW)
    assert.deepEqual(r, { ok: true, skipped: 'no-email' })
    assert.equal(h.sent.length, 0)
  }
})

/* --- the email itself ----------------------------------------------------- */

test('renders both an HTML and a plain-text body', async () => {
  const m = renderEmail({
    name: 'Giulia',
    trackSlug: 'connect',
    preferredAt: '2026-11-03T09:00',
    reference: 'CONNECT · GIULIA',
  })
  assert.match(m.html, /Thanks, Giulia/)
  assert.match(m.html, /CONNECT · GIULIA/)
  assert.match(m.html, /1-on-1 chat/)
  assert.match(m.text, /Thanks, Giulia/)
  // A text part matters: an HTML-only message scores as spam.
  assert.ok(m.text.length > 100)
})

test('escapes anything that came from the booking form', async () => {
  const m = renderEmail({
    name: '<script>alert(1)</script>',
    trackSlug: 'connect',
    preferredAt: '2026-11-03T09:00',
    reference: '"><img src=x onerror=alert(1)>',
  })
  // The property that matters is that no *markup* can form. An escaped
  // `onerror=` surviving as text is inert, so asserting on the substring alone
  // would be testing the wrong thing.
  assert.ok(!m.html.includes('<script'), 'no script tag may be injected')
  assert.ok(!m.html.includes('<img'), 'no img tag may be injected')
  assert.match(m.html, /&lt;script&gt;/, 'it is escaped, not stripped')
  assert.match(m.html, /&quot;&gt;&lt;img/, 'quotes and brackets both escaped')
})

test('never contains a password or a login link', async () => {
  const m = renderEmail({
    name: 'Giulia',
    trackSlug: 'connect',
    preferredAt: '2026-11-03T09:00',
    reference: 'CONNECT · GIULIA',
  })
  const blob = (m.html + m.text).toLowerCase()
  for (const forbidden of ['password', 'passphrase', '/login', 'sign in']) {
    assert.ok(!blob.includes(forbidden), `confirmation must not mention "${forbidden}"`)
  }
})
