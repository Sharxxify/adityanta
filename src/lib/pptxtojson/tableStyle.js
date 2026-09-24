// ADITYANTA: table style resolution.
//
// PowerPoint table styles are layered: wholeTbl, then column bands, row
// bands, last/first column, last/first row and finally the corner cells.
// Every layer may set the cell fill, text colour / bold / italic, and the
// borders of its region (outer edges: left/right/top/bottom, inner edges:
// insideH/insideV). The upstream code only looked at one layer per cell and
// ignored inner borders, so styled tables lost their banding and header.
//
// Decks written by some tools (python-pptx, Google Slides...) reference
// PowerPoint's built-in styles without embedding them in tableStyles.xml, so
// the most common built-ins are defined here.

import * as txml from 'txml/dist/txml.mjs'
import { simplifyLostLess } from './readXmlFile'
import { getTextByPathList } from './utils'
import { getSolidFill } from './fill'
import { getBorder } from './border'

const ln = (w, clr) => `<a:ln w="${w}" cmpd="sng"><a:solidFill><a:schemeClr val="${clr}"/></a:solidFill></a:ln>`
const edge = (tag, w, clr) => `<a:${tag}>${ln(w, clr)}</a:${tag}>`
const txStyle = (clr, bold) => `<a:tcTxStyle${bold ? ' b="on"' : ''}><a:fontRef idx="minor"><a:prstClr val="black"/></a:fontRef><a:schemeClr val="${clr}"/></a:tcTxStyle>`
const solid = (clr, tint) => `<a:fill><a:solidFill><a:schemeClr val="${clr}">${tint ? `<a:tint val="${tint}"/>` : ''}</a:schemeClr></a:solidFill></a:fill>`

const mediumStyle2 = (id, accent) => `<a:tblStyle styleId="${id}" styleName="Medium Style 2">
<a:wholeTbl>${txStyle('dk1')}<a:tcStyle><a:tcBdr>${['left', 'right', 'top', 'bottom', 'insideH', 'insideV'].map((t) => edge(t, 12700, 'lt1')).join('')}</a:tcBdr>${solid(accent, 20000)}</a:tcStyle></a:wholeTbl>
<a:band1H><a:tcStyle><a:tcBdr/>${solid(accent, 40000)}</a:tcStyle></a:band1H>
<a:band2H><a:tcStyle><a:tcBdr/></a:tcStyle></a:band2H>
<a:band1V><a:tcStyle><a:tcBdr/>${solid(accent, 40000)}</a:tcStyle></a:band1V>
<a:band2V><a:tcStyle><a:tcBdr/></a:tcStyle></a:band2V>
<a:lastCol>${txStyle('lt1', true)}<a:tcStyle><a:tcBdr/>${solid(accent)}</a:tcStyle></a:lastCol>
<a:firstCol>${txStyle('lt1', true)}<a:tcStyle><a:tcBdr/>${solid(accent)}</a:tcStyle></a:firstCol>
<a:lastRow>${txStyle('lt1', true)}<a:tcStyle><a:tcBdr>${edge('top', 38100, 'lt1')}</a:tcBdr>${solid(accent)}</a:tcStyle></a:lastRow>
<a:firstRow>${txStyle('lt1', true)}<a:tcStyle><a:tcBdr>${edge('bottom', 38100, 'lt1')}</a:tcBdr>${solid(accent)}</a:tcStyle></a:firstRow>
</a:tblStyle>`

