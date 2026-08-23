/**
 * Packages the built app into one self-contained HTML fragment.
 *
 * The Artifact host applies a strict CSP (no external hosts at all) and wraps
 * the file in its own <!doctype>/<head>/<body>, so the output here is page
 * content only, with every stylesheet, script, font and photograph inlined.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join, extname } from 'node:path'

const DIST = 'dist'
const PHOTOS = '.artifact-assets'
const OUT = 'dist-artifact/atelier.html'
/** Complete document, for sending to someone directly — no host involved. */
const OUT_STANDALONE = 'dist-artifact/atelier-standalone.html'
const TITLE = 'Nefedova Atelier'

/** Only Latin faces are inlined; other subsets would triple the page weight. */
const KEEP_FONT = /-latin-wght-(normal|italic)-/

const b64 = async (p) => (await readFile(p)).toString('base64')

async function main() {
  const html = await readFile(join(DIST, 'index.html'), 'utf8')

  const cssName = html.match(/href="[^"]*?\/([^/"]+\.css)"/)?.[1]
  const jsName = html.match(/src="[^"]*?\/([^/"]+\.js)"/)?.[1]
  if (!cssName || !jsName) throw new Error('could not find built css/js in dist/index.html')

  let css = await readFile(join(DIST, 'assets', cssName), 'utf8')
  let js = await readFile(join(DIST, 'assets', jsName), 'utf8')

  // --- fonts: inline the Latin faces, drop every other subset -------------
  const fontFiles = (await readdir(join(DIST, 'assets'))).filter((f) => extname(f) === '.woff2')
  let kept = 0
  const blocks = css.match(/@font-face\{[^}]*\}/g) ?? []
  for (const block of blocks) {
    const url = block.match(/url\([^)]*?\/([^/)]+\.woff2)\)/)?.[1]
    if (url && KEEP_FONT.test(url) && fontFiles.includes(url)) {
      const data = `data:font/woff2;base64,${await b64(join(DIST, 'assets', url))}`
      css = css.replace(block, block.replace(/url\([^)]+\)/, `url(${data})`))
      kept++
    } else {
      css = css.replace(block, '')
    }
  }

  // --- photographs: swap the public/ paths for recompressed data URIs -----
  let photos = 0
  for (const f of await readdir(PHOTOS)) {
    const data = `data:image/jpeg;base64,${await b64(join(PHOTOS, f))}`
    const ref = `/images/${f}`
    if (js.includes(ref)) {
      js = js.split(ref).join(data)
      photos++
    }
  }

  // An inline module script must not contain a literal closing script tag.
  js = js.replace(/<\/script/gi, '<\\/script')

  const out = [
    `<title>${TITLE}</title>`,
    `<style>${css}</style>`,
    `<div id="root"></div>`,
    `<script type="module">${js}</script>`,
    '',
  ].join('\n')

  await writeFile(OUT, out)

  // The artifact host supplies its own document shell; a file opened straight
  // from disk needs the whole document, so emit that separately.
  const standalone = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${TITLE}</title>`,
    `<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;height:100%}</style>`,
    `<style>${css}</style>`,
    '</head>',
    '<body>',
    '<div id="root"></div>',
    `<script type="module">${js}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')
  await writeFile(OUT_STANDALONE, standalone)
  const kb = (n) => `${(n / 1024).toFixed(0)}KB`
  console.log(`fonts inlined : ${kept} of ${blocks.length} @font-face blocks`)
  console.log(`photos inlined: ${photos}`)
  console.log(`css / js      : ${kb(css.length)} / ${kb(js.length)}`)
  console.log(`output        : ${OUT}  ${kb(out.length)}`)
  console.log(`standalone    : ${OUT_STANDALONE}  ${kb(standalone.length)}`)
  if (out.length > 16 * 1024 * 1024) throw new Error('over the 16MB artifact limit')
}

main()
