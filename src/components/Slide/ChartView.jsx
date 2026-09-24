// SVG chart renderer for charts (imported from PowerPoint or created here).
// Supports column/bar (clustered, stacked, 100% stacked), line, area,
// scatter and pie/doughnut, with PowerPoint-like axis scaling, legend
// placement, gap width and data labels.

import { memo } from 'react'

const PALETTE = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9E480E', '#636363', '#997300']
const FONT = 'Carlito, Calibri, Arial, sans-serif'

/** Excel/PowerPoint-style automatic value axis: headroom, then 1-2-5 steps */
export const autoScale = (minV, maxV, { min, max, majorUnit, targetTicks = 6 } = {}) => {
  let lo = min ?? (minV < 0 ? minV : 0)
  let hi = max ?? maxV
  if (hi <= lo) hi = lo + 1
  const span = hi - lo
  if (max == null) hi += span * 0.05
  if (min == null && minV < 0) lo -= span * 0.05
  let step = majorUnit
  if (!(step > 0)) {
    const raw = (hi - lo) / targetTicks
    const p = 10 ** Math.floor(Math.log10(raw))
    const n = raw / p
    step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
  }
  if (max == null) hi = Math.ceil(hi / step - 1e-9) * step
  if (min == null) lo = Math.floor(lo / step + 1e-9) * step
  return { lo, hi, step }
}

