/**
 * The tip jar.
 *
 * Framed as supporting the atelier rather than as a donation: Anna runs a
 * practice, not a charity, and "donate" invites the wrong comparison to the
 * paid tracks. Change the copy here if that call is wrong — it is one string.
 *
 * Deliberately absent from the hub, the track pages and the booking flow. An
 * ask sitting beside "Book a session" competes with the thing that actually
 * pays her, and an ask inside a payment flow is worse than none.
 */
export const SUPPORT = {
  url: 'https://paypal.me/annafisio',
  /** Menu label. Unnumbered on purpose — it is not one of the five tracks. */
  label: 'SUPPORT THE ATELIER',
  menuTagline: 'Leave a tip',
  /** Shown to a client whose sessions have wrapped up. */
  closedTitle: 'That is a wrap',
  closedBody:
    'If the work made a difference, you can leave Anna a tip. Entirely optional, and it changes nothing about your sessions.',
  cta: 'LEAVE A TIP',
} as const
