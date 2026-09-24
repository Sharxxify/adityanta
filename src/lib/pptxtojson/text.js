import { getHorizontalAlign, getParagraphSpacing, getParagraphIndent, getParagraphStyleNodes } from './paragraph'
import { getSolidFill } from './fill'
import { getTextByPathList } from './utils'

import {
  getFontType,
  getFontColor,
  getFontSize,
  getFontBold,
  getFontItalic,
  getFontDecoration,
  getFontDecorationLine,
  getFontSpace,
  getFontSubscript,
  getFontCaps,
  getFontShadow,
} from './fontStyle'

export function getTextNodeValue(node) {
  if (typeof node === 'string') return node
  if (node && typeof node.value === 'string') return node.value
  return undefined
}

// ADITYANTA: Wingdings/Symbol bullet glyphs -> Unicode equivalents
const SYMBOL_FONT_BULLETS = {
  'Ø': '➢', '§': '■', 'ü': '✔', 'q': '❑', 'v': '❖', 'Ÿ': '•', 'n': '■', 'l': '●',
  'u': '◆', 'o': '□', 'p': '◻', 'ª': '▪', '¨': '◻', 'à': '➔', 'è': '➔', 'Þ': '➔',
  'ð': '⇨', 'û': '✗', 'ý': '☒', 'þ': '☑', '': '•', '·': '•', '–': '–',
}

const escapeText = (t) => String(t)
  .replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

// ADITYANTA: keep normal spaces so text wraps like PowerPoint (the upstream
// code turned every space into &nbsp;, which prevents line wrapping).
const processRunText = (t) => escapeText(t).replace(/\t/g, '    ')

const toRoman = (num) => {
  const map = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let out = ''
  for (const [v, sym] of map) while (num >= v) { out += sym; num -= v }
  return out
}
const toAlpha = (num) => {
  let out = ''
  let n = num
  while (n > 0) { n -= 1; out = String.fromCharCode(97 + (n % 26)) + out; n = Math.floor(n / 26) }
  return out
}

const formatAutoNumber = (scheme, n) => {
  const s = scheme || 'arabicPeriod'
  let base
  if (s.startsWith('alphaLc')) base = toAlpha(n)
  else if (s.startsWith('alphaUc')) base = toAlpha(n).toUpperCase()
  else if (s.startsWith('romanLc')) base = toRoman(n)
  else if (s.startsWith('romanUc')) base = toRoman(n).toUpperCase()
  else base = String(n)
  if (s.endsWith('ParenBoth')) return `(${base})`
  if (s.endsWith('ParenR')) return `${base})`
  if (s.endsWith('Period')) return `${base}.`
  if (s.endsWith('Minus')) return `${base}-`
  return base
}

// ADITYANTA: resolve bullet properties through PowerPoint's inheritance chain
function getBulletInfo(pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, warpObj) {
  const styleNodes = getParagraphStyleNodes(pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, warpObj) || []
  let kind = null
  let char = ''
  let scheme = ''
  let startAt = 1
  let color = ''
  let sizePct = 0
  let font = ''
  for (const node of styleNodes) {
    if (!node) continue
    if (!kind) {
      if (node['a:buNone']) kind = 'none'
      else if (node['a:buAutoNum']) {
        kind = 'num'
        scheme = getTextByPathList(node, ['a:buAutoNum', 'attrs', 'type']) || 'arabicPeriod'
        startAt = parseInt(getTextByPathList(node, ['a:buAutoNum', 'attrs', 'startAt']) || '1', 10) || 1
      }
      else if (node['a:buChar']) {
        kind = 'char'
        char = getTextByPathList(node, ['a:buChar', 'attrs', 'char']) || '•'
      }
      else if (node['a:buBlip']) {
        kind = 'char'
        char = '•'
      }
    }
    if (!color && node['a:buClr']) color = getSolidFill(node['a:buClr'], undefined, undefined, warpObj)
    if (!sizePct && node['a:buSzPct']) sizePct = parseInt(getTextByPathList(node, ['a:buSzPct', 'attrs', 'val']) || '0', 10) / 100000
    if (!font && node['a:buFont']) font = getTextByPathList(node, ['a:buFont', 'attrs', 'typeface']) || ''
  }
  if (!kind || kind === 'none') return null
  if (kind === 'char' && /wingdings|symbol|webdings/i.test(font)) {
    char = SYMBOL_FONT_BULLETS[char] || '•'
    font = ''
  }
  return { kind, char, scheme, startAt, color, sizePct, font }
}

