// Slide element -> native PowerPoint object specs.
//
// Each builder returns a list of specs that the exporter turns into slide
// objects:
//   { kind: 'sp',   xml: (id) => '<p:sp>…' | '<p:graphicFrame>…' }
//   { kind: 'pic',  data, box, transparency, xml: (id, blipXml) => '<p:pic>…' }
//   { kind: 'raster' }   render the element to a PNG (last resort)
// Charts and media are added through pptxgenjs directly by the exporter.

import { getShapeGeometry } from '../../components/Slide/geometry'
import { getPadding, getTextFrameStyle, getTableCells } from '../../components/Slide/ElementView'
import { getShapeTextInsets } from '../../components/Slide/textRect'
import { ICONS } from '../../components/Slide/iconLibrary'
import { fontStack } from '../../components/Slide/fonts'
import { isHtmlBlank } from '../../components/Slide/html'
import {
  esc, emu, parseColor, fillXml, lineXml, shadowXml, xfrmXml, prstGeomXml, roundRectAdj, normalizeFill, srgb,
} from './xml'
import { custGeomXml } from './svgPath'
import { htmlToParagraphs, txBodyXml } from './htmlText'

const num = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

export const opacityOf = (el) => (el.opacity == null ? 1 : Math.max(0, Math.min(1, num(el.opacity, 100) / 100)))

export const boxOf = (el) => ({
  x: num(el.x),
  y: num(el.y),
  w: Math.max(0, num(el.width)),
  h: Math.max(0, num(el.height)),
  rot: num(el.rotation),
  flipH: !!el.flipH,
  flipV: !!el.flipV,
})

/** Place a child box (relative to the element) so it rotates with the element */
export const subBox = (box, rel, { flips = true } = {}) => {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const dx = box.x + rel.x + rel.w / 2 - cx
  const dy = box.y + rel.y + rel.h / 2 - cy
  const a = (box.rot * Math.PI) / 180
  const nx = cx + dx * Math.cos(a) - dy * Math.sin(a)
  const ny = cy + dx * Math.sin(a) + dy * Math.cos(a)
  return { x: nx - rel.w / 2, y: ny - rel.h / 2, w: rel.w, h: rel.h, rot: box.rot, flipH: flips && box.flipH, flipV: flips && box.flipV }
}

const anchorOf = (va, fallback) => ({ middle: 'ctr', center: 'ctr', bottom: 'b', top: 't' }[va || fallback] || 't')
const NO_LINE = '<a:ln><a:noFill/></a:ln>'
const CAP = { round: 'rnd', square: 'sq', butt: 'flat' }

