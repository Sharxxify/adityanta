// Native, editable PowerPoint export.
//
// Every slide object becomes a real PowerPoint object: text boxes with runs
// and paragraphs, preset or freeform shapes, lines with arrowheads,
// pictures (with crop / clip / border), tables, charts, audio/video, icons
// (SVG) and pen ink (freeforms). pptxgenjs builds the package (slides,
// media, charts, notes); our own DrawingML replaces its generic objects
// where PowerPoint supports more than pptxgenjs writes (see ./elements.js).
// Anything that cannot be expressed natively is rendered to a picture so
// the slide still looks exactly like the canvas.

import JSZip from 'jszip'
import logger from '../logger'
import { renderElementToBlob, SLIDE_WIDTH, SLIDE_HEIGHT } from '../../components/Slide/rasterize'
import { normalizeElement } from '../../components/Slide/model'
import { parseColor, parseCssGradient, fillXml, esc } from './xml'
import { releaseTextHost } from './htmlText'
import {
  textSpecs, shapeSpecs, imageSpecs, iconSpecs, tableSpecs, drawingSpecs, boxOf, opacityOf, fitCrop,
} from './elements'

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const inch = (px) => (Number(px) || 0) / 96

// ---------------------------------------------------------------------------
// Media loading (blob:, data:, asset and remote URLs)
// ---------------------------------------------------------------------------

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = () => reject(r.error)
  r.readAsDataURL(blob)
})

const sniffType = async (blob) => {
  if (blob.type && !/octet-stream/.test(blob.type)) return blob.type
  const b = new Uint8Array(await blob.slice(0, 32).arrayBuffer())
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png'
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg'
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'image/webp'
  if (/<svg|<\?xml/i.test(new TextDecoder().decode(b))) return 'image/svg+xml'
  return blob.type || 'application/octet-stream'
}

const fetchBlob = async (src) => {
  const local = /^(data|blob):/i.test(src)
  const res = await fetch(src, local ? undefined : { mode: 'cors', cache: 'force-cache' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.blob()
}

const decodeImage = (url, cors = false) => new Promise((resolve, reject) => {
  const img = new Image()
  if (cors) img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = () => reject(new Error('image decode failed'))
  img.src = url
})

const drawToPng = (img, w, h) => {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w))
  canvas.height = Math.max(1, Math.round(h))
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

// Formats every PowerPoint version opens; anything else is converted to PNG
const NATIVE_IMAGES = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/gif': 'gif' }

const loadImage = async (src) => {
  let blob
  try {
    blob = await fetchBlob(src)
  } catch {
    const img = await decodeImage(src, true)
    return { data: drawToPng(img, img.naturalWidth, img.naturalHeight), width: img.naturalWidth, height: img.naturalHeight, ext: 'png' }
  }
  const type = await sniffType(blob)
  const url = URL.createObjectURL(blob)
  try {
    const img = await decodeImage(url)
    let w = img.naturalWidth
    let h = img.naturalHeight
    if (type === 'image/svg+xml') {
      if (!w || !h) { w = 1024; h = 1024 }
      const s = Math.max(1, 2048 / Math.max(w, h))
      return { data: drawToPng(img, w * s, h * s), width: w, height: h, ext: 'png' }
    }
    const ext = NATIVE_IMAGES[type]
    if (ext) {
      const typed = blob.type === type ? blob : new Blob([blob], { type })
      return { data: await blobToDataUrl(typed), width: w, height: h, ext }
    }
    return { data: drawToPng(img, w, h), width: w, height: h, ext: 'png' }
  } finally {
    URL.revokeObjectURL(url)
  }
}

const loadMedia = async (src, fallbackType) => {
  const blob = await fetchBlob(src)
  const type = blob.type && !/octet-stream/.test(blob.type) ? blob.type : fallbackType
  return blobToDataUrl(blob.type === type ? blob : new Blob([blob], { type }))
}

const cached = (fn) => {
  const cache = new Map()
  return (src) => {
    if (!cache.has(src)) {
      cache.set(src, fn(src).catch((err) => {
        logger.warn('PPTX export: could not load media', String(src).slice(0, 80), err)
        return null
      }))
    }
    return cache.get(src)
  }
}

// ---------------------------------------------------------------------------
// Charts (native, editable in PowerPoint's chart editor)
// ---------------------------------------------------------------------------

const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && !(typeof v === 'number' && !Number.isFinite(v))))
const LEGEND_POS = new Set(['b', 'l', 'r', 't', 'tr'])

