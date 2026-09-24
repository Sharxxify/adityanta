// What a download contains.
//
// The project header is a title that sits above the slides on the canvas
// (it is not part of any slide). Downloads open with one title slide that
// shows it, instead of stamping it over every slide's content.

import { HEADER_LAYOUT } from './snakeLayout'

const escapeHtml = (text) => String(text ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

export const hasHeader = (header) => !!(header && !header.isPlaceholder && String(header.content || '').trim())

/** Header typography as a slide text element (same look as on the canvas) */
export const headerTextElement = (header, box) => ({
  id: '__header__',
  type: 'text',
  content: escapeHtml(String(header.content).trim()),
  ...box,
  // the canvas never draws the header smaller than 64px
  fontSize: Math.max(64, Number(header.fontSize) || 64),
  fontFamily: header.fontFamily || 'Inter',
  fontWeight: header.fontWeight || 'bold',
  fontStyle: header.fontStyle || 'normal',
  textDecoration: header.textDecoration || 'none',
  color: header.color || '#1a1a1a',
  textAlign: header.textAlign || 'center',
  verticalAlign: 'middle',
  lineHeight: 1.15,
  padding: { top: 12, right: 24, bottom: 12, left: 24 },
})

/** Title slide for the header (uses the project background, like other slides without their own) */
export const headerTitleFrame = (header) => ({
  id: '__title__',
  title: 'Title',
  backgroundColor: 'transparent',
  notes: '',
  elements: [headerTextElement(header, { x: 80, y: 180, width: 1120, height: 360 })],
})

/** Frames to export: an opening title slide when the project has a header */
export const framesForExport = (frames, header) => (hasHeader(header) ? [headerTitleFrame(header), ...(frames || [])] : (frames || []))

/** Header box in canvas (world) coordinates, as the editor places it */
export const headerWorldBox = (header) => {
  const size = Math.max(64, Number(header?.fontSize) || 64)
  const lines = Math.max(1, String(header?.content || '').split('\n').length)
  return {
    x: typeof header?.x === 'number' ? header.x : HEADER_LAYOUT.x,
    y: typeof header?.y === 'number' ? header.y : HEADER_LAYOUT.y,
    width: typeof header?.width === 'number' ? header.width : HEADER_LAYOUT.width,
    height: Math.max(HEADER_LAYOUT.height, Math.ceil(lines * size * 1.15 + 28)),
  }
}
