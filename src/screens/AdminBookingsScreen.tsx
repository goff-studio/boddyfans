import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wordmark } from '../components/Chrome'
import { useSession } from '../auth/session'
import { watchBookings, type Booking, type BookingStatus } from '../chat/bookings'
import { TRACKS } from '../data/tracks'
import { DURATION, EASE_OUT, STAGGER } from '../motion/tokens'

const FILTERS: { label: string; value: BookingStatus | 'all' }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Declined', value: 'declined' },
  { label: 'All', value: 'all' },
]

const trackWord = (slug: string) => TRACKS.find((t) => t.slug === slug)?.word ?? slug

function formatWhen(raw: string): string {
  // Stored as the raw datetime-local string the client typed.
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw || '—'
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AdminBookingsScreen() {
  const { signOutNow } = useSession()
  const [filter, setFilter] = useState<BookingStatus | 'all'>('pending')
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // One subscription for all statuses; the tabs filter what is already loaded,
  // so switching them is instant and needs no composite index.
  useEffect(() => {
    return watchBookings(setBookings, (e) => {
      // Keep the underlying error: a Firestore permission or index failure
      // carries the detail (and sometimes a fix-it link) that a friendly
      // message would throw away.
      console.error('bookings subscription failed', e)
      setError(
        'Could not load bookings. If this is the first run, check that admins/<your uid> exists and that the rules are published.',
      )
    })
  }, [])

  const visible =
    bookings === null ? null : filter === 'all' ? bookings : bookings.filter((b) => b.status === filter)

  return (
    <div className="panel">
      <header className="topbar">
        <Wordmark />
        <div className="topbar__right">
          <span className="panel__who">ANNA</span>
          <button type="button" className="back" onClick={() => void signOutNow()}>
            <span>SIGN OUT</span>
          </button>
        </div>
      </header>

      <div className="panel__body">
        <div className="panel__inner">
          <p className="booking__eyebrow">ATELIER · BOOKINGS</p>
          <h1 className="booking__title">Bookings</h1>

          <nav className="tabs" aria-label="Filter bookings">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={filter === f.value ? 'tabs__tab tabs__tab--on' : 'tabs__tab'}
                aria-current={filter === f.value ? 'true' : undefined}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </nav>

          {error ? (
            <p className="field__error" role="alert">
              {error}
            </p>
          ) : visible === null ? (
            <p className="chat__hint">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="chat__hint">
              {filter === 'pending'
                ? 'Nothing waiting. New bookings from the site land here.'
                : 'Nothing here.'}
            </p>
          ) : (
            <motion.ul
              className="blist"
              initial="hidden"
              animate="shown"
              variants={{ hidden: {}, shown: { transition: { staggerChildren: STAGGER * 0.5 } } }}
            >
              {visible.map((b) => (
                <motion.li
                  key={b.id}
                  variants={{
                    hidden: { opacity: 0, transform: 'translateY(6px)' },
                    shown: { opacity: 1, transform: 'translateY(0px)' },
                  }}
                  transition={{ duration: DURATION.micro, ease: EASE_OUT }}
                >
                  <Link to={`/admin/bookings/${b.id}`} className="brow">
                    <span className={`chip chip--${b.status}`}>{b.status}</span>
                    <span className="brow__name">{b.name}</span>
                    <span className="brow__track">{trackWord(b.trackSlug)}</span>
                    <span className="brow__when">{formatWhen(b.preferredAt)}</span>
                    <span className="brow__go" aria-hidden="true">→</span>
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </div>
      </div>
    </div>
  )
}