const spXml = ({ id, name, box, geom, fill = '<a:noFill/>', line = NO_LINE, effect = '', txBody = '', txBox = false }) => (
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr${txBox ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr>`
  + `<p:spPr>${xfrmXml(box)}${geom}${fill}${line}${effect}</p:spPr>${txBody}</p:sp>`
)

const hasRunText = (paragraphs) => paragraphs.some((p) => p.runs.some((r) => r.text && r.text.trim()))

const outlineGeom = (radius, w, h) => {
  if (radius === '50%') return prstGeomXml('ellipse')
  const r = parseFloat(radius)
  if (r > 0 && !/%$/.test(String(radius))) return prstGeomXml('roundRect', { adj: roundRectAdj(r, w, h) })
  return prstGeomXml('rect')
}

// ---------------------------------------------------------------------------
// Text boxes
// ---------------------------------------------------------------------------

export const textSpecs = (el, sctx) => {
  const box = { ...boxOf(el), flipH: false, flipV: false }
  const op = opacityOf(el)
  const pad = getPadding(el, 8)
  const paragraphs = htmlToParagraphs(el.content, {
    frameStyle: getTextFrameStyle(el),
    width: box.w,
    lineHeight: el.lineHeight ?? 1.5,
    listType: el.listType,
  })
  const fill = fillXml(el.backgroundColor, op)
  const bw = num(el.borderWidth)
  if (!hasRunText(paragraphs) && fill === '<a:noFill/>' && !bw) return []
  const line = bw ? lineXml({ width: bw, color: el.borderColor || '#333333', style: el.borderStyle, opacity: op }) : NO_LINE
  const vert = el.vertical ? (el.vertical === 'vert270' ? 'vert270' : 'vert') : undefined
  const txBody = txBodyXml({
    paragraphs,
    insets: pad,
    anchor: anchorOf(el.verticalAlign, 'top'),
    wrap: el.wrap !== false,
    vert,
    opacity: op,
    links: sctx.link,
  })
  return [{
    kind: 'sp',
    xml: (id) => spXml({ id, name: el.name || `TextBox ${id}`, box, geom: outlineGeom(el.borderRadius, box.w, box.h), fill, line, effect: shadowXml(el.shadow, op), txBody, txBox: true }),
  }]
}

// ---------------------------------------------------------------------------
// Shapes and lines
// ---------------------------------------------------------------------------

// Built-in shapes whose PowerPoint preset is geometrically identical
const EXACT_PRESETS = { triangle: 'triangle', rightTriangle: 'rtTriangle', diamond: 'diamond' }

export const shapeSpecs = (el, sctx) => {
  const box = boxOf(el)
  const op = opacityOf(el)
  const g = getShapeGeometry(el, box.w, box.h)
  const sw = num(el.strokeWidth)
  const isLine = g.kind === 'line' || g.kind === 'arrow'
  const strokeColor = isLine ? (el.strokeColor || el.fill || '#333333') : (el.strokeColor || '#333333')
  const f = normalizeFill(g.strokeOnly || isLine ? null : el.fill)
  if (f.type === 'image') return [{ kind: 'raster' }]
  const fill = fillXml(f, op * (el.fillOpacity ?? 1))
  const dash = el.borderStyle || el.strokeDash
  const cap = CAP[el.strokeLinecap] || (isLine ? 'rnd' : 'flat')
  const join = el.strokeLinejoin || 'round'

  let geom
  let xbox = box
  let line = NO_LINE
  if (isLine) {
    // canvas lines run across the middle of the box
    xbox = { ...box, y: box.y + box.h / 2, h: 0 }
    geom = prstGeomXml('line')
    const tail = g.kind === 'arrow' ? { type: 'triangle', width: 'lg', length: 'lg' } : el.tailEnd
    line = lineXml({ width: sw || 2, color: strokeColor, style: dash, cap, join, head: el.headEnd, tail, opacity: op })
  } else {
    if (sw > 0) line = lineXml({ width: sw, color: strokeColor, style: dash, cap, join, head: el.headEnd, tail: el.tailEnd, opacity: op })
    const preset = el.geometry?.preset
    if (g.kind === 'ellipse') geom = prstGeomXml('ellipse')
    else if (g.kind === 'rect') {
      // the canvas keeps the stroke inside the box; PowerPoint centres it on the edge
      if (sw > 0) xbox = { ...box, x: box.x + sw / 2, y: box.y + sw / 2, w: Math.max(0, box.w - sw), h: Math.max(0, box.h - sw) }
      geom = g.rx > 0 ? prstGeomXml('roundRect', { adj: roundRectAdj(g.rx, xbox.w, xbox.h) }) : prstGeomXml('rect')
    } else if (preset && preset !== 'custom') geom = prstGeomXml(preset, el.geometry.adj)
    else if (!el.geometry && EXACT_PRESETS[el.shapeType]) geom = prstGeomXml(EXACT_PRESETS[el.shapeType])
    else geom = custGeomXml([{ d: g.d, fill: !g.strokeOnly }], box.w, box.h)
  }

  let txBody = ''
  if (!isLine && el.content && !isHtmlBlank(el.content)) {
    const rect = getShapeTextInsets(el, box.w, box.h)
    const paragraphs = htmlToParagraphs(el.content, {
      frameStyle: getTextFrameStyle(el, { inShape: true }),
      width: Math.max(1, box.w - (rect ? rect.l + rect.r : 0)),
      lineHeight: el.lineHeight ?? 1.5,
      listType: el.listType,
    })
    if (hasRunText(paragraphs)) {
      txBody = txBodyXml({
        paragraphs,
        insets: getPadding(el, 8),
        anchor: anchorOf(el.verticalAlign, 'middle'),
        wrap: el.wrap !== false,
        opacity: op,
        links: sctx.link,
      })
    }
  }
  return [{
    kind: 'sp',
    xml: (id) => spXml({ id, name: el.name || `${isLine ? 'Straight Connector' : 'Shape'} ${id}`, box: xbox, geom, fill, line, effect: shadowXml(el.shadow, op), txBody }),
  }]
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

const picXml = ({ id, name, box, blip, srcRect = '', geom = prstGeomXml('rect'), line = '', effect = '' }) => (
  `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(name)}" descr=""/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
  + `<p:blipFill>${blip}${srcRect}<a:stretch><a:fillRect/></a:stretch></p:blipFill>`
  + `<p:spPr>${xfrmXml(box)}${geom}${line}${effect}</p:spPr></p:pic>`
)

