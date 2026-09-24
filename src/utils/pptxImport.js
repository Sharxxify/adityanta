// PowerPoint (.pptx) import.
//
// Parsing is done by the vendored pptxtojson engine (src/lib/pptxtojson),
// which resolves themes, colour maps, master/layout inheritance, preset and
// custom geometry, tables, charts and SmartArt drawings. This adapter turns
// its output (points, relative group coordinates) into Adityanta slide
// elements on our 1280x720 canvas, preserving positions and sizes exactly.

import JSZip from 'jszip'
import { parse } from '../lib/pptxtojson/pptxtojson'
import { getShapePath } from '../lib/pptxtojson/shapePath'
import { FONT_SUBSTITUTES } from '../components/Slide/fonts'
import { htmlToText } from '../components/Slide/html'

export const CANVAS_W = 1280
export const CANVAS_H = 720

const LINE_SHAPES = new Set([
  'line', 'straightConnector1', 'bentConnector2', 'bentConnector3', 'bentConnector4', 'bentConnector5',
  'curvedConnector2', 'curvedConnector3', 'curvedConnector4', 'curvedConnector5', 'arc',
])

const round = (n, d = 2) => {
  const f = 10 ** d
  return Math.round((Number(n) || 0) * f) / f
}

// ---------------------------------------------------------------------------
// HTML (text) conversion: points -> canvas pixels, font substitutes
// ---------------------------------------------------------------------------

const cssFontStack = (value) => {
  const families = String(value || '').split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  const out = []
  for (const fam of families) {
    if (!out.includes(fam)) out.push(fam)
    const sub = FONT_SUBSTITUTES[fam.toLowerCase()]
    if (sub && !out.includes(sub)) out.push(sub)
  }
  if (out.length === 0) return ''
  // single quotes: the value lives inside a double-quoted style attribute
  return out.map((f) => `'${f.replace(/'/g, '')}'`).join(', ')
}

/**
 * Convert pptxtojson's HTML (pt units) to canvas px.
 * @param {string} html
 * @param {number} scale      px per pt on our canvas
 * @param {object} [autoFit]  { fontScale (%), lnSpcReduction (%) }
 */
export const convertTextHtml = (html, scale, autoFit = null) => {
  if (!html) return ''
  const fontScale = autoFit?.fontScale ? autoFit.fontScale / 100 : 1
  const lineReduce = autoFit?.lnSpcReduction ? autoFit.lnSpcReduction / 100 : 0
  return html.replace(/style="([^"]*)"/g, (_, style) => {
    let st = style
      // font sizes (autofit shrink applies to text only)
      .replace(/font-size:\s*([\d.]+)pt/g, (_m, v) => `font-size: ${round(parseFloat(v) * scale * fontScale)}px`)
      // any other pt length
      .replace(/(-?[\d.]+)pt\b/g, (_m, v) => `${round(parseFloat(v) * scale)}px`)
      // font families -> stack with metric-compatible substitutes
      .replace(/font-family:\s*([^;]+);?/g, (_m, v) => {
        const stack = cssFontStack(v)
        return stack ? `font-family: ${stack};` : ''
      })
    if (lineReduce) {
      st = st.replace(/line-height:\s*([\d.]+)(;|$)/g, (_m, v, end) => `line-height: ${round(parseFloat(v) * (1 - lineReduce), 4)}${end}`)
    }
    return `style="${st}"`
  })
}

