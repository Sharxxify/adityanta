// Slide data model helpers: migration of older saved projects to the current
// element format, and id utilities.

import { runsToHtml } from './html'

/**
 * Upgrade one element to the current model. Pure: returns the same object
 * when nothing needs to change (keeps React memoisation effective).
 */
export const normalizeElement = (el) => {
  if (!el || typeof el !== 'object') return el
  let next = el
  const patch = (obj) => { next = next === el ? { ...el, ...obj } : Object.assign(next, obj) }

  // v1 PPTX import stored text as `runs`; v2 stores sanitized HTML in `content`
  if (Array.isArray(el.runs) && el.runs.length > 0) {
    patch({ content: runsToHtml(el.runs), runs: null })
  }
  // The v1 importer produced a type we never rendered
  if (el.type === 'smartart-placeholder') {
    patch({ type: 'text', content: el.text || '', runs: null })
  }
  return next
}

export const normalizeFrame = (frame) => {
  if (!frame || !Array.isArray(frame.elements)) return frame
  let changed = false
  const elements = frame.elements.map((el) => {
    const n = normalizeElement(el)
    if (n !== el) changed = true
    return n
  })
  return changed ? { ...frame, elements } : frame
}

export const normalizeFrames = (frames) => (Array.isArray(frames) ? frames.map(normalizeFrame) : [])

/** Highest numeric element id in a deck (for seeding the id counter) */
export const maxElementId = (frames) => {
  let max = 0
  for (const f of frames || []) {
    for (const el of f?.elements || []) {
      const n = typeof el?.id === 'number' ? el.id : parseInt(el?.id, 10)
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  return max
}