const srcRectXml = ({ l = 0, t = 0, r = 0, b = 0 }) => {
  const v = (n) => Math.round(n * 100000)
  if (!l && !t && !r && !b) return ''
  return `<a:srcRect${l ? ` l="${v(l)}"` : ''}${t ? ` t="${v(t)}"` : ''}${r ? ` r="${v(r)}"` : ''}${b ? ` b="${v(b)}"` : ''}/>`
}

/** Crop (fractions of the picture) that reproduces CSS object-fit in a w x h frame */
export const fitCrop = (fit, imgW, imgH, w, h) => {
  if (!(imgW > 0 && imgH > 0 && w > 0 && h > 0) || fit === 'fill') return null
  const ia = imgW / imgH
  const ba = w / h
  if (Math.abs(ia - ba) < 1e-3) return null
  if (fit === 'cover') {
    if (ia > ba) { const c = (1 - ba / ia) / 2; return { l: c, r: c, t: 0, b: 0 } }
    const c = (1 - ia / ba) / 2
    return { t: c, b: c, l: 0, r: 0 }
  }
  // contain: negative crop pads the picture inside its frame
  if (ia > ba) { const p = ((h - w / ia) / 2) / (w / ia); return { t: -p, b: -p, l: 0, r: 0 } }
  const p = ((w - h * ia) / 2) / (h * ia)
  return { l: -p, r: -p, t: 0, b: 0 }
}

/** Contained picture rectangle inside a frame (relative px) */
const containRect = (imgW, imgH, w, h) => {
  const s = Math.min(w / imgW, h / imgH)
  const cw = imgW * s
  const ch = imgH * s
  return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch }
}

const captionSpec = (el, box, rel, op) => {
  const size = num(el.captionFontSize, 14)
  const paragraphs = htmlToParagraphs(String(el.caption).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])), {
    frameStyle: { fontSize: size, color: el.captionColor || '#666666', fontFamily: fontStack(el.captionFontFamily || 'Inter'), textAlign: 'center', whiteSpace: 'nowrap', lineHeight: 1.5 },
    width: rel.w,
    lineHeight: 1.5,
  })
  const cbox = subBox(box, rel, { flips: false })
  return {
    kind: 'sp',
    xml: (id) => spXml({ id, name: `Caption ${id}`, box: cbox, geom: prstGeomXml('rect'), txBody: txBodyXml({ paragraphs, insets: { top: 4, right: 8, bottom: 4, left: 8 }, anchor: 't', wrap: false, opacity: op }), txBox: true }),
  }
}

/**
 * @param {object} media { data, width, height } from the exporter's image loader
 */
