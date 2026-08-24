import { TRACKS } from './data/tracks'

/**
 * Route metadata, shared by the app (which updates the document on
 * navigation) and by the build (which bakes a real <head> into one HTML file
 * per route). Kept free of React and of `import.meta` so that vite.config can
 * import it too — the site URL is passed in rather than read from env here.
 */

export const SITE = {
  name: 'AN · Atelier',
  person: 'Anna Nefedova',
  role: 'Physiotherapist · Coach · Trainer',
  city: 'Bologna',
  country: 'IT',
  locale: 'en',
} as const

/** RFC 2606 reserved TLD: can never resolve, so a missing env var is obvious. */
export const FALLBACK_SITE_URL = 'https://example.invalid'

export type RouteMeta = {
  path: string
  title: string
  description: string
  /** Relative to the site root; made absolute when rendered. */
  image: string
  imageAlt: string
  tags: string[]
}

const HUB: RouteMeta = {
  path: '/',
  title: 'Anna Nefedova · Physiotherapy & Training Atelier, Bologna',
  description:
    'Clinical physiotherapy and deliberate strength training in Bologna. Injury prevention, body sculpting, athletic aging, rehabilitation and 1-on-1 coaching.',
  image: '/og/default.png',
  imageAlt:
    'Anna Nefedova training with a stability ball, beside the words physiotherapeutic training atelier',
  tags: [
    'physiotherapist Bologna',
    'fisioterapista Bologna',
    'personal trainer Bologna',
    'injury prevention',
    'rehabilitation',
    'strength training',
    'athletic aging',
    'online coaching',
  ],
}

/** Per-track tags, beyond the shared set. */
const TRACK_TAGS: Record<string, string[]> = {
  train: ['injury prevention', 'joint health', 'movement quality', 'safe training'],
  build: ['body sculpting', 'custom training plan', 'hypertrophy', 'strength programming'],
  perform: ['athletic aging', 'mobility', 'longevity training', 'masters athlete'],
  recover: ['physiotherapy', 'rehabilitation', 'return to sport', 'injury recovery'],
  connect: ['online coaching', 'remote physiotherapy', 'form check', 'accountability'],
}

const BASE_TAGS = ['Anna Nefedova', 'physiotherapy Bologna', 'training atelier']

/** Sentence-cased headline, for use in a title tag. */
function headline(lines: string[]): string {
  const s = lines.join(' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const ROUTES: RouteMeta[] = [
  HUB,
  ...TRACKS.map((t) => ({
    path: `/${t.slug}`,
    title: `${headline(t.title)} · ${SITE.person}, ${SITE.city}`,
    // The page's own body copy is the honest description — no SEO filler.
    description: t.body,
    image: `/og/${t.slug}.png`,
    imageAlt: t.alt,
    tags: [...BASE_TAGS, ...(TRACK_TAGS[t.slug] ?? [])],
  })),
]

export function metaForPath(pathname: string): RouteMeta {
  return ROUTES.find((r) => r.path === pathname) ?? HUB
}

export function absolute(siteUrl: string, path: string): string {
  return `${siteUrl.replace(/\/$/, '')}${path}`
}
