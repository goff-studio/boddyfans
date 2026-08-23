import { useParams } from 'react-router-dom'
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { imageSide, TRACKS, trackBySlug } from '../data/tracks'
import { DURATION, EASE_OUT, STAGGER } from '../motion/tokens'
import { BackLink, Footer, MenuButton, Wordmark } from '../components/Chrome'
import { Pressable } from '../motion/primitives'
import { useScreenEntryDelay } from '../motion/ScreenEntry'
import { BookingSheet } from '../components/BookingSheet'

export function TrackScreen({
  onOpenMenu,
  menuOpen,
}: {
  onOpenMenu: () => void
  menuOpen: boolean
}) {
  const { slug } = useParams()
  const track = trackBySlug(slug)
  const reduce = useReducedMotion()
  const entryDelay = useScreenEntryDelay()
  const [booking, setBooking] = useState(false)

  if (!track) return null
  const side = imageSide(TRACKS.indexOf(track))

  const rise = {
    hidden: {
      opacity: 0,
      transform: reduce ? 'translateY(0px)' : 'translateY(14px)',
    },
    shown: { opacity: 1, transform: 'translateY(0px)' },
  }

  return (
    <div className="detail">
      <header className="topbar">
        <Wordmark />
        <div className="topbar__right">
          <BackLink />
          <MenuButton open={menuOpen} onClick={onOpenMenu} />
        </div>
      </header>

      <motion.div
        className={side === 'left' ? 'detail__body' : 'detail__body detail__body--flip'}
        initial="hidden"
        animate="shown"
        variants={{
          hidden: {},
          shown: {
            transition: {
              staggerChildren: reduce ? 0 : STAGGER,
              delayChildren: reduce ? 0 : entryDelay,
            },
          },
        }}
      >
        {/* The photo settles rather than slides: a contained scale-down reads
            as the image coming to rest behind the frame, and never shifts the
            layout around the text. */}
        <div className="panel panel--media">
          <motion.img
            className="panel__img"
            src={track.image}
            alt={track.alt}
            variants={{
              hidden: { transform: reduce ? 'scale(1)' : 'scale(1.07)', opacity: 0 },
              shown: { transform: 'scale(1)', opacity: 1 },
            }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
          />
        </div>

        <div className="panel panel--text">
          <motion.span
            className="ghost"
            aria-hidden="true"
            variants={{
              hidden: {
                opacity: 0,
                transform: reduce ? 'translateY(0px)' : 'translateY(18px)',
              },
              shown: { opacity: 1, transform: 'translateY(0px)' },
            }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
          >
            {track.num}
          </motion.span>

          <div className="copy">
            <motion.p
              className="copy__kicker"
              variants={rise}
              transition={{ duration: DURATION.short, ease: EASE_OUT }}
            >
              {track.kicker}
            </motion.p>

            {/* Nested stagger: the headline is a variant parent of its own
                lines, so they cascade inside the screen's cascade. */}
            <motion.h1
              className="copy__title"
              variants={{
                hidden: {},
                shown: { transition: { staggerChildren: reduce ? 0 : 0.045 } },
              }}
            >
              {track.title.map((line) => (
                <motion.span
                  key={line}
                  className="copy__line"
                  variants={rise}
                  transition={{ duration: DURATION.short, ease: EASE_OUT }}
                >
                  {line}
                </motion.span>
              ))}
            </motion.h1>

            <motion.p
              className="copy__body"
              variants={rise}
              transition={{ duration: DURATION.short, ease: EASE_OUT }}
            >
              {track.body}
            </motion.p>

            <motion.div
              variants={rise}
              transition={{ duration: DURATION.short, ease: EASE_OUT }}
            >
              <Pressable className="cta" onClick={() => setBooking(true)}>
                <span>BOOK A SESSION</span>
                <span className="cta__arrow" aria-hidden="true">
                  →
                </span>
              </Pressable>
            </motion.div>
          </div>
        </div>
      </motion.div>

      <Footer />

      <BookingSheet
        track={track}
        open={booking}
        onClose={() => setBooking(false)}
      />
    </div>
  )
}
