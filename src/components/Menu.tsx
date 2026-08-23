import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { TRACKS } from '../data/tracks'
import { DURATION, EASE_OUT, STAGGER } from '../motion/tokens'
import { MenuButton, Wordmark } from './Chrome'

/**
 * NOTE: the Figma set has no menu frame, but the burger appears in every
 * header — and on the desktop hub it is the only chrome there is. Rather than
 * ship a visible control that does nothing, this builds the panel out of the
 * existing tokens and the track list. Swap it for the real frame when there
 * is one.
 */
export function Menu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion()

  // Escape closes, and the page behind must not scroll while it is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="menu"
          role="dialog"
          aria-modal="true"
          aria-label="Atelier tracks"
          initial="hidden"
          animate="shown"
          exit="hidden"
          variants={{
            hidden: {
              opacity: 0,
              transform: reduce ? 'translateY(0%)' : 'translateY(-2%)',
            },
            shown: { opacity: 1, transform: 'translateY(0%)' },
          }}
          transition={{ duration: DURATION.short, ease: EASE_OUT }}
        >
          <div className="menu__bar">
            <Wordmark inverted />
            <MenuButton open onClick={onClose} inverted />
          </div>

          <motion.nav
            className="menu__list"
            initial="hidden"
            animate="shown"
            variants={{
              hidden: {},
              shown: {
                transition: {
                  staggerChildren: reduce ? 0 : STAGGER,
                  delayChildren: reduce ? 0 : 0.06,
                },
              },
            }}
          >
            {TRACKS.map((track) => (
              <motion.div
                key={track.slug}
                variants={{
                  hidden: {
                    opacity: 0,
                    transform: reduce ? 'translateY(0px)' : 'translateY(12px)',
                  },
                  shown: { opacity: 1, transform: 'translateY(0px)' },
                }}
                transition={{ duration: DURATION.short, ease: EASE_OUT }}
              >
                <Link to={`/${track.slug}`} className="menu__item" onClick={onClose}>
                  <span className="menu__num">{track.num}</span>
                  <span className="menu__word">
                    {track.word}
                    {track.glyph ? <span className="menu__glyph">{track.glyph}</span> : null}
                  </span>
                  <em className="menu__tagline">{track.tagline}</em>
                </Link>
              </motion.div>
            ))}
          </motion.nav>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