export const imageSpecs = (el, media) => {
  const box = boxOf(el)
  const op = opacityOf(el)
  const specs = []
  let frameRel = { x: 0, y: 0, w: box.w, h: box.h }
  if (el.caption && el.showCaption) {
    const capH = num(el.captionFontSize, 14) * 1.5 + 8
    frameRel = { x: 0, y: 0, w: box.w, h: Math.max(1, box.h - capH - 4) }
    specs.push(captionSpec(el, box, { x: 0, y: frameRel.h + 4, w: box.w, h: capH }, op))
  }
  const ellipse = el.borderRadius === '50%' || el.clipShape === 'ellipse'
  const radius = !ellipse ? parseFloat(el.borderRadius) : 0
  const clipped = ellipse || radius > 0 || !!el.clipPath
  const crop = el.crop && (el.crop.l || el.crop.t || el.crop.r || el.crop.b) ? el.crop : null
  const fit = el.objectFit || 'contain'

  let rel = frameRel
  let src = crop
  if (!crop) {
    if (fit === 'contain' && !clipped) {
      const c = containRect(media.width, media.height, frameRel.w, frameRel.h)
      rel = { x: frameRel.x + c.x, y: frameRel.y + c.y, w: c.w, h: c.h }
    } else {
      src = fitCrop(fit === 'contain' || fit === 'cover' ? fit : 'fill', media.width, media.height, frameRel.w, frameRel.h)
    }
  }
  const pbox = subBox(box, rel)
  let geom = prstGeomXml('rect')
  if (ellipse) geom = prstGeomXml('ellipse')
  else if (radius > 0) geom = prstGeomXml('roundRect', { adj: roundRectAdj(radius, pbox.w, pbox.h) })
  else if (el.clipPath) geom = custGeomXml([{ d: el.clipPath }], frameRel.w, frameRel.h)
  const bw = num(el.borderWidth)
  const line = bw ? lineXml({ width: bw, color: el.borderColor || '#333333', style: el.borderStyle, opacity: op }) : ''
  specs.unshift({
    kind: 'pic',
    data: media.data,
    box: pbox,
    transparency: op < 1 ? Math.round((1 - op) * 100) : 0,
    xml: (id, blip) => picXml({ id, name: el.name || `Picture ${id}`, box: pbox, blip, srcRect: src ? srcRectXml(src) : '', geom, line, effect: shadowXml(el.shadow, op) }),
  })
  return specs
}

// ---------------------------------------------------------------------------
// Icons (SVG picture, like PowerPoint's own icons) + optional label
// ---------------------------------------------------------------------------

