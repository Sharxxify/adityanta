import { eachElement, getTextByPathList } from './utils'
import { applyTint, applyShade } from './color'
import { getSolidFill } from './fill' // ADITYANTA
import { getSchemeColorFromTheme } from './schemeColor' // ADITYANTA

// ADITYANTA: series / point colours with full colour transforms, and the
// automatic colours PowerPoint uses when a series has none (theme accents,
// cycling through darker then lighter variants).
function accentColor(i, warpObj) {
  const n = ((i % 6) + 6) % 6
  const base = getSchemeColorFromTheme(`a:accent${n + 1}`, warpObj)
  if (!base) return undefined
  const cycle = Math.floor(i / 6) % 3
  const hex = `#${String(base).replace('#', '')}`
  if (cycle === 1) return `#${applyShade(hex, 0.6)}`
  if (cycle === 2) return `#${applyTint(hex, 0.6)}`
  return hex
}

function spPrColor(spPr, warpObj, preferLine) {
  if (!spPr) return undefined
  const fill = () => {
    const solid = getTextByPathList(spPr, ['a:solidFill'])
    if (solid) return getSolidFill(solid, undefined, undefined, warpObj)
    let gs = getTextByPathList(spPr, ['a:gradFill', 'a:gsLst', 'a:gs'])
    if (gs) return getSolidFill(Array.isArray(gs) ? gs[0] : gs, undefined, undefined, warpObj)
    return undefined
  }
  const line = () => {
    const solid = getTextByPathList(spPr, ['a:ln', 'a:solidFill'])
    return solid ? getSolidFill(solid, undefined, undefined, warpObj) : undefined
  }
  return (preferLine ? line() || fill() : fill() || line()) || undefined
}

const seriesIndex = (node, fallback) => {
  const v = parseInt(getTextByPathList(node, ['c:idx', 'attrs', 'val']))
  return Number.isFinite(v) ? v : fallback
}

function extractChartColors(serNode, warpObj, preferLine = false) {
  if (!serNode) return []
  const list = serNode.constructor === Array ? serNode : [serNode]
  return list.map((node, i) => spPrColor(node['c:spPr'], warpObj, preferLine)
    || spPrColor(getTextByPathList(node, ['c:marker', 'c:spPr']), warpObj, false)
    || accentColor(seriesIndex(node, i), warpObj))
}

// Pie / doughnut: one colour per data point (c:dPt overrides, else accents)
function extractPointColors(serNode, warpObj) {
  const ser = Array.isArray(serNode) ? serNode[0] : serNode
  if (!ser) return []
  let pts = getTextByPathList(ser, ['c:val', 'c:numRef', 'c:numCache', 'c:pt']) || []
  if (!Array.isArray(pts)) pts = [pts]
  let dPts = ser['c:dPt'] || []
  if (!Array.isArray(dPts)) dPts = [dPts]
  const byIdx = {}
  dPts.forEach((d) => { byIdx[getTextByPathList(d, ['c:idx', 'attrs', 'val'])] = spPrColor(d['c:spPr'], warpObj) })
  const n = Math.max(pts.length, dPts.length)
  return Array.from({ length: n }, (_, i) => byIdx[String(i)] || accentColor(i, warpObj))
}

const richText = (node) => {
  let paras = getTextByPathList(node, ['c:tx', 'c:rich', 'a:p'])
  if (!paras) return ''
  if (!Array.isArray(paras)) paras = [paras]
  return paras.map((p) => {
    let runs = p['a:r'] || []
    if (!Array.isArray(runs)) runs = [runs]
    return runs.map((r) => {
      const t = r['a:t']
      return typeof t === 'string' ? t : (t?.value ?? '')
    }).join('')
  }).join('\n').trim()
}

const defRPr = (txPr) => getTextByPathList(txPr, ['a:p', 'a:pPr', 'a:defRPr'])
  || (Array.isArray(getTextByPathList(txPr, ['a:p'])) ? getTextByPathList(txPr, ['a:p'])[0]?.['a:pPr']?.['a:defRPr'] : undefined)