const BUILTIN = {
  '{073A0DAA-6AF3-43AB-8588-CEC1D06C72B9}': () => mediumStyle2('{073A0DAA-6AF3-43AB-8588-CEC1D06C72B9}', 'dk1'),
  '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}': () => mediumStyle2('{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}', 'accent1'),
  '{21E4AEA4-8DFA-4A89-87EB-49C32662AFE8}': () => mediumStyle2('{21E4AEA4-8DFA-4A89-87EB-49C32662AFE8}', 'accent2'),
  '{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}': () => mediumStyle2('{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}', 'accent3'),
  '{00A15C55-8517-42AA-B614-E9B94910E393}': () => mediumStyle2('{00A15C55-8517-42AA-B614-E9B94910E393}', 'accent4'),
  '{7DF18680-E054-41AD-8BC1-D1AEF772440D}': () => mediumStyle2('{7DF18680-E054-41AD-8BC1-D1AEF772440D}', 'accent5'),
  '{93296810-A885-4BE3-A3E7-6D5BEEA58F35}': () => mediumStyle2('{93296810-A885-4BE3-A3E7-6D5BEEA58F35}', 'accent6'),
  // No Style, Table Grid
  '{5940675A-B579-460E-94D1-54222C63F5DA}': () => `<a:tblStyle styleId="{5940675A-B579-460E-94D1-54222C63F5DA}" styleName="No Style, Table Grid">
<a:wholeTbl>${txStyle('tx1')}<a:tcStyle><a:tcBdr>${['left', 'right', 'top', 'bottom', 'insideH', 'insideV'].map((t) => edge(t, 12700, 'tx1')).join('')}</a:tcBdr><a:fill><a:noFill/></a:fill></a:tcStyle></a:wholeTbl>
</a:tblStyle>`,
  // No Style, No Grid
  '{2D5ABB26-0587-4C30-8999-92F81FD0307C}': () => `<a:tblStyle styleId="{2D5ABB26-0587-4C30-8999-92F81FD0307C}" styleName="No Style, No Grid">
<a:wholeTbl>${txStyle('tx1')}<a:tcStyle><a:tcBdr/><a:fill><a:noFill/></a:fill></a:tcStyle></a:wholeTbl>
</a:tblStyle>`,
}

const builtinCache = new Map()

/** Find a table style by id in tableStyles.xml, falling back to built-ins */
export function findTableStyle(tableStyles, styleId) {
  if (!styleId) return undefined
  let list = getTextByPathList(tableStyles, ['a:tblStyleLst', 'a:tblStyle'])
  if (list && !Array.isArray(list)) list = [list]
  const found = (list || []).find((s) => getTextByPathList(s, ['attrs', 'styleId']) === styleId)
  if (found) return found
  if (!BUILTIN[styleId]) return undefined
  if (!builtinCache.has(styleId)) {
    const parsed = simplifyLostLess(txml.parse(BUILTIN[styleId](), { keepWhitespace: false }))
    builtinCache.set(styleId, parsed['a:tblStyle'])
  }
  return builtinCache.get(styleId)
}

const PART_FILL = (part, warpObj) => {
  const tcStyle = getTextByPathList(part, ['a:tcStyle'])
  if (!tcStyle) return undefined
  const fill = getTextByPathList(tcStyle, ['a:fill'])
  if (fill) {
    if (getTextByPathList(fill, ['a:noFill'])) return null
    const solidFill = getTextByPathList(fill, ['a:solidFill'])
    if (solidFill) return getSolidFill(solidFill, undefined, undefined, warpObj) || undefined
    const stops = getTextByPathList(fill, ['a:gradFill', 'a:gsLst', 'a:gs'])
    if (stops) return getSolidFill(Array.isArray(stops) ? stops[0] : stops, undefined, undefined, warpObj) || undefined
  }
  const fillRef = getTextByPathList(tcStyle, ['a:fillRef'])
  if (fillRef) return getSolidFill(fillRef, undefined, undefined, warpObj) || undefined
  return undefined
}

// A border edge from a style part: <a:ln> or <a:lnRef> (theme line style)
const PART_EDGE = (part, name, warpObj) => {
  const e = getTextByPathList(part, ['a:tcStyle', 'a:tcBdr', name])
  if (!e) return undefined
  const lnNode = getTextByPathList(e, ['a:ln'])
  if (lnNode) return getBorder(lnNode, undefined, warpObj)
  const lnRef = getTextByPathList(e, ['a:lnRef'])
  if (lnRef) return getBorder({ 'p:style': { 'a:lnRef': lnRef } }, undefined, warpObj)
  return undefined
}

/**
 * Resolve style-derived formatting for cell (r, c).
 * flags: { firstRow, lastRow, firstCol, lastCol, bandRow, bandCol } booleans
 * Returns { fill, fontColor, bold, italic, borders: { top, bottom, left, right } }
 * (fill: colour string, null = explicitly none, undefined = unset)
 */
