export type Track = {
  slug: string
  /** Display number, also used as the oversized watermark. */
  num: string
  /** Vertical word on the hub. */
  word: string
  /** Trailing glyph after the word, if any. */
  glyph?: string
  /** Small caps label above the headline. */
  kicker: string
  /** Italic line shown on the hub only. */
  tagline: string
  /** Headline, one entry per rendered line — the design breaks these by hand. */
  title: string[]
  body: string
  image: string
  alt: string
}

/**
 * Image side on the detail screens alternates down the list: odd numbers put
 * the photo on the left, even numbers on the right. Derived rather than
 * stored, so adding a track can't get the rhythm wrong.
 */
export function imageSide(index: number): 'left' | 'right' {
  return index % 2 === 0 ? 'left' : 'right'
}

export const TRACKS: Track[] = [
  {
    slug: 'train',
    num: '01',
    word: 'TRAIN',
    kicker: 'PREVENT INJURIES',
    tagline: 'Train Safely',
    title: ['train', 'without', 'injuries'],
    body: 'Science-backed programming that protects your joints while building real strength. Every movement is intentional.',
    image: '/images/train.jpg',
    alt: 'Anna in a kneeling lunge, pressing a stability ball against a studio wall',
  },
  {
    slug: 'build',
    num: '02',
    word: 'BUILD',
    kicker: 'BODY SCULPTING',
    tagline: 'Your Form',
    title: ['build the', 'body you', 'want'],
    body: 'Custom training plans designed around your goals, your schedule, your body. No templates, no shortcuts.',
    image: '/images/build.jpg',
    alt: 'Anna holding a full backbend on the sand at the shoreline',
  },
  {
    slug: 'perform',
    num: '03',
    word: 'PERFORM',
    kicker: 'ATHLETIC AGING',
    tagline: 'Peak Vigor',
    title: ['perform', 'better as', 'you age'],
    body: 'Stay powerful, mobile, and pain-free at every stage of life. Age is not a limit — it is a strategy.',
    image: '/images/perform.jpg',
    alt: 'Anna in a side-lying leg raise with a stability ball on the beach',
  },
  {
    slug: 'recover',
    num: '04',
    word: 'RECOVER',
    kicker: 'REHABILITATION',
    tagline: 'Physiotherapy',
    title: ['strong', 'through', 'injuries'],
    body: 'Expert rehabilitation meets smart training. Come back stronger than before, guided by clinical expertise.',
    image: '/images/recover.jpg',
    alt: 'Anna treating a client on a physiotherapy table in her clinic',
  },
  {
    slug: 'connect',
    num: '05',
    word: 'CHAT',
    glyph: '🔥',
    kicker: 'ONLINE COACHING',
    tagline: '1-on-1 Dialogue',
    title: ['one on', 'one', 'chat'],
    body: 'Direct access to Anna for personalized guidance, form checks, and accountability. Your coach in your pocket.',
    image: '/images/connect.jpg',
    alt: 'Anna reviewing a training plan on a tablet with a client',
  },
]

export function trackBySlug(slug: string | undefined): Track | undefined {
  return TRACKS.find((t) => t.slug === slug)
}