const attrVal = (node, path) => getTextByPathList(node, [...path, 'attrs', 'val'])

/**
 * Extra chart information (title, legend, text size, axes, data labels)
 * that the upstream parser does not extract. Sizes are in points.
 */
export function getChartExtras(chartSpace, plotArea, chart, warpObj) {
  const c = getTextByPathList(chartSpace, ['c:chartSpace', 'c:chart']) || {}
  const spaceTx = defRPr(getTextByPathList(chartSpace, ['c:chartSpace', 'c:txPr']))
  const baseSz = parseInt(getTextByPathList(spaceTx, ['attrs', 'sz']))
  const fontSize = Number.isFinite(baseSz) ? baseSz / 100 : 10
  const textFill = getTextByPathList(spaceTx, ['a:solidFill'])
  const textColor = textFill ? getSolidFill(textFill, undefined, undefined, warpObj) : undefined

  const seriesCount = Array.isArray(chart?.data) ? chart.data.length : 0
  let title
  const titleNode = c['c:title']
  if (titleNode) {
    title = richText(titleNode)
    if (!title && seriesCount === 1) title = String(chart.data[0]?.key ?? '')
  }
  else if (attrVal(c, ['c:autoTitleDeleted']) !== '1' && seriesCount === 1 && !/scatter|bubble/.test(chart?.type || '')) {
    const k = chart.data[0]?.key
    if (typeof k === 'string') title = k
  }
  const titleRPr = defRPr(getTextByPathList(titleNode, ['c:tx', 'c:rich'])) || defRPr(getTextByPathList(titleNode, ['c:txPr']))
  const titleSz = parseInt(getTextByPathList(titleRPr, ['attrs', 'sz']))
  const titleRunSz = parseInt(getTextByPathList(titleNode, ['c:tx', 'c:rich', 'a:p', 'a:r', 'a:rPr', 'attrs', 'sz']))
  const titleSize = Number.isFinite(titleRunSz) ? titleRunSz / 100 : Number.isFinite(titleSz) ? titleSz / 100 : fontSize * 1.2

  const legendNode = c['c:legend']
  const legend = legendNode ? { pos: attrVal(legendNode, ['c:legendPos']) || 'r' } : null

  const axis = (node) => {
    if (!node) return undefined
    const n = Array.isArray(node) ? node[0] : node
    const num = (path) => {
      const v = parseFloat(attrVal(n, path))
      return Number.isFinite(v) ? v : undefined
    }
    return {
      deleted: attrVal(n, ['c:delete']) === '1',
      min: num(['c:scaling', 'c:min']),
      max: num(['c:scaling', 'c:max']),
      majorUnit: num(['c:majorUnit']),
      gridlines: !!n['c:majorGridlines'],
      numFmt: getTextByPathList(n, ['c:numFmt', 'attrs', 'formatCode']),
      reversed: attrVal(n, ['c:scaling', 'c:orientation']) === 'maxMin',
    }
  }

  const typeNode = Object.keys(plotArea || {}).map((k) => plotArea[k]).find((v) => v && v['c:ser'])
  const firstSer = Array.isArray(typeNode?.['c:ser']) ? typeNode['c:ser'][0] : typeNode?.['c:ser']
  const dl = typeNode?.['c:dLbls'] || firstSer?.['c:dLbls']
  const dataLabels = dl && (attrVal(dl, ['c:showVal']) === '1' || attrVal(dl, ['c:showPercent']) === '1' || attrVal(dl, ['c:showCatName']) === '1')
    ? {
      showVal: attrVal(dl, ['c:showVal']) === '1',
      showPercent: attrVal(dl, ['c:showPercent']) === '1',
      showCatName: attrVal(dl, ['c:showCatName']) === '1',
      pos: attrVal(dl, ['c:dLblPos']),
    }
    : undefined
  const gap = parseFloat(attrVal(typeNode, ['c:gapWidth']))
  const overlap = parseFloat(attrVal(typeNode, ['c:overlap']))
  const firstSlice = parseFloat(attrVal(typeNode, ['c:firstSliceAng']))

  return {
    title: title || undefined,
    titleSize,
    titleBold: getTextByPathList(titleRPr, ['attrs', 'b']) !== '0',
    fontSize,
    textColor,
    legend,
    valAxis: axis(plotArea?.['c:valAx']),
    catAxis: axis(plotArea?.['c:catAx'] || plotArea?.['c:dateAx']),
    dataLabels,
    gapWidth: Number.isFinite(gap) ? gap : undefined,
    overlap: Number.isFinite(overlap) ? overlap : undefined,
    firstSliceAngle: Number.isFinite(firstSlice) ? firstSlice : undefined,
    varyColors: attrVal(typeNode, ['c:varyColors']) === '1',
  }
}