const ptNumber = (value) => {
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

export function genTextBody(textBodyNode, spNode, slideLayoutSpNode, slideMasterSpNode, type, warpObj) {
  if (!textBodyNode) return ''

  let text = ''

  const diagramFill = warpObj.diagramTextFills?.[getTextByPathList(spNode, ['attrs', 'modelId'])]
  const pFontStyle = diagramFill || getTextByPathList(spNode, ['p:style', 'a:fontRef'])
  const slideMasterTextStyles = spNode && spNode['a:tcPr'] ? undefined : warpObj['slideMasterTextStyles']
  const defaultTextStyle = spNode && spNode['a:tcPr'] ? warpObj['defaultTextStyle'] : undefined

  const pNode = textBodyNode['a:p']
  const pNodes = pNode.constructor === Array ? pNode : [pNode]

  // auto-number counters per list level
  const counters = []

  for (const pNode of pNodes) {
    let rNode = pNode['a:r']
    let fldNode = pNode['a:fld']
    let brNode = pNode['a:br']
    // ADITYANTA: keep runs, fields and line breaks in document order
    const pieces = []
    for (const [key, list] of [['r', rNode], ['fld', fldNode], ['br', brNode]]) {
      if (!list) continue
      const arr = list.constructor === Array ? list : [list]
      arr.forEach((item) => pieces.push({ key, item, order: Number(getTextByPathList(item, ['attrs', 'order'])) }))
    }
    pieces.sort((a, b) => (Number.isFinite(a.order) && Number.isFinite(b.order) ? a.order - b.order : 0))

    const align = getHorizontalAlign(pNode, spNode, type, slideLayoutSpNode, slideMasterSpNode, warpObj)
    const spacing = getParagraphSpacing(pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, warpObj)
    const indent = getParagraphIndent(pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, warpObj)
    const level = Math.max(0, getListLevel(pNode))

    // Run styles first: the paragraph takes the size of its first run so em
    // based spacing and line-height resolve against the right font size.
    const runs = []
    if (pieces.length === 0) {
      const info = getSpanStyleInfo(pNode, pNode, textBodyNode, pFontStyle, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, defaultTextStyle, warpObj)
      runs.push({ ...info, isEmpty: true })
    }
    else {
      for (const piece of pieces) {
        if (piece.key === 'br') { runs.push({ isBreak: true }); continue }
        runs.push(getSpanStyleInfo(piece.item, pNode, textBodyNode, pFontStyle, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, defaultTextStyle, warpObj))
      }
    }
    const firstRun = runs.find((r) => !r.isBreak) || {}
    const paraFontSize = firstRun.fontSize || ''

    let styleText = `text-align: ${align};`
    if (paraFontSize) styleText += `font-size: ${paraFontSize};`
    if (spacing) {
      if (spacing.lineSpacing) styleText += `line-height: ${spacing.lineSpacing};`
      if (spacing.spaceBefore) styleText += `margin-top: ${spacing.spaceBefore};`
      if (spacing.spaceAfter) styleText += `margin-bottom: ${spacing.spaceAfter};`
    }

    const hasText = runs.some((r) => !r.isBreak && !r.isEmpty && r.text && r.text !== '&nbsp;')
    const bullet = hasText ? getBulletInfo(pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, warpObj) : null

    const marL = indent?.marginLeft ? ptNumber(indent.marginLeft) : 0
    const ind = indent?.textIndent ? ptNumber(indent.textIndent) : 0
    if (marL) styleText += `margin-left: ${marL}pt;`
    if (ind) styleText += `text-indent: ${ind}pt;`

    text += `<p style="${styleText}">`

    if (bullet) {
      let glyph = bullet.char
      if (bullet.kind === 'num') {
        counters.length = level + 1
        counters[level] = counters[level] === undefined ? bullet.startAt : counters[level] + 1
        glyph = formatAutoNumber(bullet.scheme, counters[level])
      }
      else counters.length = level
      const runSize = ptNumber(paraFontSize) || 18
      const bulletSize = bullet.sizePct ? runSize * bullet.sizePct : runSize
      const bStyle = [
        'display: inline-block;',
        'text-indent: 0;',
        ind < 0 ? `min-width: ${-ind}pt;` : 'margin-right: 0.5em;',
        `font-size: ${Math.round(bulletSize * 100) / 100}pt;`,
        bullet.color ? `color: ${bullet.color};` : (firstRun.color ? `color: ${firstRun.color};` : ''),
        bullet.font ? `font-family: ${bullet.font};` : '',
        'font-weight: normal; font-style: normal; text-decoration: none;',
      ].join('')
      text += `<span data-bullet="1" contenteditable="false" style="${bStyle}">${escapeText(glyph)}</span>`
    }
    else if (hasText) counters.length = 0

    // merge adjacent runs with identical style
    let prev = null
    let acc = ''
    const flush = () => {
      if (!prev) return
      const body = prev.hasLink
        ? `<a href="${prev.linkURL}" target="_blank" rel="noopener noreferrer">${acc}</a>`
        : acc
      text += `<span style="${prev.styleText}">${body}</span>`
      prev = null
      acc = ''
    }
    for (const run of runs) {
      if (run.isBreak) { flush(); text += '<br>'; continue }
      if (run.isEmpty) {
        // empty paragraph keeps its height via a styled break
        text += `<span style="${run.styleText}"><br></span>`
        continue
      }
      const t = processRunText(run.text === '&nbsp;' ? ' ' : run.text)
      if (prev && prev.styleText === run.styleText && !prev.hasLink && !run.hasLink) acc += t
      else { flush(); prev = run; acc = t }
    }
    flush()

    text += '</p>'
  }
  return text
}

export function getListType(node) {
  const pPrNode = node['a:pPr']
  if (!pPrNode) return ''

  if (pPrNode['a:buChar']) return 'ul'
  if (pPrNode['a:buAutoNum']) return 'ol'
  
  return ''
}
export function getListLevel(node) {
  const pPrNode = node['a:pPr']
  if (!pPrNode) return -1

  const lvlNode = getTextByPathList(pPrNode, ['attrs', 'lvl'])
  if (lvlNode !== undefined) return parseInt(lvlNode)

  return 0
}

export function genSpanElement(node, pNode, textBodyNode, pFontStyle, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, defaultTextStyle, warpObj) {
  const { styleText, text, hasLink, linkURL } = getSpanStyleInfo(node, pNode, textBodyNode, pFontStyle, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, defaultTextStyle, warpObj)
  const processedText = text.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;').replace(/\s/g, '&nbsp;')

  if (hasLink) {
    return `<span style="${styleText}"><a href="${linkURL}" target="_blank">${processedText}</a></span>`
  }
  return `<span style="${styleText}">${processedText}</span>`
}

export function getSpanStyleInfo(node, pNode, textBodyNode, pFontStyle, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, defaultTextStyle, warpObj) {
  let lvl = 1
  const pPrNode = pNode['a:pPr']
  const lvlNode = getTextByPathList(pPrNode, ['attrs', 'lvl'])
  if (lvlNode !== undefined) lvl = parseInt(lvlNode) + 1

  let text = getTextNodeValue(node['a:t'])
  if (typeof text !== 'string') text = getTextNodeValue(getTextByPathList(node, ['a:fld', 'a:t']))
  if (typeof text !== 'string') text = '&nbsp;'

  let styleText = ''
  const fontColor = getFontColor(node, pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, lvl, pFontStyle, warpObj)
  const fontSize = getFontSize(node, pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, lvl, defaultTextStyle)
  const fontType = getFontType(node, pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, lvl, warpObj)
  const fontBold = getFontBold(node, pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, lvl)
  const fontItalic = getFontItalic(node, pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, lvl)
  const fontDecoration = getFontDecoration(node, pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, lvl)
  const fontDecorationLine = getFontDecorationLine(node, pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, lvl)
  const fontSpace = getFontSpace(node, pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, lvl)
  const shadow = getFontShadow(node, pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, lvl, warpObj)
  const subscript = getFontSubscript(node, pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, lvl)
  const caps = getFontCaps(node, pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, lvl) // ADITYANTA

  if (fontColor) {
    if (typeof fontColor === 'string') styleText += `color: ${fontColor};`
    else if (fontColor.colors) {
      const { colors, rot } = fontColor
      const stops = colors.map(item => `${item.color} ${item.pos}`).join(', ')
      const gradientStyle = `linear-gradient(${rot + 90}deg, ${stops})`
      styleText += `background: ${gradientStyle}; background-clip: text; color: transparent;`
    }
  }
  // ADITYANTA: PowerPoint draws super/subscript runs at 2/3 size
  if (fontSize) styleText += `font-size: ${subscript && /pt$/.test(fontSize) ? `${Math.round(parseFloat(fontSize) * 66.7) / 100}pt` : fontSize};`
  if (fontType) styleText += `font-family: ${fontType};`
  if (fontBold) styleText += `font-weight: ${fontBold};`
  if (fontItalic) styleText += `font-style: ${fontItalic};`
  if (fontDecoration) styleText += `text-decoration: ${fontDecoration};`
  if (fontDecorationLine) styleText += `text-decoration-line: ${fontDecorationLine};`
  if (fontSpace) styleText += `letter-spacing: ${fontSpace};`
  if (subscript) styleText += `vertical-align: ${subscript};`
  if (caps) styleText += caps
  if (shadow) styleText += `text-shadow: ${shadow};`

  const linkID = getTextByPathList(node, ['a:rPr', 'a:hlinkClick', 'attrs', 'r:id'])
  const hasLink = linkID && warpObj['slideResObj'][linkID]

  return {
    styleText,
    text,
    hasLink,
    linkURL: hasLink ? warpObj['slideResObj'][linkID]['target'] : null,
    fontSize,
    color: typeof fontColor === 'string' ? fontColor : '',
  }
}
