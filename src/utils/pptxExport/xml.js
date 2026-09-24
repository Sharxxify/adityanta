// Low-level DrawingML helpers for the native PPTX export: units, XML
// escaping, colours, fills, outlines, effects and transforms.
//
// Canvas units are CSS px on a 1280x720 slide. The exported deck is
// 13.333 x 7.5 in (PowerPoint widescreen), so 1 px = 1/96 in = 9525 EMU
// and 1 px of font size = 0.75 pt.

import tinycolor from 'tinycolor2'

export const EMU_PER_PX = 9525
export const emu = (px) => Math.round((Number(px) || 0) * EMU_PER_PX)
export const pt100 = (px) => Math.round((Number(px) || 0) * 75) // 1/100 pt
export const deg60k = (deg) => Math.round((((Number(deg) || 0) % 360) + 360) % 360 * 60000)

// XML 1.0 forbids most control characters
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g

export const esc = (value) => String(value ?? '')
  .replace(INVALID_XML, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/** CSS colour -> { hex: 'RRGGBB', alpha: 0..1 } or null (none/invalid) */
export const parseColor = (value) => {
  if (value == null) return null
  const s = String(value).trim()
  if (!s || s === 'none' || s === 'transparent' || s === 'inherit' || s === 'currentColor') return null
  const c = tinycolor(s)
  if (!c.isValid()) return null
  const alpha = c.getAlpha()
  if (alpha <= 0) return null
  return { hex: c.toHex().toUpperCase(), alpha }
}

/** <a:srgbClr> with optional alpha (alpha multiplied by `opacity`) */
export const srgb = (color, opacity = 1) => {
  const a = Math.max(0, Math.min(1, (color.alpha ?? 1) * opacity))
  return a < 0.999
    ? `<a:srgbClr val="${color.hex}"><a:alpha val="${Math.round(a * 100000)}"/></a:srgbClr>`
    : `<a:srgbClr val="${color.hex}"/>`
}

export const solidFill = (color, opacity = 1) => `<a:solidFill>${srgb(color, opacity)}</a:solidFill>`

// ---------------------------------------------------------------------------
// Fills (element fill objects, CSS strings and CSS gradients)
// ---------------------------------------------------------------------------

const splitTopLevel = (s) => {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

const SIDE_ANGLES = {
  'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270,
  'to top right': 45, 'to right top': 45, 'to bottom right': 135, 'to right bottom': 135,
  'to bottom left': 225, 'to left bottom': 225, 'to top left': 315, 'to left top': 315,
}

/**
 * Parse a CSS linear/radial gradient into the element fill model
 * ({ type: 'linear'|'radial', angle, stops: [{ offset %, color, opacity }] }).
 */
export const parseCssGradient = (css) => {
  const m = /^\s*(repeating-)?(linear|radial)-gradient\((.*)\)\s*$/is.exec(String(css || ''))
  if (!m) return null
  const kind = m[2].toLowerCase()
  const parts = splitTopLevel(m[3])
  let angle = 180
  if (kind === 'linear' && parts.length) {
    const first = parts[0].toLowerCase()
    const deg = /^(-?[\d.]+)(deg|turn|rad)$/.exec(first)
    if (deg) {
      const v = parseFloat(deg[1])
      angle = deg[2] === 'turn' ? v * 360 : deg[2] === 'rad' ? (v * 180) / Math.PI : v
      parts.shift()
    } else if (SIDE_ANGLES[first] !== undefined) {
      angle = SIDE_ANGLES[first]
      parts.shift()
    }
  } else if (kind === 'radial' && parts.length && !parseColor(parts[0].split(/\s+/)[0]) && !/^(rgb|hsl)/i.test(parts[0])) {
    parts.shift() // shape / position
  }
  const stops = []
  parts.forEach((p, i) => {
    const pm = /^(.*?)(?:\s+(-?[\d.]+)%)?(?:\s+(-?[\d.]+)%)?$/.exec(p)
    const color = parseColor(pm?.[1] || p)
    if (!color) return
    const offset = pm?.[2] !== undefined ? parseFloat(pm[2]) : null
    stops.push({ color, offset, index: i })
  })
  if (!stops.length) return null
  // distribute missing positions evenly (CSS behaviour for the simple cases)
  stops.forEach((s, i) => {
    if (s.offset == null) s.offset = stops.length === 1 ? 0 : (i / (stops.length - 1)) * 100
  })
  return {
    type: kind,
    angle,
    stops: stops.map((s) => ({ offset: s.offset, color: `#${s.color.hex}`, opacity: s.color.alpha })),
  }
}

const gradFill = (fill, opacity) => {
  const stops = (fill.stops || [])
    .map((s) => ({ c: parseColor(s.color), pos: Math.max(0, Math.min(100, Number(s.offset) || 0)), op: s.opacity ?? 1 }))
    .filter((s) => s.c)
  if (!stops.length) return '<a:noFill/>'
  const gs = stops.map((s) => `<a:gs pos="${Math.round(s.pos * 1000)}">${srgb(s.c, opacity * s.op)}</a:gs>`).join('')
  if (fill.type === 'radial') {
    return `<a:gradFill rotWithShape="1"><a:gsLst>${gs}</a:gsLst><a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>`
  }
  // CSS: 90deg = left -> right; DrawingML: 0 = left -> right, clockwise
  const ang = deg60k((Number(fill.angle ?? 180) || 0) - 90)
  return `<a:gradFill rotWithShape="1"><a:gsLst>${gs}</a:gsLst><a:lin ang="${ang}" scaled="0"/></a:gradFill>`
}

/** Normalise any fill value (string, CSS gradient, fill object) */
export const normalizeFill = (fill) => {
  if (fill == null || fill === '' || fill === 'none' || fill === 'transparent') return { type: 'none' }
  if (typeof fill === 'string') {
    if (/gradient\(/i.test(fill)) return parseCssGradient(fill) || { type: 'none' }
    return parseColor(fill) ? { type: 'solid', color: fill } : { type: 'none' }
  }
  if (fill.type === 'solid' || fill.type === 'color') return { type: 'solid', color: fill.color || fill.value }
  return fill
}

/** DrawingML fill for a normalised fill; image fills are handled by the caller */
export const fillXml = (fill, opacity = 1) => {
  const f = normalizeFill(fill)
  if (f.type === 'solid') {
    const c = parseColor(f.color)
    return c ? solidFill(c, opacity) : '<a:noFill/>'
  }
  if (f.type === 'linear' || f.type === 'radial') return gradFill(f, opacity)
  return '<a:noFill/>'
}

// ---------------------------------------------------------------------------
// Outlines
// ---------------------------------------------------------------------------

const PRST_DASH = {
  dashed: 'dash', dash: 'dash', dotted: 'sysDot', dot: 'sysDot', lgDash: 'lgDash', dashDot: 'dashDot',
  lgDashDot: 'lgDashDot', sysDash: 'sysDash', sysDot: 'sysDot', lgDashDotDot: 'lgDashDotDot', sysDashDot: 'sysDashDot',
}
const END_TYPES = new Set(['triangle', 'stealth', 'diamond', 'oval', 'arrow'])
const END_SIZE = new Set(['sm', 'med', 'lg'])

const lineEnd = (tag, end) => {
  if (!end || !END_TYPES.has(end.type)) return ''
  const w = END_SIZE.has(end.width) ? end.width : 'med'
  const len = END_SIZE.has(end.length) ? end.length : 'med'
  return `<a:${tag} type="${end.type}" w="${w}" len="${len}"/>`
}

/**
 * <a:ln> for a stroke.
 * @param {object} o { width px, color, style, cap: 'rnd'|'flat'|'sq', join: 'round'|'miter'|'bevel', head, tail, opacity }
 */
export const lineXml = ({ width, color, style, cap, join, head, tail, opacity = 1 } = {}) => {
  const c = parseColor(color)
  if (!(Number(width) > 0) || !c) return '<a:ln><a:noFill/></a:ln>'
  const dash = PRST_DASH[style]
  const joinXml = join === 'miter' ? '<a:miter lim="800000"/>' : join === 'bevel' ? '<a:bevel/>' : '<a:round/>'
  return `<a:ln w="${emu(width)}"${cap ? ` cap="${cap}"` : ''}>${solidFill(c, opacity)}${dash ? `<a:prstDash val="${dash}"/>` : ''}${joinXml}${lineEnd('headEnd', head)}${lineEnd('tailEnd', tail)}</a:ln>`
}

/** Outer shadow from the CSS-like { x, y, blur, color } model */
export const shadowXml = (shadow, opacity = 1) => {
  if (!shadow) return ''
  const c = parseColor(shadow.color || 'rgba(0,0,0,0.35)')
  if (!c) return ''
  const x = Number(shadow.x) || 0
  const y = Number(shadow.y) || 0
  const dist = Math.hypot(x, y)
  const dir = dist ? (Math.atan2(y, x) * 180) / Math.PI : 0
  return `<a:effectLst><a:outerShdw blurRad="${emu(Number(shadow.blur) || 0)}" dist="${emu(dist)}" dir="${deg60k(dir)}" algn="ctr" rotWithShape="0">${srgb(c, opacity)}</a:outerShdw></a:effectLst>`
}

/** <a:xfrm> for a box in px */
export const xfrmXml = ({ x, y, w, h, rot, flipH, flipV }, tag = 'a:xfrm') => {
  const attrs = [
    rot ? ` rot="${deg60k(rot)}"` : '',
    flipH ? ' flipH="1"' : '',
    flipV ? ' flipV="1"' : '',
  ].join('')
  return `<${tag}${attrs}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${Math.max(0, emu(w))}" cy="${Math.max(0, emu(h))}"/></${tag}>`
}

export const prstGeomXml = (prst, adj) => {
  const gd = adj ? Object.entries(adj).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => `<a:gd name="${esc(k)}" fmla="val ${Math.round(Number(v))}"/>`).join('') : ''
  return `<a:prstGeom prst="${esc(prst)}"><a:avLst>${gd}</a:avLst></a:prstGeom>`
}

/** Adjust value for a rounded rectangle with corner radius r (px) */
export const roundRectAdj = (r, w, h) => {
  const m = Math.min(Number(w) || 0, Number(h) || 0)
  if (!(m > 0) || !(r > 0)) return 0
  return Math.max(0, Math.min(50000, Math.round((r / m) * 100000)))
}
