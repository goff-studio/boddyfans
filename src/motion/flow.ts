import { TRACKS } from '../data/tracks'

/**
 * Navigation order. The hub is the root; each track sits one level deeper, so
 * hub -> track reads as forward and the "back" control reads as backward.
 * Track -> track (via the menu) keeps its list order.
 */
export const FLOW = ['/', ...TRACKS.map((t) => `/${t.slug}`)]

export function flowIndex(pathname: string): number {
  const i = FLOW.indexOf(pathname)
  return i === -1 ? 0 : i
}
