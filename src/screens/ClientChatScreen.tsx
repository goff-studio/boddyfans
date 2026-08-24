import { useEffect, useState } from 'react'
import { Wordmark } from '../components/Chrome'
import { useSession } from '../auth/session'
import { ChatPane } from '../chat/ChatPane'
import { getMyBooking, type Booking } from '../chat/bookings'
import { TRACKS } from '../data/tracks'

/**
 * The client's side: one conversation, the one attached to their booking.
 *
 * The booking is looked up by `clientUid` rather than passed in a URL, so there
 * is no id for anyone to change — and the rules would refuse it anyway.
 */
export function ClientChatScreen() {
  const { user, displayName, signOutNow } = useSession()
  const [booking, setBooking] = useState<Booking | null | 'missing'>(null)

  useEffect(() => {
    if (!user) return
    let active = true
    void getMyBooking(user.uid)
      .then((b) => active && setBooking(b ?? 'missing'))
      .catch(() => active && setBooking('missing'))
    return () => {
      active = false
    }
  }, [user])

  const track =
    booking && booking !== 'missing'
      ? TRACKS.find((t) => t.slug === booking.trackSlug)
      : undefined

  return (
    <div className="panel">
      <header className="topbar">
        <Wordmark />
        <div className="topbar__right">
          {displayName ? <span className="panel__who">{displayName.toUpperCase()}</span> : null}
          <button type="button" className="back" onClick={() => void signOutNow()}>
            <span>SIGN OUT</span>
          </button>
        </div>
      </header>

      <div className="panel__body">
        <div className="panel__inner">
          <p className="booking__eyebrow">{track?.kicker ?? 'YOUR ATELIER'}</p>
          <h1 className="booking__title">Chat with Anna</h1>

          {booking === null ? (
            <p className="chat__hint">Loading…</p>
          ) : booking === 'missing' || !booking.conversationId ? (
            <p className="chat__hint">
              Your chat is not open yet. Anna opens it once she has confirmed your
              transfer.
            </p>
          ) : (
            <ChatPane
              conversationId={booking.conversationId}
              myUid={user!.uid}
              otherLabel="Anna"
            />
          )}
        </div>
      </div>
    </div>
  )
}