// First run style inside the HTML (used as the element's default typography)
const firstRunStyle = (html) => {
  const out = {}
  const m = /<span style="([^"]*)"/.exec(html || '')
  if (!m) return out
  const style = m[1]
  const size = /font-size:\s*([\d.]+)px/.exec(style)
  const color = /(?:^|;)\s*color:\s*([^;]+)/.exec(style)
  const family = /font-family:\s*([^;]+)/.exec(style)
  const weight = /font-weight:\s*([^;]+)/.exec(style)
  const align = /text-align:\s*([a-z]+)/.exec(html || '')
  if (size) out.fontSize = parseFloat(size[1])
  if (color) out.color = color[1].trim()
  if (family) out.fontFamily = family[1].split(',')[0].trim().replace(/^['"]|['"]$/g, '')
  if (weight && /bold|[6-9]00/.test(weight[1])) out.fontWeight = 'bold'
  if (align) out.textAlign = align[1]
  return out
}

// ---------------------------------------------------------------------------
// Fills / borders
// ---------------------------------------------------------------------------

const parsePct = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

const convertFill = (fill) => {
  if (!fill) return 'transparent'
  if (typeof fill === 'string') return fill || 'transparent'
  switch (fill.type) {
    case 'color': return fill.value || 'transparent'
    case 'gradient': {
      const g = fill.value || {}
      const stops = (g.colors || []).map((c) => ({ offset: parsePct(c.pos), color: c.color }))
      if (stops.length === 0) return 'transparent'
      if (g.path === 'circle' || g.path === 'rect' || g.path === 'shape') return { type: 'radial', stops }
      // pptxtojson rot: 0 = left->right; CSS angle 90deg = left->right
      return { type: 'linear', angle: ((Number(g.rot) || 0) + 90) % 360, stops }
    }
    case 'image': return fill.value?.base64 ? { type: 'image', src: fill.value.base64 } : 'transparent'
    case 'pattern': return fill.value?.foregroundColor || fill.value?.backgroundColor || 'transparent'
    default: return 'transparent'
  }
}

const fillToCss = (fill) => {
  const f = convertFill(fill)
  if (typeof f === 'string') return f
  if (f.type === 'linear') return `linear-gradient(${f.angle}deg, ${f.stops.map((s) => `${s.color} ${s.offset}%`).join(', ')})`
  if (f.type === 'radial') return `radial-gradient(circle, ${f.stops.map((s) => `${s.color} ${s.offset}%`).join(', ')})`
  return 'transparent'
}

const dashStyle = (el) => {
  if (el.borderType === 'dashed') return 'dashed'
  if (el.borderType === 'dotted') return 'dotted'
  return 'solid'
}

const convertShadow = (shadow, scale) => (shadow
  ? { x: round(shadow.h * scale), y: round(shadow.v * scale), blur: round((shadow.blur || 0) * scale), color: shadow.color }
  : undefined)

const convertLineEnd = (end) => (end && end.type && end.type !== 'none'
  ? { type: end.type, width: end.w || end.width || 'med', length: end.len || end.length || 'med' }
  : undefined)

const VALIGN = { up: 'top', mid: 'middle', down: 'bottom' }

// ---------------------------------------------------------------------------
// Element conversion
// ---------------------------------------------------------------------------

/**
 * Resolve an element's absolute box, applying enclosing group transforms
 * (offset, rotation and flips) — groups are flattened on import.
 */
const applyGroupTransforms = (box, groups) => {
  let { left, top, width, height, rotate = 0, flipH = false, flipV = false } = box
  // innermost group first
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    // position inside group -> parent space
    let cx = left + width / 2
    let cy = top + height / 2
    if (g.isFlipH) { cx = g.width - cx; flipH = !flipH; rotate = -rotate }
    if (g.isFlipV) { cy = g.height - cy; flipV = !flipV; rotate = -rotate }
    if (g.rotate) {
      const a = (g.rotate * Math.PI) / 180
      const dx = cx - g.width / 2
      const dy = cy - g.height / 2
      cx = g.width / 2 + dx * Math.cos(a) - dy * Math.sin(a)
      cy = g.height / 2 + dx * Math.sin(a) + dy * Math.cos(a)
      rotate += g.rotate
    }
    left = g.left + cx - width / 2
    top = g.top + cy - height / 2
  }
  return { left, top, width, height, rotate: ((rotate % 360) + 360) % 360, flipH, flipV }
}

/** pptxtojson keypoints (value / 50000) -> raw DrawingML adjust values */
const presetAdjust = (keypoints) => {
  if (!keypoints || typeof keypoints !== 'object') return undefined
  const out = {}
  for (const [k, v] of Object.entries(keypoints)) {
    if (Number.isFinite(v)) out[k] = Math.round(v * 50000)
  }
  return Object.keys(out).length ? out : undefined
}

class Converter {
  constructor({ scale, offsetX, offsetY, frameIndex }) {
    this.scale = scale
    this.offsetX = offsetX
    this.offsetY = offsetY
    this.nextId = (frameIndex + 1) * 1000
    this.warnings = new Set()
  }

