// ElementView — the single renderer for slide element *content*.
//
// Used by the editor canvas, presentation mode, slide thumbnails, the share
// page and every export, so a slide looks identical everywhere. Positioning
// (left/top/size/rotation) is done by the caller (see SlideElement), except in
// the editor, which wraps this in its own selection/drag container.

import { memo, useId, useMemo } from 'react'
import { ICONS } from './iconLibrary'
import { getShapeGeometry } from './geometry'
import { getShapeTextInsets } from './textRect'
import { sanitizeHtml } from './html'
import { fontStack, ensureElementFonts } from './fonts'
import ChartView from './ChartView'
import { normalizeElement } from './model'

// ---------------------------------------------------------------------------
// Style helpers (exported so the editor's inline editors match exactly)
// ---------------------------------------------------------------------------

const px = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

export const getPadding = (el, fallback = 8) => {
  const p = el?.padding
  if (typeof p === 'number') return { top: p, right: p, bottom: p, left: p }
  return {
    top: px(p?.top, fallback),
    right: px(p?.right, fallback),
    bottom: px(p?.bottom, fallback),
    left: px(p?.left, fallback),
  }
}

const justifyFor = (va) => (va === 'middle' ? 'center' : va === 'bottom' ? 'flex-end' : 'flex-start')

/**
 * Outer box of a text frame (text element, or the text inside a shape):
 * padding, vertical alignment, default font. Inline HTML styles override the
 * defaults per run/paragraph, exactly like PowerPoint's inheritance.
 */
export const getTextFrameStyle = (el, { inShape = false } = {}) => {
  const pad = getPadding(el, inShape ? 8 : 8)
  const va = el.verticalAlign || (inShape ? 'middle' : 'top')
  // Imported preset shapes lay text out in the preset's text rectangle
  const rect = inShape ? getShapeTextInsets(el, px(el.width, 0), px(el.height, 0)) : null
  const style = {
    position: inShape ? 'absolute' : 'relative',
    inset: inShape ? (rect ? `${rect.t}px ${rect.r}px ${rect.b}px ${rect.l}px` : 0) : undefined,
    width: rect ? 'auto' : '100%',
    height: rect ? 'auto' : '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: justifyFor(va),
    paddingTop: pad.top,
    paddingRight: pad.right,
    paddingBottom: pad.bottom,
    paddingLeft: pad.left,
    fontSize: px(el.fontSize, 16),
    fontWeight: el.fontWeight || 'normal',
    fontFamily: fontStack(el.fontFamily || 'Inter'),
    fontStyle: el.fontStyle || 'normal',
    textDecoration: el.textDecoration || 'none',
    textAlign: el.textAlign || (inShape ? 'center' : 'left'),
    color: el.isPlaceholder ? '#9ca3af' : (el.color || '#1a1a1a'),
    lineHeight: el.lineHeight ?? 1.5,
    letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
    whiteSpace: el.wrap === false ? 'pre' : 'pre-wrap',
    overflowWrap: 'break-word',
    wordBreak: 'normal',
    overflow: 'visible',
    pointerEvents: inShape ? 'none' : undefined,
  }
  if (el.vertical) {
    style.writingMode = el.vertical === 'vert270' ? 'vertical-lr' : 'vertical-rl'
    if (el.vertical === 'vert270') style.transform = 'rotate(180deg)'
  }
  if (!inShape) {
    if (el.backgroundColor && el.backgroundColor !== 'transparent') style.background = el.backgroundColor
    if (el.borderWidth) style.border = `${el.borderWidth}px ${el.borderStyle || 'solid'} ${el.borderColor || '#333333'}`
    if (el.borderRadius) style.borderRadius = typeof el.borderRadius === 'number' ? `${el.borderRadius}px` : el.borderRadius
  }
  return style
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const toRoman = (num) => {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [v, s] of map) while (num >= v) { out += s; num -= v }
  return out
}

const listPrefix = (listType, n) => {
  switch (listType) {
    case 'bullet': return '•'
    case 'bullet-hollow': return '○'
    case 'bullet-square': return '■'
    case 'bullet-dash': return '-'
    case 'bullet-arrow': return '➔'
    case 'bullet-check': return '✓'
    case 'bullet-star': return '★'
    case 'numbered': return `${n}.`
    case 'numbered-paren': return `${n})`
    case 'alpha': return `${String.fromCharCode(65 + ((n - 1) % 26))}.`
    case 'alpha-lower': return `${String.fromCharCode(97 + ((n - 1) % 26))}.`
    case 'roman': return `${toRoman(n)}.`
    default: return '•'
  }
}

