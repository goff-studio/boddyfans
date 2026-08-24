import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { FALLBACK_SITE_URL, ROUTES, SITE, absolute, metaForPath } from './src/seo'
import { TRACKS } from './src/data/tracks'

const SITE_URL = process.env.VITE_SITE_URL || FALLBACK_SITE_URL
const HASH_ROUTER = process.env.VITE_HASH_ROUTER === '1'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Structured data. Only facts we actually have — no invented address or phone. */
function jsonLd(): string {
  const business = {
    '@context': 'https://schema.org',
    '@type': 'Physiotherapy',
    '@id': `${SITE_URL}/#practice`,
    name: `${SITE.person} · Atelier`,
    description: metaForPath('/').description,
    url: `${SITE_URL}/`,
    image: absolute(SITE_URL, '/og/default.png'),
    address: {
      '@type': 'PostalAddress',
      addressLocality: SITE.city,
      addressCountry: SITE.country,
    },
    areaServed: { '@type': 'City', name: SITE.city },
    founder: {
      '@type': 'Person',
      name: SITE.person,
      jobTitle: SITE.role,
    },
    makesOffer: TRACKS.map((t) => ({
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Service',
        name: t.title.join(' '),
        serviceType: t.kicker,
        description: t.body,
        url: `${SITE_URL}/${t.slug}`,
      },
    })),
  }
  return `<script type="application/ld+json">${JSON.stringify(business)}</script>`
}

function headFor(path: string): string {
  const m = metaForPath(path)
  const url = absolute(SITE_URL, m.path)
  const image = absolute(SITE_URL, m.image)
  const rows: string[] = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<meta name="keywords" content="${esc(m.tags.join(', '))}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large" />`,
    `<meta name="theme-color" content="#faf7f2" />`,
    `<meta name="author" content="${esc(SITE.person)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE.name)}" />`,
    `<meta property="og:locale" content="en" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(m.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    `<meta name="twitter:image:alt" content="${esc(m.imageAlt)}" />`,
  ]
  // Absolute canonical/og:url are meaningless without a real domain, and a
  // wrong one is worse than none.
  if (SITE_URL !== FALLBACK_SITE_URL) {
    rows.push(`<meta property="og:url" content="${esc(url)}" />`)
    rows.push(`<link rel="canonical" href="${esc(url)}" />`)
  }
  if (path === '/') rows.push(jsonLd())
  return rows.join('\n    ')
}

/**
 * Bakes a real <head> into the HTML for every route.
 *
 * The app also updates the head on navigation, but social scrapers and some
 * crawlers never execute JavaScript — so each route needs to be served HTML
 * that already carries its own title, description and card image. With six
 * routes it is cheaper to emit six files than to add a render server.
 */
function seo(): Plugin {
  const START = '<!--seo:start-->'
  const END = '<!--seo:end-->'

  return {
    name: 'atelier-seo',
    // Must run after vite:build-html, which is what creates the index.html
    // asset this plugin uses as its template.
    enforce: 'post',

    transformIndexHtml(html) {
      if (SITE_URL === FALLBACK_SITE_URL) {
        this.warn(
          'VITE_SITE_URL is not set — canonical and og:url are omitted and the ' +
            'sitemap uses a placeholder. Set it before going live (see .env.example).',
        )
      }
      return html.replace('<!--seo-->', `${START}\n    ${headFor('/')}\n    ${END}`)
    },

    generateBundle(_options, bundle) {
      const today = process.env.BUILD_DATE || ''
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source:
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          ROUTES.map(
            (r) =>
              `  <url><loc>${absolute(SITE_URL, r.path)}</loc>` +
              (today ? `<lastmod>${today}</lastmod>` : '') +
              `<priority>${r.path === '/' ? '1.0' : '0.8'}</priority></url>`,
          ).join('\n') +
          `\n</urlset>\n`,
      })

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
      })

      const index = bundle['index.html']
      if (!index || index.type !== 'asset') {
        this.warn('index.html not found in the bundle — per-route HTML was not emitted')
        return
      }
      const template = String(index.source)
      const block = new RegExp(`${START}[\\s\\S]*?${END}`)
      if (!block.test(template)) {
        this.warn('SEO markers missing from index.html — per-route HTML was not emitted')
        return
      }

      // Hash routing serves every screen from one file, so per-route HTML
      // would never be requested.
      if (!HASH_ROUTER) {
        for (const route of ROUTES) {
          if (route.path === '/') continue
          this.emitFile({
            type: 'asset',
            fileName: `${route.path.slice(1)}/index.html`,
            source: template.replace(block, headFor(route.path)),
          })
        }
      }

      index.source = template.replace(block, headFor('/'))
    },
  }
}

export default defineConfig({
  plugins: [react(), seo()],
  build: HASH_ROUTER
    ? {
        // scripts/build-singlefile.mjs inlines exactly one script tag, so the
        // embedded build must not code-split. Set ONLY here: passing this key
        // as `false` disables splitting outright under rolldown.
        rollupOptions: { output: { inlineDynamicImports: true } },
      }
    : {},
})
