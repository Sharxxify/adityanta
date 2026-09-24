// Video export: the presentation, played exactly like the slideshow.
//
// - Same camera as the slideshow (utils/presentationCamera): overview first,
//   then a Van Wijk zoom/pan to every slide at the "Slide Transition Speed",
//   each slide filling 90% of the frame, no zoom limit.
// - Frame-accurate timing: every video frame is drawn for its exact moment on
//   the timeline and encoded with WebCodecs into a real H.264 MP4, so every
//   slide (the last one included) is on screen for exactly the chosen time,
//   and the file has a correct duration. It is faster than real time and does
//   not depend on the tab staying in front.
// - Browsers without WebCodecs fall back to real-time recording (WebM).

import { Muxer, ArrayBufferTarget } from 'mp4-muxer'
import { renderSlideToCanvas, renderElementToBlob, SLIDE_WIDTH } from '../components/Slide/rasterize'
import {
  frameLayout, worldBoundsOf, viewForBox, cameraFromView, viewTween, readNavSpeedMs, SLIDE_FIT, OVERVIEW_FIT,
} from './presentationCamera'
import { hasHeader, headerTextElement, headerWorldBox } from './exportFrames'
import { safeFileName } from './exportUtils'
import logger from './logger'

export const VIDEO_W = 1920
export const VIDEO_H = 1080
export const FPS = 30
const INTRO_MS = 1500
const OUTRO_MS = 1500

// ─── Timeline ──────────────────────────────────────────────────────────────

/**
 * Camera timeline: overview hold, then (move, hold) per slide, optionally
 * back to the overview.
 * @returns {{ segments: object[], totalMs: number, world: object, layout: object[] }}
 */
export const buildTimeline = (frames, { holdMs, navMs = readNavSpeedMs(), endOnOverview = true, header = null } = {}) => {
  const layout = frameLayout(frames)
  const world = worldBoundsOf(layout)
  // the overview shot also shows the project header, like the canvas
  let ov = { minX: world.minX, minY: world.minY, maxX: world.maxX, maxY: world.maxY }
  if (hasHeader(header)) {
    const hb = headerWorldBox(header)
    ov = { minX: Math.min(ov.minX, hb.x), minY: Math.min(ov.minY, hb.y), maxX: Math.max(ov.maxX, hb.x + hb.width), maxY: Math.max(ov.maxY, hb.y + hb.height) }
  }
  const overview = viewForBox({ x: ov.minX, y: ov.minY, width: Math.max(1, ov.maxX - ov.minX), height: Math.max(1, ov.maxY - ov.minY) }, VIDEO_W, VIDEO_H, OVERVIEW_FIT)
  const segments = []
  let t = 0
  const push = (seg) => { segments.push({ ...seg, start: t }); t += seg.ms }
  push({ kind: 'hold', view: overview, ms: INTRO_MS, active: -1 })
  let prev = overview
  layout.forEach((box, i) => {
    const view = viewForBox(box, VIDEO_W, VIDEO_H, SLIDE_FIT)
    push({ kind: 'move', tween: viewTween(prev, view), ms: navMs, active: i })
    push({ kind: 'hold', view, ms: holdMs, active: i })
    prev = view
  })
  if (endOnOverview && layout.length) {
    push({ kind: 'move', tween: viewTween(prev, overview), ms: navMs, active: -1 })
    push({ kind: 'hold', view: overview, ms: OUTRO_MS, active: -1 })
  }
  return { segments, totalMs: t, world, layout, overview }
}

/** Camera state at time tMs */
const stateAt = (timeline, tMs) => {
  const segs = timeline.segments
  let i = segs.length - 1
  while (i > 0 && segs[i].start > tMs) i--
  const seg = segs[i]
  if (seg.kind === 'hold') return { index: i, still: true, active: seg.active, view: seg.view }
  const p = Math.min(1, Math.max(0, (tMs - seg.start) / seg.ms))
  return { index: i, still: false, active: seg.active, view: seg.tween(p) }
}

/** Length of the exported video in seconds (for the export dialog) */
export const videoLengthSeconds = (frameCount, holdSeconds, { endOnOverview = true, navMs = readNavSpeedMs() } = {}) => {
  const n = Math.max(0, frameCount)
  const ms = INTRO_MS + n * (navMs + holdSeconds * 1000) + (endOnOverview && n ? navMs + OUTRO_MS : 0)
  return Math.round(ms / 100) / 10
}

// ─── Scene ─────────────────────────────────────────────────────────────────

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = () => reject(new Error('Failed to load image'))
  img.src = src
})

const makeCanvas = (w, h) => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