const addChart = (pptx, slide, el) => {
  const box = boxOf(el)
  const kind = el.chartType || 'column'
  const T = pptx.ChartType
  const type = { column: T.bar, bar: T.bar, line: T.line, pie: T.pie, doughnut: T.doughnut, area: T.area, scatter: T.scatter }[kind] || T.bar
  const series = (el.series || []).filter((s) => Array.isArray(s.values))
  if (!series.length) throw new Error('empty chart')
  const cats = (el.categories?.length ? el.categories : series[0].values.map((_, i) => i + 1)).map(String)
  const data = kind === 'scatter'
    ? [{ name: 'X', values: cats.map((c) => Number(c) || 0) }, ...series.map((s) => ({ name: String(s.name ?? ''), values: s.values.map((v) => Number(v) || 0) }))]
    : series.map((s) => ({ name: String(s.name ?? ''), labels: cats, values: s.values.map((v) => Number(v) || 0) }))
  const isPie = kind === 'pie' || kind === 'doughnut'
  const hex = (c) => parseColor(c)?.hex
  const colors = (isPie ? (series[0].pointColors || el.colors || []) : series.map((s, i) => s.color || el.colors?.[i])).map(hex)
  const pt = (px) => (px ? Math.round(px * 0.75 * 10) / 10 : undefined)
  const textColor = hex(el.textColor)
  const legendPos = el.legend === null ? null : (el.legend?.pos || (series.length > 1 || isPie ? 'b' : null))
  const va = el.valAxis || {}
  const ca = el.catAxis || {}
  const dl = el.dataLabels || {}
  const opts = clean({
    x: inch(box.x),
    y: inch(box.y),
    w: inch(box.w),
    h: inch(box.h),
    objectName: el.name || 'Chart',
    barDir: kind === 'bar' ? 'bar' : 'col',
    barGrouping: el.grouping === 'stacked' || el.grouping === 'percentStacked' ? el.grouping : (kind === 'column' || kind === 'bar' ? 'clustered' : undefined),
    chartColors: colors.length && colors.every(Boolean) ? colors : undefined,
    showLegend: !!legendPos,
    legendPos: legendPos && LEGEND_POS.has(legendPos) ? legendPos : undefined,
    legendFontSize: pt(el.fontSize),
    legendColor: textColor,
    showTitle: !!el.title,
    title: el.title || undefined,
    titleFontSize: el.title ? pt(el.titleSize || (el.fontSize || 12) * 1.3) : undefined,
    titleBold: el.title ? !!el.titleBold : undefined,
    titleColor: textColor,
    catAxisLabelColor: textColor,
    valAxisLabelColor: textColor,
    catAxisLabelFontSize: pt(el.fontSize),
    valAxisLabelFontSize: pt(el.fontSize),
    valAxisMinVal: va.min,
    valAxisMaxVal: va.max,
    valAxisMajorUnit: va.majorUnit,
    valAxisHidden: va.deleted || undefined,
    catAxisHidden: ca.deleted || undefined,
    valAxisOrientation: va.reversed ? 'maxMin' : undefined,
    catAxisOrientation: ca.reversed ? 'maxMin' : undefined,
    valAxisLabelFormatCode: va.numFmt && va.numFmt !== 'General' ? va.numFmt : undefined,
    valGridLine: isPie ? undefined : (va.gridlines === false ? { style: 'none' } : { color: 'D9D9D9', size: 0.75 }),
    catGridLine: isPie ? undefined : (ca.gridlines ? { color: 'D9D9D9', size: 0.75 } : { style: 'none' }),
    showValue: !!dl.showVal,
    showPercent: !!dl.showPercent,
    showLabel: !!dl.showCatName,
    dataLabelColor: textColor,
    dataLabelFontSize: pt(el.fontSize),
    barGapWidthPct: el.gapWidth,
    barOverlapPct: el.overlap,
    holeSize: kind === 'doughnut' ? (el.holeSize || 50) : undefined,
    firstSliceAng: el.firstSliceAngle,
    lineDataSymbol: kind === 'line' || kind === 'scatter' ? (el.marker === false && kind !== 'scatter' ? 'none' : 'circle') : undefined,
    lineSize: kind === 'scatter' ? 0 : undefined,
  })
  slide.addChart(type, data, opts)
}

// ---------------------------------------------------------------------------
// Post-processing of the generated package
// ---------------------------------------------------------------------------

const HYPERLINK = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink'

const srcRectFor = ({ l = 0, t = 0, r = 0, b = 0 }) => `<a:srcRect l="${Math.round(l * 100000)}" t="${Math.round(t * 100000)}" r="${Math.round(r * 100000)}" b="${Math.round(b * 100000)}"/>`