const formatNumber = (n, fmtCode, percentScale = false) => {
  const code = fmtCode && fmtCode !== 'General' ? fmtCode : ''
  if (code.includes('%') || percentScale) {
    const dec = (code.split('.')[1] || '').replace(/[^0]/g, '').length
    return `${(n * (percentScale ? 1 : 100)).toFixed(dec)}%`
  }
  if (code) {
    const dec = (code.split('.')[1] || '').replace(/[^0#]/g, '').length
    const s = Math.abs(n).toFixed(dec)
    const [i, f] = s.split('.')
    const int = code.includes(',') ? i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : i
    return `${n < 0 ? '-' : ''}${code.includes('$') ? '$' : ''}${int}${f ? `.${f}` : ''}`
  }
  const r = Math.round(n * 1e6) / 1e6
  return `${r}`
}

const textWidth = (str, size) => String(str).length * size * 0.52

function Legend({ items, pos, W, H, font, area }) {
  if (!items.length) return null
  const sw = font.fontSize * 0.7
  const gap = font.fontSize * 0.4
  if (pos === 'r' || pos === 'l' || pos === 'tr') {
    const lineH = font.fontSize * 1.35
    const totalH = items.length * lineH
    const maxW = Math.max(...items.map((it) => textWidth(it.label, font.fontSize))) + sw + gap
    const x0 = pos === 'l' ? font.fontSize * 0.5 : W - maxW - font.fontSize * 0.5
    const y0 = pos === 'tr' ? area.top : area.top + (area.height - totalH) / 2
    return (
      <g>
        {items.map((it, i) => (
          <g key={i} transform={`translate(${x0} ${y0 + i * lineH + lineH / 2})`}>
            <rect x="0" y={-sw / 2} width={sw} height={sw} fill={it.color} />
            <text x={sw + gap} y={font.fontSize * 0.34} {...font}>{it.label}</text>
          </g>
        ))}
      </g>
    )
  }
  // top / bottom: one centred row
  const widths = items.map((it) => sw + gap + textWidth(it.label, font.fontSize) + font.fontSize)
  const total = widths.reduce((a, b) => a + b, 0)
  let x = Math.max(0, (W - total) / 2)
  const y = pos === 't' ? font.fontSize * 0.9 + area.titleH : H - font.fontSize * 0.9
  return (
    <g>
      {items.map((it, i) => {
        const g = (
          <g key={i} transform={`translate(${x} ${y})`}>
            <rect x="0" y={-sw / 2} width={sw} height={sw} fill={it.color} />
            <text x={sw + gap} y={font.fontSize * 0.34} {...font}>{it.label}</text>
          </g>
        )
        x += widths[i]
        return g
      })}
    </g>
  )
}

function ChartViewImpl({ el }) {
  const W = Math.max(40, el.width || 400)
  const H = Math.max(40, el.height || 300)
  const series = (el.series || []).filter((s) => Array.isArray(s.values))
  const categories = el.categories || series[0]?.values.map((_, i) => `${i + 1}`) || []
  const colors = el.colors?.length ? el.colors : PALETTE
  const color = (i) => series[i]?.color || colors[i % colors.length] || PALETTE[i % PALETTE.length]
  const fontSize = el.fontSize || Math.max(9, Math.min(14, H / 22))
  const font = { fontFamily: FONT, fontSize, fill: el.textColor || '#595959' }
  const type = el.chartType || 'column'
  const isPie = type === 'pie' || type === 'doughnut'

  if (series.length === 0) {
    return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontFamily: 'Inter, sans-serif', fontSize: 13, border: '1px dashed #d1d5db' }}>Chart</div>
  }

  // Legend: null = none, { pos } = PowerPoint placement, undefined = legacy default
  const legendPos = el.legend === null ? null : (el.legend?.pos || (series.length > 1 || isPie ? 'b' : null))
  const titleSize = el.titleSize || fontSize * 1.3
  const titleH = el.title ? titleSize * 1.9 : 0
  const legendItems = legendPos
    ? (isPie
      ? categories.map((c, i) => ({ label: String(c), color: series[0].pointColors?.[i] || colors[i % colors.length] }))
      : series.map((s, i) => ({ label: String(s.name || `Series ${i + 1}`), color: color(i) })))
    : []
  const legendW = legendPos === 'r' || legendPos === 'l' || legendPos === 'tr'
    ? Math.max(0, ...legendItems.map((it) => textWidth(it.label, fontSize))) + fontSize * 2.2
    : 0
  const legendH = legendPos === 'b' || legendPos === 't' ? fontSize * 2 : 0

  const area = {
    left: legendPos === 'l' ? legendW : 0,
    top: titleH + (legendPos === 't' ? legendH : 0),
    width: W - legendW,
    height: H - titleH - legendH,
    titleH,
  }

  const title = el.title
    ? <text x={W / 2} y={titleSize * 1.2} textAnchor="middle" fontFamily={FONT} fontSize={titleSize} fontWeight={el.titleBold ? 700 : 400} fill={el.textColor || '#404040'}>{el.title}</text>
    : null
  const legend = <Legend items={legendItems} pos={legendPos} W={W} H={H} font={font} area={area} />
  const labels = el.dataLabels

  // --- Pie / doughnut ------------------------------------------------------
  if (isPie) {
    const vals = series[0].values.map((v) => Math.max(0, Number(v) || 0))
    const total = vals.reduce((a, b) => a + b, 0) || 1
    const cx = area.left + area.width / 2
    const cy = area.top + area.height / 2
    const r = Math.max(4, Math.min(area.width, area.height) / 2 - fontSize * 0.6)
    const hole = type === 'doughnut' ? r * ((el.holeSize ?? 50) / 100) : 0
    let a0 = ((el.firstSliceAngle || 0) - 90) * (Math.PI / 180)
    const sliceColor = (i) => series[0].pointColors?.[i] || colors[i % colors.length]
    const p = (a, rad) => `${cx + Math.cos(a) * rad} ${cy + Math.sin(a) * rad}`
    const slices = []
    const texts = []
    vals.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2
      const large = a1 - a0 > Math.PI ? 1 : 0
      const d = vals.length === 1
        ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`
        : hole > 0
          ? `M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, hole)} A ${hole} ${hole} 0 ${large} 0 ${p(a0, hole)} Z`
          : `M ${cx} ${cy} L ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} Z`
      slices.push(<path key={i} d={d} fill={sliceColor(i)} stroke="#fff" strokeWidth="1.5" />)
      if (labels && v > 0) {
        const mid = (a0 + a1) / 2
        const rr = hole > 0 ? (r + hole) / 2 : r * 0.62
        const parts = []
        if (labels.showCatName) parts.push(categories[i])
        if (labels.showVal) parts.push(formatNumber(v, el.valAxis?.numFmt))
        if (labels.showPercent) parts.push(`${Math.round((v / total) * 100)}%`)
        texts.push(<text key={`t${i}`} x={cx + Math.cos(mid) * rr} y={cy + Math.sin(mid) * rr + fontSize * 0.35} textAnchor="middle" fontFamily={FONT} fontSize={fontSize} fill="#fff">{parts.join(', ')}</text>)
      }
      a0 = a1
    })
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        {title}
        {slices}
        {hole > 0 && vals.length === 1 && <circle cx={cx} cy={cy} r={hole} fill="#fff" />}
        {texts}
        {legend}
      </svg>
    )
  }

  // --- Axis charts ---------------------------------------------------------
  const horizontal = type === 'bar'
  const percent = el.grouping === 'percentStacked'
  const stacked = el.grouping === 'stacked' || percent
  const n = Math.max(...series.map((s) => s.values.length), categories.length)
  const totals = Array.from({ length: n }, (_, i) => series.reduce((a, s) => a + Math.abs(Number(s.values[i]) || 0), 0) || 1)
  const value = (s, i) => {
    const v = Number(s.values[i]) || 0
    return percent ? v / totals[i] : v
  }
  let maxV = 0
  let minV = 0
  for (let i = 0; i < n; i++) {
    if (stacked) {
      let pos = 0
      let neg = 0
      series.forEach((s) => { const v = value(s, i); if (v >= 0) pos += v; else neg += v })
      maxV = Math.max(maxV, pos)
      minV = Math.min(minV, neg)
    } else {
      series.forEach((s) => {
        const v = value(s, i)
        maxV = Math.max(maxV, v)
        minV = Math.min(minV, v)
      })
    }
  }
  const va = el.valAxis || {}
  const ca = el.catAxis || {}
  const plotHGuess = Math.max(10, area.height - fontSize * 2)
  const scale = percent
    ? { lo: minV < 0 ? -1 : 0, hi: 1, step: 0.1 * Math.ceil(10 / Math.max(2, Math.min(10, plotHGuess / (fontSize * 2.2)))) }
    : autoScale(minV, maxV, { min: va.min, max: va.max, majorUnit: va.majorUnit, targetTicks: Math.max(2, Math.min(8, Math.round(plotHGuess / (fontSize * 2.6)))) })
  const { lo, hi, step } = scale
  const tickLabel = (v) => (percent ? formatNumber(v * 100, '', true) : formatNumber(v, va.numFmt))
  const tickVals = []
  for (let v = lo; v <= hi + step * 1e-6; v += step) tickVals.push(Math.round(v * 1e9) / 1e9)
  const maxTickW = Math.max(...tickVals.map((v) => textWidth(tickLabel(v), fontSize)))
  const maxCatW = Math.max(0, ...categories.map((c) => textWidth(c, fontSize)))

  const showVal = !va.deleted
  const showCat = !ca.deleted
  const padL = area.left + fontSize * 0.6 + (horizontal ? (showCat ? Math.min(W * 0.3, maxCatW + fontSize * 0.6) : 0) : (showVal ? maxTickW + fontSize * 0.6 : 0))
  const padR = W - (area.left + area.width) + fontSize * 0.8
  const padT = area.top + fontSize * 0.7
  const padB = (H - (area.top + area.height)) + fontSize * 0.5 + (horizontal ? (showVal ? fontSize * 1.5 : 0) : (showCat ? fontSize * 1.5 : 0))
  const plotW = Math.max(10, W - padL - padR)
  const plotH = Math.max(10, H - padT - padB)
  const valToPos = (v) => (horizontal
    ? padL + ((v - lo) / (hi - lo)) * plotW
    : padT + plotH - ((v - lo) / (hi - lo)) * plotH)
  const band = (horizontal ? plotH : plotW) / Math.max(1, n)
  // PowerPoint lists bar-chart categories bottom-up (unless the axis is reversed)
  const catPos = (i) => (horizontal ? padT + band * (ca.reversed ? i : n - 1 - i) : padL + band * i)
  const barCatPos = catPos

  const grid = []
  const gridOn = el.valAxis ? va.gridlines : true
  tickVals.forEach((v, t) => {
    const pos = valToPos(v)
    grid.push(
      <g key={t}>
        {gridOn && (horizontal
          ? <line x1={pos} y1={padT} x2={pos} y2={padT + plotH} stroke="#d9d9d9" strokeWidth="1" />
          : <line x1={padL} y1={pos} x2={padL + plotW} y2={pos} stroke="#d9d9d9" strokeWidth="1" />)}
        {showVal && (horizontal
          ? <text x={pos} y={padT + plotH + fontSize * 1.2} textAnchor="middle" {...font}>{tickLabel(v)}</text>
          : <text x={padL - fontSize * 0.4} y={pos + fontSize * 0.34} textAnchor="end" {...font}>{tickLabel(v)}</text>)}
      </g>,
    )
  })
  const zero = valToPos(Math.max(lo, Math.min(hi, 0)))
  const axisLine = horizontal
    ? <line x1={zero} y1={padT} x2={zero} y2={padT + plotH} stroke="#bfbfbf" strokeWidth="1" />
    : <line x1={padL} y1={zero} x2={padL + plotW} y2={zero} stroke="#bfbfbf" strokeWidth="1" />

  const marks = []
  const valueTexts = []
  if (type === 'line' || type === 'area' || type === 'scatter') {
    const acc = new Array(n).fill(0)
    series.forEach((s, si) => {
      const pts = s.values.map((_, i) => {
        let v = value(s, i)
        if (stacked) { acc[i] += v; v = acc[i] }
        const c = catPos(i) + band / 2
        return horizontal ? [valToPos(v), c] : [c, valToPos(v)]
      })
      if (pts.length === 0) return
      const d = 'M ' + pts.map((pt) => pt.join(' ')).join(' L ')
      if (type === 'area') {
        const base = valToPos(Math.max(lo, 0))
        marks.push(<path key={`a${si}`} d={`${d} L ${pts[pts.length - 1][0]} ${base} L ${pts[0][0]} ${base} Z`} fill={color(si)} fillOpacity="0.85" />)
      } else if (type === 'line') {
        marks.push(<path key={`l${si}`} d={d} fill="none" stroke={color(si)} strokeWidth={Math.max(1.5, fontSize / 6)} strokeLinejoin="round" strokeLinecap="round" />)
      }
      if (type !== 'area' && (el.marker !== false || type === 'scatter')) {
        pts.forEach((pt, i) => marks.push(<circle key={`m${si}-${i}`} cx={pt[0]} cy={pt[1]} r={Math.max(2, fontSize / 4)} fill={color(si)} />))
      }
      if (labels?.showVal) {
        pts.forEach((pt, i) => valueTexts.push(<text key={`v${si}-${i}`} x={pt[0]} y={pt[1] - fontSize * 0.6} textAnchor="middle" {...font}>{formatNumber(Number(s.values[i]) || 0, va.numFmt)}</text>))
      }
    })
  } else {
    const gap = (el.gapWidth ?? 150) / 100
    const overlap = stacked ? 1 : Math.max(-1, Math.min(1, (el.overlap ?? 0) / 100))
    const groupW = band / (1 + gap)
    const k = series.length
    const barW = stacked ? groupW : groupW / (k - (k - 1) * overlap)
    const stride = barW * (1 - overlap)
    for (let i = 0; i < n; i++) {
      let pos = 0
      let neg = 0
      series.forEach((s, si) => {
        const v = value(s, i)
        let start = 0
        let end = v
        if (stacked) {
          if (v >= 0) { start = pos; end = pos + v; pos = end } else { start = neg; end = neg + v; neg = end }
        }
        const off = barCatPos(i) + (band - groupW) / 2 + (stacked ? 0 : (horizontal ? stride * (k - 1 - si) : stride * si))
        const p0 = valToPos(Math.max(lo, Math.min(hi, start)))
        const p1 = valToPos(Math.max(lo, Math.min(hi, end)))
        const fill = s.pointColors?.[i] || color(si)
        marks.push(horizontal
          ? <rect key={`${i}-${si}`} x={Math.min(p0, p1)} y={off} width={Math.abs(p1 - p0)} height={barW} fill={fill} />
          : <rect key={`${i}-${si}`} x={off} y={Math.min(p0, p1)} width={barW} height={Math.abs(p1 - p0)} fill={fill} />)
        if (labels?.showVal) {
          const txt = formatNumber(Number(s.values[i]) || 0, va.numFmt)
          valueTexts.push(horizontal
            ? <text key={`v${i}-${si}`} x={Math.max(p0, p1) + fontSize * 0.3} y={off + barW / 2 + fontSize * 0.34} {...font}>{txt}</text>
            : <text key={`v${i}-${si}`} x={off + barW / 2} y={Math.min(p0, p1) - fontSize * 0.3} textAnchor="middle" {...font}>{txt}</text>)
        }
      })
    }
  }

  const catLabels = showCat ? categories.map((c, i) => {
    const pos = catPos(i) + band / 2
    return horizontal
      ? <text key={i} x={padL - fontSize * 0.4} y={pos + fontSize * 0.34} textAnchor="end" {...font}>{String(c)}</text>
      : <text key={i} x={pos} y={padT + plotH + fontSize * 1.2} textAnchor="middle" {...font}>{String(c)}</text>
  }) : null

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {title}
      {grid}
      {marks}
      {axisLine}
      {valueTexts}
      {catLabels}
      {legend}
    </svg>
  )
}

export default memo(ChartViewImpl)
