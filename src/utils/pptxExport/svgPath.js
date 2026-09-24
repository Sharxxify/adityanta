// SVG path data -> DrawingML custom geometry (<a:custGeom>).
//
// Shapes on the canvas are SVG paths (built-in presets and imported
// freeforms). PowerPoint's custom geometry supports moveTo / lnTo /
// cubicBezTo / quadBezTo / close, so relative commands, H/V, smooth curves
// and elliptical arcs are converted to those primitives first.

const ARG_COUNT = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

/** Tokenise path data; arc flags may be written without separators ("a1 1 0 01 5 5"). */
const parse = (d) => {
  const out = []
  const s = String(d || '')
  let i = 0
  let cmd = null
  const skip = () => { while (i < s.length && /[\s,]/.test(s[i])) i++ }
  const number = () => {
    skip()
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(s.slice(i))
    if (!m) return null
    i += m[0].length
    return parseFloat(m[0])
  }
  const flag = () => {
    skip()
    const c = s[i]
    if (c === '0' || c === '1') { i++; return c === '1' ? 1 : 0 }
    return null
  }
  while (i < s.length) {
    skip()
    if (i >= s.length) break
    if (/[a-z]/i.test(s[i])) {
      cmd = s[i]
      i++
      if (cmd.toUpperCase() === 'Z') { out.push({ cmd, args: [] }); continue }
    } else if (!cmd) { i++; continue }
    const kind = cmd.toUpperCase()
    const n = ARG_COUNT[kind]
    if (n === undefined) { i++; continue }
    if (kind === 'Z') { out.push({ cmd, args: [] }); continue }
    const args = []
    for (let k = 0; k < n; k++) {
      const v = kind === 'A' && (k === 3 || k === 4) ? flag() : number()
      if (v === null) return out
      args.push(v)
    }
    out.push({ cmd, args })
    if (kind === 'M') cmd = cmd === 'M' ? 'L' : 'l'
  }
  return out
}

// SVG arc (endpoint parameterisation) -> cubic Bezier segments
const arcToCubics = (x1, y1, rxIn, ryIn, phiDeg, largeArc, sweep, x2, y2) => {
  if (x1 === x2 && y1 === y2) return []
  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]]
  const phi = (phiDeg * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) { const k = Math.sqrt(lambda); rx *= k; ry *= k }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den))
  const cxp = (coef * rx * y1p) / ry
  const cyp = (-coef * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const angle = (ux, uy, vx, vy) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return a
  }
  const t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI
  if (sweep && dt < 0) dt += 2 * Math.PI
  const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9))
  const delta = dt / segs
  const alpha = (4 / 3) * Math.tan(delta / 4)
  const point = (t) => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos]
  const deriv = (t) => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos]
  const out = []
  let t = t1
  for (let k = 0; k < segs; k++) {
    const [px1, py1] = point(t)
    const [dx1, dy1] = deriv(t)
    const t2 = t + delta
    const [px2, py2] = k === segs - 1 ? [x2, y2] : point(t2)
    const [dx2, dy2] = deriv(t2)
    out.push([px1 + alpha * dx1, py1 + alpha * dy1, px2 - alpha * dx2, py2 - alpha * dy2, px2, py2])
    t = t2
  }
  return out
}

/**
 * Normalise to absolute segments: { op: 'M'|'L'|'C'|'Q'|'Z', pts: [x, y, ...] }
 */
