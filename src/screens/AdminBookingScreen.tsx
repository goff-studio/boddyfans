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
  reissueAccess,
  setChatOpen,
  getConversationStatus,
  type ApprovalOutcome,
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
        <>
          <section className="section">
            <h2 className="section__title">Chat</h2>
            <ChatPane
              conversationId={booking.conversationId}
              myUid={user.uid}
              otherLabel={booking.name}
              canSendImages
            />
          </section>
          <ChatState conversationId={booking.conversationId} />
          <Reissue booking={booking} adminUid={user.uid} />
        </>
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

/**
 * Open or close the chat. Closing stops the client writing; Anna still can, so
 * she can leave a closing note.
 */
function ChatState({ conversationId }: { conversationId: string }) {
  const [status, setStatus] = useState<'open' | 'closed' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getConversationStatus(conversationId)
      .then((s) => active && setStatus(s))
      .catch(() => active && setStatus('open'))
    return () => {
      active = false
    }
  }, [conversationId])

  async function toggle() {
    if (busy || status === null) return
    setBusy(true)
    setError(null)
    const next = status === 'open' ? 'closed' : 'open'
    try {
      await setChatOpen(conversationId, next === 'open')
      setStatus(next)
    } catch {
      setError('Could not change the chat status.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="section">
      <h2 className="section__title">Chat status</h2>
      <p className="booking__lede">
        {status === 'closed'
          ? 'Closed — they can read the history but not reply. Approving a new booking from them reopens it automatically.'
          : 'Open — they can reply. Close it when the sessions are done.'}
      </p>
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="booking__actions">
        <Pressable className="ghostbtn" onClick={toggle} disabled={busy || status === null}>
          <span>
            {status === null ? 'LOADING…' : status === 'open' ? 'CLOSE CHAT' : 'REOPEN CHAT'}
          </span>
        </Pressable>
      </div>
    </section>
  )
}

/** Shown once after provisioning. The password is never stored. */
function Credentials({
  name,
  issued,
  note,
}: {
  name: string
  issued: ApprovalResult
  note: string
}) {
  return (
    <motion.section
      className="section"
      initial={{ opacity: 0, transform: 'translateY(8px)' }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      transition={{ duration: DURATION.short, ease: EASE_OUT }}
    >
      <h2 className="section__title">Access created</h2>
      <p className="booking__lede">
        Send these to {name}. <strong>The password is shown once</strong> — it is
        not stored anywhere, so copy it now. {note}
      </p>
      <div className="account">
        <CopyRow label="Username" value={issued.username} strong />
        <CopyRow label="Password" value={issued.password} strong />
        <CopyRow label="Sign in at" value={`${window.location.origin}/login`} />
      </div>
      <div className="booking__actions">
        <Pressable className="cta" onClick={() => window.location.reload()}>
          <span>DONE</span>
        </Pressable>
      </div>
    </motion.section>
  )
}

/**
 * Reissue a login. Spark has no Admin SDK, so a password cannot be reset for
 * another account — a new login replaces the old one instead. The copy says so,
 * because the username changing is a surprise otherwise.
 */
function Reissue({ booking, adminUid }: { booking: Booking; adminUid: string }) {
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState(`${normalizeUsername(booking.name)}2`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<ApprovalResult | null>(null)

  if (issued) {
    return (
      <Credentials
        name={booking.name}
        issued={issued}
        note="Their previous login no longer works."
      />
    )
  }

  if (!open) {
    return (
      <section className="section">
        <h2 className="section__title">Lost password</h2>
        <p className="booking__lede">
          Passwords cannot be recovered — issue a new login instead.
        </p>
        <div className="booking__actions">
          <Pressable className="ghostbtn" onClick={() => setOpen(true)}>
            <span>REISSUE LOGIN</span>
          </Pressable>
        </div>
      </section>
    )
  }

  const clean = normalizeUsername(username)

  async function run() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      setIssued(await reissueAccess(booking, adminUid, username))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reissue the login.')
      setBusy(false)
    }
  }

  return (
    <section className="section">
      <h2 className="section__title">Reissue login</h2>
      <p className="booking__lede">
        This creates a new username and password for {booking.name} and{' '}
        <strong>stops their old login working</strong>. The chat history stays.
        The username has to change, because the old one is already taken.
      </p>

      <label className="field">
        <span className="field__label">New username</span>
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
        </span>
      </label>

      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="booking__actions">
        <Pressable className="ghostbtn" onClick={() => setOpen(false)} disabled={busy}>
          <span>CANCEL</span>
        </Pressable>
        <Pressable className="cta" onClick={run} disabled={busy || !clean}>
          <span>{busy ? 'CREATING…' : 'CREATE NEW LOGIN'}</span>
          <span className="cta__arrow" aria-hidden="true">→</span>
        </Pressable>
      </div>
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
  const [outcome, setOutcome] = useState<ApprovalOutcome | null>(null)

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

  if (outcome?.kind === 'created') {
    return (
      <Credentials
        name={booking.name}
        issued={outcome.credentials}
        note="You can always issue a new one."
      />
    )
  }

  // A returning client keeps their existing login, so there is nothing to hand
  // over — saying so is the whole message.
  if (outcome?.kind === 'reconnected') {
    return (
      <section className="section">
        <h2 className="section__title">Reconnected</h2>
        <p className="booking__lede">
          {booking.name} already has an account for {booking.email}. Their chat
          is open again and their existing login still works — they sign in as{' '}
          <strong>{outcome.username}</strong>. Nothing new to send them.
        </p>
        <div className="booking__actions">
          <Pressable className="cta" onClick={() => window.location.reload()}>
            <span>OPEN THE CHAT</span>
            <span className="cta__arrow" aria-hidden="true">→</span>
          </Pressable>
        </div>
      </section>
    )
  }

  async function approve() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      setOutcome(await approveBooking(booking, adminUid, username))
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
