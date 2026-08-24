import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { FALLBACK_SITE_URL, absolute, metaForPath } from './seo'

const SITE_URL = import.meta.env.VITE_SITE_URL || FALLBACK_SITE_URL

/**
 * The single-file preview build runs embedded in a host that supplies its own
 * page title and is never crawled, so rewriting the head there would only
 * fight the host for the browser tab.
 */
const EMBEDDED = import.meta.env.VITE_EMBEDDED === '1'

function tag(selector: string, create: () => HTMLElement): HTMLElement {
  let el = document.head.querySelector<HTMLElement>(selector)
  if (!el) {
    el = create()
    document.head.appendChild(el)
  }
  return el
}

function meta(attr: 'name' | 'property', key: string, content: string) {
  const el = tag(`meta[${attr}="${key}"]`, () => {
    const m = document.createElement('meta')
    m.setAttribute(attr, key)
    return m
  })
  el.setAttribute('content', content)
}

/**
 * Keeps the document head in step with the current route.
 *
 * This is for browsers and for crawlers that execute JavaScript. Social
 * scrapers do not run JS, so the per-route cards they read come from the
 * static HTML the build emits for each route — not from here.
 */
export function useSeo() {
  const { pathname } = useLocation()

  useEffect(() => {
    if (EMBEDDED) return

    // The panel is private. These routes are linkable, so without this they
    // would inherit the hub's marketing title and card.
    const isPrivate =
      pathname === '/login' || pathname === '/chat' || pathname.startsWith('/admin')
    if (isPrivate) {
      document.title = 'Atelier access'
      meta('name', 'robots', 'noindex, nofollow')
      meta('name', 'description', '')
      return
    }
    meta('name', 'robots', 'index, follow, max-image-preview:large')

    const m = metaForPath(pathname)
    const url = absolute(SITE_URL, m.path)
    const image = absolute(SITE_URL, m.image)

    document.title = m.title
    meta('name', 'description', m.description)
    meta('name', 'keywords', m.tags.join(', '))

    meta('property', 'og:title', m.title)
    meta('property', 'og:description', m.description)
    meta('property', 'og:url', url)
    meta('property', 'og:image', image)
    meta('property', 'og:image:alt', m.imageAlt)

    meta('name', 'twitter:title', m.title)
    meta('name', 'twitter:description', m.description)
    meta('name', 'twitter:image', image)
    meta('name', 'twitter:image:alt', m.imageAlt)

    const link = tag('link[rel="canonical"]', () => {
      const l = document.createElement('link')
      l.setAttribute('rel', 'canonical')
      return l
    })
    link.setAttribute('href', url)
  }, [pathname])
}