export const normalizePath = (d) => {
  const segs = []
  let x = 0; let y = 0; let sx = 0; let sy = 0
  let lastC = null // last cubic control point (for S)
  let lastQ = null // last quadratic control point (for T)
  for (const { cmd, args } of parse(d)) {
    const rel = cmd === cmd.toLowerCase()
    const K = cmd.toUpperCase()
    const ax = (v) => (rel ? x + v : v)
    const ay = (v) => (rel ? y + v : v)
    let nextC = null
    let nextQ = null
    switch (K) {
      case 'M': x = ax(args[0]); y = ay(args[1]); sx = x; sy = y; segs.push({ op: 'M', pts: [x, y] }); break
      case 'L': x = ax(args[0]); y = ay(args[1]); segs.push({ op: 'L', pts: [x, y] }); break
      case 'H': x = rel ? x + args[0] : args[0]; segs.push({ op: 'L', pts: [x, y] }); break
      case 'V': y = rel ? y + args[0] : args[0]; segs.push({ op: 'L', pts: [x, y] }); break
      case 'C': {
        const p = [ax(args[0]), ay(args[1]), ax(args[2]), ay(args[3]), ax(args[4]), ay(args[5])]
        segs.push({ op: 'C', pts: p }); nextC = [p[2], p[3]]; x = p[4]; y = p[5]; break
      }
      case 'S': {
        const c1 = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y]
        const p = [c1[0], c1[1], ax(args[0]), ay(args[1]), ax(args[2]), ay(args[3])]
        segs.push({ op: 'C', pts: p }); nextC = [p[2], p[3]]; x = p[4]; y = p[5]; break
      }
      case 'Q': {
        const p = [ax(args[0]), ay(args[1]), ax(args[2]), ay(args[3])]
        segs.push({ op: 'Q', pts: p }); nextQ = [p[0], p[1]]; x = p[2]; y = p[3]; break
      }
      case 'T': {
        const c = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y]
        const p = [c[0], c[1], ax(args[0]), ay(args[1])]
        segs.push({ op: 'Q', pts: p }); nextQ = c; x = p[2]; y = p[3]; break
      }
      case 'A': {
        const ex = ax(args[5]); const ey = ay(args[6])
        arcToCubics(x, y, args[0], args[1], args[2], args[3], args[4], ex, ey).forEach((c) => segs.push({ op: 'C', pts: c }))
        x = ex; y = ey; break
      }
      case 'Z': segs.push({ op: 'Z', pts: [] }); x = sx; y = sy; break
      default: break
    }
    lastC = nextC
    lastQ = nextQ
  }
  return segs
}

const pt = (x, y, k) => `<a:pt x="${Math.round(x * k)}" y="${Math.round(y * k)}"/>`

/** Path commands (inside <a:path>) for normalised segments */
const segmentsXml = (segs, k) => segs.map((s) => {
  const p = s.pts
  switch (s.op) {
    case 'M': return `<a:moveTo>${pt(p[0], p[1], k)}</a:moveTo>`
    case 'L': return `<a:lnTo>${pt(p[0], p[1], k)}</a:lnTo>`
    case 'C': return `<a:cubicBezTo>${pt(p[0], p[1], k)}${pt(p[2], p[3], k)}${pt(p[4], p[5], k)}</a:cubicBezTo>`
    case 'Q': return `<a:quadBezTo>${pt(p[0], p[1], k)}${pt(p[2], p[3], k)}</a:quadBezTo>`
    case 'Z': return '<a:close/>'
    default: return ''
  }
}).join('')

/**
 * <a:custGeom> for one or more SVG paths drawn in a (vbW x vbH) box.
 * @param {Array<{ d: string, fill?: boolean, stroke?: boolean }>|string} paths
 */
export const custGeomXml = (paths, vbW, vbH) => {
  const list = typeof paths === 'string' ? [{ d: paths }] : paths
  const w = Math.max(1e-6, Number(vbW) || 1)
  const h = Math.max(1e-6, Number(vbH) || 1)
  const k = 100000 / Math.max(w, h)
  const pathXml = list.map(({ d, fill = true, stroke = true }) => {
    const segs = normalizePath(d)
    if (!segs.length) return ''
    if (segs[0].op !== 'M') segs.unshift({ op: 'M', pts: [0, 0] })
    const attrs = `${fill ? '' : ' fill="none"'}${stroke ? '' : ' stroke="0"'}`
    return `<a:path w="${Math.round(w * k)}" h="${Math.round(h * k)}"${attrs}>${segmentsXml(segs, k)}</a:path>`
  }).join('')
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst>${pathXml}</a:pathLst></a:custGeom>`
}
