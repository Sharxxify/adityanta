// HTML helpers for rich slide text.
//
// Slide text is stored as HTML (what the contentEditable editor produces and
// what the PPTX importer emits). Everything is sanitized before it touches the
// DOM, because slides also arrive from share links and imported files.

import DOMPurify from 'dompurify'

const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['p', 'div', 'span', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup',
    'font', 'ul', 'ol', 'li', 'a', 'small', 'big', 'mark', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3',
    'h4', 'h5', 'h6', 'hr'],
  ALLOWED_ATTR: ['style', 'href', 'target', 'rel', 'color', 'face', 'size', 'class', 'dir', 'data-list', 'data-bullet', 'contenteditable'],
  ALLOW_DATA_ATTR: false,
}

const cache = new Map()
const CACHE_LIMIT = 800

export const sanitizeHtml = (html) => {
  if (html == null) return ''
  const input = String(html)
  if (!input) return ''
  // Fast path: plain text without markup
  if (!/[<&]/.test(input)) return input
  const hit = cache.get(input)
  if (hit !== undefined) return hit
  const out = DOMPurify.sanitize(input, PURIFY_CONFIG)
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value)
  cache.set(input, out)
  return out
}

const escapeHtml = (text) => String(text ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

/** Convert legacy imported "runs" into HTML (one-time migration on load). */
export const runsToHtml = (runs) => {
  if (!Array.isArray(runs) || runs.length === 0) return ''
  const paragraphs = [[]]
  runs.forEach((run) => {
    if (run.text === '\n') paragraphs.push([])
    else paragraphs[paragraphs.length - 1].push(run)
  })
  return paragraphs.map((para) => {
    const first = para[0] || {}
    const pStyle = []
    if (first.textAlign) pStyle.push(`text-align:${first.textAlign}`)
    if (first.lineHeight) pStyle.push(`line-height:${first.lineHeight}`)
    if (first.marginTop) pStyle.push(`margin-top:${first.marginTop}px`)
    if (first.marginBottom) pStyle.push(`margin-bottom:${first.marginBottom}px`)
    const inner = para.map((run) => {
      const s = []
      if (run.fontSize) s.push(`font-size:${run.fontSize}px`)
      if (run.fontWeight) s.push(`font-weight:${run.fontWeight === 'bold' ? 700 : run.fontWeight}`)
      if (run.fontStyle && run.fontStyle !== 'normal') s.push(`font-style:${run.fontStyle}`)
      if (run.textDecoration && run.textDecoration !== 'none') s.push(`text-decoration:${run.textDecoration}`)
      if (run.fontFamily) s.push(`font-family:${String(run.fontFamily).replace(/"/g, "'")}`)
      if (run.color) s.push(`color:${run.color}`)
      const text = escapeHtml(run.text).replace(/\n/g, '<br>')
      return s.length ? `<span style="${s.join(';')}">${text}</span>` : text
    }).join('')
    return `<p${pStyle.length ? ` style="${pStyle.join(';')}"` : ''}>${inner || '<br>'}</p>`
  }).join('')
}

/** Visible text of an HTML fragment (for titles, search, empty checks) */
export const htmlToText = (html) => {
  if (!html) return ''
  const s = String(html)
  if (!/[<&]/.test(s)) return s
  if (typeof document === 'undefined') return s.replace(/<[^>]+>/g, '')
  const div = document.createElement('div')
  div.innerHTML = sanitizeHtml(s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n'))
  return div.textContent || ''
}

export const isHtmlBlank = (html) => htmlToText(html).replace(/​/g, '').trim() === ''

// Formatting applied to a whole text box (PowerPoint: select the box, press
// Bold) must win over formatting stored on individual runs. These helpers
// strip the matching inline formatting so the box-level value shows through.
const INLINE_FORMAT = {
  fontWeight: { css: ['font-weight'], tags: ['B', 'STRONG'] },
  fontStyle: { css: ['font-style'], tags: ['I', 'EM'] },
  textDecoration: { css: ['text-decoration', 'text-decoration-line'], tags: ['U'] },
  color: { css: ['color'], attrs: ['color'] },
  fontFamily: { css: ['font-family'], attrs: ['face'] },
  fontSize: { css: ['font-size'], attrs: ['size'] },
}

/**
 * Remove inline formatting for the given properties
 * (keys of INLINE_FORMAT: fontWeight, fontStyle, textDecoration, color,
 * fontFamily, fontSize) from rich-text HTML.
 */
export const clearInlineFormatting = (html, keys) => {
  if (!html || typeof document === 'undefined' || !/[<]/.test(html)) return html
  const specs = keys.map((k) => INLINE_FORMAT[k]).filter(Boolean)
  if (!specs.length) return html
  const tpl = document.createElement('template')
  tpl.innerHTML = sanitizeHtml(html)
  const css = specs.flatMap((s) => s.css || [])
  const tags = new Set(specs.flatMap((s) => s.tags || []))
  const attrs = specs.flatMap((s) => s.attrs || [])
  const all = [...tpl.content.querySelectorAll('*')]
  for (const el of all) {
    // bullet glyphs keep their symbol font
    const isBullet = !!el.getAttribute?.('data-bullet')
    css.forEach((p) => { if (!(isBullet && p === 'font-family')) el.style?.removeProperty(p) })
    if (el.getAttribute('style') === '') el.removeAttribute('style')
    if (el.tagName === 'FONT') attrs.forEach((a) => el.removeAttribute(a))
  }
  for (const el of all) {
    if (tags.has(el.tagName) && el.parentNode) {
      while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el)
      el.remove()
    }
  }
  return tpl.innerHTML
}
