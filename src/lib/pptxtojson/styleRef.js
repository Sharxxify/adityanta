// ADITYANTA: helpers for theme style references (p:style fillRef / lnRef /
// effectRef) and for reading XML children in document order.
//
// readXmlFile() groups children by tag name, so the original order of mixed
// siblings (e.g. <a:solidFill/><a:gradFill/><a:gradFill/> in a style list, or
// colour modifiers like <a:lumMod/><a:lumOff/>) is only recoverable through
// the running `attrs.order` counter it stamps on every node.

import { getTextByPathList } from './utils'

/** Children of a simplified XML node as [{ tag, node }] in document order */
export function orderedChildren(node) {
  if (!node || typeof node !== 'object') return []
  const out = []
  for (const key of Object.keys(node)) {
    if (key === 'attrs' || key === 'value') continue
    const v = node[key]
    const list = Array.isArray(v) ? v : [v]
    list.forEach((n) => out.push({ tag: key, node: n }))
  }
  return out.sort((a, b) => (a.node?.attrs?.order ?? 0) - (b.node?.attrs?.order ?? 0))
}

/**
 * Entry `idx` (1-based) of a theme format-scheme list:
 * 'a:fillStyleLst' | 'a:bgFillStyleLst' | 'a:lnStyleLst' | 'a:effectStyleLst'
 */
export function getThemeStyleEntry(warpObj, listName, idx) {
  if (!(idx > 0)) return null
  const lst = getTextByPathList(warpObj, ['themeContent', 'a:theme', 'a:themeElements', 'a:fmtScheme', listName])
  return orderedChildren(lst)[idx - 1] || null
}
