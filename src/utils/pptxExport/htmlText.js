// Rich slide text (sanitized HTML) -> DrawingML paragraphs.
//
// The HTML is laid into an off-screen box styled exactly like the slide's
// text frame, so every run is read from the browser's *computed* style:
// inheritance (box -> paragraph -> span), <b>/<i>/<u>, <font>, headings and
// lists resolve the same way they do on the canvas.

import { sanitizeHtml } from '../../components/Slide/html'
import { splitFamilies } from '../../components/Slide/fonts'
import { esc, emu, pt100, parseColor, srgb } from './xml'

const UNITLESS = new Set(['lineHeight', 'fontWeight', 'opacity', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'order'])
const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'HR', 'TABLE', 'TR', 'TD', 'TH'])
const GENERIC_FONTS = { 'sans-serif': 'Arial', serif: 'Times New Roman', monospace: 'Courier New', 'system-ui': 'Arial', cursive: 'Comic Sans MS', fantasy: 'Impact' }

// PowerPoint's single line spacing is ~1.2 x font size (see the importer)
const SINGLE_LINE = 1.2

/** Apply a React-style object to a DOM node */
export const applyStyle = (node, style) => {
  for (const [k, v] of Object.entries(style || {})) {
    if (v == null || v === '') continue
    node.style[k] = typeof v === 'number' && !UNITLESS.has(k) ? `${v}px` : String(v)
  }
}

let host = null
const getHost = () => {
  if (host && host.isConnected) return host
  host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, { position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', pointerEvents: 'none' })
  document.body.appendChild(host)
  return host
}

export const releaseTextHost = () => {
  host?.remove()
  host = null
}

const primaryFont = (cssFamily) => {
  const fam = splitFamilies(cssFamily)[0] || 'Arial'
  return GENERIC_FONTS[fam.toLowerCase()] || fam
}

const hasBlockChild = (node) => [...(node.parentNode?.childNodes || [])].some((n) => n.nodeType === 1 && BLOCK_TAGS.has(n.tagName))

const decorationsUpTo = (node, root) => {
  let underline = false
  let strike = false
  for (let el = node; el && el !== root.parentNode; el = el.parentElement) {
    const line = getComputedStyle(el).textDecorationLine || ''
    if (line.includes('underline')) underline = true
    if (line.includes('line-through')) strike = true
  }
  return { underline, strike }
}

const baselineUpTo = (node, block) => {
  // <sup>/<sub> are positioned relatively by the CSS reset, so check the tags too
  for (let el = node; el && el !== block; el = el.parentElement) {
    const va = getComputedStyle(el).verticalAlign
    if (va === 'super' || el.tagName === 'SUP') return 30000
    if (va === 'sub' || el.tagName === 'SUB') return -25000
  }
  return 0
}

/** Specified line-height of a block (inline styles win, then the frame default) */
const specifiedLineHeight = (block, root, frameLineHeight) => {
  for (let el = block; el && el !== root.parentNode; el = el.parentElement) {
    const v = el.style?.lineHeight
    if (v) return v
  }
  return frameLineHeight
}

const lineSpacing = (value, fontPx) => {
  if (value == null || value === '' || value === 'normal') return { pct: 100000 }
  const s = String(value).trim()
  if (/^-?[\d.]+$/.test(s)) return { pct: Math.round((parseFloat(s) / SINGLE_LINE) * 100000) }
  if (/%$/.test(s)) return { pct: Math.round((parseFloat(s) / 100 / SINGLE_LINE) * 100000) }
  if (/em$/.test(s)) return { pct: Math.round((parseFloat(s) / SINGLE_LINE) * 100000) }
  if (/px$/.test(s)) return { pts: pt100(parseFloat(s)) }
  if (/pt$/.test(s)) return { pts: Math.round(parseFloat(s) * 100) }
  const px = parseFloat(s)
  return Number.isFinite(px) && fontPx ? { pct: Math.round((px / fontPx / SINGLE_LINE) * 100000) } : { pct: 100000 }
}

const ALIGN = { left: 'l', start: 'l', center: 'ctr', right: 'r', end: 'r', justify: 'just' }

const AUTONUM = [
  [/^\d+\.$/, 'arabicPeriod'], [/^\d+\)$/, 'arabicParenR'], [/^\(\d+\)$/, 'arabicParenBoth'],
  [/^[ivxlcdm]+\.$/, 'romanLcPeriod'], [/^[IVXLCDM]+\.$/, 'romanUcPeriod'],
  [/^[ivxlcdm]+\)$/, 'romanLcParenR'], [/^[IVXLCDM]+\)$/, 'romanUcParenR'],
  [/^[a-z]\.$/, 'alphaLcPeriod'], [/^[A-Z]\.$/, 'alphaUcPeriod'],
  [/^[a-z]\)$/, 'alphaLcParenR'], [/^[A-Z]\)$/, 'alphaUcParenR'],
  [/^\([a-z]\)$/, 'alphaLcParenBoth'], [/^\([A-Z]\)$/, 'alphaUcParenBoth'],
]

