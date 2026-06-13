import html2canvas from 'html2canvas'
import { buildSlideRenderNode, SLIDE_WIDTH, SLIDE_HEIGHT } from './slideRender'
import { computeSnakePosition } from './snakeLayout'
import logger from './logger'

// ─── Layout helpers (mirrored from PresentationPage) ───────────────────────
const WORLD_PADDING = 220

const getFrameMapLayout = (frames) => {
  return frames.map((frame, index) => ({
    id: frame.id,
    ...(frame.layout ? frame.layout : computeSnakePosition(index)),
  }))
}

const getWorldBounds = (layout) => {
  if (!layout.length) return { width: 1800, height: 1100, minX: 0, minY: 0, maxX: 1800, maxY: 1100 }
  const minX = Math.min(...layout.map(f => f.x))
  const minY = Math.min(...layout.map(f => f.y))
  const maxX = Math.max(...layout.map(f => f.x + f.width))
  const maxY = Math.max(...layout.map(f => f.y + f.height))
  return { minX, minY, maxX, maxY, width: Math.max(1800, maxX + WORLD_PADDING), height: Math.max(1100, maxY + WORLD_PADDING) }
}

const buildConnectors = (layout) => {
  if (!Array.isArray(layout) || layout.length < 2) return []
  const PREZI_FLOW_ORDER = [1, 2, 0, 3, 4]
  const order = layout.length >= 5
    ? PREZI_FLOW_ORDER.filter(idx => idx < layout.length)
    : layout.map((_, idx) => idx)
  const connectors = []
  for (let i = 0; i < order.length - 1; i++) {
    const from = layout[order[i]], to = layout[order[i + 1]]
    if (!from || !to) continue
    const fromCx = from.x + from.width / 2, fromCy = from.y + from.height / 2
    const toCx = to.x + to.width / 2, toCy = to.y + to.height / 2
    const dx = toCx - fromCx, dy = toCy - fromCy
    const dist = Math.max(1, Math.hypot(dx, dy))
    const ux = dx / dist, uy = dy / dist
    const fromExt = (from.width / 2) * Math.abs(ux) + (from.height / 2) * Math.abs(uy)
    const toExt = (to.width / 2) * Math.abs(ux) + (to.height / 2) * Math.abs(uy)
    const m = 34
    const sx = fromCx + ux * (fromExt + m), sy = fromCy + uy * (fromExt + m)
    const ex = toCx - ux * (toExt + m), ey = toCy - uy * (toExt + m)
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    connectors.push({
      x: (sx + ex) / 2, y: (sy + ey) / 2,
      symbol: horizontal ? (dx >= 0 ? '»»' : '««') : (dy >= 0 ? '⌄⌄' : '⌃⌃'),
      horizontal,
    })
  }
  return connectors
}

// ─── Camera math (identical to PresentationPage.updateCameraToBox) ─────────
const computeCamera = (box, vpW, vpH, worldW, worldH, zoomScale = 0.9) => {
  const targetZoom = Math.max(0.1, Math.min(3, Math.min(
    (vpW / box.width) * zoomScale,
    (vpH / box.height) * zoomScale,
  )))
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  const ox = worldW / 2, oy = worldH / 2
  const vcx = vpW / 2, vcy = vpH / 2
  return {
    zoom: targetZoom,
    panX: ox + (vcx - ox) / targetZoom - cx,
    panY: oy + (vcy - oy) / targetZoom - cy,
  }
}

// Cubic-bezier(0.22, 1, 0.36, 1) approximation — matches the CSS transition
const easeCubicBezier = (() => {
  // Pre-sample the cubic bezier for fast lookup
  const samples = 256
  const table = new Float64Array(samples + 1)
  // Compute using de Casteljau for bezier(0.22, 1, 0.36, 1)
  const p1x = 0.22, p1y = 1, p2x = 0.36, p2y = 1
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    // Solve X(t) = target for t using Newton's method is complex;
    // since this particular bezier is very close to easeOutExpo, use that.
    // The actual bezier(0.22,1,0.36,1) produces a fast-start, quick-settle curve
    table[i] = 1 - Math.pow(1 - t, 3.2) // close match to this bezier
  }
  return (x) => {
    const idx = Math.min(samples, Math.max(0, Math.round(x * samples)))
    return table[idx]
  }
})()

const lerp = (a, b, t) => a + (b - a) * t

// ─── Pre-render a single slide to an offscreen canvas ──────────────────────
const prerenderFrame = async (frame, header = null) => {
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;z-index:-1;'
  const root = buildSlideRenderNode(frame, { width: SLIDE_WIDTH, height: SLIDE_HEIGHT, header })
  wrapper.appendChild(root)
  document.body.appendChild(wrapper)
  try {
    return await html2canvas(root, {
      width: SLIDE_WIDTH, height: SLIDE_HEIGHT, scale: 1,
      useCORS: true, allowTaint: true, backgroundColor: null, logging: false, imageTimeout: 0,
    })
  } finally {
    document.body.removeChild(wrapper)
  }
}