function extractChartData(serNode) {
  const dataMat = []
  if (!serNode) return dataMat

  eachElement(serNode, (innerNode, index) => {
    const dataRow = []
    const colName = getTextByPathList(innerNode, ['c:tx', 'c:strRef', 'c:strCache', 'c:pt', 'c:v']) || index

    const rowNames = {}
    if (getTextByPathList(innerNode, ['c:cat', 'c:strRef', 'c:strCache', 'c:pt'])) {
      eachElement(innerNode['c:cat']['c:strRef']['c:strCache']['c:pt'], innerNode => {
        rowNames[innerNode['attrs']['idx']] = innerNode['c:v']
        return ''
      })
    } 
    else if (getTextByPathList(innerNode, ['c:cat', 'c:numRef', 'c:numCache', 'c:pt'])) {
      eachElement(innerNode['c:cat']['c:numRef']['c:numCache']['c:pt'], innerNode => {
        rowNames[innerNode['attrs']['idx']] = innerNode['c:v']
        return ''
      })
    }

    if (getTextByPathList(innerNode, ['c:val', 'c:numRef', 'c:numCache', 'c:pt'])) {
      eachElement(innerNode['c:val']['c:numRef']['c:numCache']['c:pt'], innerNode => {
        dataRow.push({
          x: innerNode['attrs']['idx'],
          y: parseFloat(innerNode['c:v']),
        })
        return ''
      })
    }

    dataMat.push({
      key: colName,
      values: dataRow,
      xlabels: rowNames,
    })
    return ''
  })

  return dataMat
}

function extractScatterChartData(serNode) {
  const dataMat = []
  if (!serNode) return dataMat

  const serNodes = serNode.constructor === Array ? serNode : [serNode]
  const firstSerNode = serNodes[0]
  const xData = []

  eachElement(firstSerNode['c:xVal']['c:numRef']['c:numCache']['c:pt'], innerNode => {
    xData.push(parseFloat(innerNode['c:v']))
    return ''
  })
  dataMat.push(xData)

  for (const node of serNodes) {
    const yData = []
    eachElement(node['c:yVal']['c:numRef']['c:numCache']['c:pt'], innerNode => {
      yData.push(parseFloat(innerNode['c:v']))
      return ''
    })
    dataMat.push(yData)
  }

  return dataMat
}

