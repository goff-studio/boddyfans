import { useLocation } from 'react-router-dom'
import { useState } from 'react'
import { flowIndex } from './flow'

export type NavDirection = 1 | -1

export type ScreenTransitionState = {
  /** +1 moving forward through the flow, -1 moving back. */
  direction: NavDirection
  /** False until the first navigation, so the initial paint can skip delays. */
  hasNavigated: boolean
}

/**
 * Derives push/pop direction from movement along FLOW.
 *
 * Uses the "adjust state during render" pattern rather than refs. Refs are
 * the obvious reach here and they break: StrictMode renders twice, so a ref
 * written during the first pass is already stale on the second, which
 * inverts the direction on back-navigation. Comparing state is idempotent,
 * so the second pass is a no-op.
 */
export function useScreenTransitionState(): ScreenTransitionState {
  const { pathname } = useLocation()
  const index = flowIndex(pathname)

  const [prevIndex, setPrevIndex] = useState(index)
  const [direction, setDirection] = useState<NavDirection>(1)
  const [hasNavigated, setHasNavigated] = useState(false)

  if (prevIndex !== index) {
    setDirection(index < prevIndex ? -1 : 1)
    setPrevIndex(index)
    setHasNavigated(true)
  }

  return { direction, hasNavigated }
}
