import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { DURATION, EASE_OUT } from '../motion/tokens'
import { Pressable } from '../motion/primitives'
import { sendMessage, watchMessages } from './client'
import type { ChatMessage } from './schema'

/**
 * The conversation, shared by Anna's panel and the client's page. The only
 * difference between the two is whose uid counts as "mine".
 */
export function ChatPane({
  conversationId,
  myUid,
  otherLabel,
}: {
  conversationId: string
  myUid: string
  /** Who the other side is, for the empty state. */
  otherLabel: string
}) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const reduce = useReducedMotion()

  const scroller = useRef<HTMLDivElement | null>(null)
  const atBottom = useRef(true)

  // Same reasoning as the bookings list: reset during render so a switched
  // conversation never shows the previous one's messages.
  const [shown, setShown] = useState(conversationId)
  if (shown !== conversationId) {
    setShown(conversationId)
    setMessages(null)
    setError(null)
  }

  useEffect(() => {
    return watchMessages(
      conversationId,
      (next) => setMessages(next),
      () => setError('Could not load this conversation.'),
    )
  }, [conversationId])

  // Stick to the bottom only if the reader was already there — yanking someone
  // away from older messages they are reading is worse than a missed message.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || !messages) return
    if (atBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  function onScroll() {
    const el = scroller.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    // Cleared immediately: the listener echoes the message back within a frame
    // or two, and leaving it in the box reads as a failed send.
    setDraft('')
    try {
      atBottom.current = true
      await sendMessage(conversationId, myUid, body)
    } catch {
      setDraft(body) // hand it back rather than losing what they typed
      setError('That message did not send.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="chat">
      <div className="chat__scroll" ref={scroller} onScroll={onScroll}>
        {messages === null ? (
          <p className="chat__hint">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="chat__hint">
            No messages yet. Say hello to {otherLabel}.
          </p>
        ) : (
          <ul className="chat__list">
            <AnimatePresence initial={false}>
              {messages.map((m) => {
                const mine = m.senderUid === myUid
                return (
                  <motion.li
                    key={m.id}
                    className={mine ? 'bubble bubble--mine' : 'bubble'}
                    initial={
                      reduce
                        ? { opacity: 0 }
                        : { opacity: 0, transform: 'translateY(8px)' }
                    }
                    animate={{ opacity: 1, transform: 'translateY(0px)' }}
                    transition={{ duration: DURATION.short, ease: EASE_OUT }}
                  >
                    <span className="bubble__text">
                      {m.failed ? (
                        <em className="bubble__failed">This message could not be read.</em>
                      ) : (
                        m.text
                      )}
                    </span>
                    <time className="bubble__time">
                      {m.sentAt
                        ? m.sentAt.toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '· · ·'}
                    </time>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {error ? (
        <p className="field__error chat__error" role="alert">
          {error}
        </p>
      ) : null}

      <form className="composer" onSubmit={submit}>
        <textarea
          className="composer__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line — what a chat box does.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit(e)
            }
          }}
          placeholder="Write a message"
          rows={1}
          maxLength={4000}
        />
        <Pressable className="cta composer__send" type="submit" disabled={!draft.trim() || sending}>
          <span>SEND</span>
          <span className="cta__arrow" aria-hidden="true">→</span>
        </Pressable>
      </form>
    </div>
  )
}