/** Rich text body (sanitized HTML), including the legacy line-based lists */
export const TextBody = memo(function TextBody({ el }) {
  const content = el.content || ''
  const listType = el.listType || 'none'
  const html = useMemo(() => sanitizeHtml(content), [content])

  if (listType !== 'none' && content && !/<(ul|ol|li)\b/i.test(content)) {
    let n = 0
    return (
      <div className="slide-text">
        {content.split(/\n|<br\s*\/?>/i).map((line, i) => {
          if (!line.replace(/<[^>]+>/g, '').trim()) return <div key={i}>&nbsp;</div>
          n += 1
          return (
            <div key={i} style={{ display: 'flex' }}>
              <span style={{ flexShrink: 0, width: '1.6em' }}>{listPrefix(listType, n)}</span>
              <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(line) }} />
            </div>
          )
        })}
      </div>
    )
  }
  return <div className="slide-text" dangerouslySetInnerHTML={{ __html: html }} />
})

const TextContent = ({ el }) => (
  <div style={getTextFrameStyle(el)}>
    <TextBody el={el} />
  </div>
)

// ---------------------------------------------------------------------------
// Fills, strokes, line ends
// ---------------------------------------------------------------------------

/** Normalise legacy string fills and imported fill objects */
export const resolveFill = (fill) => {
  if (fill == null || fill === '' || fill === 'none' || fill === 'transparent') return { type: 'none' }
  if (typeof fill === 'string') return { type: 'solid', color: fill }
  if (fill.type === 'solid' || fill.type === 'color') return { type: 'solid', color: fill.color || fill.value }
  return fill
}

const DASHES = {
  dashed: (w) => `${w * 4} ${w * 3}`,
  dash: (w) => `${w * 4} ${w * 3}`,
  dotted: (w) => `${Math.max(1, w)} ${w * 2}`,
  dot: (w) => `${Math.max(1, w)} ${w * 2}`,
  lgDash: (w) => `${w * 8} ${w * 3}`,
  dashDot: (w) => `${w * 4} ${w * 3} ${w} ${w * 3}`,
  lgDashDot: (w) => `${w * 8} ${w * 3} ${w} ${w * 3}`,
  sysDash: (w) => `${w * 3} ${w}`,
  sysDot: (w) => `${w} ${w}`,
}

const dashArray = (style, width) => {
  if (!style || style === 'solid') return undefined
  const f = DASHES[style]
  return f ? f(Math.max(1, width)) : undefined
}

const FillDefs = ({ id, fill }) => {
  if (fill.type === 'linear') {
    // CSS-style angle: 0deg = bottom->top, 90deg = left->right
    const a = ((fill.angle ?? 90) - 90) * Math.PI / 180
    const x1 = 50 - Math.cos(a) * 50
    const y1 = 50 - Math.sin(a) * 50
    const x2 = 50 + Math.cos(a) * 50
    const y2 = 50 + Math.sin(a) * 50
    return (
      <linearGradient id={id} x1={`${x1}%`} y1={`${y1}%`} x2={`${x2}%`} y2={`${y2}%`}>
        {(fill.stops || []).map((s, i) => (
          <stop key={i} offset={`${s.offset}%`} stopColor={s.color} stopOpacity={s.opacity ?? 1} />
        ))}
      </linearGradient>
    )
  }
  if (fill.type === 'radial') {
    return (
      <radialGradient id={id} cx="50%" cy="50%" r="70%">
        {(fill.stops || []).map((s, i) => (
          <stop key={i} offset={`${s.offset}%`} stopColor={s.color} stopOpacity={s.opacity ?? 1} />
        ))}
      </radialGradient>
    )
  }
  if (fill.type === 'image' && fill.src) {
    return (
      <pattern id={id} patternUnits="objectBoundingBox" width="1" height="1" patternContentUnits="objectBoundingBox">
        <image href={fill.src} x="0" y="0" width="1" height="1" preserveAspectRatio={fill.stretch === false ? 'xMidYMid slice' : 'none'} />
      </pattern>
    )
  }
  return null
}