const fromRoman = (s) => {
  const v = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 }
  let n = 0
  const t = s.toLowerCase()
  for (let i = 0; i < t.length; i++) {
    const a = v[t[i]] || 0
    const b = v[t[i + 1]] || 0
    n += a < b ? -a : a
  }
  return n
}

/** Imported bullet glyph ("1.", "iv)", "•") -> bullet model */
const bulletFromGlyph = (glyph) => {
  const g = glyph.trim()
  for (const [re, scheme] of AUTONUM) {
    if (!re.test(g)) continue
    const core = g.replace(/[().]/g, '')
    let n = 1
    if (/^arabic/.test(scheme)) n = parseInt(core, 10)
    else if (/^roman/.test(scheme)) n = fromRoman(core)
    else n = core.toLowerCase().charCodeAt(0) - 96
    return { autoNum: scheme, n: Math.max(1, n || 1) }
  }
  return { char: g || '•' }
}

const LEGACY_BULLETS = {
  bullet: { char: '•' },
  'bullet-hollow': { char: '○' },
  'bullet-square': { char: '■' },
  'bullet-dash': { char: '–' },
  'bullet-arrow': { char: '➔' },
  'bullet-check': { char: '✓' },
  'bullet-star': { char: '★' },
  numbered: { autoNum: 'arabicPeriod' },
  'numbered-paren': { autoNum: 'arabicParenR' },
  alpha: { autoNum: 'alphaUcPeriod' },
  'alpha-lower': { autoNum: 'alphaLcPeriod' },
  roman: { autoNum: 'romanUcPeriod' },
}

const LIST_STYLE = {
  disc: { char: '•' }, circle: { char: '○' }, square: { char: '▪' },
  decimal: { autoNum: 'arabicPeriod' }, 'lower-alpha': { autoNum: 'alphaLcPeriod' }, 'lower-latin': { autoNum: 'alphaLcPeriod' },
  'upper-alpha': { autoNum: 'alphaUcPeriod' }, 'upper-latin': { autoNum: 'alphaUcPeriod' },
  'lower-roman': { autoNum: 'romanLcPeriod' }, 'upper-roman': { autoNum: 'romanUcPeriod' },
}