export const iconSpecs = (el) => {
  const box = boxOf(el)
  const op = opacityOf(el)
  const withLabel = !!(el.content && el.showLabel)
  const size = Math.max(4, Math.min(box.w || 60, box.h || 60) * (withLabel ? 0.6 : 0.8))
  const labelSize = num(el.fontSize, 14)
  const labelH = withLabel ? labelSize * 1.5 : 0
  const total = size + (withLabel ? 4 + labelH : 0)
  const top = (box.h - total) / 2
  const icon = ICONS[el.iconType] || ICONS.star
  const color = el.color || '#2E7D32'
  const px = Math.round(size * 4)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="${icon.viewBox}" fill="${icon.fill === 'none' ? 'none' : color}" stroke="${icon.stroke === 'none' ? 'none' : color}" stroke-width="${icon.strokeWidth || 2}" stroke-linecap="round" stroke-linejoin="round" color="${color}">${String(icon.body).replace(/currentColor/g, color)}</svg>`
  const data = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
  const pbox = subBox(box, { x: (box.w - size) / 2, y: top, w: size, h: size })
  const specs = [{
    kind: 'pic',
    data,
    box: pbox,
    transparency: op < 1 ? Math.round((1 - op) * 100) : 0,
    xml: (id, blip) => picXml({ id, name: el.name || `Graphic ${id}`, box: pbox, blip }),
  }]
  if (withLabel) {
    const rel = { x: 0, y: top + size + 4, w: box.w, h: labelH }
    const paragraphs = htmlToParagraphs(String(el.content).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])), {
      frameStyle: { fontSize: labelSize, fontWeight: el.fontWeight || 'normal', fontFamily: fontStack(el.fontFamily || 'Inter'), color: el.textColor || '#333333', textAlign: 'center', whiteSpace: 'nowrap', lineHeight: 1.5 },
      width: box.w,
      lineHeight: 1.5,
    })
    const lbox = subBox(box, rel, { flips: false })
    specs.push({
      kind: 'sp',
      xml: (id) => spXml({ id, name: `Label ${id}`, box: lbox, geom: prstGeomXml('rect'), txBody: txBodyXml({ paragraphs, insets: {}, anchor: 't', wrap: false, opacity: op }), txBox: true }),
    })
  }
  return specs
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const cssBox = (value, fallback) => {
  if (typeof value === 'number') return { top: value, right: value, bottom: value, left: value }
  const parts = String(value ?? fallback).trim().split(/\s+/).map((p) => parseFloat(p) || 0)
  const [t, r = t, b = t, l = r] = parts
  return { top: t, right: r, bottom: b, left: l }
}

const sizesFor = (list, count, total) => {
  const ok = Array.isArray(list) && list.length === count && list.every((v) => Number(v) > 0)
  if (!ok) return Array(count).fill(total / count)
  const sum = list.reduce((a, b) => a + Number(b), 0)
  return list.map((v) => (Number(v) / sum) * total)
}

const DASH = { dashed: 'dash', dotted: 'sysDot' }

const cellBorder = (tag, b, fb) => {
  if (b === null || b?.width === 0) return `<a:${tag} w="0"><a:noFill/></a:${tag}>`
  const width = b?.width ?? fb.width
  const color = parseColor(b?.color || fb.color)
  if (!(width > 0) || !color) return `<a:${tag} w="0"><a:noFill/></a:${tag}>`
  const style = b?.style || fb.style
  return `<a:${tag} w="${emu(width)}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill>${srgb(color, fb.opacity)}</a:solidFill><a:prstDash val="${DASH[style] || 'solid'}"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/></a:${tag}>`
}

