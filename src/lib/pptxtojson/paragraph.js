import { RATIO_EMUs_Points } from './constants'
import { getTextByPathList, numberToFixed } from './utils'

function getParagraphLevel(node) {
  let lvlIdx = 1
  const lvlNode = getTextByPathList(node, ['a:pPr', 'attrs', 'lvl'])
  if (lvlNode !== undefined) lvlIdx = parseInt(lvlNode) + 1
  return lvlIdx
}

function getAlignFromTextNode(node, lvlStr) {
  if (!node) return ''

  let algn = getTextByPathList(node, ['p:txBody', 'a:lstStyle', lvlStr, 'attrs', 'algn'])
  if (!algn) algn = getTextByPathList(node, ['p:txBody', 'a:p', 'a:pPr', 'attrs', 'algn'])

  return algn || ''
}

export function getHorizontalAlign(node, pNode, type, slideLayoutSpNode, slideMasterSpNode, warpObj) {
  let algn = getTextByPathList(node, ['a:pPr', 'attrs', 'algn'])

  if (!algn) algn = getTextByPathList(pNode, ['p:txBody', 'a:p', 'a:pPr', 'attrs', 'algn'])

  if (!algn) {
    const lvlIdx = getParagraphLevel(node)
    const lvlStr = 'a:lvl' + lvlIdx + 'pPr'

    algn = getAlignFromTextNode(slideLayoutSpNode, lvlStr)
    if (!algn) algn = getAlignFromTextNode(slideMasterSpNode, lvlStr)

    // ADITYANTA: subtitle/content placeholders use the master body style
    if (!algn && (type === 'title' || type === 'ctrTitle')) {
      algn = getTextByPathList(warpObj, ['slideMasterTextStyles', 'p:titleStyle', lvlStr, 'attrs', 'algn'])
    } 
    else if (!algn && (type === 'body' || type === 'subTitle')) {
      algn = getTextByPathList(warpObj, ['slideMasterTextStyles', 'p:bodyStyle', lvlStr, 'attrs', 'algn'])
    } 
    else if (!algn) {
      algn = getTextByPathList(warpObj, ['slideMasterTextStyles', 'p:otherStyle', lvlStr, 'attrs', 'algn'])
    }
  }

  let align = 'left'
  if (algn) {
    switch (algn) {
      case 'l':
        align = 'left'
        break
      case 'r':
        align = 'right'
        break
      case 'ctr':
        align = 'center'
        break
      case 'just':
        align = 'justify'
        break
      case 'dist':
        align = 'justify'
        break
      default:
        align = 'inherit'
    }
  }
  return align
}

export function getVerticalAlign(node, slideLayoutSpNode, slideMasterSpNode) {
  let anchor = getTextByPathList(node, ['p:txBody', 'a:bodyPr', 'attrs', 'anchor'])
  if (!anchor) {
    anchor = getTextByPathList(slideLayoutSpNode, ['p:txBody', 'a:bodyPr', 'attrs', 'anchor'])
    if (!anchor) {
      anchor = getTextByPathList(slideMasterSpNode, ['p:txBody', 'a:bodyPr', 'attrs', 'anchor'])
      if (!anchor) anchor = 't'
    }
  }
  return (anchor === 'ctr') ? 'mid' : ((anchor === 'b') ? 'down' : 'up')
}

export function getTextAutoFit(node, slideLayoutSpNode, slideMasterSpNode) {
  function checkBodyPr(bodyPr) {
    if (!bodyPr) return null

    if (bodyPr['a:noAutofit']) return { result: null }
    else if (bodyPr['a:spAutoFit']) return { result: { type: 'shape' } }
    else if (bodyPr['a:normAutofit']) {
      const fontScale = getTextByPathList(bodyPr['a:normAutofit'], ['attrs', 'fontScale'])
      const lnSpcReduction = getTextByPathList(bodyPr['a:normAutofit'], ['attrs', 'lnSpcReduction'])
      // ADITYANTA: also report the line spacing reduction PowerPoint applied
      return {
        result: {
          type: 'text',
          ...(fontScale ? { fontScale: parseInt(fontScale) / 1000 } : {}),
          ...(lnSpcReduction ? { lnSpcReduction: parseInt(lnSpcReduction) / 1000 } : {}),
        }
      }
    }
    return null
  }

  const nodeCheck = checkBodyPr(getTextByPathList(node, ['p:txBody', 'a:bodyPr']))
  if (nodeCheck) return nodeCheck.result

  const layoutCheck = checkBodyPr(getTextByPathList(slideLayoutSpNode, ['p:txBody', 'a:bodyPr']))
  if (layoutCheck) return layoutCheck.result

  const masterCheck = checkBodyPr(getTextByPathList(slideMasterSpNode, ['p:txBody', 'a:bodyPr']))
  if (masterCheck) return masterCheck.result

  return null
}

function pushParagraphStyleNode(styleNodes, styleNode) {
  if (styleNode) styleNodes.push(styleNode)
}

function appendTextBodyParagraphStyleNodes(styleNodes, textBodyNode, lvl) {
  if (!textBodyNode) return

  const lvlPath = `a:lvl${lvl}pPr`
  pushParagraphStyleNode(styleNodes, getTextByPathList(textBodyNode, ['a:lstStyle', lvlPath]))
}

function appendShapeParagraphStyleNodes(styleNodes, shapeNode, lvl) {
  if (!shapeNode) return

  const lvlPath = `a:lvl${lvl}pPr`
  pushParagraphStyleNode(styleNodes, getTextByPathList(shapeNode, ['p:txBody', 'a:lstStyle', lvlPath]))
  pushParagraphStyleNode(styleNodes, getTextByPathList(shapeNode, ['p:txBody', 'a:p', 'a:pPr']))
}