const runStyle = (textNode, root, block) => {
  const el = textNode.parentElement
  const cs = getComputedStyle(el)
  const sizePx = parseFloat(cs.fontSize) || 16
  let color = parseColor(cs.color)
  // gradient text (background-clip: text): use the first stop
  if (!color && /gradient/i.test(cs.backgroundImage)) {
    const m = /(#[0-9a-f]{3,8}|rgba?\([^)]*\))/i.exec(cs.backgroundImage)
    color = m ? parseColor(m[1]) : null
  }
  const { underline, strike } = decorationsUpTo(el, root)
  const baseline = baselineUpTo(el, block)
  const bg = el !== block && el !== root ? parseColor(cs.backgroundColor) : null
  const ls = parseFloat(cs.letterSpacing)
  const link = el.closest('a[href]')
  const href = link && root.contains(link) ? link.getAttribute('href') : null
  return {
    sizePx,
    // PowerPoint draws super/subscript at ~2/3 of the run size itself
    szPx: baseline ? sizePx / 0.667 : sizePx,
    bold: (parseInt(cs.fontWeight, 10) || 400) >= 600,
    italic: cs.fontStyle === 'italic' || cs.fontStyle === 'oblique',
    underline,
    strike,
    color,
    font: primaryFont(cs.fontFamily),
    baseline,
    spacing: Number.isFinite(ls) ? ls : 0,
    caps: cs.textTransform === 'uppercase' ? 'all' : (cs.fontVariantCaps === 'small-caps' || cs.fontVariant === 'small-caps') ? 'small' : null,
    highlight: bg,
    link: href && /^(https?:|mailto:)/i.test(href) ? href : null,
  }
}

/**
 * Parse rich text into paragraphs.
 * @param {HTMLElement} root  element containing the text (already mounted)
 * @param {object} ctx { lineHeight (frame default), listType }
 */
const collectParagraphs = (root, { lineHeight }) => {
  const paragraphs = []
  const blocks = [root]
  let cur = null

  const newPara = (block) => {
    const cs = getComputedStyle(block)
    const fontPx = parseFloat(cs.fontSize) || 16
    const rootLeft = root.getBoundingClientRect().left + (parseFloat(getComputedStyle(root).paddingLeft) || 0)
    let marL = (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.paddingLeft) || 0)
    let indent = parseFloat(cs.textIndent) || 0
    let bullet = null
    let lvl = 0
    if (block.tagName === 'LI') {
      const list = block.parentElement
      const listCs = getComputedStyle(list)
      marL = Math.max(0, block.getBoundingClientRect().left - rootLeft)
      indent = -Math.min(marL, fontPx * 1.1)
      for (let p = list.parentElement; p && p !== root; p = p.parentElement) if (p.tagName === 'UL' || p.tagName === 'OL') lvl++
      const style = LIST_STYLE[listCs.listStyleType] || (list.tagName === 'OL' ? LIST_STYLE.decimal : LIST_STYLE.disc)
      if (listCs.listStyleType !== 'none') {
        bullet = { ...style }
        if (style.autoNum) {
          const idx = [...list.children].filter((c) => c.tagName === 'LI').indexOf(block)
          bullet.n = (parseInt(list.getAttribute('start'), 10) || 1) + Math.max(0, idx)
        }
      }
    } else if (block !== root) {
      // nested blocks inside the root: offset from the root's content box
      const left = block.getBoundingClientRect().left - rootLeft + (parseFloat(cs.paddingLeft) || 0)
      marL = left > 0.5 ? left : 0
    }
    return {
      block,
      align: ALIGN[cs.textAlign] || 'l',
      lnSpc: lineSpacing(specifiedLineHeight(block, root, lineHeight), fontPx),
      spcBef: parseFloat(cs.marginTop) || 0,
      spcAft: parseFloat(cs.marginBottom) || 0,
      marL: Math.max(0, marL),
      indent,
      lvl,
      bullet,
      fontPx,
      runs: [],
      empty: false,
    }
  }

  const ensure = () => {
    if (!cur) cur = newPara(blocks[blocks.length - 1])
    return cur
  }
  const close = () => {
    if (cur && (cur.runs.length || cur.empty)) paragraphs.push(cur)
    cur = null
  }
  const hasContentAfter = (node, block) => {
    for (let n = node; n && n !== block; n = n.parentNode) {
      for (let s = n.nextSibling; s; s = s.nextSibling) {
        if (s.nodeType === 3 && s.data.replace(/​/g, '').length) return true
        if (s.nodeType === 1 && (s.tagName === 'BR' || (s.textContent || '').replace(/​/g, '').length || s.querySelector?.('br'))) return true
      }
    }
    return false
  }

  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        let text = child.data.replace(/​/g, '')
        if (!text) continue
        if (!text.trim() && hasBlockChild(child)) continue // formatting whitespace between blocks
        const para = ensure()
        const style = runStyle(child, root, para.block)
        text.split('\n').forEach((part, i) => {
          if (i > 0) para.runs.push({ br: true, style })
          if (part) para.runs.push({ text: part, style })
        })
        continue
      }
      if (child.nodeType !== 1) continue
      const tag = child.tagName
      if (tag === 'BR') {
        const para = ensure()
        if (hasContentAfter(child, para.block)) para.runs.push({ br: true, style: runStyle({ parentElement: child.parentElement }, root, para.block) })
        else if (!para.runs.length) para.empty = true
        continue
      }
      if (child.getAttribute('data-bullet')) {
        const para = ensure()
        const cs = getComputedStyle(child)
        para.bullet = {
          ...bulletFromGlyph(child.textContent || ''),
          color: parseColor(cs.color),
          font: child.style.fontFamily ? primaryFont(cs.fontFamily) : null,
          sizePx: parseFloat(cs.fontSize) || null,
        }
        continue
      }
      if (BLOCK_TAGS.has(tag)) {
        close()
        if (tag === 'UL' || tag === 'OL' || tag === 'TABLE' || tag === 'TR') { walk(child); close(); continue }
        if (tag === 'HR') continue
        blocks.push(child)
        walk(child)
        close()
        blocks.pop()
        continue
      }
      walk(child)
    }
  }
  walk(root)
  close()
  return paragraphs
}