/** Fixed viewport background: project image (cover) or the dotted canvas */
const renderBackdrop = async (editorBackground) => {
  const c = makeCanvas(VIDEO_W, VIDEO_H)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f5f5f2'
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H)
  if (editorBackground) {
    try {
      const img = await loadImage(editorBackground)
      const s = Math.max(VIDEO_W / img.naturalWidth, VIDEO_H / img.naturalHeight)
      const w = img.naturalWidth * s
      const h = img.naturalHeight * s
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, (VIDEO_W - w) / 2, (VIDEO_H - h) / 2, w, h)
      return c
    } catch (err) {
      logger.warn('Video export: background image unavailable', err)
    }
  }
  // radial-gradient(circle, #c8c8c4 1px, transparent 1px) / 28px tiles, centred
  ctx.fillStyle = '#c8c8c4'
  const ox = ((VIDEO_W / 2) % 28) - 14
  const oy = ((VIDEO_H / 2) % 28) - 14
  for (let y = oy; y < VIDEO_H + 28; y += 28) {
    for (let x = ox; x < VIDEO_W + 28; x += 28) {
      ctx.beginPath()
      ctx.arc(x + 14, y + 14, 1, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  return c
}

/** Downscale in halving steps (sharp, no shimmer in the overview) */
const downscale = (src, targetW) => {
  let cur = src
  while (cur.width / 2 >= targetW) {
    const next = makeCanvas(cur.width / 2, cur.height / 2)
    const nctx = next.getContext('2d')
    nctx.imageSmoothingQuality = 'high'
    nctx.drawImage(cur, 0, 0, next.width, next.height)
    cur = next
  }
  if (cur.width === Math.round(targetW)) return cur
  const out = makeCanvas(targetW, (cur.height * targetW) / cur.width)
  const octx = out.getContext('2d')
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(cur, 0, 0, out.width, out.height)
  return out
}

const roundRectPath = (ctx, x, y, w, h, r) => {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

const yieldToBrowser = () => new Promise((resolve) => {
  // MessageChannel is not throttled in background tabs (setTimeout is)
  const ch = new MessageChannel()
  ch.port1.onmessage = () => resolve()
  ch.port2.postMessage(0)
})

// Sharp close-up copies kept in memory at once (big decks re-render on demand)
const FULL_CACHE = 6

/**
 * Prepare everything that is drawn: backdrop, slide pictures (a sharp copy
 * for close-ups, a small one for the overview) and the header.
 */
const prepareScene = async (frames, timeline, { editorBackground, header, onStep, signal }) => {
  const backdrop = await renderBackdrop(editorBackground)
  const ovZoom = VIDEO_W / timeline.overview.width
  const slides = []
  const recent = []
  const renderFull = (i) => {
    const box = timeline.layout[i]
    const closeW = Math.min(VIDEO_W * SLIDE_FIT, (VIDEO_H * SLIDE_FIT * box.width) / box.height)
    const scale = Math.max(0.5, Math.min(2, closeW / SLIDE_WIDTH))
    return renderSlideToCanvas(frames[i], { scale, mode: 'canvas', backgroundColor: null, editorBackground })
  }
  const keep = (i, canvas) => {
    slides[i].full = canvas
    const at = recent.indexOf(i)
    if (at >= 0) recent.splice(at, 1)
    recent.push(i)
    while (recent.length > FULL_CACHE) slides[recent.shift()].full = null
  }
  for (let i = 0; i < frames.length; i++) {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
    onStep?.(i, frames.length)
    const box = timeline.layout[i]
    const full = await renderFull(i)
    const smallW = Math.max(32, Math.min(full.width, Math.ceil(ovZoom * box.width * 2)))
    slides.push({ box, full: null, small: downscale(full, smallW) })
    if (i < FULL_CACHE) keep(i, full)
  }
  /** make sure the sharp copies of these slides are ready */
  const ensureFull = async (indices) => {
    for (const i of indices) {
      if (i < 0 || i >= slides.length) continue
      keep(i, slides[i].full || await renderFull(i))
    }
  }
  let headerArt = null
  if (hasHeader(header)) {
    const hb = headerWorldBox(header)
    try {
      const blob = await renderElementToBlob(headerTextElement(header, { x: 0, y: 0, width: hb.width, height: hb.height }), { scale: Math.max(1, Math.min(3, ovZoom * 3)) })
      headerArt = { box: hb, image: await createImageBitmap(blob) }
    } catch (err) {
      logger.warn('Video export: header not drawn', err)
    }
  }
  // stacking like the slideshow: bigger slides below smaller ones
  const order = slides.map((_, i) => i).sort((a, b) => (slides[b].box.width * slides[b].box.height) - (slides[a].box.width * slides[a].box.height))
  return { backdrop, slides, order, headerArt, ensureFull }
}

const drawScene = (ctx, scene, world, state) => {
  const cam = cameraFromView(state.view, VIDEO_W, VIDEO_H, world)
  const z = cam.zoom
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(scene.backdrop, 0, 0)
  // screen = O + z * (p + pan - O)   (CSS: scale(z) translate(pan), origin centre)
  const ox = world.width / 2
  const oy = world.height / 2
  ctx.setTransform(z, 0, 0, z, ox - z * ox + z * cam.panX, oy - z * oy + z * cam.panY)
  ctx.imageSmoothingQuality = 'high'
  // visible world rectangle (for culling)
  const vx0 = state.view.center[0] - state.view.width / 2
  const vw = state.view.width
  const vh = (vw * VIDEO_H) / VIDEO_W
  const vy0 = state.view.center[1] - vh / 2
  const visible = (b) => b.x < vx0 + vw && b.x + b.width > vx0 && b.y < vy0 + vh && b.y + b.height > vy0

  if (scene.headerArt && visible(scene.headerArt.box)) {
    const b = scene.headerArt.box
    ctx.drawImage(scene.headerArt.image, b.x, b.y, b.width, b.height)
  }
  const order = state.active >= 0 ? [...scene.order.filter((i) => i !== state.active), state.active] : scene.order
  for (const i of order) {
    const s = scene.slides[i]
    const b = s.box
    if (!visible(b)) continue
    const r = 12 / z // corners stay 12px on screen, as in the slideshow
    const active = i === state.active
    // outer shadow only (CSS box-shadow is not drawn under the slide)
    ctx.save()
    ctx.beginPath()
    ctx.rect(b.x - b.width * 4, b.y - b.height * 4, b.width * 9, b.height * 9)
    roundRectPath(ctx, b.x, b.y, b.width, b.height, r)
    ctx.clip('evenodd')
    ctx.shadowColor = active ? 'rgba(0,0,0,0.25)' : 'rgba(15,23,42,0.12)'
    ctx.shadowBlur = (active ? 30 : 24) * z
    ctx.shadowOffsetY = (active ? 10 : 8) * z
    ctx.beginPath()
    roundRectPath(ctx, b.x, b.y, b.width, b.height, r)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.restore()
    // slide picture: the small copy while it is small on screen
    const img = !s.full || z * b.width <= s.small.width ? s.small : s.full
    ctx.save()
    ctx.beginPath()
    roundRectPath(ctx, b.x, b.y, b.width, b.height, r)
    ctx.clip()
    ctx.drawImage(img, b.x, b.y, b.width, b.height)
    ctx.restore()
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

// ─── Encoders ──────────────────────────────────────────────────────────────

const CODECS = [
  { codec: 'avc1.640028', muxer: 'avc' }, // H.264 High 4.0 — plays everywhere
  { codec: 'avc1.4d0028', muxer: 'avc' },
  { codec: 'avc1.42002a', muxer: 'avc' },
  { codec: 'vp09.00.40.08', muxer: 'vp9' }, // browsers without H.264 encoders
  { codec: 'av01.0.08M.08', muxer: 'av1' },
]

const pickCodec = async () => {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return null
  for (const c of CODECS) {
    const config = {
      codec: c.codec,
      width: VIDEO_W,
      height: VIDEO_H,
      bitrate: 8_000_000,
      framerate: FPS,
      ...(c.muxer === 'avc' ? { avc: { format: 'avc' } } : {}),
    }
    try {
      const { supported } = await VideoEncoder.isConfigSupported(config)
      if (supported) return { ...c, config }
    } catch { /* try the next codec */ }
  }
  return null
}

const encodeWithWebCodecs = async (codec, frameCount, drawFrame, { onProgress, signal, beforeFrame }) => {
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: codec.muxer, width: VIDEO_W, height: VIDEO_H, frameRate: FPS },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  })
  let failure = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failure = e },
  })
  encoder.configure(codec.config)
  const frameUs = 1e6 / FPS
  try {
    for (let f = 0; f < frameCount; f++) {
      if (failure) throw failure
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
      await beforeFrame?.(f)
      const canvas = drawFrame(f)
      const vf = new VideoFrame(canvas, { timestamp: Math.round(f * frameUs), duration: Math.round(frameUs) })
      encoder.encode(vf, { keyFrame: f % (FPS * 2) === 0 })
      vf.close()
      while (encoder.encodeQueueSize > 8) {
        if (failure) throw failure
        await yieldToBrowser()
      }
      if (f % 15 === 0) {
        onProgress?.(f / frameCount)
        await yieldToBrowser()
      }
    }
    await encoder.flush()
    if (failure) throw failure
    muxer.finalize()
    return new Blob([muxer.target.buffer], { type: 'video/mp4' })
  } finally {
    if (encoder.state !== 'closed') encoder.close()
  }
}

