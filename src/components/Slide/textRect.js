// Text rectangles of PowerPoint preset shapes.
//
// PowerPoint lays out a shape's text inside the preset's <a:rect> (from
// presetShapeDefinitions.xml), not inside the whole bounding box — e.g. a
// triangle's text sits in its lower half, a chevron's between its notches.
// Formulas follow the spec, using the shape's adjust values when present
// (raw 1/100000 units, `adj`, `adj1`, `adj2`...).
//
// Returns insets { l, t, r, b } in px from the shape box edges, or null for
// "use the whole box".

const ELLIPSE_INSET = 1 - Math.SQRT1_2 // (1 - cos 45deg) / 2 * 2

const frac = (l, t, r, b) => (w, h) => ({ l: w * l, t: h * t, r: w * r, b: h * b })

const ellipse = (w, h) => ({ l: (w / 2) * ELLIPSE_INSET, t: (h / 2) * ELLIPSE_INSET, r: (w / 2) * ELLIPSE_INSET, b: (h / 2) * ELLIPSE_INSET })

const a = (adj, name, def) => {
  const v = Number(adj?.[name])
  return Number.isFinite(v) ? v : def
}

const RECTS = {
  ellipse,
  donut: ellipse,
  flowChartConnector: ellipse,
  smileyFace: ellipse,
  noSmoking: ellipse,
  wedgeEllipseCallout: ellipse,
  pie: ellipse,
  chord: ellipse,
  teardrop: ellipse,

  roundRect: (w, h, adj) => {
    const i = Math.min(w, h) * (a(adj, 'adj', 16667) / 100000) * 0.29289
    return { l: i, t: i, r: i, b: i }
  },
  flowChartAlternateProcess: (w, h) => {
    const i = Math.min(w, h) * 0.1667 * 0.29289
    return { l: i, t: i, r: i, b: i }
  },
  triangle: (w, h, adj) => {
    const x1 = (w * a(adj, 'adj', 50000)) / 200000
    return { l: x1, t: h / 2, r: w - (x1 + w / 2), b: 0 }
  },
  flowChartExtract: (w, h) => ({ l: w / 4, t: h / 2, r: w / 4, b: 0 }),
  flowChartMerge: (w, h) => ({ l: w / 4, t: 0, r: w / 4, b: h / 2 }),
  rtTriangle: (w, h) => ({ l: w / 12, t: (h * 7) / 12, r: (w * 5) / 12, b: h / 12 }),
  diamond: frac(0.25, 0.25, 0.25, 0.25),
  flowChartDecision: frac(0.25, 0.25, 0.25, 0.25),
  parallelogram: (w, h, adj) => {
    const x2 = Math.min(w, h) * (a(adj, 'adj', 25000) / 100000)
    return { l: x2 * 0.5, t: 0, r: x2 * 0.5, b: 0 }
  },
  flowChartInputOutput: frac(0.2, 0, 0.2, 0),
  trapezoid: (w, h, adj) => {
    const ss = Math.min(w, h)
    const maxAdj = (50000 * w) / ss
    const av = Math.min(a(adj, 'adj', 25000), maxAdj)
    const il = ((w / 3) * av) / maxAdj
    const it = ((h / 3) * av) / maxAdj
    return { l: il, t: it, r: il, b: 0 }
  },
  pentagon: frac(0.18, 0.28, 0.18, 0),
  hexagon: (w, h, adj) => {
    const x1 = Math.min(w, h) * (a(adj, 'adj', 25000) / 100000)
    return { l: x1 * 0.5, t: h * 0.08, r: x1 * 0.5, b: h * 0.08 }
  },
  octagon: (w, h, adj) => {
    const i = (Math.min(w, h) * (a(adj, 'adj', 29289) / 100000)) / 2
    return { l: i, t: i, r: i, b: i }
  },
  plaque: (w, h, adj) => {
    const i = Math.min(w, h) * (a(adj, 'adj', 16667) / 100000) * 0.70711
    return { l: i, t: i, r: i, b: i }
  },
  frame: (w, h, adj) => {
    const i = Math.min(w, h) * (a(adj, 'adj1', 12500) / 100000)
    return { l: i, t: i, r: i, b: i }
  },
  bevel: (w, h, adj) => {
    const i = Math.min(w, h) * (a(adj, 'adj', 12500) / 100000)
    return { l: i, t: i, r: i, b: i }
  },
  cube: (w, h, adj) => {
    const y1 = Math.min(w, h) * (a(adj, 'adj', 25000) / 100000)
    return { l: 0, t: y1, r: y1, b: 0 }
  },
  can: (w, h, adj) => {
    const y1 = (Math.min(w, h) * a(adj, 'adj', 25000)) / 200000
    return { l: 0, t: y1 * 2, r: 0, b: y1 }
  },
  flowChartMagneticDisk: frac(0, 1 / 3, 0, 1 / 6),
  plus: (w, h, adj) => {
    const x1 = Math.min(w, h) * (a(adj, 'adj', 25000) / 100000)
    return { l: 0, t: x1, r: 0, b: x1 }
  },
  chevron: (w, h, adj) => {
    const x1 = Math.min(w, h) * (a(adj, 'adj', 50000) / 100000)
    const x2 = w - x1
    return x2 > x1 ? { l: x1, t: 0, r: w - x2, b: 0 } : null
  },
  homePlate: (w, h, adj) => {
    const dx1 = Math.min(w, h) * (a(adj, 'adj', 50000) / 100000)
    return { l: 0, t: 0, r: dx1 / 2, b: 0 }
  },
  rightArrow: (w, h, adj) => {
    const ss = Math.min(w, h)
    const dx1 = ss * (Math.min(a(adj, 'adj2', 50000), (100000 * w) / ss) / 100000)
    const dy1 = (h * a(adj, 'adj1', 50000)) / 200000
    const y1 = h / 2 - dy1
    const dx2 = (y1 * dx1) / (h / 2)
    return { l: 0, t: y1, r: dx1 - dx2, b: y1 }
  },
  leftArrow: (w, h, adj) => {
    const r = RECTS.rightArrow(w, h, adj)
    return { l: r.r, t: r.t, r: 0, b: r.b }
  },
  downArrow: (w, h, adj) => {
    const ss = Math.min(w, h)
    const dy1 = ss * (Math.min(a(adj, 'adj2', 50000), (100000 * h) / ss) / 100000)
    const dx1 = (w * a(adj, 'adj1', 50000)) / 200000
    const x1 = w / 2 - dx1
    const dy2 = (x1 * dy1) / (w / 2)
    return { l: x1, t: 0, r: x1, b: dy1 - dy2 }
  },
  upArrow: (w, h, adj) => {
    const r = RECTS.downArrow(w, h, adj)
    return { l: r.l, t: r.b, r: r.r, b: 0 }
  },
  leftRightArrow: (w, h, adj) => {
    const ss = Math.min(w, h)
    const dx2 = ss * (Math.min(a(adj, 'adj2', 50000), (50000 * w) / ss) / 100000)
    const dy1 = (h * a(adj, 'adj1', 50000)) / 200000
    const y1 = h / 2 - dy1
    const i = dx2 - (y1 * dx2) / (h / 2)
    return { l: i, t: y1, r: i, b: y1 }
  },
  notchedRightArrow: (w, h, adj) => RECTS.rightArrow(w, h, adj),
  star5: (w, h, adj) => {
    const k = a(adj, 'adj', 19098) / 19098
    const ix = 0.191 * k
    return { l: w * (0.5 - ix), t: h * (0.5528 - 0.1708 * k), r: w * (0.5 - ix), b: h * (1 - (0.5528 + 0.2112 * k)) }
  },
  star4: frac(0.32, 0.32, 0.32, 0.32),
  star6: frac(0.25, 0.22, 0.25, 0.22),
  star7: frac(0.28, 0.26, 0.28, 0.2),
  star8: frac(0.3, 0.3, 0.3, 0.3),
  star10: frac(0.3, 0.3, 0.3, 0.3),
  star12: frac(0.3, 0.3, 0.3, 0.3),
  star16: frac(0.29, 0.29, 0.29, 0.29),
  star24: frac(0.29, 0.29, 0.29, 0.29),
  star32: frac(0.29, 0.29, 0.29, 0.29),
  sun: frac(0.3, 0.3, 0.3, 0.3),
  heart: frac(0.2, 0.2, 0.2, 0.28),
  cloud: frac(2977 / 21600, 3262 / 21600, 1 - 17087 / 21600, 1 - 17337 / 21600),
  cloudCallout: frac(2977 / 21600, 3262 / 21600, 1 - 17087 / 21600, 1 - 17337 / 21600),
  flowChartTerminator: frac(1018 / 21600, 3163 / 21600, 1 - 20582 / 21600, 1 - 18437 / 21600),
  flowChartDocument: frac(0, 0, 0, 1 - 17322 / 21600),
  flowChartMultidocument: frac(0, 3600 / 21600, 3600 / 21600, 1 - 17322 / 21600),
  flowChartPunchedTape: frac(0, 0.2, 0, 0.2),
  flowChartPredefinedProcess: frac(1 / 8, 0, 1 / 8, 0),
  flowChartPreparation: frac(0.2, 0, 0.2, 0),
  flowChartManualInput: frac(0, 0.2, 0, 0),
  flowChartManualOperation: frac(0.2, 0, 0.2, 0),
  flowChartDelay: frac(0, 0.146, 0.146, 0.146),
  flowChartDisplay: frac(1 / 6, 0, 1 / 6, 0),
  flowChartOffpageConnector: frac(0, 0, 0, 0.2),
  flowChartOnlineStorage: frac(1 / 6, 0, 1 / 6, 0),
  wave: (w, h, adj) => {
    const y1 = (h * a(adj, 'adj1', 12500)) / 100000
    return { l: w * 0.05, t: y1 * 2, r: w * 0.05, b: y1 * 2 }
  },
  doubleWave: (w, h, adj) => {
    const y1 = (h * a(adj, 'adj1', 6250)) / 100000
    return { l: w * 0.05, t: y1 * 2, r: w * 0.05, b: y1 * 2 }
  },
  snip1Rect: (w, h, adj) => {
    const i = (Math.min(w, h) * a(adj, 'adj', 16667)) / 200000
    return { l: 0, t: i, r: i, b: 0 }
  },
  snip2SameRect: (w, h, adj) => {
    const i = (Math.min(w, h) * a(adj, 'adj1', 16667)) / 200000
    return { l: i, t: i, r: i, b: 0 }
  },
  round1Rect: (w, h, adj) => {
    const i = Math.min(w, h) * (a(adj, 'adj', 16667) / 100000) * 0.29289
    return { l: 0, t: 0, r: i, b: 0 }
  },
  round2SameRect: (w, h, adj) => {
    const i = Math.min(w, h) * (a(adj, 'adj1', 16667) / 100000) * 0.29289
    return { l: i, t: i, r: i, b: 0 }
  },
  foldedCorner: (w, h, adj) => ({ l: 0, t: 0, r: 0, b: Math.min(w, h) * (a(adj, 'adj', 16667) / 100000) }),
}

/**
 * Text rectangle of a shape element in px (relative to its box), or null to
 * use the full box.
 */
export const getShapeTextInsets = (el, w, h) => {
  const preset = el?.geometry?.preset
  if (!preset || !(w > 0) || !(h > 0)) return null
  const fn = RECTS[preset]
  if (!fn) return null
  const r = fn(w, h, el.geometry.adj)
  if (!r) return null
  const clamp = (v, max) => Math.min(Math.max(0, Number(v) || 0), max)
  const l = clamp(r.l, w)
  const t = clamp(r.t, h)
  return { l, t, r: clamp(r.r, w - l), b: clamp(r.b, h - t) }
}