/**
 * Measure HTML inside a frame-styled box and return paragraphs.
 * @param {string} html
 * @param {object} opts { frameStyle (React style), width, lineHeight, listType, fontPx }
 */
export const htmlToParagraphs = (html, { frameStyle = {}, width = 400, lineHeight = 1.5, listType = 'none' } = {}) => {
  const h = getHost()
  const frame = document.createElement('div')
  applyStyle(frame, { ...frameStyle, position: 'relative', inset: undefined, width, height: 'auto', display: 'block' })
  const root = document.createElement('div')
  root.className = 'slide-text'
  frame.appendChild(root)
  h.appendChild(frame)
  try {
    const content = String(html || '')
    const legacy = LEGACY_BULLETS[listType] && content && !/<(ul|ol|li)\b/i.test(content)
    if (legacy) {
      // same line split as the canvas renderer (TextBody)
      root.innerHTML = content.split(/\n|<br\s*\/?>/i).map((line) => `<div>${sanitizeHtml(line) || '<br>'}</div>`).join('')
    } else {
      root.innerHTML = sanitizeHtml(content)
    }
    const paragraphs = collectParagraphs(root, { lineHeight })
    if (legacy) {
      const fontPx = parseFloat(getComputedStyle(root).fontSize) || 16
      let n = 0
      paragraphs.forEach((p) => {
        const blank = !p.runs.some((r) => r.text && r.text.trim())
        if (blank) return
        n += 1
        p.bullet = { ...LEGACY_BULLETS[listType], n }
        p.marL += fontPx * 1.6
        p.indent = -fontPx * 1.6
      })
    }
    return paragraphs
  } finally {
    frame.remove()
  }
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

const rPrXml = (s, { opacity = 1, links, tag = 'a:rPr' } = {}) => {
  const attrs = [
    'lang="en-US"',
    `sz="${Math.max(100, Math.min(400000, pt100(s.szPx ?? s.sizePx)))}"`,
    s.bold ? 'b="1"' : 'b="0"',
    s.italic ? 'i="1"' : 'i="0"',
    s.underline ? 'u="sng"' : '',
    s.strike ? 'strike="sngStrike"' : '',
    s.baseline ? `baseline="${s.baseline}"` : '',
    s.spacing ? `spc="${pt100(s.spacing)}"` : '',
    s.caps ? `cap="${s.caps}"` : '',
    'dirty="0"',
  ].filter(Boolean).join(' ')
  const fill = s.color ? `<a:solidFill>${srgb(s.color, opacity)}</a:solidFill>` : ''
  const hl = s.highlight ? `<a:highlight>${srgb({ ...s.highlight, alpha: 1 })}</a:highlight>` : ''
  const font = s.font ? `<a:latin typeface="${esc(s.font)}"/><a:ea typeface="${esc(s.font)}"/><a:cs typeface="${esc(s.font)}"/>` : ''
  let link = ''
  if (s.link && links) link = `<a:hlinkClick r:id="${links(s.link)}"/>`
  const inner = `${fill}${hl}${font}${link}`
  return inner ? `<${tag} ${attrs}>${inner}</${tag}>` : `<${tag} ${attrs}/>`
}

/** Paragraph list -> <a:p> XML */
export const paragraphsXml = (paragraphs, { opacity = 1, links } = {}) => {
  let prev = null
  const out = paragraphs.map((p) => {
    const b = p.bullet
    const firstRun = p.runs.find((r) => !r.br)
    const attrs = [
      p.marL ? `marL="${emu(p.marL)}"` : '',
      p.lvl ? `lvl="${Math.min(8, p.lvl)}"` : '',
      p.indent ? `indent="${emu(p.indent)}"` : '',
      `algn="${p.align}"`,
    ].filter(Boolean).join(' ')
    const ln = p.lnSpc?.pts ? `<a:lnSpc><a:spcPts val="${p.lnSpc.pts}"/></a:lnSpc>` : `<a:lnSpc><a:spcPct val="${p.lnSpc?.pct ?? 100000}"/></a:lnSpc>`
    const bef = `<a:spcBef><a:spcPts val="${pt100(p.spcBef)}"/></a:spcBef>`
    const aft = `<a:spcAft><a:spcPts val="${pt100(p.spcAft)}"/></a:spcAft>`
    let bu = '<a:buNone/>'
    if (b && !p.empty) {
      const clr = b.color ? `<a:buClr>${srgb(b.color, opacity)}</a:buClr>` : ''
      const refPx = firstRun?.style?.sizePx || p.fontPx
      const sz = b.sizePx && refPx ? `<a:buSzPct val="${Math.max(25000, Math.min(400000, Math.round((b.sizePx / refPx) * 100000)))}"/>` : ''
      if (b.autoNum) {
        const continues = prev?.bullet?.autoNum === b.autoNum && (prev.lvl || 0) === (p.lvl || 0) && prev.bullet.n === (b.n || 1) - 1
        const startAt = continues ? '' : ` startAt="${b.n || 1}"`
        bu = `${clr}${sz}<a:buFont typeface="+mj-lt"/><a:buAutoNum type="${b.autoNum}"${startAt}/>`
      } else {
        const font = b.font || 'Arial'
        bu = `${clr}${sz}<a:buFont typeface="${esc(font)}"/><a:buChar char="${esc(b.char || '•')}"/>`
      }
    }
    const pPr = `<a:pPr ${attrs}>${ln}${bef}${aft}${bu}</a:pPr>`
    const runs = p.runs.map((r) => (r.br
      ? `<a:br>${rPrXml(r.style, { opacity })}</a:br>`
      : `<a:r>${rPrXml(r.style, { opacity, links })}<a:t>${esc(r.text)}</a:t></a:r>`)).join('')
    const last = [...p.runs].reverse().find((r) => r.style)?.style
    const end = rPrXml(last || { sizePx: p.fontPx }, { opacity, tag: 'a:endParaRPr' })
    // numbering restarts explicitly after anything that is not a numbered item
    prev = b && !p.empty ? p : null
    return `<a:p>${pPr}${runs}${end}</a:p>`
  })
  return out.length ? out.join('') : '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>'
}

/**
 * <p:txBody> / <a:txBody>
 * @param {object} o { paragraphs, insets {top,right,bottom,left} px, anchor, wrap, vert, tag, opacity, links }
 */
export const txBodyXml = ({ paragraphs, insets = {}, anchor = 't', wrap = true, vert, tag = 'p:txBody', opacity = 1, links, bodyPr = true }) => {
  const body = bodyPr
    ? `<a:bodyPr wrap="${wrap ? 'square' : 'none'}" lIns="${emu(insets.left)}" tIns="${emu(insets.top)}" rIns="${emu(insets.right)}" bIns="${emu(insets.bottom)}" rtlCol="0" anchor="${anchor}"${vert ? ` vert="${vert}"` : ''}><a:noAutofit/></a:bodyPr>`
    : '<a:bodyPr/>'
  return `<${tag}>${body}<a:lstStyle/>${paragraphsXml(paragraphs, { opacity, links })}</${tag}>`
}
