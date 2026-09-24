import { getSolidFill } from './fill'
import { getThemeStyleEntry } from './styleRef' // ADITYANTA
import { getTextByPathList } from './utils'

function getLineEnd(node) {
  const attrs = getTextByPathList(node, ['attrs'])
  if (!attrs) return undefined

  const lineEnd = { type: attrs.type || 'none' }
  if (attrs.w) lineEnd.width = attrs.w
  if (attrs.len) lineEnd.length = attrs.len
  return lineEnd
}

// ADITYANTA: colour of a line node: undefined = not specified, null = no line
function lineFillColor(ln, phClr, warpObj) {
  if (!ln || typeof ln !== 'object') return undefined
  if (getTextByPathList(ln, ['a:noFill'])) return null
  const solid = getTextByPathList(ln, ['a:solidFill'])
  if (solid) return getSolidFill(solid, undefined, phClr, warpObj) || undefined
  let stops = getTextByPathList(ln, ['a:gradFill', 'a:gsLst', 'a:gs'])
  if (stops) {
    if (Array.isArray(stops)) stops = stops[0]
    return getSolidFill(stops, undefined, phClr, warpObj) || undefined
  }
  return undefined
}

export function getBorder(node, elType, warpObj) {
  // ADITYANTA: the shape's own <a:ln> wins; anything it leaves out comes from
  // the theme line style referenced by p:style/a:lnRef (whose colour is phClr).
  // Table cells pass the <a:lnX> node itself.
  const spLn = getTextByPathList(node, ['p:spPr', 'a:ln'])
  const lnRefNode = getTextByPathList(node, ['p:style', 'a:lnRef'])
  let styleLn
  let phClr
  if (lnRefNode) {
    const idx = Number(getTextByPathList(lnRefNode, ['attrs', 'idx']))
    styleLn = getThemeStyleEntry(warpObj, 'a:lnStyleLst', idx)?.node
    phClr = getSolidFill(lnRefNode, undefined, undefined, warpObj) || undefined
  }
  const ownLn = spLn || (!lnRefNode && !node?.['p:spPr'] ? node : undefined)
  const lineNode = ownLn || styleLn || node
  const pick = (path) => {
    const v = ownLn ? getTextByPathList(ownLn, path) : undefined
    return v !== undefined ? v : (styleLn ? getTextByPathList(styleLn, path) : undefined)
  }

  let color = lineFillColor(ownLn, phClr, warpObj)
  if (color === undefined && styleLn) color = lineFillColor(styleLn, phClr, warpObj)
  if (color === undefined && styleLn) color = phClr

  let w = parseInt(getTextByPathList(ownLn, ['attrs', 'w']))
  if (isNaN(w) && styleLn) w = parseInt(getTextByPathList(styleLn, ['attrs', 'w']))

  let borderWidth = 0
  if (color) borderWidth = isNaN(w) ? 0.75 : w / 12700
  let borderColor = color || '#000000'
  if (!borderColor.startsWith('#')) borderColor = `#${borderColor}`

  const type = pick(['a:prstDash', 'attrs', 'val'])
  let borderType = 'solid'
  let strokeDasharray = '0'
  switch (type) {
    case 'solid':
      borderType = 'solid'
      strokeDasharray = '0'
      break
    case 'dash':
      borderType = 'dashed'
      strokeDasharray = '5'
      break
    case 'dashDot':
      borderType = 'dashed'
      strokeDasharray = '5, 5, 1, 5'
      break
    case 'dot':
      borderType = 'dotted'
      strokeDasharray = '1, 5'
      break
    case 'lgDash':
      borderType = 'dashed'
      strokeDasharray = '10, 5'
      break
    case 'lgDashDotDot':
      borderType = 'dotted'
      strokeDasharray = '10, 5, 1, 5, 1, 5'
      break
    case 'sysDash':
      borderType = 'dashed'
      strokeDasharray = '5, 2'
      break
    case 'sysDashDot':
      borderType = 'dotted'
      strokeDasharray = '5, 2, 1, 5'
      break
    case 'sysDashDotDot':
      borderType = 'dotted'
      strokeDasharray = '5, 2, 1, 5, 1, 5'
      break
    case 'sysDot':
      borderType = 'dotted'
      strokeDasharray = '2, 5'
      break
    default:
  }

  const headEnd = getLineEnd(pick(['a:headEnd']) || getTextByPathList(lineNode, ['a:headEnd']))
  const tailEnd = getLineEnd(pick(['a:tailEnd']) || getTextByPathList(lineNode, ['a:tailEnd']))

  return {
    borderColor,
    borderWidth,
    borderType,
    strokeDasharray,
    headEnd,
    tailEnd,
  }
}