const markerPath = (type) => {
  switch (type) {
    case 'oval': return <circle cx="5" cy="5" r="4" />
    case 'diamond': return <path d="M 5 0 L 10 5 L 5 10 L 0 5 Z" />
    case 'stealth': return <path d="M 0 0 L 10 5 L 0 10 L 3 5 Z" />
    case 'arrow': return <path d="M 0 0 L 10 5 L 0 10" fill="none" strokeWidth="1.5" stroke="context-stroke" />
    default: return <path d="M 0 0 L 10 5 L 0 10 Z" />
  }
}

const SIZE_MUL = { sm: 2, med: 3, lg: 4.5 }

const LineMarker = ({ id, end, color, strokeWidth, isStart }) => {
  if (!end || !end.type || end.type === 'none') return null
  const len = SIZE_MUL[end.length || 'med'] * Math.max(1, strokeWidth)
  const wid = SIZE_MUL[end.width || 'med'] * Math.max(1, strokeWidth)
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX={end.type === 'oval' || end.type === 'diamond' ? 5 : 9}
      refY="5"
      markerUnits="userSpaceOnUse"
      markerWidth={len}
      markerHeight={wid}
      orient={isStart ? 'auto-start-reverse' : 'auto'}
      fill={color}
      stroke={end.type === 'arrow' ? color : 'none'}
    >
      {markerPath(end.type)}
    </marker>
  )
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