/** Real-time fallback for browsers without WebCodecs */
const recordInRealTime = async (canvas, frameCount, drawFrame, { onProgress, signal, beforeFrame }) => {
  if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
    throw new Error("Your browser can't create videos. Please use Chrome, Edge or Safari.")
  }
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || 'video/webm'
  const stream = canvas.captureStream(0)
  const track = stream.getVideoTracks()[0]
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
  const chunks = []
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  const stopped = new Promise((resolve) => { recorder.onstop = resolve })
  recorder.start(1000)
  const start = performance.now()
  try {
    for (let f = 0; f < frameCount; f++) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')
      await beforeFrame?.(f)
      drawFrame(f)
      track.requestFrame?.()
      if (f % 15 === 0) onProgress?.(f / frameCount)
      const wait = start + ((f + 1) * 1000) / FPS - performance.now()
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    }
  } finally {
    recorder.stop()
    await stopped
    track.stop()
  }
  return new Blob(chunks, { type: mimeType.split(';')[0] })
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Build the presentation video.
 * @param {object[]} frames
 * @param {object} options { slideDuration (s), editorBackground, header, endOnOverview, signal }
 * @param {(done: number, total: number, message: string) => void} [onProgress]
 * @returns {Promise<{ blob: Blob, extension: 'mp4'|'webm', durationMs: number }>}
 */
