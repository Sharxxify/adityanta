// Shape geometry shared by every slide renderer.
//
// Built-in shapes are defined once here in a small design box (viewBox) and
// scaled to the element's real pixel size at render time, so stroke widths
// stay exact (no non-uniform stroke stretching from preserveAspectRatio=none).
// Imported PowerPoint shapes carry their own path (`element.geometry`).

const poly = (points) => {
  const pts = points.trim().split(/\s+/).map((p) => p.split(',').map(Number))
  return 'M ' + pts.map(([x, y]) => `${x} ${y}`).join(' L ') + ' Z'
}

// name -> { vb: [w, h], d, strokeOnly? }
export const SHAPE_PRESETS = {
  semicircle: { vb: [100, 100], d: 'M 0 100 A 50 50 0 0 1 100 100 Z' },
  triangle: { vb: [200, 150], d: poly('100,0 0,150 200,150') },
  rightTriangle: { vb: [100, 100], d: poly('0,0 0,100 100,100') },
  parallelogram: { vb: [100, 100], d: poly('25,0 100,0 75,100 0,100') },
  diamond: { vb: [100, 100], d: poly('50,0 100,50 50,100 0,50') },
  pentagon: { vb: [100, 100], d: poly('50,5 95,38 78,92 22,92 5,38') },
  hexagon: { vb: [120, 100], d: poly('30,0 90,0 120,50 90,100 30,100 0,50') },
  octagon: { vb: [100, 100], d: poly('30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30') },
  cylinder: { vb: [100, 100], d: 'M 10 20 L 10 80 A 40 10 0 0 0 90 80 L 90 20 A 40 10 0 0 0 10 20 M 10 20 A 40 10 0 0 0 90 20' },
  chevronProcess: { vb: [100, 100], d: poly('0,0 75,0 100,50 75,100 0,100 25,50') },
  shield: { vb: [100, 100], d: 'M 10 10 L 90 10 L 90 50 Q 90 85 50 95 Q 10 85 10 50 Z' },
  waveFlag: { vb: [100, 100], d: 'M 10 20 Q 30 10 50 20 T 90 20 L 90 80 Q 70 70 50 80 T 10 80 Z' },
  folder: { vb: [100, 100], d: 'M 10 20 L 40 20 L 50 30 L 90 30 L 90 80 L 10 80 Z' },
  stickyNote: { vb: [100, 100], d: 'M 10 10 L 90 10 L 90 70 L 70 90 L 10 90 Z M 90 70 L 70 70 L 70 90' },
  document: { vb: [100, 100], d: 'M 15 10 L 70 10 L 85 25 L 85 90 L 15 90 Z M 70 10 L 70 25 L 85 25' },
  puzzle: { vb: [100, 100], d: 'M 20 20 L 40 20 C 40 10 60 10 60 20 L 80 20 L 80 40 C 90 40 90 60 80 60 L 80 80 L 60 80 C 60 90 40 90 40 80 L 20 80 L 20 60 C 10 60 10 40 20 40 Z' },
  leftArrowBlock: { vb: [100, 100], d: poly('0,50 40,15 40,35 100,35 100,65 40,65 40,85') },
  rightArrowBlock: { vb: [100, 100], d: poly('100,50 60,15 60,35 0,35 0,65 60,65 60,85') },
  leftRightArrowBlock: { vb: [100, 100], d: poly('0,50 25,25 25,40 75,40 75,25 100,50 75,75 75,60 25,60 25,75') },
  chevronArrowBlock: { vb: [100, 100], d: poly('0,25 50,25 50,10 90,50 50,90 50,75 0,75 40,50') },
  pentagonArrowBlock: { vb: [100, 100], d: poly('0,35 60,35 60,15 100,50 60,85 60,65 0,65') },
  crescent: { vb: [100, 100], d: 'M 80 15 A 35 35 0 1 0 80 85 A 30 30 0 1 1 80 15' },
  star4: { vb: [100, 100], d: poly('50,10 60,40 90,50 60,60 50,90 40,60 10,50 40,40') },
  star: { vb: [100, 100], d: poly('50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35') },
  star6: { vb: [100, 100], d: poly('50,5 63,28 90,28 72,50 90,72 63,72 50,95 37,72 10,72 28,50 10,28 37,28') },
  star8: { vb: [100, 100], d: poly('50,5 58,35 82,18 65,42 95,50 65,58 82,82 58,65 50,95 42,65 18,82 35,58 5,50 35,42 18,18 42,35') },
  sun: { vb: [100, 100], d: poly('50,5 53,23 68,14 64,31 81,19 72,36 89,30 76,46 95,50 76,54 89,70 72,64 81,81 64,69 68,86 53,77 50,95 47,77 32,86 36,69 19,81 28,64 11,70 24,54 5,50 24,46 11,30 28,36 19,19 36,31 32,14 47,23') },
  teardrop: { vb: [100, 100], d: 'M 50 10 C 50 10 90 55 90 70 A 40 40 0 0 1 10 70 C 10 55 50 10 50 10 Z' },
  ovalSpeech: { vb: [100, 100], d: 'M 50 10 C 25 10 5 25 5 45 C 5 60 18 73 35 77 L 25 95 L 48 80 C 49 80 50 80 50 80 C 75 80 95 65 95 45 C 95 25 75 10 50 10 Z' },
  rectSpeech: { vb: [100, 100], d: 'M 10 10 L 90 10 L 90 70 L 45 70 L 25 90 L 25 70 L 10 70 Z' },
  thoughtBubble: { vb: [100, 100], d: 'M 30 60 A 15 15 0 0 1 38 35 A 18 18 0 0 1 70 35 A 15 15 0 0 1 78 60 A 12 12 0 0 1 70 75 L 35 75 A 12 12 0 0 1 30 60 Z M 22 83 A 5 5 0 1 1 17 83 A 5 5 0 1 1 22 83 Z M 13 91 A 3 3 0 1 1 10 91 A 3 3 0 1 1 13 91 Z' },
  cloud: { vb: [100, 100], d: 'M 25 60 A 15 15 0 0 1 35 35 A 20 20 0 0 1 70 35 A 15 15 0 0 1 80 60 A 12 12 0 0 1 75 80 L 25 80 A 12 12 0 0 1 25 60 Z' },
  heart: { vb: [100, 100], d: 'M 50 30 C 50 10 10 10 10 40 C 10 65 50 90 50 95 C 50 90 90 65 90 40 C 90 10 50 10 50 30 Z' },
  cross: { vb: [100, 100], d: poly('35,5 65,5 65,35 95,35 95,65 65,65 65,95 35,95 35,65 5,65 5,35 35,35') },
  flower: { vb: [100, 100], d: 'M 50 40 C 53 30 63 30 66 40 C 76 37 79 47 70 53 C 79 59 71 69 61 66 C 60 76 50 76 47 66 C 37 69 29 59 38 53 C 29 47 32 37 42 40 C 40 30 50 30 50 40 Z' },
  decagram: { vb: [100, 100], d: poly('50,5 57,20 72,12 70,28 85,25 78,39 92,45 81,54 88,70 75,72 77,88 63,83 59,95 48,87 37,95 33,83 19,88 21,72 8,70 15,54 4,45 18,39 11,25 26,28 24,12 39,20') },
  roundedFlower: { vb: [100, 100], d: 'M 50 20 L 53 20 L 55 10 L 61 12 L 59 21 L 64 23 L 69 16 L 74 20 L 69 27 L 73 31 L 80 27 L 83 32 L 76 37 L 78 42 L 86 42 L 86 48 L 77 50 L 77 55 L 85 58 L 83 63 L 75 61 L 72 66 L 77 73 L 73 77 L 66 72 L 62 75 L 63 84 L 57 85 L 55 76 L 50 77 L 48 86 L 42 85 L 44 76 L 39 74 L 33 80 L 29 75 L 34 69 L 31 64 L 23 67 L 21 62 L 28 57 L 27 52 L 18 50 L 18 44 L 27 42 L 28 37 L 20 34 L 22 29 L 30 32 L 33 27 L 28 20 L 33 16 L 38 23 L 43 21 L 43 12 L 49 11 Z M 50 35 A 15 15 0 1 0 50 65 A 15 15 0 1 0 50 35 Z' },
  doubleArrow: { vb: [100, 100], d: 'M 12 50 L 88 50 M 28 30 L 8 50 L 28 70 M 72 30 L 92 50 L 72 70', strokeOnly: true },
}

