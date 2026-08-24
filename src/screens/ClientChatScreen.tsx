import { useEffect, useState } from 'react'
import { Wordmark } from '../components/Chrome'
import { useSession } from '../auth/session'
import { ChatPane } from '../chat/ChatPane'
import { getMyChat } from '../chat/bookings'

/**
 * The client's side: one conversation, the one attached to their booking.
 *
 * The booking is looked up by `clientUid` rather than passed in a URL, so there
 * is no id for anyone to change — and the rules would refuse it anyway.
 */
export function ClientChatScreen() {
  const { user, displayName, signOutNow } = useSession()
  const [chat, setChat] = useState<
    { conversationId: string; status: 'open' | 'closed' } | null | 'none'
  >(null)

  useEffect(() => {
    if (!user) return
    let active = true
    void getMyChat(user.uid)
      .then((c) => active && setChat(c ?? 'none'))
      .catch(() => active && setChat('none'))
    return () => {
      active = false
    }
  }, [user])

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
          <p className="booking__eyebrow">YOUR ATELIER</p>
          <h1 className="booking__title">Chat with Anna</h1>

          {chat === null ? (
            <p className="chat__hint">Loading…</p>
          ) : chat === 'none' ? (
            <p className="chat__hint">
              Your chat is not open yet. Anna opens it once she has confirmed your
              transfer.
            </p>
          ) : (
            <>
              {chat.status === 'closed' ? (
                <p className="notice">
                  This chat is closed, so you can read it but not reply. Book
                  another session and Anna will reopen it — you will come back to
                  this same conversation.
                </p>
              ) : null}
              <ChatPane
                conversationId={chat.conversationId}
                myUid={user!.uid}
                otherLabel="Anna"
                readOnly={chat.status === 'closed'}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