export function resolveTableCellStyle(style, flags, r, c, nRows, nCols, warpObj) {
  const out = { fill: undefined, fontColor: undefined, bold: undefined, italic: undefined, borders: {} }
  if (!style) return out

  // Background of the whole table (behind every cell)
  const tblBg = getTextByPathList(style, ['a:tblBg'])
  if (tblBg) {
    const ref = getTextByPathList(tblBg, ['a:fillRef'])
    const solidFill = getTextByPathList(tblBg, ['a:fill', 'a:solidFill'])
    const clr = solidFill ? getSolidFill(solidFill, undefined, undefined, warpObj) : ref ? getSolidFill(ref, undefined, undefined, warpObj) : ''
    if (clr) out.fill = clr
  }

  const firstDataRow = flags.firstRow ? 1 : 0
  const lastDataRow = flags.lastRow ? nRows - 2 : nRows - 1
  const firstDataCol = flags.firstCol ? 1 : 0
  const lastDataCol = flags.lastCol ? nCols - 2 : nCols - 1

  // [part, region {r0, r1, c0, c1}] in increasing priority
  const layers = [['a:wholeTbl', { r0: 0, r1: nRows - 1, c0: 0, c1: nCols - 1 }]]
  if (flags.bandCol && c >= firstDataCol && c <= lastDataCol) {
    const band = (c - firstDataCol) % 2 === 0 ? 'a:band1V' : 'a:band2V'
    layers.push([band, { r0: 0, r1: nRows - 1, c0: c, c1: c }])
  }
  if (flags.bandRow && r >= firstDataRow && r <= lastDataRow) {
    const band = (r - firstDataRow) % 2 === 0 ? 'a:band1H' : 'a:band2H'
    layers.push([band, { r0: r, r1: r, c0: 0, c1: nCols - 1 }])
  }
  if (flags.lastCol && c === nCols - 1) layers.push(['a:lastCol', { r0: 0, r1: nRows - 1, c0: c, c1: c }])
  if (flags.firstCol && c === 0) layers.push(['a:firstCol', { r0: 0, r1: nRows - 1, c0: 0, c1: 0 }])
  if (flags.lastRow && r === nRows - 1) layers.push(['a:lastRow', { r0: r, r1: r, c0: 0, c1: nCols - 1 }])
  if (flags.firstRow && r === 0) layers.push(['a:firstRow', { r0: 0, r1: 0, c0: 0, c1: nCols - 1 }])
  const one = { r0: r, r1: r, c0: c, c1: c }
  if (flags.firstRow && flags.lastCol && r === 0 && c === nCols - 1) layers.push(['a:neCell', one])
  if (flags.firstRow && flags.firstCol && r === 0 && c === 0) layers.push(['a:nwCell', one])
  if (flags.lastRow && flags.lastCol && r === nRows - 1 && c === nCols - 1) layers.push(['a:seCell', one])
  if (flags.lastRow && flags.firstCol && r === nRows - 1 && c === 0) layers.push(['a:swCell', one])

  for (const [name, reg] of layers) {
    const part = getTextByPathList(style, [name])
    if (!part) continue
    const fill = PART_FILL(part, warpObj)
    if (fill !== undefined) out.fill = fill
    const tx = getTextByPathList(part, ['a:tcTxStyle'])
    if (tx) {
      const clr = getSolidFill(tx, undefined, undefined, warpObj)
      if (clr) out.fontColor = clr
      const b = getTextByPathList(tx, ['attrs', 'b'])
      if (b === 'on') out.bold = true
      else if (b === 'off') out.bold = false
      const i = getTextByPathList(tx, ['attrs', 'i'])
      if (i === 'on') out.italic = true
      else if (i === 'off') out.italic = false
    }
    const edges = {
      top: PART_EDGE(part, r === reg.r0 ? 'a:top' : 'a:insideH', warpObj),
      bottom: PART_EDGE(part, r === reg.r1 ? 'a:bottom' : 'a:insideH', warpObj),
      left: PART_EDGE(part, c === reg.c0 ? 'a:left' : 'a:insideV', warpObj),
      right: PART_EDGE(part, c === reg.c1 ? 'a:right' : 'a:insideV', warpObj),
    }
    for (const k of Object.keys(edges)) if (edges[k]) out.borders[k] = edges[k]
  }
  return out
}
