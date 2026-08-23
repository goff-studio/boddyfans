import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { TRACKS } from '../data/tracks'
import { DURATION, EASE_OUT, STAGGER } from '../motion/tokens'
import { MenuButton, Wordmark } from '../components/Chrome'
import { useScreenEntryDelay } from '../motion/ScreenEntry'

/**
 * The wash over each photo.
 *
 * The hub columns are a ~90% flat tint that warms and deepens left to right,
 * with only a trace of the photograph reading through. Each value is fitted
 * against its own source photo from the export — `design = 0.09*src + C` —
 * rather than interpolated between the ends: columns 4 and 5 do not sit on
 * the straight line the others suggest, and guessing column 5 put it 28 too
 * blue. Falls back to the last value if a track is added.
 */
const TINTS = [
  'rgb(191, 169, 151)',
  'rgb(183, 158, 146)',
  'rgb(174, 144, 133)',
  'rgb(171, 145, 136)',
  'rgb(151, 117, 101)',
]

function tint(i: number): string {
  return TINTS[i] ?? TINTS[TINTS.length - 1]
}

/**
 * Vertical letter pitch, as letter-spacing.
 *
 * The export holds cap height constant at 65px and varies the *pitch* between
 * stacked letters: 90px for words of five glyphs or fewer, 81px beyond that,
 * which is how a seven-letter word still clears the label. In upright vertical
 * text the glyph advance is the font's own vertical advance — 1.207em for
 * Inter Tight — so the spacing is that target minus the advance. Re-derive the
 * 1.207 if the display face ever changes.
 */
const ADVANCE_EM = 1.207

function pitchSpacing(glyphs: number): string {
  const targetEm = glyphs <= 5 ? 1.008 : 0.907
  return `${(targetEm - ADVANCE_EM).toFixed(3)}em`
}

export function HubScreen({
  onOpenMenu,
  menuOpen,
}: {
  onOpenMenu: () => void
  menuOpen: boolean
}) {
  const reduce = useReducedMotion()
  const entryDelay = useScreenEntryDelay()

  return (
    <div className="hub">
      {/* Intro is mobile-only in the design; the desktop hub is a full-bleed
          splash where the columns are the whole navigation. */}
      <div className="hub__intro">
        <div className="hub__bar">
          <Wordmark inverted />
          <MenuButton open={menuOpen} onClick={onOpenMenu} inverted />
        </div>
        <h1 className="hub__title">milanese physiotherapeutic training atelier.</h1>
        <p className="hub__sub">
          Select an atelier track below to see how clinical physiotherapy meets
          deliberate form.
        </p>
      </div>

      <motion.ul
        className="hub__tracks"
        initial="hidden"
        animate="shown"
        variants={{
          hidden: {},
          shown: {
            transition: {
              staggerChildren: reduce ? 0 : STAGGER + 0.01,
              delayChildren: reduce ? 0 : entryDelay,
            },
          },
        }}
      >
        {TRACKS.map((track, i) => (
          <motion.li
            key={track.slug}
            className="cell"
            style={
              {
                ['--tint' as string]: tint(i),
                ['--pitch' as string]: pitchSpacing(
                  track.word.length + (track.glyph ? 1 : 0),
                ),
              } as CSSProperties
            }
            variants={{
              hidden: { opacity: 0 },
              shown: { opacity: 1 },
            }}
            transition={{ duration: DURATION.short, ease: EASE_OUT }}
          >
            <Link to={`/${track.slug}`} className="cell__hit">
              <motion.img
                className="cell__img"
                src={track.image}
                alt=""
                aria-hidden="true"
                variants={{
                  hidden: { transform: reduce ? 'scale(1)' : 'scale(1.08)' },
                  shown: { transform: 'scale(1)' },
                }}
                transition={{ duration: 0.7, ease: EASE_OUT }}
              />
              <span className="cell__tint" aria-hidden="true" />

              <motion.span
                className="cell__word"
                variants={{
                  hidden: {
                    opacity: 0,
                    transform: reduce ? 'translateY(0px)' : 'translateY(14px)',
                  },
                  shown: { opacity: 1, transform: 'translateY(0px)' },
                }}
                transition={{ duration: DURATION.short, ease: EASE_OUT }}
              >
                {track.word}
                {track.glyph ? (
                  <span className="cell__glyph">{track.glyph}</span>
                ) : null}
              </motion.span>

              <motion.span
                className="cell__label"
                variants={{
                  hidden: {
                    opacity: 0,
                    transform: reduce ? 'translateY(0px)' : 'translateY(10px)',
                  },
                  shown: { opacity: 1, transform: 'translateY(0px)' },
                }}
                transition={{ duration: DURATION.short, ease: EASE_OUT }}
              >
                <span className="cell__labelText">
                  <span className="cell__kicker">{track.kicker}</span>
                  <em className="cell__tagline">{track.tagline}</em>
                </span>
                <span className="cell__num">{track.num}</span>
              </motion.span>
            </Link>
          </motion.li>
        ))}
      </motion.ul>

      <footer className="hub__footer">ANNA NEFEDOVA · ATELIER · MILAN</footer>
    </div>
  )
}
