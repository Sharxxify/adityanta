import { getTextByPathList, numberToFixed } from './utils'
import { RATIO_EMUs_Points } from './constants'

const DEFAULT_INSET_EMU = {
  lIns: 91440, // 0.1 in
  rIns: 91440, // 0.1 in
  tIns: 45720, // 0.05 in
  bIns: 45720, // 0.05 in
}

function getInsetAttr(slideNode, layoutNode, masterNode, attrName) {
  let v = getTextByPathList(slideNode, ['p:txBody', 'a:bodyPr', 'attrs', attrName])
  if (v !== undefined && v !== null && v !== '') return v

  v = getTextByPathList(layoutNode, ['p:txBody', 'a:bodyPr', 'attrs', attrName])
  if (v !== undefined && v !== null && v !== '') return v

  return getTextByPathList(masterNode, ['p:txBody', 'a:bodyPr', 'attrs', attrName])
}

function emuToPt(emuStr) {
  if (emuStr === undefined || emuStr === null || emuStr === '') return null
  const v = parseInt(emuStr, 10)
  if (!Number.isFinite(v)) return null
  return numberToFixed(v * RATIO_EMUs_Points)
}

export function getTextInsets(node, slideLayoutSpNode, slideMasterSpNode) {
  const nodeBodyPr = getTextByPathList(node, ['p:txBody', 'a:bodyPr'])
  const layoutBodyPr = getTextByPathList(slideLayoutSpNode, ['p:txBody', 'a:bodyPr'])
  const masterBodyPr = getTextByPathList(slideMasterSpNode, ['p:txBody', 'a:bodyPr'])

  if (!nodeBodyPr) {
    if (!layoutBodyPr) {
      if (!masterBodyPr) return null
    }
  }

  let li = getInsetAttr(node, slideLayoutSpNode, slideMasterSpNode, 'lIns')
  if (li === undefined || li === null || li === '') li = DEFAULT_INSET_EMU.lIns

  let ti = getInsetAttr(node, slideLayoutSpNode, slideMasterSpNode, 'tIns')
  if (ti === undefined || ti === null || ti === '') ti = DEFAULT_INSET_EMU.tIns

  let ri = getInsetAttr(node, slideLayoutSpNode, slideMasterSpNode, 'rIns')
  if (ri === undefined || ri === null || ri === '') ri = DEFAULT_INSET_EMU.rIns

  let bi = getInsetAttr(node, slideLayoutSpNode, slideMasterSpNode, 'bIns')
  if (bi === undefined || bi === null || bi === '') bi = DEFAULT_INSET_EMU.bIns

  let l = emuToPt(li)
  if (l === null) l = 0

  let t = emuToPt(ti)
  if (t === null) t = 0

  let r = emuToPt(ri)
  if (r === null) r = 0

  let b = emuToPt(bi)
  if (b === null) b = 0

  return { l, t, r, b }
}