// Load an image from URL and return an HTMLImageElement
const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = () => reject(new Error('Failed to load image'))
  img.src = src
})

// Draw rounded rect path
const roundedRectPath = (ctx, x, y, w, h, r) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ─── Main export function ──────────────────────────────────────────────────
export const exportToVideo = async (frames, options, onProgress, header = null) => {
  const {
    slideDuration = 3,
    projectTitle = 'presentation',
    editorBackground = null,
    exportFormat = 'mp4',
  } = options

  if (!window.MediaRecorder) {
    throw new Error("Your browser doesn't support video export. Try Chrome or Edge.")
  }

  const VIDEO_W = 1920
  const VIDEO_H = 1080
  const TRANSITION_MS = 1600   // matches CSS transition: 1.6s
  const HOLD_MS = slideDuration * 1000

  // ── Spatial layout ──────────────────────────────────────────────────
  const frameMapLayout = getFrameMapLayout(frames)
  const worldBounds = getWorldBounds(frameMapLayout)
  const worldW = worldBounds.width, worldH = worldBounds.height
  const connectors = buildConnectors(frameMapLayout)

  // ── Pre-render all slides (the ONLY slow part — done upfront) ───────
  const frameCanvases = []
  for (let i = 0; i < frames.length; i++) {
    onProgress?.(i, frames.length, `Pre-rendering slide ${i + 1} of ${frames.length}…`)
    frameCanvases.push(await prerenderFrame(frames[i]))
  }
  onProgress?.(frames.length, frames.length, 'Starting recording…')

  // ── Load background image if set ────────────────────────────────────
  let bgImage = null
  if (editorBackground) {
    try { bgImage = await loadImage(editorBackground) } catch { /* use fallback */ }
  }

  // ── Dot-pattern background (pre-render to a small tile canvas) ──────
  let dotPatternCanvas = null
  if (!bgImage) {
    dotPatternCanvas = document.createElement('canvas')
    dotPatternCanvas.width = 28
    dotPatternCanvas.height = 28
    const dctx = dotPatternCanvas.getContext('2d')
    dctx.fillStyle = '#f5f5f2'
    dctx.fillRect(0, 0, 28, 28)
    dctx.fillStyle = '#c8c8c4'
    dctx.beginPath()
    dctx.arc(14, 14, 1, 0, Math.PI * 2)
    dctx.fill()
  }

  // ── Camera sequence: overview → each frame ──────────────────────────
  const overviewBox = {
    x: worldBounds.minX, y: worldBounds.minY,
    width: Math.max(1, worldBounds.maxX - worldBounds.minX),
    height: Math.max(1, worldBounds.maxY - worldBounds.minY),
  }
  const overviewCam = computeCamera(overviewBox, VIDEO_W, VIDEO_H, worldW, worldH, 0.85)
  const frameCams = frameMapLayout.map(box => computeCamera(box, VIDEO_W, VIDEO_H, worldW, worldH, 0.9))

  // ── FFmpeg MP4 conversion (best-effort, needs SharedArrayBuffer / COOP headers) ──
  const convertToMp4 = async (webmBlob) => {
    if (typeof SharedArrayBuffer === 'undefined') throw new Error('SharedArrayBuffer unavailable')
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const { fetchFile } = await import('@ffmpeg/util')
    const ffmpeg = new FFmpeg()
    ffmpeg.on('progress', ({ progress }) => {
      onProgress?.(frames.length, frames.length, `Converting to MP4… ${Math.round(progress * 100)}%`)
    })
    onProgress?.(frames.length, frames.length, 'Loading video converter…')
    await ffmpeg.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
    })
    const webmData = await fetchFile(webmBlob)
    await ffmpeg.writeFile('input.webm', webmData)
     await ffmpeg.exec([
      '-i', 'input.webm',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '26',
      '-pix_fmt', 'yuv420p',
      '-threads', '0',
      '-movflags', '+faststart',
      'output.mp4'
    ])
    const mp4Data = await ffmpeg.readFile('output.mp4')
    await ffmpeg.deleteFile('input.webm')
    await ffmpeg.deleteFile('output.mp4')
    return new Blob([mp4Data.buffer], { type: 'video/mp4' })
  }

  // ── Setup recording canvas & MediaRecorder ──────────────────────────

  const recordCanvas = document.createElement('canvas')
  recordCanvas.width = VIDEO_W
  recordCanvas.height = VIDEO_H
  const ctx = recordCanvas.getContext('2d')

  if (typeof recordCanvas.captureStream !== 'function') {
    throw new Error("Your browser doesn't support video export (captureStream). Try Chrome or Edge.")
  }

  const stream = recordCanvas.captureStream(30)
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm'

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 })
  const chunks = []
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

  const stopPromise = new Promise(resolve => {
    recorder.onstop = () => resolve()
  })



  // ── Drawing function (FAST — pure canvas ops, no DOM) ───────────────
  const drawScene = (cam) => {
    // 1. Background (fills viewport)
    if (bgImage) {
      // Draw-image "cover" mode
      const imgAR = bgImage.width / bgImage.height
      const vpAR = VIDEO_W / VIDEO_H
      let sw, sh, sx, sy
      if (imgAR > vpAR) {
        sh = bgImage.height; sw = sh * vpAR
        sx = (bgImage.width - sw) / 2; sy = 0
      } else {
        sw = bgImage.width; sh = sw / vpAR
        sx = 0; sy = (bgImage.height - sh) / 2
      }
      ctx.drawImage(bgImage, sx, sy, sw, sh, 0, 0, VIDEO_W, VIDEO_H)
    } else if (dotPatternCanvas) {
      const pattern = ctx.createPattern(dotPatternCanvas, 'repeat')
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, VIDEO_W, VIDEO_H)
    } else {
      ctx.fillStyle = '#f5f5f2'
      ctx.fillRect(0, 0, VIDEO_W, VIDEO_H)
    }

    // 2. Apply camera transform (mirrors CSS: scale(z) translate(px,py) with origin center)
    ctx.save()
    ctx.translate(worldW / 2, worldH / 2)
    ctx.scale(cam.zoom, cam.zoom)
    ctx.translate(cam.panX, cam.panY)
    ctx.translate(-worldW / 2, -worldH / 2)

    // 3. Connectors
    ctx.globalAlpha = 0.92
    connectors.forEach(c => {
      ctx.fillStyle = '#4b5563'
      ctx.font = `800 ${c.horizontal ? 72 : 70}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(c.symbol, c.x, c.y)
    })
    ctx.globalAlpha = 1

    // 4. Frames (pre-rendered canvases drawn at their spatial positions)
    // Sort rendering order: largest area frames first (at the bottom), smallest area frames last (on top).
    const sortedFrameIndices = Array.from({ length: frameMapLayout.length }, (_, idx) => idx)
      .sort((a, b) => {
        const boxA = frameMapLayout[a]
        const boxB = frameMapLayout[b]
        return (boxB.width * boxB.height) - (boxA.width * boxA.height)
      })

    for (let k = 0; k < sortedFrameIndices.length; k++) {
      const i = sortedFrameIndices[k]
      const box = frameMapLayout[i]
      ctx.save()

      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.18)'
      ctx.shadowBlur = 24
      ctx.shadowOffsetY = 4

      // Rounded rect clip
      roundedRectPath(ctx, box.x, box.y, box.width, box.height, 8)
      ctx.clip()

      // Draw the pre-rendered slide canvas into this box
      ctx.drawImage(frameCanvases[i], box.x, box.y, box.width, box.height)

      ctx.restore()
    }

    ctx.restore() // undo camera transform
  }

  // ── Animate camera transition (requestAnimationFrame loop) ──────────
  const animateTransition = (fromCam, toCam, durationMs) => {
    return new Promise(resolve => {
      const startTime = performance.now()
      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / durationMs)
        const eased = easeCubicBezier(t)
        drawScene({
          zoom: lerp(fromCam.zoom, toCam.zoom, eased),
          panX: lerp(fromCam.panX, toCam.panX, eased),
          panY: lerp(fromCam.panY, toCam.panY, eased),
        })
        if (t < 1) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
  }

  // Hold view for a duration (keeps drawing so captureStream has frames)
  const holdView = (cam, durationMs) => {
    return new Promise(resolve => {
      const startTime = performance.now()
      const tick = (now) => {
        drawScene(cam)
        if (now - startTime < durationMs) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
  }

  // ── Execute the recording sequence ──────────────────────────────────
  try {
    recorder.start()

    // Overview hold
    onProgress?.(0, frames.length, 'Showing overview…')
    await holdView(overviewCam, Math.max(1500, HOLD_MS * 0.5))

    // Navigate through each frame
    let currentCam = overviewCam
    for (let i = 0; i < frames.length; i++) {
      const targetCam = frameCams[i]
      onProgress?.(i + 1, frames.length, `Recording slide ${i + 1} of ${frames.length}…`)

      // Smooth zoom/pan transition (1.6s, same as presentation CSS)
      await animateTransition(currentCam, targetCam, TRANSITION_MS)

      // Hold on this slide
      await holdView(targetCam, HOLD_MS)

      currentCam = targetCam
    }

    recorder.stop()
    await stopPromise

    // Assemble WebM blob
    const webmBlob = new Blob(chunks, { type: mimeType.split(';')[0] })

    // Try MP4 if selected, else download WebM directly
    let downloadBlob = webmBlob
    let filename = `${projectTitle}.webm`
    if (exportFormat === 'mp4') {
      try {
        downloadBlob = await convertToMp4(webmBlob)
        filename = `${projectTitle}.mp4`
      } catch (convErr) {
        logger.warn('MP4 conversion skipped — downloading as WebM:', convErr.message)
      }
    }

    const url = URL.createObjectURL(downloadBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)

    return true
  } catch (error) {
    logger.error('Video export failed:', error)
    if (recorder.state !== 'inactive') recorder.stop()
    throw error
  }
}