  id() {
    this.nextId += 1
    return this.nextId
  }

  box(el, groups) {
    const b = applyGroupTransforms({
      left: Number(el.left) || 0,
      top: Number(el.top) || 0,
      width: Number(el.width) || 0,
      height: Number(el.height) || 0,
      rotate: Number(el.rotate) || 0,
      flipH: !!el.isFlipH,
      flipV: !!el.isFlipV,
    }, groups)
    return {
      x: round(this.offsetX + b.left * this.scale),
      y: round(this.offsetY + b.top * this.scale),
      width: round(b.width * this.scale),
      height: round(b.height * this.scale),
      rotation: round(b.rotate, 2),
      flipH: b.flipH || undefined,
      flipV: b.flipV || undefined,
    }
  }

  textFrame(el) {
    const s = this.scale
    const inset = el.textInset
    const content = convertTextHtml(el.content || '', s, el.autoFit?.type === 'text' ? el.autoFit : null)
    const first = firstRunStyle(content)
    return {
      content,
      verticalAlign: VALIGN[el.vAlign] || 'top',
      padding: inset
        ? { top: round(inset.t * s), right: round(inset.r * s), bottom: round(inset.b * s), left: round(inset.l * s) }
        : { top: round(3.6 * s), right: round(7.2 * s), bottom: round(3.6 * s), left: round(7.2 * s) },
      wrap: el.wrap === false ? false : undefined,
      lineHeight: 1.2,
      fontSize: first.fontSize || round(18 * s),
      fontFamily: first.fontFamily || 'Calibri',
      color: first.color || '#000000',
      // Runs carry their own weight; a bold box would make every plain run bold
      fontWeight: 'normal',
      textAlign: first.textAlign || 'left',
      vertical: el.isVertical ? 'vert' : undefined,
    }
  }

