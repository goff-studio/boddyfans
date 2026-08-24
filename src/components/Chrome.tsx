import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { DURATION, EASE_OUT } from '../motion/tokens'

/** Wordmark: heavy "AN", coral dot, spaced "ATELIER". */
export function Wordmark({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link to="/" className={inverted ? 'mark mark--inv' : 'mark'} aria-label="Anna Nefedova Atelier, go to index">
      <span className="mark__an">AN</span>
      <span className="mark__dot" aria-hidden="true">•</span>
      <span className="mark__word">ATELIER</span>
    </Link>
  )
}

/**
 * Two stacked rules that cross into an X when open. The rules rotate about
 * their own centre and the top/bottom offset collapses, so the open and close
 * paths are exact mirrors.
 */
export function MenuButton({
  open,
  onClick,
  inverted = false,
}: {
  open: boolean
  onClick: () => void
  inverted?: boolean
}) {
  const reduce = useReducedMotion()
  const t = { duration: DURATION.short, ease: EASE_OUT }
  return (
    <button
      type="button"
      className={inverted ? 'burger burger--inv' : 'burger'}
      onClick={onClick}
      aria-label={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
    >
      <motion.span
        className="burger__bar"
        animate={
          reduce
            ? {}
            : { transform: open ? 'translateY(4px) rotate(45deg)' : 'translateY(0px) rotate(0deg)' }
        }
        transition={t}
      />
      <motion.span
        className="burger__bar"
        animate={
          reduce
            ? {}
            : { transform: open ? 'translateY(-4px) rotate(-45deg)' : 'translateY(0px) rotate(0deg)' }
        }
        transition={t}
      />
    </button>
  )
}

/** "← BACK". The arrow nudges toward where it will take you. */
export function BackLink() {
  return (
    <Link to="/" className="back">
      <span className="back__arrow" aria-hidden="true">←</span>
      <span>BACK</span>
    </Link>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <span className="footer__name">ANNA NEFEDOVA</span>
      <span className="footer__meta">PHYSIOTHERAPIST · COACH · TRAINER</span>
      <span className="footer__meta">© 2026 BOLOGNA, ITALY</span>
    </footer>
  )
}
