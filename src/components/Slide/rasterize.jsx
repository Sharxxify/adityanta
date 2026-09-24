// Rasterize slides with the SAME renderer the editor uses (SlideView), so
// PDF / PPTX-fallback / video exports look exactly like the canvas.
//
// Uses modern-screenshot (SVG foreignObject), which lets the browser itself
// paint the DOM — gradients, SVG shapes, filters, clip paths and web fonts
// all come out as on screen (html2canvas re-implements CSS and misses many).

import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { domToCanvas, domToBlob } from 'modern-screenshot'
import SlideView, { SLIDE_WIDTH, SLIDE_HEIGHT } from './SlideView'
import ElementView from './ElementView'
import { waitForFonts } from './fonts'

const waitForImages = async (root, timeoutMs = 8000) => {
  const imgs = Array.from(root.querySelectorAll('img'))
  const bgUrls = []
  root.querySelectorAll('[style*="url("]').forEach((node) => {
    const m = /url\(["']?([^"')]+)["']?\)/.exec(node.style.backgroundImage || '')
    if (m) bgUrls.push(m[1])
  })
  const loadUrl = (src) => new Promise((resolve) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = resolve
    im.onerror = resolve
    im.src = src
  })
  const all = [
    ...imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r }))),
    ...bgUrls.map(loadUrl),
  ]
  await Promise.race([Promise.all(all), new Promise((r) => setTimeout(r, timeoutMs))])
}

/** Mount a React node off-screen, wait for fonts/images, run fn(node), clean up. */
const withMounted = async (reactNode, width, height, fn) => {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
    zIndex: '-1',
  })
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    flushSync(() => root.render(reactNode))
    await waitForFonts()
    await waitForImages(host)
    // one more frame so late layout (fonts swapped in) settles
    await new Promise((r) => requestAnimationFrame(() => r()))
    return await fn(host.firstElementChild)
  } finally {
    root.unmount()
    host.remove()
  }
}

const shotOptions = (scale, backgroundColor) => ({
  scale,
  backgroundColor,
  // Cross-origin images (S3, CDNs) are fetched and inlined when CORS allows;
  // images that refuse CORS are skipped instead of tainting the canvas.
  fetch: { requestInit: { mode: 'cors', cache: 'force-cache' } },
  timeout: 15000,
})

/**
 * Render a frame to a canvas.
 * mode 'export' paints the project background into slides without their own
 * background; 'canvas' leaves them transparent (pass backgroundColor: null),
 * as in the presentation where the world background shows through.
 * @returns {Promise<HTMLCanvasElement>}
 */
export const renderSlideToCanvas = async (frame, {
  width = SLIDE_WIDTH,
  height = SLIDE_HEIGHT,
  scale = 1,
  header = null,
  editorBackground = null,
  backgroundColor = '#ffffff',
  mode = 'export',
} = {}) => withMounted(
  <SlideView frame={frame} width={width} height={height} mode={mode} header={header} editorBackground={editorBackground} />,
  width,
  height,
  (node) => domToCanvas(node, shotOptions(scale, backgroundColor)),
)

/** Render a single element (transparent background) — used for PPTX fallbacks */
export const renderElementToBlob = async (element, { scale = 2 } = {}) => {
  const w = Math.max(1, Math.round(element.width || 1))
  const h = Math.max(1, Math.round(element.height || 1))
  const local = { ...element, x: 0, y: 0, rotation: 0 }
  return withMounted(
    <div style={{ position: 'relative', width: w, height: h }}>
      <ElementView element={local} />
    </div>,
    w,
    h,
    (node) => domToBlob(node, { ...shotOptions(scale, null), type: 'image/png' }),
  )
}

export { SLIDE_WIDTH, SLIDE_HEIGHT }
