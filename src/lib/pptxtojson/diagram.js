import { readXmlFile } from './readXmlFile'
import { getTextNodeValue } from './text'
import { getTextByPathList } from './utils'

export async function loadDiagramFile(warpObj, filename, transformDrawing = false) {
  if (!filename) return null

  const cacheKey = `${transformDrawing ? 'drawing:' : 'xml:'}${filename}`
  if (warpObj.diagramFileCache[cacheKey]) return warpObj.diagramFileCache[cacheKey]

  let content = await readXmlFile(warpObj['zip'], filename)
  if (content && transformDrawing) {
    const contentStr = JSON.stringify(content).replace(/dsp:/g, 'p:')
    content = JSON.parse(contentStr)
  }

  warpObj.diagramFileCache[cacheKey] = content
  return content
}

export function getDiagramDrawingRelId(dataContent) {
  let extNodes = getTextByPathList(dataContent, ['dgm:dataModel', 'dgm:extLst', 'a:ext'])
  if (!extNodes) return ''

  if (!Array.isArray(extNodes)) extNodes = [extNodes]
  for (const extNode of extNodes) {
    const relId = getTextByPathList(extNode, ['dsp:dataModelExt', 'attrs', 'relId'])
    if (relId) return relId
  }

  return ''
}

export async function getDiagramNodeContext(node, warpObj) {
  const relIds = getTextByPathList(node, ['a:graphic', 'a:graphicData', 'dgm:relIds', 'attrs']) || {}
  const diagramContent = {
    data: null,
    layout: null,
    quickStyle: null,
    colors: null,
    drawing: null,
  }
  let digramFileContent = {}
  const diagramResObj = {}

  const diagramDataTarget = getTextByPathList(warpObj['slideResObj'], [relIds['r:dm'], 'target'])
  const diagramLayoutTarget = getTextByPathList(warpObj['slideResObj'], [relIds['r:lo'], 'target'])
  const diagramQuickStyleTarget = getTextByPathList(warpObj['slideResObj'], [relIds['r:qs'], 'target'])
  const diagramColorsTarget = getTextByPathList(warpObj['slideResObj'], [relIds['r:cs'], 'target'])

  if (diagramDataTarget) diagramContent.data = await loadDiagramFile(warpObj, diagramDataTarget)
  if (diagramLayoutTarget) diagramContent.layout = await loadDiagramFile(warpObj, diagramLayoutTarget)
  if (diagramQuickStyleTarget) diagramContent.quickStyle = await loadDiagramFile(warpObj, diagramQuickStyleTarget)
  if (diagramColorsTarget) diagramContent.colors = await loadDiagramFile(warpObj, diagramColorsTarget)

  const drawingRelId = diagramContent.data ? getDiagramDrawingRelId(diagramContent.data) : ''
  const drawingTarget = getTextByPathList(warpObj['slideResObj'], [drawingRelId, 'target'])

  if (drawingTarget) {
    digramFileContent = await loadDiagramFile(warpObj, drawingTarget, true) || {}
    diagramContent.drawing = digramFileContent

    const drawingName = drawingTarget.split('/').pop()
    const diagramResFileName = drawingTarget.replace(drawingName, '_rels/' + drawingName) + '.rels'
    const digramResContent = await readXmlFile(warpObj['zip'], diagramResFileName)
    if (digramResContent) {
      let relationshipArray = digramResContent['Relationships']['Relationship']
      if (relationshipArray && relationshipArray.constructor !== Array) relationshipArray = [relationshipArray]
      if (relationshipArray) {
        for (const relationshipArrayItem of relationshipArray) {
          let relTarget = relationshipArrayItem['attrs']['Target']
          relTarget = relTarget.replace(/\\/g, '/')
          if (relTarget.indexOf('/ppt/') === 0) relTarget = relTarget.substr(1)
          else if (relTarget.indexOf('../') !== -1) relTarget = relTarget.replace('../', 'ppt/')
          else relTarget = drawingTarget.replace(drawingName, '') + relTarget

          diagramResObj[relationshipArrayItem['attrs']['Id']] = {
            type: relationshipArrayItem['attrs']['Type'].replace('http://schemas.openxmlformats.org/officeDocument/2006/relationships/', ''),
            target: relTarget,
          }
        }
      }
    }
  }

  return {
    ...warpObj,
    digramFileContent,
    diagramResObj,
    diagramContent,
    diagramTextFills: getDiagramTextFills(diagramContent),
  }
}

// ADITYANTA: text colour of each drawn SmartArt shape (by modelId), from the
// colour definition of the point's style label (txFillClrLst). The cached
// drawing often only carries the quick style's fontRef (e.g. white), while
// PowerPoint colours the text from the colour definition.
function getDiagramTextFills(diagramContent) {
  const fills = {}
  let labels = getTextByPathList(diagramContent.colors, ['dgm:colorsDef', 'dgm:styleLbl'])
  let pts = getTextByPathList(diagramContent.data, ['dgm:dataModel', 'dgm:ptLst', 'dgm:pt'])
  if (!labels || !pts) return fills
  if (!Array.isArray(labels)) labels = [labels]
  if (!Array.isArray(pts)) pts = [pts]
  const byLabel = {}
  for (const lbl of labels) {
    const fill = lbl?.['dgm:txFillClrLst']
    const name = getTextByPathList(lbl, ['attrs', 'name'])
    if (name && fill && (fill['a:schemeClr'] || fill['a:srgbClr'] || fill['a:prstClr'] || fill['a:sysClr'])) {
      const first = {}
      for (const key of ['a:schemeClr', 'a:srgbClr', 'a:prstClr', 'a:sysClr']) {
        if (fill[key]) { first[key] = Array.isArray(fill[key]) ? fill[key][0] : fill[key]; break }
      }
      byLabel[name] = first
    }
  }
  for (const pt of pts) {
    const id = getTextByPathList(pt, ['attrs', 'modelId'])
    const label = getTextByPathList(pt, ['dgm:prSet', 'attrs', 'presStyleLbl'])
    if (id && label && byLabel[label]) fills[id] = byLabel[label]
  }
  return fills
}

export function getSmartArtTextData(dataContent) {
  const result = []

  let ptLst = getTextByPathList(dataContent, ['dgm:dataModel', 'dgm:ptLst', 'dgm:pt'])

  if (!ptLst) return result
  if (!Array.isArray(ptLst)) ptLst = [ptLst]

  for (const pt of ptLst) {
    const textBody = getTextByPathList(pt, ['dgm:t'])

    if (textBody) {
      let nodeText = ''

      let paragraphs = getTextByPathList(textBody, ['a:p'])
      if (paragraphs) {
        if (!Array.isArray(paragraphs)) paragraphs = [paragraphs]

        paragraphs.forEach(p => {
          let runs = getTextByPathList(p, ['a:r'])
          if (runs) {
            if (!Array.isArray(runs)) runs = [runs]

            runs.forEach(r => {
              const t = getTextNodeValue(getTextByPathList(r, ['a:t']))
              if (t && typeof t === 'string') nodeText += t
            })
          }
          if (nodeText.length > 0) nodeText += '\n'
        })
      }

      const cleanText = nodeText.trim()
      if (cleanText) {
        result.push(cleanText)
      }
    }
  }

  return result
}
