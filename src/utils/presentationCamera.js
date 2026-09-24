// Presentation camera shared by the slideshow and the video export, so a
// downloaded video moves exactly like the presentation on screen.
//
// World space: slides sit at their canvas layout boxes. The world layer is
// transformed with `scale(zoom) translate(panX, panY)` around the world's
// centre (CSS transform-origin: center), so a world point p lands on screen
// at  origin + zoom * (p + pan - origin).
//
// A "view" is { center: [x, y], width } = the world point in the middle of
// the viewport and the world width visible across it.

import { computeSnakePosition } from './snakeLayout'

export const WORLD_PADDING = 220
export const SLIDE_FIT = 0.9 // a slide fills 90% of the viewport
export const OVERVIEW_FIT = 0.85
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 40
export const DEFAULT_NAV_MS = 1500
export const NAV_SPEED_KEY = 'adityanta_nav_speed_ms'

/** Transition time set with the editor's "Slide Transition Speed" slider */
export const readNavSpeedMs = () => {
  try {
    const n = Number(localStorage.getItem(NAV_SPEED_KEY))
    if (Number.isFinite(n) && n >= 300 && n <= 3000) return n
  } catch { /* storage unavailable */ }
  return DEFAULT_NAV_MS
}

export const frameLayout = (frames) => (frames || []).map((frame, index) => ({
  id: frame.id,
  ...(frame.layout ? frame.layout : computeSnakePosition(index)),
}))

export const worldBoundsOf = (layout) => {
  if (!layout.length) return { width: 1800, height: 1100, minX: 0, minY: 0, maxX: 1800, maxY: 1100 }
  const minX = Math.min(...layout.map((f) => f.x))
  const minY = Math.min(...layout.map((f) => f.y))
  const maxX = Math.max(...layout.map((f) => f.x + f.width))
  const maxY = Math.max(...layout.map((f) => f.y + f.height))
  return { minX, minY, maxX, maxY, width: Math.max(1800, maxX + WORLD_PADDING), height: Math.max(1100, maxY + WORLD_PADDING) }
}

/** View that fits a box into the viewport */
export const viewForBox = (box, vpW, vpH, fit = SLIDE_FIT) => {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((vpW / box.width) * fit, (vpH / box.height) * fit)))
  return { center: [box.x + box.width / 2, box.y + box.height / 2], width: vpW / zoom }
}

export const cameraFromView = (view, vpW, vpH, world) => {
  const zoom = vpW / view.width
  const ox = world.width / 2
  const oy = world.height / 2
  return {
    zoom,
    panX: ox + (vpW / 2 - ox) / zoom - view.center[0],
    panY: oy + (vpH / 2 - oy) / zoom - view.center[1],
  }
}

export const viewFromCamera = (cam, vpW, vpH, world) => {
  const ox = world.width / 2
  const oy = world.height / 2
  return {
    center: [ox + (vpW / 2 - ox) / cam.zoom - cam.panX, oy + (vpH / 2 - oy) / cam.zoom - cam.panY],
    width: vpW / cam.zoom,
  }
}

// ─── Van Wijk & Nuij (2003) smooth zoom-pan ────────────────────────────────
// The camera follows a hyperbolic arc through (pan, log-zoom) space, so far
// jumps pull back in the middle and near jumps stay shallow (the Prezi feel).
export const VAN_WIJK_RHO = 1.6

export const buildVanWijkPath = (u0, u1, w0, w1, rho = VAN_WIJK_RHO) => {
  const rho2 = rho * rho
  const ux = u1[0] - u0[0]
  const uy = u1[1] - u0[1]
  const d = Math.hypot(ux, uy)
  if (d < 1e-6) {
    const S = Math.abs(Math.log(w1 / w0)) / rho
    const dir = Math.sign(Math.log(w1 / w0))
    return { S: Math.max(S, 1e-6), w: (s) => w0 * Math.exp(rho * s * dir), u: () => [u0[0], u0[1]] }
  }
  const b0 = (w1 * w1 - w0 * w0 + rho2 * rho2 * d * d) / (2 * w0 * rho2 * d)
  const b1 = (w1 * w1 - w0 * w0 - rho2 * rho2 * d * d) / (2 * w1 * rho2 * d)
  const r0 = Math.log(-b0 + Math.sqrt(b0 * b0 + 1))
  const r1 = Math.log(-b1 + Math.sqrt(b1 * b1 + 1))
  const S = (r1 - r0) / rho
  return {
    S: Math.max(Math.abs(S), 1e-6),
    w: (s) => w0 * (Math.cosh(r0) / Math.cosh(rho * s + r0)),
    u: (s) => {
      const k = (w0 / rho2) * Math.cosh(r0) * Math.tanh(rho * s + r0) - (w0 / rho2) * Math.sinh(r0)
      return [u0[0] + (k / d) * ux, u0[1] + (k / d) * uy]
    },
  }
}

// A little wind-up and wind-down on top of Van Wijk's constant velocity
export const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** Interpolator between two views: t in [0, 1] -> view */
export const viewTween = (from, to) => {
  const path = buildVanWijkPath(from.center, to.center, from.width, to.width)
  return (t) => {
    if (t >= 1) return to
    const s = easeInOutQuad(Math.max(0, t)) * path.S
    return { center: path.u(s), width: path.w(s) }
  }
}