const RECT_LIKE = new Set(['square', 'rectangle', 'tallRectangle', 'roundedRectangle'])

const PARAMS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

/**
 * Scale an SVG path (absolute or relative commands) by (sx, sy).
 * Pure scaling is linear, so relative segments scale the same way.
 */
export const scalePath = (d, sx, sy) => {
  if (!d) return ''
  if (sx === 1 && sy === 1) return d
  const out = []
  const tokens = d.match(/[a-df-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []
  let cmd = null
  let i = 0
  const fmt = (n) => Math.round(n * 1000) / 1000
  while (i < tokens.length) {
    const t = tokens[i]
    if (/^[a-z]$/i.test(t)) {
      cmd = t
      out.push(t)
      i++
      if (cmd.toUpperCase() === 'Z') continue
    }
    if (!cmd) { i++; continue }
    const kind = cmd.toUpperCase()
    const n = PARAMS[kind]
    if (!n) { i++; continue }
    const args = tokens.slice(i, i + n).map(Number)
    if (args.length < n || args.some((v) => Number.isNaN(v))) break
    let scaled
    switch (kind) {
      case 'H': scaled = [args[0] * sx]; break
      case 'V': scaled = [args[0] * sy]; break
      case 'A': scaled = [args[0] * sx, args[1] * sy, args[2], args[3], args[4], args[5] * sx, args[6] * sy]; break
      default: scaled = args.map((v, k) => (k % 2 === 0 ? v * sx : v * sy))
    }
    out.push(scaled.map(fmt).join(' '))
    i += n
    // An implicit repeat after M is treated as L (SVG spec).
    if (kind === 'M') cmd = cmd === 'M' ? 'L' : 'l'
  }
  return out.join(' ')
}

/**
 * Resolve the outline of a shape element at its real pixel size.
 * Returns { kind: 'rect'|'ellipse'|'path'|'line'|'arrow', d?, rx?, strokeOnly? }
 */
export const getShapeGeometry = (el, w, h) => {
  const width = Math.max(0, w)
  const height = Math.max(0, h)

  // Imported / custom geometry (PowerPoint presets and freeforms)
  if (el.geometry?.path) {
    const vb = el.geometry.viewBox || { width, height }
    const sx = vb.width ? width / vb.width : 1
    const sy = vb.height ? height / vb.height : 1
    return { kind: 'path', d: scalePath(el.geometry.path, sx, sy), strokeOnly: !!el.geometry.strokeOnly }
  }

  const type = el.shapeType || 'rectangle'
  if (type === 'circle' || type === 'oval' || type === 'ellipse') return { kind: 'ellipse' }
  if (RECT_LIKE.has(type)) {
    const rx = type === 'roundedRectangle' ? (el.borderRadius ?? 16) : (el.borderRadius ?? 4)
    return { kind: 'rect', rx: Math.min(Number(rx) || 0, width / 2, height / 2) }
  }
  if (type === 'line') return { kind: 'line' }
  if (type === 'arrow') return { kind: 'arrow' }

  const preset = SHAPE_PRESETS[type]
  if (!preset) return { kind: 'rect', rx: 0 }
  return {
    kind: 'path',
    d: scalePath(preset.d, width / preset.vb[0], height / preset.vb[1]),
    strokeOnly: !!preset.strokeOnly,
  }
}
