import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wordmark } from '../components/Chrome'
import { CopyRow } from '../components/CopyRow'
import { Pressable } from '../motion/primitives'
import { DURATION, EASE_OUT } from '../motion/tokens'
import { useSession } from '../auth/session'
import { ChatPane } from '../chat/ChatPane'
import {
  approveBooking,
  declineBooking,
  getBooking,
  getReceipt,
  isUsernameTaken,
  type ApprovalResult,
  type Booking,
} from '../chat/bookings'
import { receiptDataUrl } from '../chat/receipt'
import { normalizeUsername } from '../firebase'
import { TRACKS } from '../data/tracks'

/**
 * One booking: what they asked for, the transfer receipt, and either the
 * approval control or the chat it opened.
 */
export function AdminBookingScreen() {
  const { id } = useParams()
  const { user } = useSession()
  const [booking, setBooking] = useState<Booking | null | 'missing'>(null)
  const [receipt, setReceipt] = useState<{ contentType: string; dataBase64: string } | null>(null)

  useEffect(() => {
    if (!id) return
    let active = true
    void (async () => {
      const b = await getBooking(id)
      if (!active) return
      setBooking(b ?? 'missing')
      const r = await getReceipt(id).catch(() => null)
      if (active) setReceipt(r)
    })()
    return () => {
      active = false
    }
  }, [id])

  if (!id) return null
  if (booking === null) return <Shell><p className="chat__hint">Loading…</p></Shell>
  if (booking === 'missing') return <Shell><p className="chat__hint">No such booking.</p></Shell>

  const track = TRACKS.find((t) => t.slug === booking.trackSlug)

  return (
    <Shell>
      <p className="booking__eyebrow">
        {track?.kicker ?? booking.trackSlug} · {track?.num ?? '—'}
      </p>
      <h1 className="booking__title">{booking.name}</h1>
      <p className="booking__lede">
        Asked for {booking.preferredAt || 'no particular time'}
        {booking.email ? <> · {booking.email}</> : null}
      </p>

      <div className="account">
        <CopyRow label="Reference" value={booking.reference} strong />
        <CopyRow label="Status" value={booking.status} />
        {booking.email ? <CopyRow label="Email" value={booking.email} /> : null}
      </div>

      <Receipt receipt={receipt} />

      {booking.status === 'approved' && booking.conversationId && user ? (
        <section className="section">
          <h2 className="section__title">Chat</h2>
          <ChatPane
            conversationId={booking.conversationId}
            myUid={user.uid}
            otherLabel={booking.name}
          />
        </section>
      ) : booking.status === 'pending' ? (
        <Approve booking={booking} adminUid={user?.uid ?? ''} onDone={setBooking} />
      ) : (
        <p className="chat__hint">This booking was declined.</p>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="panel">
      <header className="topbar">
        <Wordmark />
        <div className="topbar__right">
          <Link to="/admin" className="back">
            <span className="back__arrow" aria-hidden="true">←</span>
            <span>BOOKINGS</span>
          </Link>
        </div>
      </header>
      <div className="panel__body">
        <div className="panel__inner">{children}</div>
      </div>
    </div>
  )
}

function Receipt({
  receipt,
}: {
  receipt: { contentType: string; dataBase64: string } | null
}) {
  if (!receipt) {
    return (
      <section className="section">
        <h2 className="section__title">Transfer receipt</h2>
        <p className="chat__hint">No receipt attached.</p>
      </section>
    )
  }
  const url = receiptDataUrl(receipt)
  return (
    <section className="section">
      <h2 className="section__title">Transfer receipt</h2>
      {receipt.contentType === 'application/pdf' ? (
        // A data: URL in an <object> keeps it inline without a download the
        // browser would block anyway.
        <object className="receipt receipt--pdf" data={url} type="application/pdf">
          <p className="chat__hint">This PDF cannot be previewed here.</p>
        </object>
      ) : (
        <a href={url} target="_blank" rel="noreferrer">
          <img className="receipt" src={url} alt="Bank transfer receipt" />
        </a>
      )}
    </section>
  )
}

function Approve({
  booking,
  adminUid,
  onDone,
}: {
  booking: Booking
  adminUid: string
  onDone: (b: Booking) => void
}) {
  const [username, setUsername] = useState(normalizeUsername(booking.name))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taken, setTaken] = useState(false)
  const [issued, setIssued] = useState<ApprovalResult | null>(null)

  // Check availability as she types, so the collision is not a surprise at the
  // point where an auth account has already been created.
  useEffect(() => {
    const u = normalizeUsername(username)
    if (!u) return
    let active = true
    const t = window.setTimeout(() => {
      void isUsernameTaken(u).then((v) => active && setTaken(v))
    }, 350)
    return () => {
      active = false
      window.clearTimeout(t)
    }
  }, [username])

  if (issued) {
    return (
      <motion.section
        className="section"
        initial={{ opacity: 0, transform: 'translateY(8px)' }}
        animate={{ opacity: 1, transform: 'translateY(0px)' }}
        transition={{ duration: DURATION.short, ease: EASE_OUT }}
      >
        <h2 className="section__title">Access created</h2>
        <p className="booking__lede">
          Send these to {booking.name}. <strong>The password is shown once</strong> —
          it is not stored anywhere, so copy it now. You can always issue a new one.
        </p>
        <div className="account">
          <CopyRow label="Username" value={issued.username} strong />
          <CopyRow label="Password" value={issued.password} strong />
          <CopyRow label="Sign in at" value={`${window.location.origin}/login`} />
        </div>
        <div className="booking__actions">
          <Pressable className="cta" onClick={() => window.location.reload()}>
            <span>OPEN THE CHAT</span>
            <span className="cta__arrow" aria-hidden="true">→</span>
          </Pressable>
        </div>
      </motion.section>
    )
  }

  async function approve() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await approveBooking(booking, adminUid, username)
      setIssued(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not approve this booking.')
      setBusy(false)
    }
  }

  async function decline() {
    if (busy) return
    setBusy(true)
    try {
      await declineBooking(booking.id)
      onDone({ ...booking, status: 'declined' })
    } catch {
      setError('Could not decline this booking.')
      setBusy(false)
    }
  }

  const clean = normalizeUsername(username)

  return (
    <section className="section">
      <h2 className="section__title">Approve and create access</h2>
      <p className="booking__lede">
        Check the transfer above first. Approving creates {booking.name}&apos;s
        login and opens your private chat.
      </p>

      <label className="field">
        <span className="field__label">Username for them</span>
        <input
          className="field__input"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoCapitalize="none"
          spellCheck={false}
        />
        <span className="field__hint">
          {clean ? `They will sign in as "${clean}".` : 'Needs at least one character.'}
          {taken ? ' That one is already taken.' : ''}
        </span>
      </label>

      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="booking__actions">
        <Pressable className="ghostbtn" onClick={decline} disabled={busy}>
          <span>DECLINE</span>
        </Pressable>
        <Pressable className="cta" onClick={approve} disabled={busy || !clean || taken}>
          <span>{busy ? 'CREATING…' : 'APPROVE & CREATE ACCESS'}</span>
          <span className="cta__arrow" aria-hidden="true">→</span>
        </Pressable>
      </div>
    </section>
  )
}