const patchSlide = (xml, fix) => {
  const idName = /<p:cNvPr id="(\d+)" name="(adx\d+)"/
  let out = xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (m) => {
    const t = idName.exec(m)
    const spec = t && fix.objects.get(t[2])
    return spec ? spec.xml(t[1]) : m
  })
  out = out.replace(/<p:pic>[\s\S]*?<\/p:pic>/g, (m) => {
    const t = idName.exec(m)
    const spec = t && fix.objects.get(t[2])
    if (!spec) return m
    const blip = /<a:blip\b[\s\S]*?<\/a:blip>|<a:blip\b[^>]*\/>/.exec(m)
    return blip ? spec.xml(t[1], blip[0]) : m
  })
  if (fix.bgFill) out = out.replace(/<p:bg>[\s\S]*?<\/p:bg>/, `<p:bg><p:bgPr>${fix.bgFill}<a:effectLst/></p:bgPr></p:bg>`)
  if (fix.bgCrop) out = out.replace(/(<p:bg>[\s\S]*?)<a:srcRect\/>/, `$1${srcRectFor(fix.bgCrop)}`)
  return out
}

const addLinkRels = (relsXml, links) => {
  const used = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]))
  let next = Math.max(0, ...used) + 1
  const map = new Map()
  const rels = links.map((url) => {
    const id = `rId${next++}`
    map.set(url, id)
    return `<Relationship Id="${id}" Type="${HYPERLINK}" Target="${esc(url)}" TargetMode="External"/>`
  }).join('')
  return { xml: relsXml.replace('</Relationships>', `${rels}</Relationships>`), map }
}

/** Store identical media (e.g. one background on every slide) once */
const dedupeMedia = async (zip) => {
  if (!globalThis.crypto?.subtle) return
  const seen = new Map()
  const rename = new Map()
  for (const f of zip.file(/^ppt\/media\//)) {
    const bytes = await f.async('uint8array')
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    const ext = f.name.split('.').pop().toLowerCase()
    const key = `${ext}:${bytes.length}:${Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')}`
    const name = f.name.slice('ppt/media/'.length)
    if (seen.has(key)) {
      rename.set(name, seen.get(key))
      zip.remove(f.name)
    } else seen.set(key, name)
  }
  if (!rename.size) return
  for (const rf of zip.file(/_rels\/[^/]+\.rels$/)) {
    const xml = await rf.async('string')
    let changed = false
    const next = xml.replace(/Target="\.\.\/media\/([^"]+)"/g, (m, n) => {
      if (!rename.has(n)) return m
      changed = true
      return `Target="../media/${rename.get(n)}"`
    })
    if (changed) zip.file(rf.name, next)
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Build and download an editable .pptx of the deck.
 * @param {object[]} frames
 * @param {string} title
 * @param {object} [opts] { editorBackground, onProgress({ progress 0..1, message }) }
 * @returns {Promise<{ blob: Blob, warnings: string[] }>}
 */
