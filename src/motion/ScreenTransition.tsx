import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLocation, useOutlet } from 'react-router-dom'
import { DURATION, EASE_DRAWER } from './tokens'
import { useScreenTransitionState } from './useNavDirection'
import { NAV_ENTER_DELAY, ScreenEntryContext } from './ScreenEntry'

/**
 * iOS-style push/pop between flow steps.
 *
 * The entering screen travels the full viewport width; the outgoing screen
 * moves a third of that in the same direction and dims, so it reads as a
 * layer being covered rather than two slides racing. Exit mirrors entry, so
 * going back retraces the path forward — that symmetry is what makes the
 * stack legible.
 *
 * Both screens are absolutely positioned and animate at once (`mode="sync"`),
 * which is why there is no gap or flash of empty background mid-transition.
 */
export function ScreenTransition() {
  const location = useLocation()
  const { direction, hasNavigated } = useScreenTransitionState()
  const reduce = useReducedMotion()

  // AnimatePresence needs the outlet captured per-location, otherwise the
  // exiting screen re-renders with the new route's element.
  const outlet = useOutlet()

  // First paint has no incoming push, so content should not wait for one.
  const entryDelay = hasNavigated ? NAV_ENTER_DELAY : 0

  // Variants are functions of `custom` rather than plain objects on purpose.
  // AnimatePresence feeds the current `custom` to the *exiting* child; a
  // static object would freeze it with the direction from its last render,
  // so going back would send the outgoing screen out the way it came in.
  const variants = {
    enter: (d: number) => ({
      transform: reduce ? 'translateX(0%)' : `translateX(${d * 100}%)`,
      opacity: reduce ? 0 : 1,
    }),
    center: {
      transform: 'translateX(0%)',
      opacity: 1,
    },
    exit: (d: number) => ({
      transform: reduce ? 'translateX(0%)' : `translateX(${d * -33}%)`,
      opacity: reduce ? 0 : 0.55,
    }),
  }

  return (
    <div className="screen-stack">
      <AnimatePresence mode="sync" initial={false} custom={direction}>
        <motion.main
          key={location.pathname}
          className="screen"
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            duration: reduce ? DURATION.short : DURATION.screen,
            ease: reduce ? 'easeOut' : EASE_DRAWER,
          }}
        >
          <ScreenEntryContext.Provider value={entryDelay}>
            {outlet}
          </ScreenEntryContext.Provider>
        </motion.main>
      </AnimatePresence>
    </div>
  )
}