export const renderPresentationVideo = async (frames, options = {}, onProgress) => {
  const { slideDuration = 3, editorBackground = null, header = null, endOnOverview = true, signal } = options
  if (!frames?.length) throw new Error('No slides to export')
  const timeline = buildTimeline(frames, { holdMs: Math.max(0.5, Number(slideDuration) || 3) * 1000, endOnOverview, header })
  const frameCount = Math.ceil((timeline.totalMs * FPS) / 1000)
  const PREP = 0.25 // share of the progress bar for preparing slides

  const scene = await prepareScene(frames, timeline, {
    editorBackground,
    header,
    signal,
    onStep: (i, n) => onProgress?.(Math.round((i / n) * PREP * 1000), 1000, `Preparing slide ${i + 1} of ${n}…`),
  })

  const canvas = makeCanvas(VIDEO_W, VIDEO_H)
  const ctx = canvas.getContext('2d', { alpha: false })
  let drawnSegment = -1
  const drawFrame = (f) => {
    const state = stateAt(timeline, (f * 1000) / FPS)
    // a held shot is drawn once and reused for all its frames
    if (!state.still || state.index !== drawnSegment) {
      drawScene(ctx, scene, timeline.world, state)
      drawnSegment = state.still ? state.index : -1
    }
    return canvas
  }
  // sharp copies of the slide being zoomed to and the one being left
  let preparedSegment = -1
  const beforeFrame = async (f) => {
    const state = stateAt(timeline, (f * 1000) / FPS)
    if (state.index === preparedSegment) return
    preparedSegment = state.index
    const seg = timeline.segments[state.index]
    const prev = timeline.segments[state.index - 1]
    await scene.ensureFull([seg.active, prev?.active ?? -1])
  }
  const report = (p) => onProgress?.(Math.round((PREP + p * (1 - PREP)) * 1000), 1000, `Creating video… ${Math.round(p * 100)}%`)

  const codec = await pickCodec()
  if (codec) {
    try {
      const blob = await encodeWithWebCodecs(codec, frameCount, drawFrame, { onProgress: report, signal, beforeFrame })
      return { blob, extension: 'mp4', durationMs: timeline.totalMs, codec: codec.codec }
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      logger.warn('Video export: WebCodecs encoding failed, recording in real time instead', err)
      drawnSegment = -1
      preparedSegment = -1
    }
  }
  const blob = await recordInRealTime(canvas, frameCount, drawFrame, { onProgress: report, signal, beforeFrame })
  return { blob, extension: blob.type.includes('mp4') ? 'mp4' : 'webm', durationMs: timeline.totalMs, codec: blob.type }
}

/** Build the video and download it. Returns the file name. */
export const exportToVideo = async (frames, options = {}, onProgress) => {
  const { blob, extension } = await renderPresentationVideo(frames, options, onProgress)
  const filename = `${safeFileName(options.projectTitle, 'presentation')}.${extension}`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
  return filename
}

/** Whether this browser can make a video without real-time recording */
export const supportsFastVideo = () => typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
