// Table editing operations (PowerPoint "Table Design" / "Layout" tabs):
// insert / delete rows and columns, and draw borders with a pen weight,
// colour and style on all / outside / inside / single edges.
// Every function returns a patch for updateElement().

import { getTableCells } from './ElementView'

const clone = (cells) => cells.map((row) => row.map((c) => ({ ...c, borders: c.borders ? { ...c.borders } : undefined })))
const dataOf = (cells) => cells.map((row) => row.map((c) => c.text ?? ''))

const sizes = (el, count, key, total) => {
  const list = Array.isArray(el[key]) && el[key].length === count ? [...el[key]] : null
  return list || Array(count).fill(total / count)
}

const model = (el) => {
  const cells = clone(getTableCells(el))
  const rows = cells.length
  const cols = cells[0]?.length || 1
  return {
    cells,
    rows,
    cols,
    colWidths: sizes(el, cols, 'colWidths', Number(el.width) || 400),
    rowHeights: sizes(el, rows, 'rowHeights', Number(el.height) || 200),
  }
}

const emptyCell = (like) => ({ text: '', html: '', ...(like?.fill ? { fill: like.fill } : {}), ...(like?.borders ? { borders: { ...like.borders } } : {}) })

export const insertRow = (el, index, { below = true } = {}) => {
  const m = model(el)
  const at = Math.max(0, Math.min(m.rows, below ? index + 1 : index))
  const like = m.cells[Math.min(index, m.rows - 1)] || []
  m.cells.splice(at, 0, Array.from({ length: m.cols }, (_, c) => emptyCell(like[c])))
  const h = m.rowHeights[Math.min(index, m.rows - 1)] || (Number(el.height) || 200) / m.rows
  m.rowHeights.splice(at, 0, h)
  return { cells: m.cells, data: dataOf(m.cells), rows: m.rows + 1, rowHeights: m.rowHeights, height: Math.round((Number(el.height) || 0) + h) }
}

export const deleteRow = (el, index) => {
  const m = model(el)
  if (m.rows <= 1) return null
  const h = m.rowHeights[index] || 0
  m.cells.splice(index, 1)
  m.rowHeights.splice(index, 1)
  return { cells: m.cells, data: dataOf(m.cells), rows: m.rows - 1, rowHeights: m.rowHeights, height: Math.max(20, Math.round((Number(el.height) || 0) - h)) }
}

export const insertCol = (el, index, { right = true } = {}) => {
  const m = model(el)
  const at = Math.max(0, Math.min(m.cols, right ? index + 1 : index))
  m.cells.forEach((row) => row.splice(at, 0, emptyCell(row[Math.min(index, m.cols - 1)])))
  const w = m.colWidths[Math.min(index, m.cols - 1)] || (Number(el.width) || 400) / m.cols
  m.colWidths.splice(at, 0, w)
  return { cells: m.cells, data: dataOf(m.cells), cols: m.cols + 1, colWidths: m.colWidths, width: Math.round((Number(el.width) || 0) + w) }
}

export const deleteCol = (el, index) => {
  const m = model(el)
  if (m.cols <= 1) return null
  const w = m.colWidths[index] || 0
  m.cells.forEach((row) => row.splice(index, 1))
  m.colWidths.splice(index, 1)
  return { cells: m.cells, data: dataOf(m.cells), cols: m.cols - 1, colWidths: m.colWidths, width: Math.max(20, Math.round((Number(el.width) || 0) - w)) }
}

export const BORDER_SCOPES = [
  { id: 'all', label: 'All borders' },
  { id: 'outside', label: 'Outside borders' },
  { id: 'inside', label: 'Inside borders' },
  { id: 'none', label: 'No border' },
  { id: 'top', label: 'Top border' },
  { id: 'bottom', label: 'Bottom border' },
  { id: 'left', label: 'Left border' },
  { id: 'right', label: 'Right border' },
  { id: 'insideH', label: 'Inside horizontal' },
  { id: 'insideV', label: 'Inside vertical' },
]

/**
 * Draw borders with a pen ({ width, color, style }) on part of the table.
 * The shared edge between two cells is written on both cells so the result
 * does not depend on which cell's border wins.
 */
export const applyBorders = (el, pen, scope) => {
  const m = model(el)
  const last = { r: m.rows - 1, c: m.cols - 1 }
  const line = scope === 'none' ? null : { width: Number(pen.width) || 0, color: pen.color || '#000000', style: pen.style || 'solid' }
  const set = (r, c, edge) => {
    const cell = m.cells[r]?.[c]
    if (!cell) return
    cell.borders = { ...(cell.borders || {}), [edge]: line }
  }
  for (let r = 0; r <= last.r; r++) {
    for (let c = 0; c <= last.c; c++) {
      const outerTop = r === 0
      const outerBottom = r === last.r
      const outerLeft = c === 0
      const outerRight = c === last.c
      const want = {
        top: scope === 'all' || scope === 'none' || (scope === 'outside' && outerTop) || (scope === 'top' && outerTop) || ((scope === 'inside' || scope === 'insideH') && !outerTop),
        bottom: scope === 'all' || scope === 'none' || (scope === 'outside' && outerBottom) || (scope === 'bottom' && outerBottom) || ((scope === 'inside' || scope === 'insideH') && !outerBottom),
        left: scope === 'all' || scope === 'none' || (scope === 'outside' && outerLeft) || (scope === 'left' && outerLeft) || ((scope === 'inside' || scope === 'insideV') && !outerLeft),
        right: scope === 'all' || scope === 'none' || (scope === 'outside' && outerRight) || (scope === 'right' && outerRight) || ((scope === 'inside' || scope === 'insideV') && !outerRight),
      }
      Object.entries(want).forEach(([edge, on]) => { if (on) set(r, c, edge) })
    }
  }
  return { cells: m.cells, data: dataOf(m.cells) }
}

/** The pen of the table as it looks now (for the toolbar) */
export const currentPen = (el) => {
  const cells = getTableCells(el)
  const b = cells[0]?.[0]?.borders?.top || cells[0]?.[0]?.borders?.left
  return {
    width: b?.width ?? el.borderWidth ?? 1,
    color: b?.color ?? el.borderColor ?? '#9ca3af',
    style: b?.style ?? el.borderStyle ?? 'solid',
  }
}