function appendMasterTextParagraphStyleNodes(styleNodes, type, lvl, slideMasterTextStyles) {
  if (!slideMasterTextStyles) return

  const lvlPath = `a:lvl${lvl}pPr`

  // ADITYANTA: subtitle placeholders inherit from the master BODY style
  if (type === 'title' || type === 'ctrTitle') {
    pushParagraphStyleNode(styleNodes, getTextByPathList(slideMasterTextStyles, ['p:titleStyle', lvlPath]))
  }
  else if (type === 'body' || type === 'subTitle') {
    pushParagraphStyleNode(styleNodes, getTextByPathList(slideMasterTextStyles, ['p:bodyStyle', lvlPath]))
  }
  else {
    pushParagraphStyleNode(styleNodes, getTextByPathList(slideMasterTextStyles, ['p:otherStyle', lvlPath]))
  }
}

function appendDefaultTextParagraphStyleNodes(styleNodes, defaultTextStyle, lvl) {
  if (!defaultTextStyle) return

  const lvlPath = `a:lvl${lvl}pPr`
  pushParagraphStyleNode(styleNodes, getTextByPathList(defaultTextStyle, [lvlPath]))
  pushParagraphStyleNode(styleNodes, getTextByPathList(defaultTextStyle, ['a:defPPr']))
}

export function getParagraphStyleNodes(pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, warpObj) {
  if (!pNode) return null

  const pPrNode = pNode['a:pPr']
  const lvl = getParagraphLevel(pNode)
  const styleNodes = []

  pushParagraphStyleNode(styleNodes, pPrNode)
  appendTextBodyParagraphStyleNodes(styleNodes, textBodyNode, lvl)
  appendShapeParagraphStyleNodes(styleNodes, slideLayoutSpNode, lvl)
  appendShapeParagraphStyleNodes(styleNodes, slideMasterSpNode, lvl)
  appendMasterTextParagraphStyleNodes(styleNodes, type, lvl, slideMasterTextStyles)
  appendDefaultTextParagraphStyleNodes(styleNodes, getTextByPathList(warpObj, ['defaultTextStyle']), lvl)

  return styleNodes
}

function getLineSpacingValue(spacingNode, singleLineSpacingFactor = 1) {
  const spcPct = getTextByPathList(spacingNode, ['a:spcPct', 'attrs', 'val'])
  const spcPts = getTextByPathList(spacingNode, ['a:spcPts', 'attrs', 'val'])

  if (spcPct !== undefined) {
    const value = String(spcPct).trim()
    const percentage = value.endsWith('%') ? Number.parseFloat(value) / 100 : Number.parseInt(value, 10) / 100000
    if (Number.isFinite(percentage)) return percentage * singleLineSpacingFactor
  }
  if (spcPts) return parseInt(spcPts) / 100 + 'pt'

  return undefined
}

function getParagraphSpacingValue(spacingNode) {
  const spcPct = getTextByPathList(spacingNode, ['a:spcPct', 'attrs', 'val'])
  const spcPts = getTextByPathList(spacingNode, ['a:spcPts', 'attrs', 'val'])

  // ADITYANTA: spcPct is 1/1000 of a percent of one line (1 line = 1.2em)
  if (spcPct) return numberToFixed((parseInt(spcPct) / 100000) * 1.2, 4) + 'em'
  if (spcPts) return parseInt(spcPts) / 100 + 'pt'

  return undefined
}

function getParagraphIndentValue(styleNode, attrName) {
  const val = getTextByPathList(styleNode, ['attrs', attrName])

  if (val !== undefined && val !== '') return numberToFixed(parseInt(val) * RATIO_EMUs_Points) + 'pt'

  return undefined
}

export function getParagraphSpacing(pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, warpObj) {
  const styleNodes = getParagraphStyleNodes(pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, warpObj)
  if (!styleNodes) return null

  const spacing = {}
  const singleLineSpacingFactor = getTextByPathList(warpObj, ['options', 'singleLineSpacingFactor'])

  for (const styleNode of styleNodes) {
    if (spacing.lineSpacing === undefined) {
      const lineSpacing = getLineSpacingValue(styleNode['a:lnSpc'], singleLineSpacingFactor)
      if (lineSpacing !== undefined) spacing.lineSpacing = lineSpacing
    }

    if (spacing.spaceBefore === undefined) {
      const spaceBefore = getParagraphSpacingValue(styleNode['a:spcBef'])
      if (spaceBefore !== undefined) spacing.spaceBefore = spaceBefore
    }

    if (spacing.spaceAfter === undefined) {
      const spaceAfter = getParagraphSpacingValue(styleNode['a:spcAft'])
      if (spaceAfter !== undefined) spacing.spaceAfter = spaceAfter
    }
  }

  return Object.keys(spacing).length > 0 ? spacing : null
}

export function getParagraphIndent(pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, warpObj) {
  const styleNodes = getParagraphStyleNodes(pNode, textBodyNode, slideLayoutSpNode, slideMasterSpNode, type, slideMasterTextStyles, warpObj)
  if (!styleNodes) return null

  const indent = {}

  for (const styleNode of styleNodes) {
    if (indent.marginLeft === undefined) {
      const marginLeft = getParagraphIndentValue(styleNode, 'marL')
      if (marginLeft !== undefined) indent.marginLeft = marginLeft
    }

    if (indent.textIndent === undefined) {
      const textIndent = getParagraphIndentValue(styleNode, 'indent')
      if (textIndent !== undefined) indent.textIndent = textIndent
    }
  }

  return Object.keys(indent).length > 0 ? indent : null
}
