// Built-in topic backgrounds (public/backgrounds).
//
// The originals are 2700-2800px PNGs of 5-10 MB each (279 MB in total), far
// more than a screen needs; loading them made "Create new project" and the
// background pickers crawl (#58). Two optimised copies of every image ship
// next to them (made by scripts/optimize-backgrounds.py):
//   /backgrounds/display/<topic>/<name>.jpg  2560px JPEG (~0.4 MB) — canvas, slideshow, exports
//   /backgrounds/thumbs/<topic>/<name>.jpg   480px JPEG (~12 KB) — pickers and cards
// Projects saved with an original path keep working: paths are mapped here.

const ORIGINAL = /^\/backgrounds\/(?!display\/|thumbs\/)(.+)\.(?:png|jpe?g|webp)$/i
const OPTIMISED = /^\/backgrounds\/(?:display|thumbs)\/(.+)\.jpg$/i

const relPath = (src) => {
  if (typeof src !== 'string') return null
  const clean = src.split(/[?#]/)[0]
  const m = ORIGINAL.exec(clean) || OPTIMISED.exec(clean)
  return m ? m[1] : null
}

/** Full-screen version of a built-in background (other URLs pass through) */
export const displayBackground = (src) => {
  const rel = relPath(src)
  return rel ? `/backgrounds/display/${rel}.jpg` : src
}

/** Small preview of a built-in background (other URLs pass through) */
export const thumbBackground = (src) => {
  const rel = relPath(src)
  return rel ? `/backgrounds/thumbs/${rel}.jpg` : src
}

/** Same built-in background, whichever version the paths point to */
export const sameBackground = (a, b) => {
  if (a === b) return true
  const ra = relPath(a)
  return !!ra && ra === relPath(b)
}
