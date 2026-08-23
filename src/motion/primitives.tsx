import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { DURATION, EASE_OUT } from './tokens'

/**
 * Press feedback for buttons and tappable rows. Press only — hover lives in
 * CSS behind `@media (hover: hover)`, so a tap on a touch screen cannot leave
 * a hover state stuck on.
 */
export function Pressable({
  children,
  className,
  onClick,
  type = 'button',
  disabled,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <motion.button
      type={type}
      className={className}
      onClick={onClick}
      disabled={disabled}
      whileTap={reduce || disabled ? undefined : { transform: 'scale(0.97)' }}
      transition={{ duration: DURATION.press, ease: EASE_OUT }}
    >
      {children}
    </motion.button>
  )
}