const ShapeContent = ({ el, textSlot }) => {
  const uid = useId().replace(/:/g, '')
  const w = Math.max(0, px(el.width, 0))
  const h = Math.max(0, px(el.height, 0))
  const geom = getShapeGeometry(el, w, h)

  const strokeWidth = px(el.strokeWidth, 0)
  const isLine = geom.kind === 'line' || geom.kind === 'arrow'
  const strokeColor = isLine
    ? (el.strokeColor || el.fill || '#333333')
    : (el.strokeColor || '#333333')
  const fill = geom.strokeOnly || isLine ? { type: 'none' } : resolveFill(el.fill)
  const fillId = `f${uid}`
  const fillAttr = fill.type === 'none' ? 'none' : fill.type === 'solid' ? fill.color : `url(#${fillId})`
  const fillOpacity = el.fillOpacity ?? 1
  const stroke = strokeWidth > 0 ? strokeColor : 'none'
  const dash = dashArray(el.borderStyle || el.strokeDash, strokeWidth)
  const headId = `h${uid}`
  const tailId = `t${uid}`

  const flip = (el.flipH || el.flipV)
    ? `translate(${el.flipH ? w : 0} ${el.flipV ? h : 0}) scale(${el.flipH ? -1 : 1} ${el.flipV ? -1 : 1})`
    : undefined

  let node = null
  const common = {
    fill: fillAttr,
    fillOpacity,
    stroke,
    strokeWidth: strokeWidth || 0,
    strokeDasharray: dash,
    strokeLinejoin: el.strokeLinejoin || 'round',
    strokeLinecap: el.strokeLinecap || (isLine ? 'round' : 'butt'),
    markerStart: el.headEnd && el.headEnd.type !== 'none' ? `url(#${headId})` : undefined,
    markerEnd: el.tailEnd && el.tailEnd.type !== 'none' ? `url(#${tailId})` : undefined,
  }

  if (geom.kind === 'ellipse') {
    node = <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w / 2)} ry={Math.max(0, h / 2)} {...common} />
  } else if (geom.kind === 'rect') {
    const inset = strokeWidth > 0 ? strokeWidth / 2 : 0
    node = (
      <rect
        x={inset}
        y={inset}
        width={Math.max(0, w - strokeWidth)}
        height={Math.max(0, h - strokeWidth)}
        rx={geom.rx}
        ry={geom.rx}
        {...common}
      />
    )
  } else if (geom.kind === 'line') {
    const sw = strokeWidth || 2
    node = <line x1={0} y1={h / 2} x2={w} y2={h / 2} {...common} stroke={strokeColor} strokeWidth={sw} />
  } else if (geom.kind === 'arrow') {
    const sw = strokeWidth || 2
    const head = Math.min(w * 0.3, Math.max(10, h))
    node = (
      <g>
        <line x1={0} y1={h / 2} x2={Math.max(0, w - head)} y2={h / 2} stroke={strokeColor} strokeWidth={sw} strokeLinecap="round" strokeDasharray={dash} />
        <polygon points={`${w - head},${h * 0.18} ${w},${h / 2} ${w - head},${h * 0.82}`} fill={strokeColor} />
      </g>
    )
  } else {
    node = <path d={geom.d} {...common} fillRule="evenodd" />
  }

  const shadow = el.shadow
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        width={Math.max(w, 1)}
        height={Math.max(h, 1)}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          overflow: 'visible',
          filter: shadow ? `drop-shadow(${shadow.x || 0}px ${shadow.y || 0}px ${shadow.blur || 0}px ${shadow.color || 'rgba(0,0,0,0.35)'})` : undefined,
        }}
        aria-hidden="true"
      >
        <defs>
          <FillDefs id={fillId} fill={fill} />
          <LineMarker id={headId} end={el.headEnd} color={strokeColor} strokeWidth={strokeWidth || 2} isStart />
          <LineMarker id={tailId} end={el.tailEnd} color={strokeColor} strokeWidth={strokeWidth || 2} />
        </defs>
        <g transform={flip}>{node}</g>
      </svg>
      {textSlot !== undefined ? textSlot : (el.content ? (
        <div style={getTextFrameStyle(el, { inShape: true })}>
          <TextBody el={el} />
        </div>
      ) : null)}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const ImageContent = ({ el, captionSlot }) => {
  const crop = el.crop
  const hasCrop = crop && (crop.l || crop.t || crop.r || crop.b)
  const flipT = `${el.flipH ? 'scaleX(-1)' : ''} ${el.flipV ? 'scaleY(-1)' : ''}`.trim() || undefined
  const radius = el.borderRadius === '50%' || el.clipShape === 'ellipse'
    ? '50%'
    : (typeof el.borderRadius === 'number' ? `${el.borderRadius}px` : (el.borderRadius || undefined))
  const clipPath = el.clipPath ? `path('${el.clipPath}')` : undefined
  const showCaption = el.caption && el.showCaption

  let img
  if (hasCrop) {
    const wF = 1 - (crop.l || 0) - (crop.r || 0)
    const hF = 1 - (crop.t || 0) - (crop.b || 0)
    img = (
      <img
        src={el.src}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          left: `${(-(crop.l || 0) / wF) * 100}%`,
          top: `${(-(crop.t || 0) / hF) * 100}%`,
          width: `${100 / wF}%`,
          height: `${100 / hF}%`,
          maxWidth: 'none',
        }}
      />
    )
  } else {
    img = (
      <img
        src={el.src}
        alt={el.caption || ''}
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: el.objectFit || 'contain', display: 'block' }}
      />
    )
  }

  const frame = (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        flex: showCaption ? '1 1 auto' : undefined,
        height: showCaption ? undefined : '100%',
        borderRadius: radius,
        clipPath,
        transform: flipT,
        border: el.borderWidth ? `${el.borderWidth}px ${el.borderStyle || 'solid'} ${el.borderColor || '#333'}` : undefined,
        boxSizing: 'border-box',
        filter: el.shadow ? `drop-shadow(${el.shadow.x || 0}px ${el.shadow.y || 0}px ${el.shadow.blur || 0}px ${el.shadow.color || 'rgba(0,0,0,0.35)'})` : undefined,
      }}
    >
      {el.src ? img : <div style={{ width: '100%', height: '100%', background: '#f3f4f6' }} />}
    </div>
  )

  if (!showCaption) return frame
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {frame}
      {captionSlot !== undefined ? captionSlot : (
        <div
          style={{
            fontSize: px(el.captionFontSize, 14),
            color: el.captionColor || '#666666',
            fontFamily: fontStack(el.captionFontFamily || 'Inter'),
            textAlign: 'center',
            padding: '4px 8px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {el.caption}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

export const IconGlyph = ({ name, color, size, style }) => {
  const icon = ICONS[name] || ICONS.star
  return (
    <svg
      width={size}
      height={size}
      viewBox={icon.viewBox}
      fill={icon.fill === 'none' ? 'none' : 'currentColor'}
      stroke={icon.stroke === 'none' ? 'none' : 'currentColor'}
      strokeWidth={icon.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color, display: 'block', flexShrink: 0, ...style }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  )
}

const IconContent = ({ el, labelSlot }) => {
  const withLabel = el.content && el.showLabel
  const size = Math.max(4, Math.min(px(el.width, 60), px(el.height, 60)) * (withLabel ? 0.6 : 0.8))
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: withLabel ? 4 : 0 }}>
      <IconGlyph name={el.iconType} color={el.color || '#2E7D32'} size={size} />
      {withLabel && (labelSlot !== undefined ? labelSlot : (
        <div
          style={{
            width: '100%',
            textAlign: 'center',
            fontSize: px(el.fontSize, 14),
            fontWeight: el.fontWeight || 'normal',
            fontFamily: fontStack(el.fontFamily || 'Inter'),
            color: el.textColor || '#333333',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {el.content}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

const borderCss = (b, fallbackColor, fallbackWidth, fallbackStyle = 'solid') => {
  if (b === null || b?.width === 0) return 'none'
  const width = b?.width ?? fallbackWidth
  if (!width) return 'none'
  return `${width}px ${b?.style || fallbackStyle} ${b?.color || fallbackColor}`
}

export const getTableCells = (el) => {
  const rows = Math.max(1, px(el.rows, el.cells?.length || el.data?.length || 1))
  const cols = Math.max(1, px(el.cols, el.cells?.[0]?.length || el.data?.[0]?.length || 1))
  const out = []
  for (let r = 0; r < rows; r++) {
    const row = []
    for (let c = 0; c < cols; c++) {
      const cell = el.cells?.[r]?.[c]
      if (cell) row.push(cell)
      else row.push({ text: el.data?.[r]?.[c] ?? '' })
    }
    out.push(row)
  }
  return out
}

const TableContent = ({ el, renderCell }) => {
  const cells = getTableCells(el)
  const bColor = el.borderColor || '#9ca3af'
  const bWidth = el.borderWidth ?? 1
  const bStyle = el.borderStyle || 'solid'
  const cols = cells[0]?.length || 1
  const totalW = (el.colWidths || []).reduce((a, b) => a + b, 0)
  const totalH = (el.rowHeights || []).reduce((a, b) => a + b, 0)
  return (
    <table
      style={{
        width: '100%',
        height: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        fontFamily: fontStack(el.fontFamily || 'Inter'),
        fontSize: px(el.fontSize, 14),
        color: el.color || '#1f2937',
        background: el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : undefined,
      }}
    >
      {el.colWidths?.length === cols && totalW > 0 && (
        <colgroup>
          {el.colWidths.map((w, i) => <col key={i} style={{ width: `${(w / totalW) * 100}%` }} />)}
        </colgroup>
      )}
      <tbody>
        {cells.map((row, r) => (
          <tr key={r} style={el.rowHeights?.[r] && totalH ? { height: `${(el.rowHeights[r] / totalH) * 100}%` } : undefined}>
            {row.map((cell, c) => {
              if (cell.hidden) return null
              const header = el.headerRow && r === 0
              // Never mix the border shorthand with longhands (React clears
              // the shorthand when a longhand is present, even if undefined).
              const borderStyle = cell.borders
                ? {
                  borderTop: borderCss(cell.borders.top, bColor, bWidth, bStyle),
                  borderRight: borderCss(cell.borders.right, bColor, bWidth, bStyle),
                  borderBottom: borderCss(cell.borders.bottom, bColor, bWidth, bStyle),
                  borderLeft: borderCss(cell.borders.left, bColor, bWidth, bStyle),
                }
                : { border: borderCss(undefined, bColor, bWidth, bStyle) }
              const style = {
                ...borderStyle,
                background: cell.fill || (header ? (el.headerFill || '#f3f4f6') : undefined),
                color: cell.color,
                fontWeight: cell.bold || header ? 700 : undefined,
                fontStyle: cell.italic ? 'italic' : undefined,
                textAlign: cell.align || el.cellAlign || 'left',
                verticalAlign: cell.vAlign || 'middle',
                padding: el.cellPadding ?? '6px 8px',
                overflow: 'hidden',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.25,
              }
              return (
                <td key={c} rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined} colSpan={cell.colSpan > 1 ? cell.colSpan : undefined} style={style}>
                  {renderCell
                    ? renderCell(cell, r, c)
                    : (cell.html
                      ? <div className="slide-text" dangerouslySetInnerHTML={{ __html: sanitizeHtml(cell.html) }} />
                      : cell.text)}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Media, drawings, charts
// ---------------------------------------------------------------------------

const MediaPlaceholder = ({ el }) => (
  <div style={{ width: '100%', height: '100%', background: el.type === 'video' ? '#111827' : '#f3f4f6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: el.type === 'video' ? '#fff' : '#111827', fontFamily: 'Inter, sans-serif', fontSize: 14, overflow: 'hidden' }}>
    {el.poster ? <img src={el.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (
      <>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          {el.type === 'video' ? <polygon points="6 4 20 12 6 20 6 4" /> : <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />}
        </svg>
        <span style={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.title || (el.type === 'video' ? 'Video' : 'Audio')}</span>
      </>
    )}
  </div>
)

const VideoContent = ({ el, interactive }) => {
  if (!interactive || !el.src) return <MediaPlaceholder el={el} />
  if (el.isYouTube) {
    return (
      <iframe
        src={el.src}
        title={el.title || 'Video'}
        style={{ width: '100%', height: '100%', border: 0, borderRadius: 4 }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    )
  }
  return <video src={el.src} controls muted={el.muted} loop={el.loop} autoPlay={el.autoplay} style={{ width: '100%', height: '100%', background: '#000', borderRadius: 4 }} />
}

const AudioContent = ({ el, interactive }) => {
  if (!interactive || !el.src) return <MediaPlaceholder el={el} />
  return (
    <div style={{ width: '100%', height: '100%', background: '#f3f4f6', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', boxSizing: 'border-box' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: '#111827', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{el.title}</p>
        <audio src={el.src} controls loop={el.loop} autoPlay={el.autoplay} style={{ width: '100%', height: 32, marginTop: 4 }} />
      </div>
    </div>
  )
}

const DrawingContent = ({ el }) => (
  <svg width="100%" height="100%" viewBox={`0 0 ${px(el.width, 1280)} ${px(el.height, 720)}`} style={{ overflow: 'visible', pointerEvents: 'none' }} aria-hidden="true">
    {(el.paths || []).map((p, i) => (
      <path
        key={i}
        d={p.points?.length ? `M ${p.points.map((pt) => `${pt.x} ${pt.y}`).join(' L ')}` : ''}
        stroke={p.color}
        strokeWidth={p.size}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={p.opacity ?? 1}
      />
    ))}
  </svg>
)

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/**
 * @param {object} props
 * @param {object} props.element  slide element
 * @param {boolean} [props.interactive] live video/audio (presentation/editor)
 * @param {React.ReactNode} [props.textSlot] editor override for shape text
 * @param {React.ReactNode} [props.captionSlot] editor override for image caption
 * @param {React.ReactNode} [props.labelSlot] editor override for icon label
 * @param {Function} [props.renderCell] editor override for table cells
 */
function ElementViewImpl({ element, interactive = false, textSlot, captionSlot, labelSlot, renderCell }) {
  // Older saved decks (and raw share/export payloads) may still hold the v1
  // format; upgrade on the fly so every caller renders the same thing.
  const el = useMemo(() => normalizeElement(element), [element])
  ensureElementFonts(el)
  switch (el.type) {
    case 'text': return <TextContent el={el} />
    case 'shape': return <ShapeContent el={el} textSlot={textSlot} />
    case 'image': return <ImageContent el={el} captionSlot={captionSlot} />
    case 'icon': return <IconContent el={el} labelSlot={labelSlot} />
    case 'table': return <TableContent el={el} renderCell={renderCell} />
    case 'video': return <VideoContent el={el} interactive={interactive} />
    case 'audio': return <AudioContent el={el} interactive={interactive} />
    case 'drawing': return <DrawingContent el={el} />
    case 'chart': return <ChartView el={el} />
    default: return null
  }
}

export const ElementView = memo(ElementViewImpl)
export default ElementView

/** Outer transform for an element box (rotation + opacity). */
export const getElementBoxStyle = (el) => {
  const rotation = px(el.rotation, 0)
  const opacity = el.opacity == null ? 1 : Math.max(0, Math.min(100, px(el.opacity, 100))) / 100
  return {
    position: 'absolute',
    left: px(el.x, 0),
    top: px(el.y, 0),
    width: Math.max(0, px(el.width, 0)),
    height: Math.max(0, px(el.height, 0)),
    transform: rotation ? `rotate(${rotation}deg)` : undefined,
    opacity: opacity < 1 ? opacity : undefined,
  }
}