const escText = (t) => String(t ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

export const tableSpecs = (el, sctx) => {
  const box = boxOf(el)
  const op = opacityOf(el)
  const cells = getTableCells(el)
  const rows = cells.length
  const cols = cells[0]?.length || 1
  const colW = sizesFor(el.colWidths, cols, box.w)
  const rowH = sizesFor(el.rowHeights, rows, box.h)
  const fb = { width: el.borderWidth ?? 1, color: el.borderColor || '#9ca3af', style: el.borderStyle || 'solid', opacity: op }
  const pad = cssBox(el.cellPadding, '6px 8px')

  // cells covered by a merged neighbour
  const cover = cells.map((row) => row.map(() => null))
  cells.forEach((row, r) => row.forEach((cell, c) => {
    if (cell.hidden) return
    const rs = Math.max(1, num(cell.rowSpan, 1))
    const cs = Math.max(1, num(cell.colSpan, 1))
    for (let rr = r; rr < Math.min(rows, r + rs); rr++) {
      for (let cc = c; cc < Math.min(cols, c + cs); cc++) {
        if (rr === r && cc === c) continue
        cover[rr][cc] = { h: cc > c, v: rr > r }
      }
    }
  }))

  const rowsXml = cells.map((row, r) => {
    const tcs = row.map((cell, c) => {
      const cov = cover[r][c]
      if (cov || cell.hidden) {
        const attrs = cov ? `${cov.h ? ' hMerge="1"' : ''}${cov.v ? ' vMerge="1"' : ''}` : ' hMerge="1"'
        return `<a:tc${attrs}><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p></a:txBody><a:tcPr/></a:tc>`
      }
      const rs = Math.max(1, Math.min(rows - r, num(cell.rowSpan, 1)))
      const cs = Math.max(1, Math.min(cols - c, num(cell.colSpan, 1)))
      const header = el.headerRow && r === 0
      const width = colW.slice(c, c + cs).reduce((a, b) => a + b, 0)
      const paragraphs = htmlToParagraphs(cell.html || escText(cell.text), {
        frameStyle: {
          fontFamily: fontStack(el.fontFamily || 'Inter'),
          fontSize: num(el.fontSize, 14),
          color: cell.color || el.color || '#1f2937',
          fontWeight: cell.bold || header ? 700 : 'normal',
          fontStyle: cell.italic ? 'italic' : 'normal',
          textAlign: cell.align || el.cellAlign || 'left',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.25,
          padding: `0 ${pad.right}px 0 ${pad.left}px`,
          boxSizing: 'border-box',
        },
        width,
        lineHeight: 1.25,
      })
      const fillColor = cell.fill || (header ? (el.headerFill || '#f3f4f6') : (el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : null))
      const fill = fillColor ? fillXml(fillColor, op) : '<a:noFill/>'
      const b = cell.borders
      const borders = [
        cellBorder('lnL', b ? b.left : undefined, fb),
        cellBorder('lnR', b ? b.right : undefined, fb),
        cellBorder('lnT', b ? b.top : undefined, fb),
        cellBorder('lnB', b ? b.bottom : undefined, fb),
      ].join('')
      const anchor = anchorOf(cell.vAlign, 'middle')
      const spans = `${rs > 1 ? ` rowSpan="${rs}"` : ''}${cs > 1 ? ` gridSpan="${cs}"` : ''}`
      const body = txBodyXml({ paragraphs, tag: 'a:txBody', bodyPr: false, opacity: op, links: sctx.link })
      return `<a:tc${spans}>${body}<a:tcPr marL="${emu(pad.left)}" marR="${emu(pad.right)}" marT="${emu(pad.top)}" marB="${emu(pad.bottom)}" anchor="${anchor}">${borders}${fill}</a:tcPr></a:tc>`
    }).join('')
    return `<a:tr h="${emu(rowH[r])}">${tcs}</a:tr>`
  }).join('')

  const grid = colW.map((w) => `<a:gridCol w="${emu(w)}"/>`).join('')
  return [{
    kind: 'sp',
    xml: (id) => `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${esc(el.name || `Table ${id}`)}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>`
      + `${xfrmXml({ x: box.x, y: box.y, w: box.w, h: box.h }, 'p:xfrm')}`
      + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid>${grid}</a:tblGrid>${rowsXml}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`,
  }]
}

// ---------------------------------------------------------------------------
// Pen drawings -> freeform lines (one shape per pen style)
// ---------------------------------------------------------------------------

export const drawingSpecs = (el) => {
  const box = { ...boxOf(el), flipH: false, flipV: false }
  const op = opacityOf(el)
  const vbW = num(el.width, 1280) || 1
  const vbH = num(el.height, 720) || 1
  const groups = new Map()
  ;(el.paths || []).forEach((p) => {
    const pts = (p?.points || []).filter((q) => Number.isFinite(q?.x) && Number.isFinite(q?.y))
    if (!pts.length) return
    const key = `${p.color}|${p.size}|${p.opacity ?? 1}`
    if (!groups.has(key)) groups.set(key, { color: p.color || '#111827', size: num(p.size, 2), opacity: p.opacity ?? 1, paths: [] })
    const d = pts.length === 1
      ? `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 0.01} ${pts[0].y}`
      : `M ${pts.map((q) => `${q.x} ${q.y}`).join(' L ')}`
    groups.get(key).paths.push({ d, fill: false })
  })
  return [...groups.values()].map((g) => ({
    kind: 'sp',
    xml: (id) => spXml({
      id,
      name: `Ink ${id}`,
      box,
      geom: custGeomXml(g.paths, vbW, vbH),
      line: lineXml({ width: g.size, color: g.color, cap: 'rnd', join: 'round', opacity: op * g.opacity }),
    }),
  }))
}
