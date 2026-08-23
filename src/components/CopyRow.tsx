import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { DURATION, EASE_OUT } from '../motion/tokens'

/**
 * A label/value row whose value can be copied. Bank details get typed into
 * banking apps by hand, so every one of them is copyable.
 *
 * The clipboard API is unavailable in some sandboxed frames, so failure is a
 * state the row actually renders rather than a silent no-op.
 */
export function CopyRow({
  label,
  value,
  copyValue,
  strong,
}: {
  label: string
  value: string
  /** Defaults to `value`; pass the unspaced form for IBANs. */
  copyValue?: string
  strong?: boolean
}) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  const reduce = useReducedMotion()

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyValue ?? value)
      setState('done')
    } catch {
      setState('failed')
    }
    window.setTimeout(() => setState('idle'), 2000)
  }

  return (
    <div className={strong ? 'row row--strong' : 'row'}>
      <span className="row__label">{label}</span>
      <span className="row__value">{value}</span>
      <button
        type="button"
        className="row__copy"
        onClick={copy}
        aria-label={`Copy ${label}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={state}
            initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(4px)' }}
            animate={{ opacity: 1, transform: 'translateY(0px)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-4px)' }}
            transition={{ duration: DURATION.micro, ease: EASE_OUT }}
          >
            {state === 'done' ? 'COPIED' : state === 'failed' ? 'SELECT IT' : 'COPY'}
          </motion.span>
        </AnimatePresence>
      </button>
    </div>
  )
}
