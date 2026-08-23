import { createContext, useContext } from 'react'
import { DURATION } from './tokens'

/**
 * How long in-screen content should wait before revealing itself.
 *
 * On a navigation the screen is sliding in, so content holds until that push
 * is most of the way settled. On the very first paint there is no push to
 * wait for — delaying there just shows the user an empty page.
 */
export const ScreenEntryContext = createContext<number>(0)

export const NAV_ENTER_DELAY = DURATION.screen * 0.6

export function useScreenEntryDelay(): number {
  return useContext(ScreenEntryContext)
}
