// Font handling for slides.
//
// 1. Office fonts are mapped to metric-compatible open fonts so text wraps
//    at the same places as in PowerPoint when the real font isn't installed
//    (Calibri -> Carlito, Cambria -> Caladea, Arial -> Arimo, ...).
// 2. Any Google-hosted family used on a slide is loaded on demand.

import { FONTS } from '../../constants'

// Office / system font -> open, metric-compatible (or closest) Google font
export const FONT_SUBSTITUTES = {
  calibri: 'Carlito',
  'calibri light': 'Carlito',
  cambria: 'Caladea',
  'cambria math': 'Caladea',
  arial: 'Arimo',
  helvetica: 'Arimo',
  'helvetica neue': 'Arimo',
  'arial narrow': 'Archivo Narrow',
  'arial black': 'Archivo Black',
  'times new roman': 'Tinos',
  times: 'Tinos',
  'courier new': 'Cousine',
  courier: 'Cousine',
  georgia: 'Gelasio',
  'segoe ui': 'Open Sans',
  'segoe ui light': 'Open Sans',
  'segoe ui semibold': 'Open Sans',
  tahoma: 'PT Sans',
  verdana: 'PT Sans',
  'trebuchet ms': 'Fira Sans',
  'century gothic': 'Questrial',
  'gill sans': 'Lato',
  'gill sans mt': 'Lato',
  garamond: 'EB Garamond',
  'book antiqua': 'Gentium Book Plus',
  'palatino linotype': 'Gentium Book Plus',
  aptos: 'Inter',
  'aptos display': 'Inter',
  'franklin gothic': 'Libre Franklin',
  'franklin gothic medium': 'Libre Franklin',
  consolas: 'Inconsolata',
  'comic sans ms': 'Comic Neue',
  impact: 'Anton',
  'bahnschrift': 'Barlow',
  // fonts used by Microsoft's own templates (not installed on most machines)
  bembo: 'Cardo',
  'gill sans nova': 'Lato',
  'avenir next lt pro': 'Nunito Sans',
  'neue haas grotesk text pro': 'Inter',
  rockwell: 'Arvo',
  'tw cen mt': 'Questrial',
}

const GOOGLE_EXTRA = [
  'Carlito', 'Caladea', 'Arimo', 'Tinos', 'Cousine', 'Gelasio', 'Archivo Narrow', 'Archivo Black',
  'Fira Sans', 'Questrial', 'EB Garamond', 'Gentium Book Plus', 'Libre Franklin', 'Comic Neue',
  'Barlow', 'Inter', 'Cardo', 'Lato', 'Nunito Sans', 'Arvo',
]

const GOOGLE_FAMILIES = new Set([...FONTS, ...GOOGLE_EXTRA].map((f) => f.toLowerCase()))

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'])

const clean = (name) => `${name || ''}`.replace(/&quot;/g, '').trim().replace(/^['"]+|['"]+$/g, '').trim()

/** Parse a CSS font-family list into clean names */
export const splitFamilies = (value) =>
  `${value || ''}`.split(',').map(clean).filter(Boolean)

/**
 * Build a CSS font-family stack for a font name, inserting the metric
 * compatible substitute right after the requested font.
 */
export const fontStack = (value, fallback = 'sans-serif') => {
  const families = splitFamilies(value)
  if (families.length === 0) return `Inter, ${fallback}`
  const out = []
  for (const fam of families) {
    if (!out.includes(fam)) out.push(fam)
    const sub = FONT_SUBSTITUTES[fam.toLowerCase()]
    if (sub && !out.includes(sub)) out.push(sub)
  }
  if (!out.some((f) => GENERIC.has(f.toLowerCase()))) out.push(fallback)
  return out.map((f) => (GENERIC.has(f.toLowerCase()) ? f : `"${f}"`)).join(', ')
}

const requested = new Set(['inter'])
let pending = new Set()
let flushTimer = null

const flush = () => {
  flushTimer = null
  const families = [...pending]
  pending = new Set()
  if (families.length === 0 || typeof document === 'undefined') return
  const query = families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:ital,wght@0,400;0,700;1,400;1,700`)
    .join('&')
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.crossOrigin = 'anonymous'
  link.href = `https://fonts.googleapis.com/css2?${query}&display=swap`
  link.dataset.slideFonts = families.join('|')
  // If a family doesn't offer every weight/style, retry with defaults only
  link.onerror = () => {
    families.forEach((f) => {
      const l = document.createElement('link')
      l.rel = 'stylesheet'
      l.crossOrigin = 'anonymous'
      l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}&display=swap`
      document.head.appendChild(l)
    })
  }
  document.head.appendChild(link)
}

/** Make sure the Google font(s) behind a font-family value are loaded */
export const ensureFontLoaded = (value) => {
  for (const fam of splitFamilies(value)) {
    const candidates = [fam, FONT_SUBSTITUTES[fam.toLowerCase()]].filter(Boolean)
    for (const c of candidates) {
      const key = c.toLowerCase()
      if (requested.has(key) || GENERIC.has(key) || !GOOGLE_FAMILIES.has(key)) continue
      requested.add(key)
      pending.add(c)
    }
  }
  if (pending.size && !flushTimer) flushTimer = setTimeout(flush, 0)
}

const FONT_FAMILY_RE = /font-family\s*:\s*([^;]+)/gi

/** Load every font referenced by an element (box font + inline HTML fonts) */
export const ensureElementFonts = (el) => {
  if (!el) return
  if (el.fontFamily) ensureFontLoaded(el.fontFamily)
  if (el.captionFontFamily) ensureFontLoaded(el.captionFontFamily)
  const scan = (html) => {
    if (typeof html !== 'string' || !html.includes('font-family')) return
    let m
    FONT_FAMILY_RE.lastIndex = 0
    while ((m = FONT_FAMILY_RE.exec(html))) ensureFontLoaded(m[1].replace(/&quot;/g, '').split('"')[0])
  }
  scan(el.content)
  if (Array.isArray(el.cells)) el.cells.forEach((row) => row?.forEach((cell) => scan(cell?.html)))
}

/** Wait until the fonts currently requested have finished loading */
export const waitForFonts = async (timeoutMs = 4000) => {
  if (typeof document === 'undefined' || !document.fonts) return
  if (flushTimer) { clearTimeout(flushTimer); flush() }
  await Promise.race([
    document.fonts.ready,
    new Promise((r) => setTimeout(r, timeoutMs)),
  ])
}