  convert(el, groups = [], extra = {}) {
    if (!el) return []
    const s = this.scale
    switch (el.type) {
      case 'group': {
        const g = {
          left: Number(el.left) || 0,
          top: Number(el.top) || 0,
          width: Number(el.width) || 0,
          height: Number(el.height) || 0,
          rotate: Number(el.rotate) || 0,
          isFlipH: !!el.isFlipH,
          isFlipV: !!el.isFlipV,
        }
        return (el.elements || []).flatMap((child) => this.convert(child, [...groups, g], extra))
      }
      case 'diagram': {
        const g = { left: Number(el.left) || 0, top: Number(el.top) || 0, width: Number(el.width) || 0, height: Number(el.height) || 0, rotate: 0 }
        return (el.elements || []).flatMap((child) => this.convert(child, [...groups, g], extra))
      }
      case 'text': {
        const b = this.box(el, groups)
        const tf = this.textFrame(el)
        const bg = fillToCss(el.fill)
        const hasText = htmlToText(tf.content).trim().length > 0
        if (!hasText && bg === 'transparent' && !(el.borderWidth > 0)) return []
        return [{
          id: this.id(),
          type: 'text',
          ...b,
          flipH: undefined,
          flipV: undefined,
          ...tf,
          backgroundColor: bg,
          borderWidth: el.borderWidth ? round(el.borderWidth * s) : 0,
          borderColor: el.borderColor || '#000000',
          borderStyle: dashStyle(el),
          shadow: convertShadow(el.shadow, s),
          name: el.name,
          ...extra,
        }]
      }
      case 'shape': {
        const b = this.box(el, groups)
        const isLine = LINE_SHAPES.has(el.shapType)
        const tf = el.content ? this.textFrame(el) : null
        const sw = el.borderWidth ? round(el.borderWidth * s, 2) : 0
        return [{
          id: this.id(),
          type: 'shape',
          shapeType: 'custom',
          ...b,
          geometry: {
            ...(el.path
              ? { path: el.path, viewBox: { width: el.pathViewBox?.width || el.width, height: el.pathViewBox?.height || el.height }, strokeOnly: !!el.strokeOnly || isLine }
              : { path: `M 0 0 L ${el.width} 0 L ${el.width} ${el.height} L 0 ${el.height} Z`, viewBox: { width: el.width, height: el.height } }),
            // preset name + adjust values: text rectangle, native PPTX export
            preset: el.shapType && el.shapType !== 'custom' ? el.shapType : undefined,
            adj: presetAdjust(el.keypoints),
          },
          fill: isLine || el.strokeOnly ? 'transparent' : convertFill(el.fill),
          strokeColor: el.borderColor || '#000000',
          strokeWidth: sw,
          borderStyle: dashStyle(el),
          headEnd: convertLineEnd(el.headEnd),
          tailEnd: convertLineEnd(el.tailEnd),
          shadow: convertShadow(el.shadow, s),
          content: tf ? tf.content : '',
          ...(tf ? {
            verticalAlign: tf.verticalAlign,
            padding: tf.padding,
            lineHeight: tf.lineHeight,
            fontSize: tf.fontSize,
            fontFamily: tf.fontFamily,
            color: tf.color,
            textAlign: tf.textAlign,
            wrap: tf.wrap,
          } : {}),
          name: el.name,
          ...extra,
        }]
      }
      case 'image': {
        const src = el.base64 || el.blob || ''
        if (!src) return []
        const b = this.box(el, groups)
        const rect = el.rect
        const crop = rect ? {
          l: (rect.l || 0) / 100,
          t: (rect.t || 0) / 100,
          r: (rect.r || 0) / 100,
          b: (rect.b || 0) / 100,
        } : undefined
        const out = {
          id: this.id(),
          type: 'image',
          ...b,
          src,
          crop,
          objectFit: 'fill',
          borderWidth: el.borderWidth ? round(el.borderWidth * s) : 0,
          borderColor: el.borderColor,
          borderStyle: dashStyle(el),
          name: el.name,
          ...extra,
        }
        const geom = String(el.geom || 'rect').replace(/^custom:/, '')
        if (geom === 'ellipse') out.clipShape = 'ellipse'
        else if (geom === 'roundRect') out.borderRadius = round(Math.min(b.width, b.height) * 0.1667)
        else if (el.custPath && !/[Aa]/.test(el.custPath)) {
          // freeform outline (in points, relative to the picture's box)
          out.clipPath = scaleSimplePath(el.custPath, s)
        }
        else if (geom && geom !== 'rect' && geom !== 'custom') {
          try {
            const d = getShapePath(geom, el.width, el.height, {})
            if (d) out.clipPath = scaleSimplePath(d, s)
          } catch { /* keep rectangular */ }
        }
        return [out]
      }
      case 'table': {
        const b = this.box(el, groups)
        const rows = (el.data || []).map((row) => row.map((cell) => ({
          html: convertTextHtml(cell.text || '', s),
          text: htmlToText(cell.text || ''),
          fill: cell.fillColor || undefined,
          color: cell.fontColor || undefined,
          bold: cell.fontBold ? true : undefined,
          italic: cell.fontItalic ? true : undefined,
          vAlign: cell.vAlign === 'mid' ? 'middle' : cell.vAlign === 'down' ? 'bottom' : cell.vAlign === 'up' ? 'top' : cell.vAlign,
          rowSpan: cell.rowSpan,
          colSpan: cell.colSpan,
          hidden: cell.hMerge || cell.vMerge ? true : undefined,
          borders: cell.borders ? {
            top: convertBorder(cell.borders.top, s),
            right: convertBorder(cell.borders.right, s),
            bottom: convertBorder(cell.borders.bottom, s),
            left: convertBorder(cell.borders.left, s),
          } : undefined,
        })))
        const cols = Math.max(1, ...rows.map((r) => r.length))
        return [{
          id: this.id(),
          type: 'table',
          ...b,
          rows: rows.length,
          cols,
          cells: rows,
          data: rows.map((r) => r.map((c) => c.text)),
          colWidths: (el.colWidths || []).map((w) => round(w * s)),
          rowHeights: (el.rowHeights || []).map((h) => round(h * s)),
          // only the borders PowerPoint draws (cell / table-style edges)
          borderWidth: 0,
          borderColor: '#000000',
          cellPadding: `${round(3.6 * s)}px ${round(7.2 * s)}px`,
          fontSize: round(18 * s),
          fontFamily: 'Calibri',
          ...extra,
        }]
      }
      case 'chart': {
        const b = this.box(el, groups)
        return [convertChart(el, b, this.id(), extra, this.scale)]
      }
      case 'math': {
        const b = this.box(el, groups)
        if (el.picBase64) {
          return [{ id: this.id(), type: 'image', ...b, src: el.picBase64, objectFit: 'fill', ...extra }]
        }
        if (el.text) {
          return [{ id: this.id(), type: 'text', ...b, content: convertTextHtml(el.text, s), lineHeight: 1.2, padding: 0, ...extra }]
        }
        return []
      }
      case 'video':
      case 'audio': {
        const b = this.box(el, groups)
        this.warnings.add(el.type === 'video' ? 'Embedded videos are shown as placeholders — re-add them from the Media menu.' : 'Embedded audio is shown as a placeholder — re-add it from the Media menu.')
        return [{ id: this.id(), type: el.type, ...b, src: '', title: el.type === 'video' ? 'Video' : 'Audio', ...extra }]
      }
      default:
        return []
    }
  }
}