export function getChartInfo(plotArea, warpObj) {
  let chart = null
  for (const key in plotArea) {
    if (!plotArea[key]['c:ser']) continue

    switch (key) {
      case 'c:lineChart':
        chart = {
          type: 'lineChart',
          data: extractChartData(plotArea[key]['c:ser']),
          colors: extractChartColors(plotArea[key]['c:ser'], warpObj, true),
          grouping: getTextByPathList(plotArea[key], ['c:grouping', 'attrs', 'val']),
          marker: plotArea[key]['c:marker'] ? true : false,
        }
        break
      case 'c:line3DChart':
        chart = {
          type: 'line3DChart',
          data: extractChartData(plotArea[key]['c:ser']),
          colors: extractChartColors(plotArea[key]['c:ser'], warpObj, true),
          grouping: getTextByPathList(plotArea[key], ['c:grouping', 'attrs', 'val']),
        }
        break
      case 'c:barChart':
        chart = {
          type: 'barChart',
          data: extractChartData(plotArea[key]['c:ser']),
          colors: extractChartColors(plotArea[key]['c:ser'], warpObj),
          grouping: getTextByPathList(plotArea[key], ['c:grouping', 'attrs', 'val']),
          barDir: getTextByPathList(plotArea[key], ['c:barDir', 'attrs', 'val']),
        }
        break
      case 'c:bar3DChart':
        chart = {
          type: 'bar3DChart',
          data: extractChartData(plotArea[key]['c:ser']),
          colors: extractChartColors(plotArea[key]['c:ser'], warpObj),
          grouping: getTextByPathList(plotArea[key], ['c:grouping', 'attrs', 'val']),
          barDir: getTextByPathList(plotArea[key], ['c:barDir', 'attrs', 'val']),
        }
        break
      case 'c:pieChart':
        chart = {
          type: 'pieChart',
          data: extractChartData(plotArea[key]['c:ser']),
          colors: extractPointColors(plotArea[key]['c:ser'], warpObj),
        }
        break
      case 'c:pie3DChart':
        chart = {
          type: 'pie3DChart',
          data: extractChartData(plotArea[key]['c:ser']),
          colors: extractPointColors(plotArea[key]['c:ser'], warpObj),
        }
        break
      case 'c:doughnutChart':
        chart = {
          type: 'doughnutChart',
          data: extractChartData(plotArea[key]['c:ser']),
          colors: extractPointColors(plotArea[key]['c:ser'], warpObj),
          holeSize: getTextByPathList(plotArea[key], ['c:holeSize', 'attrs', 'val']),
        }
        break
      case 'c:areaChart':
        chart = {
          type: 'areaChart',
          data: extractChartData(plotArea[key]['c:ser']),
          colors: extractChartColors(plotArea[key]['c:ser'], warpObj),
          grouping: getTextByPathList(plotArea[key], ['c:grouping', 'attrs', 'val']),
        }
        break
      case 'c:area3DChart':
        chart = {
          type: 'area3DChart',
          data: extractChartData(plotArea[key]['c:ser']),
          colors: extractChartColors(plotArea[key]['c:ser'], warpObj),
          grouping: getTextByPathList(plotArea[key], ['c:grouping', 'attrs', 'val']),
        }
        break
      case 'c:scatterChart':
        chart = {
          type: 'scatterChart',
          data: extractScatterChartData(plotArea[key]['c:ser']),
          colors: extractChartColors(plotArea[key]['c:ser'], warpObj, true),
          style: getTextByPathList(plotArea[key], ['c:scatterStyle', 'attrs', 'val']),
        }
        break
      case 'c:bubbleChart':
        chart = {
          type: 'bubbleChart',
          data: extractScatterChartData(plotArea[key]['c:ser']),
          colors: extractChartColors(plotArea[key]['c:ser'], warpObj),
        }
        break
      case 'c:radarChart':
        chart = {
          type: 'radarChart',
          data: extractChartData(plotArea[key]['c:ser']),
          colors: extractChartColors(plotArea[key]['c:ser'], warpObj, true),
          style: getTextByPathList(plotArea[key], ['c:radarStyle', 'attrs', 'val']),
        }
        break
      case 'c:surfaceChart':
        chart = {
          type: 'surfaceChart',
          data: extractChartData(plotArea[key]['c:ser']),
          colors: extractChartColors(plotArea[key]['c:ser'], warpObj),
        }
        break
      case 'c:surface3DChart':
        chart = {
          type: 'surface3DChart',
          data: extractChartData(plotArea[key]['c:ser']),
          colors: extractChartColors(plotArea[key]['c:ser'], warpObj),
        }
        break
      case 'c:stockChart':
        chart = {
          type: 'stockChart',
          data: extractChartData(plotArea[key]['c:ser']),
          colors: [],
        }
        break
      default:
    }
  }

  return chart
}
