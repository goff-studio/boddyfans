import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { Track } from '../data/tracks'
import { accountFor, groupIban, paymentReference } from '../data/payment'
import { DURATION, EASE_DRAWER, EASE_OUT, STAGGER } from '../motion/tokens'
import { Pressable } from '../motion/primitives'
import { CopyRow } from './CopyRow'
import { Wordmark } from './Chrome'

/**
 * Manual booking: who you are, when you want it, pay by transfer, send the
 * receipt. Deliberately three short steps rather than one long form — the
 * payment step is a task the person leaves the page to do, so it needs to be
 * a place they can come back to, not a field buried in a scroll.
 *
 * Submitting writes the booking to Firestore as `pending` and attaches the
 * receipt. Anna reviews it in the panel and approves, which is what creates the
 * client's account and opens their chat — nothing here grants access.
 */

const STEPS = ['Your session', 'Transfer', 'Receipt'] as const

const EMBEDDED = import.meta.env.VITE_EMBEDDED === '1'

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf']

export function BookingSheet({
  track,
  open,
  onClose,
}: {
  track: Track
  open: boolean
  onClose: () => void
}) {
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [name, setName] = useState('')
  const [when, setWhen] = useState('')
  const [email, setEmail] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const account = accountFor(track.slug)
  const reference = paymentReference(track.word, name)

  // Escape closes, and the page behind must not scroll while this is up.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  // Reset once closed so reopening starts clean, without the user watching it.
  useEffect(() => {
    if (open) return
    const t = window.setTimeout(() => {
      setStep(0); setDirection(1); setName(''); setWhen(''); setEmail('')
      setReceipt(null); setReceiptError(null); setSent(false)
      setSending(false); setSendError(null)
    }, 250)
    return () => window.clearTimeout(t)
  }, [open])

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1)
    setStep(next)
  }

  const canLeaveStep1 = name.trim().length > 0 && when.length > 0

  async function submit() {
    if (!receipt || sending) return

    // The single-file preview has no network and no backend. Showing the
    // confirmation is the honest end of the flow there, and the early return
    // keeps the Firebase imports below out of that bundle entirely.
    if (EMBEDDED) {
      setSent(true)
      return
    }

    setSending(true)
    setSendError(null)
    try {
      // Imported here rather than at module scope so the Firebase chunk only
      // loads when somebody actually books.
      const [{ prepareReceipt }, { submitBooking }] = await Promise.all([
        import('../chat/receipt'),
        import('../chat/bookings'),
      ])

      const prepared = await prepareReceipt(receipt)
      if (!prepared.ok) {
        setReceiptError(prepared.reason)
        setSending(false)
        return
      }

      await submitBooking({
        name,
        email: email.trim() || undefined,
        trackSlug: track.slug,
        preferredAt: when,
        reference,
        receipt: prepared.receipt,
      })
      setSent(true)
    } catch {
      setSendError(
        'That did not go through. Check your connection and try again — your details are still here.',
      )
    } finally {
      setSending(false)
    }
  }

  function pickReceipt(file: File | undefined) {
    if (!file) return
    if (!ACCEPTED.includes(file.type)) {
      setReceiptError('Use a photo, screenshot or PDF of the transfer.')
      return
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setReceiptError('That file is over 10MB — a screenshot is usually enough.')
      return
    }
    setReceiptError(null)
    setReceipt(file)
  }

  const variants = {
    enter: (d: number) => ({
      opacity: 0,
      transform: reduce ? 'translateX(0px)' : `translateX(${d * 24}px)`,
    }),
    center: { opacity: 1, transform: 'translateX(0px)' },
    exit: (d: number) => ({
      opacity: 0,
      transform: reduce ? 'translateX(0px)' : `translateX(${d * -24}px)`,
    }),
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="booking"
          role="dialog"
          aria-modal="true"
          aria-label={`Book ${track.tagline}`}
          initial={{ opacity: 0, transform: reduce ? 'translateY(0px)' : 'translateY(12px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          exit={{ opacity: 0, transform: reduce ? 'translateY(0px)' : 'translateY(12px)' }}
          transition={{ duration: DURATION.short, ease: EASE_DRAWER }}
        >
          <header className="booking__bar">
            <Wordmark />
            <button type="button" className="booking__close" onClick={onClose} aria-label="Close">
              <span />
              <span />
            </button>
          </header>

          <div className="booking__body">
            <div className="booking__inner">
              <p className="booking__eyebrow">
                {track.kicker} · {track.num}
              </p>

              {sent ? (
                <Confirmation name={name} when={when} onClose={onClose} />
              ) : (
                <>
                  <ol className="steps" aria-label="Booking steps">
                    {STEPS.map((s, i) => (
                      <li
                        key={s}
                        className={
                          i === step ? 'steps__item steps__item--on' : 'steps__item'
                        }
                        aria-current={i === step ? 'step' : undefined}
                      >
                        <span className="steps__num">0{i + 1}</span>
                        <span className="steps__name">{s}</span>
                      </li>
                    ))}
                  </ol>

                  <AnimatePresence mode="wait" custom={direction} initial={false}>
                    <motion.div
                      key={step}
                      custom={direction}
                      variants={variants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: DURATION.short, ease: EASE_OUT }}
                    >
                      {step === 0 ? (
                        <StepDetails
                          name={name}
                          setName={setName}
                          when={when}
                          setWhen={setWhen}
                          email={email}
                          setEmail={setEmail}
                          canContinue={canLeaveStep1}
                          onContinue={() => go(1)}
                        />
                      ) : step === 1 ? (
                        <StepTransfer
                          account={account}
                          reference={reference}
                          onBack={() => go(0)}
                          onContinue={() => go(2)}
                        />
                      ) : (
                        <StepReceipt
                          receipt={receipt}
                          error={receiptError}
                          onPick={pickReceipt}
                          onClear={() => setReceipt(null)}
                          onBack={() => go(1)}
                          onSubmit={submit}
                          sending={sending}
                          sendError={sendError}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </>
              )}
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/* --- Step 01 -------------------------------------------------------------- */

function StepDetails({
  name, setName, when, setWhen, email, setEmail, canContinue, onContinue,
}: {
  name: string
  setName: (v: string) => void
  when: string
  setWhen: (v: string) => void
  email: string
  setEmail: (v: string) => void
  canContinue: boolean
  onContinue: () => void
}) {
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        if (canContinue) onContinue()
      }}
    >
      <h1 className="booking__title">What should I call you?</h1>
      <p className="booking__lede">
        A first name or a nickname is plenty — whatever you'd like to be greeted by.
      </p>

      <label className="field">
        <span className="field__label">Name</span>
        <input
          className="field__input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ana, Ali, Cico…"
          autoComplete="given-name"
          autoFocus
          required
        />
      </label>

      <label className="field">
        <span className="field__label">Preferred date and time</span>
        <input
          className="field__input"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          required
        />
        <span className="field__hint">
          Anna confirms by reply — if the slot is taken she'll offer the nearest one.
        </span>
      </label>

      <label className="field">
        <span className="field__label">Email (optional)</span>
        <input
          className="field__input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="so Anna can reach you outside the chat"
          autoComplete="email"
        />
      </label>

      <div className="booking__actions">
        <Pressable className="cta" type="submit" disabled={!canContinue}>
          <span>CONTINUE</span>
          <span className="cta__arrow" aria-hidden="true">→</span>
        </Pressable>
      </div>
    </form>
  )
}

/* --- Step 02 -------------------------------------------------------------- */

function StepTransfer({
  account, reference, onBack, onContinue,
}: {
  account: ReturnType<typeof accountFor>
  reference: string
  onBack: () => void
  onContinue: () => void
}) {
  const reduce = useReducedMotion()
  return (
    <div className="form">
      <h1 className="booking__title">Send the transfer</h1>
      <p className="booking__lede">
        Payment is by bank transfer for now. Put the reference in the description
        so Anna can match it to your booking.
      </p>

      <motion.div
        className="account"
        initial="hidden"
        animate="shown"
        variants={{
          hidden: {},
          shown: { transition: { staggerChildren: reduce ? 0 : STAGGER * 0.6 } },
        }}
      >
        {[
          <CopyRow key="ref" label="Reference" value={reference} strong />,
          account.holder ? (
            <CopyRow key="holder" label="Beneficiary" value={account.holder} />
          ) : null,
          <CopyRow
            key="iban"
            label="IBAN"
            value={groupIban(account.iban)}
            copyValue={account.iban}
            strong
          />,
          <CopyRow key="bic" label="BIC / SWIFT" value={account.bic} />,
          ...(account.extra ?? []).map((e) => (
            <CopyRow key={e.label} label={e.label} value={e.value} />
          )),
        ]
          .filter(Boolean)
          .map((child, i) => (
            <motion.div
              key={i}
              variants={{
                hidden: { opacity: 0, transform: reduce ? 'none' : 'translateY(6px)' },
                shown: { opacity: 1, transform: 'translateY(0px)' },
              }}
              transition={{ duration: DURATION.micro, ease: EASE_OUT }}
            >
              {child}
            </motion.div>
          ))}
      </motion.div>

      {account.bank ? <p className="account__bank">{account.bank}</p> : null}
      {account.note ? <p className="account__note">{account.note}</p> : null}

      <div className="booking__actions">
        <Pressable className="ghostbtn" onClick={onBack}>
          <span className="ghostbtn__arrow" aria-hidden="true">←</span>
          <span>BACK</span>
        </Pressable>
        <Pressable className="cta" onClick={onContinue}>
          <span>I'VE PAID</span>
          <span className="cta__arrow" aria-hidden="true">→</span>
        </Pressable>
      </div>
    </div>
  )
}

/* --- Step 03 -------------------------------------------------------------- */

function StepReceipt({
  receipt, error, onPick, onClear, onBack, onSubmit, sending, sendError,
}: {
  receipt: File | null
  error: string | null
  onPick: (f: File | undefined) => void
  onClear: () => void
  onBack: () => void
  onSubmit: () => void
  sending: boolean
  sendError: string | null
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  // Object URLs must be revoked, or previewing a few files leaks each one.
  const preview = useMemo(
    () => (receipt && receipt.type.startsWith('image/') ? URL.createObjectURL(receipt) : null),
    [receipt],
  )
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  return (
    <div className="form">
      <h1 className="booking__title">Send the receipt</h1>
      <p className="booking__lede">
        A screenshot from your banking app is fine. This confirms the slot.
      </p>

      <div
        className={dragging ? 'drop drop--over' : 'drop'}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          onPick(e.dataTransfer.files?.[0])
        }}
      >
        <input
          ref={input}
          className="drop__input"
          type="file"
          accept={ACCEPTED.join(',')}
          onChange={(e) => onPick(e.target.files?.[0])}
        />

        {receipt ? (
          <div className="drop__file">
            {preview ? (
              <img className="drop__thumb" src={preview} alt="" />
            ) : (
              <span className="drop__pdf" aria-hidden="true">PDF</span>
            )}
            <span className="drop__meta">
              <span className="drop__name">{receipt.name}</span>
              <span className="drop__size">{(receipt.size / 1024).toFixed(0)} KB</span>
            </span>
            <button type="button" className="drop__clear" onClick={onClear}>
              REPLACE
            </button>
          </div>
        ) : (
          <button type="button" className="drop__hit" onClick={() => input.current?.click()}>
            <span className="drop__title">Drop the receipt here</span>
            <span className="drop__hint">or choose a file · PNG, JPG, HEIC or PDF, up to 10MB</span>
          </button>
        )}
      </div>

      {error ? <p className="field__error" role="alert">{error}</p> : null}
      {sendError ? <p className="field__error" role="alert">{sendError}</p> : null}

      <div className="booking__actions">
        <Pressable className="ghostbtn" onClick={onBack} disabled={sending}>
          <span className="ghostbtn__arrow" aria-hidden="true">←</span>
          <span>BACK</span>
        </Pressable>
        <Pressable className="cta" onClick={onSubmit} disabled={!receipt || sending}>
          <span>{sending ? 'SENDING…' : 'SEND REQUEST'}</span>
          <span className="cta__arrow" aria-hidden="true">→</span>
        </Pressable>
      </div>
    </div>
  )
}

/* --- Done ---------------------------------------------------------------- */

function Confirmation({
  name, when, onClose,
}: {
  name: string
  when: string
  onClose: () => void
}) {
  const pretty = when
    ? new Date(when).toLocaleString(undefined, {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      })
    : ''
  return (
    <div className="form">
      <h1 className="booking__title">Thanks, {name.trim()}.</h1>
      <p className="booking__lede">
        Anna will check the transfer and confirm{' '}
        {pretty ? <strong>{pretty}</strong> : 'your slot'}. Once she does, you'll
        get a username and password for your private chat with her.
      </p>
      <div className="booking__actions">
        <Pressable className="cta" onClick={onClose}>
          <span>DONE</span>
        </Pressable>
      </div>
    </div>
  )
}