const convertBorder = (border, scale) => {
  if (!border) return undefined
  if (!border.borderWidth) return null
  return {
    width: Math.max(0.5, round(border.borderWidth * scale, 2)),
    color: border.borderColor || '#000000',
    style: border.borderType === 'dashed' ? 'dashed' : border.borderType === 'dotted' ? 'dotted' : 'solid',
  }
}

const scaleSimplePath = (d, s) => d.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (n) => `${round(parseFloat(n) * s, 2)}`)

const CHART_TYPES = {
  barChart: 'column',
  bar3DChart: 'column',
  lineChart: 'line',
  line3DChart: 'line',
  pieChart: 'pie',
  pie3DChart: 'pie',
  ofPieChart: 'pie',
  doughnutChart: 'doughnut',
  areaChart: 'area',
  area3DChart: 'area',
  scatterChart: 'scatter',
  bubbleChart: 'scatter',
  radarChart: 'line',
  stockChart: 'line',
  surfaceChart: 'area',
  surface3DChart: 'area',
}

const convertChart = (el, box, id, extra, scale) => {
  let chartType = CHART_TYPES[el.chartType] || 'column'
  if (chartType === 'column' && el.barDir === 'bar') chartType = 'bar'
  let series = []
  let categories = []
  if (Array.isArray(el.data) && el.data.length && !Array.isArray(el.data[0])) {
    series = el.data.map((item, i) => ({
      name: String(item.key ?? `Series ${i + 1}`),
      values: (item.values || []).map((v) => Number(v.y) || 0),
      color: el.colors?.[i] || undefined,
    }))
    const labels = el.data[0]?.xlabels || {}
    const n = Math.max(...series.map((s) => s.values.length), 0)
    categories = Array.from({ length: n }, (_, i) => labels[i] ?? labels[String(i)] ?? String(i + 1))
  } else if (Array.isArray(el.data) && Array.isArray(el.data[0])) {
    // scatter: [xs, ys...]
    const [xs, ...ys] = el.data
    categories = (xs || []).map(String)
    series = ys.map((vals, i) => ({ name: `Series ${i + 1}`, values: vals.map(Number), color: el.colors?.[i] }))
  }
  if (chartType === 'pie' || chartType === 'doughnut') {
    series = series.slice(0, 1).map((s) => ({ ...s, color: undefined, pointColors: el.colors }))
  }
  const x = el.extras || {}
  const sc = scale || 1
  return {
    id,
    type: 'chart',
    ...box,
    chartType,
    series,
    categories,
    colors: el.colors,
    grouping: el.grouping,
    holeSize: el.holeSize ? parseFloat(el.holeSize) : undefined,
    marker: el.marker,
    title: x.title,
    titleSize: x.titleSize ? round(x.titleSize * sc) : undefined,
    titleBold: x.title ? x.titleBold : undefined,
    fontSize: x.fontSize ? round(x.fontSize * sc) : undefined,
    textColor: x.textColor,
    legend: x.legend === undefined ? undefined : x.legend,
    valAxis: x.valAxis,
    catAxis: x.catAxis,
    dataLabels: x.dataLabels,
    gapWidth: x.gapWidth,
    overlap: x.overlap,
    firstSliceAngle: x.firstSliceAngle,
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

const convertBackground = (fill) => {
  if (!fill) return { backgroundColor: '#ffffff', backgroundImage: null }
  if (fill.type === 'image') {
    const src = fill.value?.base64 || fill.value?.picBase64 || (typeof fill.value === 'string' ? fill.value : '')
    return { backgroundColor: '#ffffff', backgroundImage: src || null }
  }
  if (fill.type === 'gradient') {
    const css = fillToCss(fill)
    return { backgroundColor: css === 'transparent' ? '#ffffff' : css, backgroundImage: null }
  }
  if (fill.type === 'pattern') return { backgroundColor: fill.value?.backgroundColor || '#ffffff', backgroundImage: null }
  const v = typeof fill.value === 'string' ? fill.value : ''
  return { backgroundColor: v && v !== '#fff' ? v : '#ffffff', backgroundImage: null }
}

const noteText = (html) => htmlToText(String(html || '').replace(/<\/(p|li)>/gi, '\n')).replace(/\n{3,}/g, '\n\n').trim()

const slideTitleFrom = (elements, index) => {
  const titled = elements.find((e) => e.type === 'text' && /title/i.test(e.name || ''))
  const text = htmlToText(titled?.content || '').replace(/\s+/g, ' ').trim()
  if (text) return text.slice(0, 60)
  return index === 0 ? 'Cover' : `Slide ${index + 1}`
}

async function readTitle(file, zip) {
  try {
    const core = zip.file('docProps/core.xml')
    if (core) {
      const xml = await core.async('string')
      const m = /<dc:title>([^<]*)<\/dc:title>/.exec(xml)
      if (m && m[1].trim()) return m[1].trim()
    }
  } catch { /* ignore */ }
  return (file.name || 'Presentation').replace(/\.[^.]+$/, '') || 'Imported Presentation'
}

/**
 * Parse a .pptx file into Adityanta frames.
 * @param {File|Blob} file
 * @returns {Promise<{ title: string, frames: object[], warnings: string[], sourceSize: {width:number,height:number} }>}
 */
export async function parsePPTX(file) {
  const buffer = await file.arrayBuffer()
  let zip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error('This file is not a valid PowerPoint (.pptx) file.')
  }
  if (!zip.file('ppt/presentation.xml')) {
    throw new Error('This file is not a PowerPoint presentation (missing ppt/presentation.xml).')
  }

  let result
  try {
    result = await parse(buffer, { imageMode: 'base64', videoMode: 'none', audioMode: 'none', singleLineSpacingFactor: 1.2 })
  } catch (error) {
    console.error('[pptxImport] parse failed:', error)
    throw new Error('Could not read this presentation. It may be corrupted or use an unsupported feature.')
  }

  const W = result.size?.width || 960
  const H = result.size?.height || 540
  // Fit the source slide into our 16:9 canvas (letterbox for 4:3 etc.)
  const scale = Math.min(CANVAS_W / W, CANVAS_H / H)
  const offsetX = round((CANVAS_W - W * scale) / 2)
  const offsetY = round((CANVAS_H - H * scale) / 2)

  const warnings = new Set()
  const frames = (result.slides || []).map((slide, index) => {
    const conv = new Converter({ scale, offsetX, offsetY, frameIndex: index })
    const decorations = (slide.layoutElements || []).flatMap((el) => conv.convert(el, [], { locked: true, source: el.__source || 'layout' }))
    const content = (slide.elements || []).flatMap((el) => conv.convert(el))
    conv.warnings.forEach((w) => warnings.add(w))
    const bg = convertBackground(slide.fill)
    const elements = [...decorations, ...content].map((e) => {
      // drop undefined keys so saved projects stay small and clean
      const out = {}
      for (const [k, v] of Object.entries(e)) if (v !== undefined) out[k] = v
      return out
    })
    return {
      id: index + 1,
      title: slideTitleFrom(content, index),
      preview: slideTitleFrom(content, index),
      ...bg,
      notes: noteText(slide.note),
      transition: 'fade',
      elements,
    }
  }).filter(Boolean)

  if (frames.length === 0) throw new Error('No slides found in this presentation.')

  return {
    title: await readTitle(file, zip),
    frames,
    warnings: [...warnings],
    sourceSize: { width: W, height: H },
  }
}

export default parsePPTX