export const buildPptx = async (frames, title, { editorBackground = null, onProgress } = {}) => {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'ADITYANTA_WIDE', width: SLIDE_WIDTH / 96, height: SLIDE_HEIGHT / 96 })
  pptx.layout = 'ADITYANTA_WIDE'
  pptx.author = 'Adityanta'
  pptx.company = 'Adityanta'
  pptx.title = title || 'Presentation'
  pptx.subject = 'Created with Adityanta Slide Builder'

  const images = cached(loadImage)
  const videos = cached((src) => loadMedia(src, 'video/mp4'))
  const audios = cached((src) => loadMedia(src, 'audio/mpeg'))
  const warnings = new Set()
  const fixes = []
  let seq = 0

  try {
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i] || {}
      onProgress?.({ progress: i / Math.max(1, frames.length), message: `Slide ${i + 1} of ${frames.length}` })
      const slide = pptx.addSlide()
      const fix = { objects: new Map(), links: [] }
      fixes.push(fix)
      const sctx = {
        link: (url) => {
          let k = fix.links.indexOf(url)
          if (k < 0) { fix.links.push(url); k = fix.links.length - 1 }
          return `__ADXLINK${k}__`
        },
      }

      // Background (same precedence as the canvas: slide image > slide colour > project image)
      const color = frame.backgroundColor
      const hasColor = color && color !== 'transparent'
      const bgImage = frame.backgroundImage || (!hasColor && editorBackground ? editorBackground : null)
      let bgDone = false
      if (bgImage) {
        const media = await images(bgImage)
        if (media) {
          slide.background = { data: media.data, path: `background.${media.ext}` }
          fix.bgCrop = fitCrop('cover', media.width, media.height, SLIDE_WIDTH, SLIDE_HEIGHT)
          bgDone = true
        } else warnings.add('A background image could not be loaded and was left out.')
      }
      if (!bgDone && hasColor && /gradient\(/i.test(color)) {
        const g = parseCssGradient(color)
        if (g) { slide.background = { color: 'FFFFFF' }; fix.bgFill = fillXml(g); bgDone = true }
      }
      if (!bgDone) slide.background = { color: (hasColor && parseColor(color)?.hex) || 'FFFFFF' }

      const place = (spec) => {
        const token = `adx${seq++}`
        fix.objects.set(token, spec)
        if (spec.kind === 'pic') {
          const b = spec.box
          slide.addImage({ data: spec.data, x: inch(b.x), y: inch(b.y), w: inch(Math.max(1, b.w)), h: inch(Math.max(1, b.h)), transparency: spec.transparency || 0, objectName: token })
        } else {
          slide.addText('', { x: 0, y: 0, w: 1, h: 1, objectName: token })
        }
      }

      const addRaster = async (el) => {
        const box = boxOf(el)
        if (!(box.w > 0 && box.h > 0)) return
        const blob = await renderElementToBlob(el, { scale: 2 })
        if (!blob) return
        const data = await blobToDataUrl(blob)
        const op = opacityOf(el)
        slide.addImage({
          data,
          x: inch(box.x),
          y: inch(box.y),
          w: inch(box.w),
          h: inch(box.h),
          rotate: box.rot || 0,
          transparency: op < 1 ? Math.round((1 - op) * 100) : 0,
          objectName: el.name || `Picture ${el.id ?? ''}`.trim(),
        })
      }

      for (const raw of frame.elements || []) {
        const el = normalizeElement(raw)
        if (!el || el.hidden || el.isPlaceholder) continue
        try {
          let specs
          switch (el.type) {
            case 'text': specs = textSpecs(el, sctx); break
            case 'shape': specs = shapeSpecs(el, sctx); break
            case 'table': specs = tableSpecs(el, sctx); break
            case 'drawing': specs = drawingSpecs(el); break
            case 'icon': specs = iconSpecs(el); break
            case 'image': {
              const media = el.src ? await images(el.src) : null
              if (el.src && !media) warnings.add('Some pictures could not be loaded (blocked by their website) and were left out.')
              specs = media ? imageSpecs(el, media) : []
              break
            }
            case 'chart':
              addChart(pptx, slide, el)
              specs = []
              break
            case 'video':
            case 'audio': {
              const box = boxOf(el)
              const pos = { x: inch(box.x), y: inch(box.y), w: inch(box.w), h: inch(box.h), objectName: el.title || (el.type === 'video' ? 'Video' : 'Audio') }
              const poster = el.poster ? await images(el.poster) : null
              const cover = poster ? poster.data : undefined
              if (el.type === 'video' && el.isYouTube && el.src) {
                slide.addMedia({ type: 'online', link: el.src, ...pos, ...(cover ? { cover } : {}) })
                specs = []
              } else if (el.src) {
                const data = await (el.type === 'video' ? videos : audios)(el.src)
                if (data) {
                  slide.addMedia({ type: el.type, data, ...pos, ...(cover ? { cover } : {}) })
                  specs = []
                } else {
                  warnings.add('Some audio/video files could not be embedded; a placeholder picture was used.')
                  specs = [{ kind: 'raster' }]
                }
              } else specs = [{ kind: 'raster' }]
              break
            }
            default:
              specs = [{ kind: 'raster' }]
          }
          for (const spec of specs) {
            if (spec.kind === 'raster') await addRaster(el)
            else place(spec)
          }
        } catch (err) {
          logger.warn('PPTX export: element exported as a picture', el.type, err)
          try { await addRaster(el) } catch { /* skip element */ }
        }
      }

      if (frame.notes) slide.addNotes(String(frame.notes))
    }

    onProgress?.({ progress: 0.95, message: 'Packaging…' })
    const buffer = await pptx.write({ outputType: 'arraybuffer', compression: true })
    const zip = await JSZip.loadAsync(buffer)
    for (let i = 0; i < fixes.length; i++) {
      const fix = fixes[i]
      const path = `ppt/slides/slide${i + 1}.xml`
      const file = zip.file(path)
      if (!file) continue
      let xml = patchSlide(await file.async('string'), fix)
      if (fix.links.length) {
        const relsPath = `ppt/slides/_rels/slide${i + 1}.xml.rels`
        const rels = await zip.file(relsPath).async('string')
        const { xml: relsXml, map } = addLinkRels(rels, fix.links)
        zip.file(relsPath, relsXml)
        fix.links.forEach((url, k) => { xml = xml.split(`__ADXLINK${k}__`).join(map.get(url)) })
      }
      zip.file(path, xml)
    }
    await dedupeMedia(zip)
    const blob = await zip.generateAsync({ type: 'blob', mimeType: PPTX_MIME, compression: 'DEFLATE', compressionOptions: { level: 6 } })
    onProgress?.({ progress: 1, message: 'Done' })
    return { blob, warnings: [...warnings] }
  } finally {
    releaseTextHost()
  }
}

export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

