const SVG_NS = 'http://www.w3.org/2000/svg'
export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

const toPx = (value) => `${Math.max(0, Number(value) || 0)}px`
const getTextAlign = (value) => value || 'left'
const getJustify = (align) => align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start'
const createSvgIconNode = (iconType = '', color = '#2E7D32') => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.style.display = 'block'

  const addPath = (d, opts = {}) => {
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', opts.fill ?? 'none')
    path.setAttribute('stroke', opts.stroke ?? color)
    path.setAttribute('stroke-width', `${opts.strokeWidth ?? 2}`)
    path.setAttribute('stroke-linecap', opts.linecap ?? 'round')
    path.setAttribute('stroke-linejoin', opts.linejoin ?? 'round')
    svg.appendChild(path)
  }

  const addCircle = (cx, cy, r, opts = {}) => {
    const circle = document.createElementNS(SVG_NS, 'circle')
    circle.setAttribute('cx', `${cx}`)
    circle.setAttribute('cy', `${cy}`)
    circle.setAttribute('r', `${r}`)
    circle.setAttribute('fill', opts.fill ?? 'none')
    circle.setAttribute('stroke', opts.stroke ?? color)
    circle.setAttribute('stroke-width', `${opts.strokeWidth ?? 2}`)
    svg.appendChild(circle)
  }

  const addPoly = (points, opts = {}) => {
    const poly = document.createElementNS(SVG_NS, 'polygon')
    poly.setAttribute('points', points)
    poly.setAttribute('fill', opts.fill ?? 'none')
    poly.setAttribute('stroke', opts.stroke ?? color)
    poly.setAttribute('stroke-width', `${opts.strokeWidth ?? 2}`)
    poly.setAttribute('stroke-linecap', 'round')
    poly.setAttribute('stroke-linejoin', 'round')
    svg.appendChild(poly)
  }

  const addLine = (x1, y1, x2, y2, opts = {}) => {
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', `${x1}`)
    line.setAttribute('y1', `${y1}`)
    line.setAttribute('x2', `${x2}`)
    line.setAttribute('y2', `${y2}`)
    line.setAttribute('stroke', opts.stroke ?? color)
    line.setAttribute('stroke-width', `${opts.strokeWidth ?? 2}`)
    line.setAttribute('stroke-linecap', opts.linecap ?? 'round')
    svg.appendChild(line)
  }

  switch (iconType) {
    case 'star':
      addPoly('12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26', { fill: color, stroke: 'none', strokeWidth: 0 })
      return svg
    case 'heart':
      addPath('M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z', { fill: color, stroke: 'none', strokeWidth: 0 })
      return svg
    case 'check':
      addPath('M20 6L9 17L4 12')
      return svg
    case 'x':
      addLine(18, 6, 6, 18)
      addLine(6, 6, 18, 18)
      return svg
    case 'arrowRight':
      addLine(5, 12, 19, 12)
      addPath('M12 5L19 12L12 19')
      return svg
    case 'arrowLeft':
      addLine(19, 12, 5, 12)
      addPath('M12 5L5 12L12 19')
      return svg
    case 'arrowUp':
      addLine(12, 19, 12, 5)
      addPath('M5 12L12 5L19 12')
      return svg
    case 'arrowDown':
      addLine(12, 5, 12, 19)
      addPath('M5 12L12 19L19 12')
      return svg
    case 'lightning':
      addPoly('13 2 3 14 12 14 11 22 21 10 12 10', { fill: color, stroke: 'none', strokeWidth: 0 })
      return svg
    case 'thumbsUp':
      addPath('M14 9V5a3 3 0 0 0-3-3L7 11v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z', { fill: color, stroke: 'none', strokeWidth: 0 })
      addPath('M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3', { fill: color, stroke: 'none', strokeWidth: 0 })
      return svg
    case 'thumbsDown':
      addPath('M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z', { fill: color, stroke: 'none', strokeWidth: 0 })
      addPath('M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17', { fill: color, stroke: 'none', strokeWidth: 0 })
      return svg
    case 'bookmark':
      addPath('M19 21L12 16L5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z', { fill: color, stroke: 'none', strokeWidth: 0 })
      return svg
    case 'lock':
      addPath('M3 11h18v11H3z')
      addPath('M7 11V7a5 5 0 0 1 10 0v4')
      return svg
    case 'bell':
      addPath('M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9')
      addPath('M13.73 21a2 2 0 0 1-3.46 0')
      return svg
    case 'sun':
      addCircle(12, 12, 5)
      addLine(12, 1, 12, 3)
      addLine(12, 21, 12, 23)
      addLine(4.22, 4.22, 5.64, 5.64)
      addLine(18.36, 18.36, 19.78, 19.78)
      addLine(1, 12, 3, 12)
      addLine(21, 12, 23, 12)
      addLine(4.22, 19.78, 5.64, 18.36)
      addLine(18.36, 5.64, 19.78, 4.22)
      return svg
    case 'moon':
      addPath('M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z', { fill: color, stroke: 'none', strokeWidth: 0 })
      return svg
    case 'cloud':
      addPath('M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z', { fill: color, stroke: 'none', strokeWidth: 0 })
      return svg
    case 'flag':
      addPath('M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z')
      addLine(4, 15, 4, 22)
      return svg
    case 'share':
      addCircle(18, 5, 3)
      addCircle(6, 12, 3)
      addCircle(18, 19, 3)
      addLine(8.59, 13.51, 15.42, 17.49)
      addLine(15.41, 6.51, 8.59, 10.49)
      return svg
    case 'clipboard':
      addPath('M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2')
      addPath('M8 2h8v4H8z')
      return svg
    case 'trash':
      addPath('M3 6h18')
      addPath('M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6')
      addPath('M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2')
      return svg
    default:
      return null
  }
}

const applyBaseStyles = (node, element, scaleX, scaleY) => {
  node.style.position = 'absolute'
  node.style.left = toPx((element.x || 0) * scaleX)
  node.style.top = toPx((element.y || 0) * scaleY)
  node.style.width = toPx((element.width || 0) * scaleX)
  node.style.height = toPx((element.height || 0) * scaleY)
  node.style.boxSizing = 'border-box'
  node.style.opacity = `${((element.opacity ?? 100) / 100)}`
  node.style.transform = element.rotation ? `rotate(${element.rotation}deg)` : ''
  node.style.transformOrigin = 'center center'
  node.style.overflow = 'hidden'
}

const createTextNode = (element, scaleX, scaleY, extra = {}) => {
  const align = getTextAlign(element.textAlign)
  const node = document.createElement('div')
  node.style.width = '100%'
  node.style.height = '100%'
  node.style.display = 'flex'
  node.style.alignItems = 'center'
  node.style.justifyContent = getJustify(align)
  node.style.whiteSpace = 'pre-wrap'
  node.style.wordBreak = 'break-word'
  node.style.overflow = 'hidden'
  node.style.padding = toPx(8 * Math.min(scaleX, scaleY))
  node.style.fontSize = toPx((element.fontSize || 16) * Math.min(scaleX, scaleY))
  node.style.fontWeight = element.fontWeight || 'normal'
  node.style.fontFamily = element.fontFamily || 'Arial, sans-serif'
  node.style.fontStyle = element.fontStyle || 'normal'
  node.style.textDecoration = element.textDecoration || 'none'
  node.style.textAlign = align
  node.style.lineHeight = extra.lineHeight || '1.4'
  node.style.color = extra.color || element.color || '#111827'
  node.style.backgroundColor = element.backgroundColor && element.backgroundColor !== 'transparent' ? element.backgroundColor : 'transparent'
  if (element.borderWidth) {
    node.style.border = `${Math.max(1, element.borderWidth * Math.min(scaleX, scaleY))}px solid ${element.borderColor || '#333333'}`
  }
  if (element.borderRadius) {
    node.style.borderRadius = toPx(element.borderRadius * Math.min(scaleX, scaleY))
  }
  node.textContent = element.content || ''
  return node
}

const createShapeGraphic = (element) => {
  const type = element.shapeType || 'rectangle'
  if (type === 'circle' || type === 'rectangle') {
    const div = document.createElement('div')
    div.style.width = '100%'
    div.style.height = '100%'
    div.style.backgroundColor = element.fill || '#4CAF50'
    div.style.borderRadius = type === 'circle' ? '50%' : `${element.borderRadius || 8}px`
    if (element.strokeWidth) {
      div.style.border = `${element.strokeWidth}px solid ${element.strokeColor || '#333333'}`
    }
    return div
  }

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.style.width = '100%'
  svg.style.height = '100%'

  const shape = document.createElementNS(SVG_NS, type === 'line' || type === 'arrow' ? 'path' : 'polygon')
  const fill = element.fill || '#4CAF50'
  const stroke = element.strokeColor || fill
  const strokeWidth = `${element.strokeWidth || (type === 'line' || type === 'arrow' ? 3 : 1)}`

  if (type === 'triangle') shape.setAttribute('points', '50,4 4,96 96,96')
  if (type === 'star') shape.setAttribute('points', '50,4 61,37 96,37 67,58 78,94 50,72 22,94 33,58 4,37 39,37')
  if (type === 'hexagon') shape.setAttribute('points', '25,4 75,4 96,50 75,96 25,96 4,50')
  if (type === 'diamond') shape.setAttribute('points', '50,2 98,50 50,98 2,50')
  if (type === 'line') {
    shape.setAttribute('d', 'M 4 50 L 96 50')
    shape.setAttribute('fill', 'none')
    shape.setAttribute('stroke-linecap', 'round')
  }
  if (type === 'arrow') {
    shape.setAttribute('d', 'M 4 50 L 78 50 M 62 30 L 96 50 L 62 70')
    shape.setAttribute('fill', 'none')
    shape.setAttribute('stroke-linecap', 'round')
    shape.setAttribute('stroke-linejoin', 'round')
  }

  shape.setAttribute('fill', type === 'line' || type === 'arrow' ? 'none' : fill)
  shape.setAttribute('stroke', stroke)
  shape.setAttribute('stroke-width', strokeWidth)
  svg.appendChild(shape)
  return svg
}

const createImageNode = (element, scaleX, scaleY) => {
  const wrapper = document.createElement('div')
  wrapper.style.width = '100%'
  wrapper.style.height = '100%'
  wrapper.style.display = 'flex'
  wrapper.style.flexDirection = element.caption && element.showCaption ? 'column' : 'row'
  wrapper.style.gap = element.caption && element.showCaption ? toPx(4 * Math.min(scaleX, scaleY)) : '0'

  const img = document.createElement('img')
  img.src = element.src || ''
  img.alt = element.caption || 'slide'
  img.crossOrigin = 'anonymous'
  img.style.width = '100%'
  img.style.height = element.caption && element.showCaption ? 'calc(100% - 28px)' : '100%'
  img.style.objectFit = element.objectFit || 'cover'
  let borderRadiusVal = '6px'
  if (element.borderRadius !== undefined) {
    if (typeof element.borderRadius === 'string' && element.borderRadius.endsWith('%')) {
      borderRadiusVal = element.borderRadius
    } else {
      borderRadiusVal = toPx(Number(element.borderRadius || 0) * Math.min(scaleX, scaleY))
    }
  } else {
    borderRadiusVal = toPx(6 * Math.min(scaleX, scaleY))
  }
  img.style.borderRadius = borderRadiusVal
  wrapper.appendChild(img)

  if (element.caption && element.showCaption) {
    const caption = document.createElement('div')
    caption.textContent = element.caption
    caption.style.fontSize = toPx((element.captionFontSize || 14) * Math.min(scaleX, scaleY))
    caption.style.fontFamily = element.captionFontFamily || 'Arial, sans-serif'
    caption.style.color = element.captionColor || '#374151'
    caption.style.textAlign = 'center'
    caption.style.backgroundColor = '#f3f4f6'
    caption.style.borderRadius = toPx(6 * Math.min(scaleX, scaleY))
    caption.style.padding = toPx(4 * Math.min(scaleX, scaleY))
    wrapper.appendChild(caption)
  }

  return wrapper
}

const createIconNode = (element, scaleX, scaleY) => {
  const wrapper = document.createElement('div')
  wrapper.style.width = '100%'
  wrapper.style.height = '100%'
  wrapper.style.display = 'flex'
  wrapper.style.flexDirection = element.content && element.showLabel ? 'column' : 'row'
  wrapper.style.alignItems = 'center'
  wrapper.style.justifyContent = 'center'
  wrapper.style.gap = toPx(6 * Math.min(scaleX, scaleY))

  const iconHolder = document.createElement('div')
  iconHolder.style.width = element.content && element.showLabel ? '68%' : '78%'
  iconHolder.style.height = element.content && element.showLabel ? '62%' : '78%'
  iconHolder.style.display = 'flex'
  iconHolder.style.alignItems = 'center'
  iconHolder.style.justifyContent = 'center'

  const iconColor = element.color || element.fill || '#2E7D32'
  const iconSvg = createSvgIconNode(element.iconType, iconColor)

  if (iconSvg) {
    iconHolder.appendChild(iconSvg)
  } else {
    const fallback = document.createElement('div')
    fallback.textContent = `${element.iconType || 'icon'}`.charAt(0).toUpperCase() || 'I'
    fallback.style.width = '100%'
    fallback.style.height = '100%'
    fallback.style.display = 'flex'
    fallback.style.alignItems = 'center'
    fallback.style.justifyContent = 'center'
    fallback.style.backgroundColor = iconColor
    fallback.style.color = '#ffffff'
    fallback.style.borderRadius = '9999px'
    fallback.style.fontSize = toPx(Math.max(18, ((element.fontSize || 28) * Math.min(scaleX, scaleY)) * 1.15))
    fallback.style.fontFamily = element.fontFamily || 'Arial, sans-serif'
    iconHolder.appendChild(fallback)
  }

  wrapper.appendChild(iconHolder)

  if (element.content && element.showLabel) {
    const label = document.createElement('div')
    label.textContent = element.content
    label.style.maxWidth = '100%'
    label.style.fontSize = toPx((element.fontSize || 14) * Math.min(scaleX, scaleY))
    label.style.fontFamily = element.fontFamily || 'Arial, sans-serif'
    label.style.fontWeight = element.fontWeight || 'normal'
    label.style.color = element.textColor || element.color || '#1f2937'
    label.style.textAlign = 'center'
    label.style.whiteSpace = 'nowrap'
    label.style.overflow = 'hidden'
    label.style.textOverflow = 'ellipsis'
    wrapper.appendChild(label)
  }

  return wrapper
}

const createTableNode = (element, scaleX, scaleY) => {
  const table = document.createElement('table')
  table.style.width = '100%'
  table.style.height = '100%'
  table.style.borderCollapse = 'collapse'
  table.style.tableLayout = 'fixed'
  table.style.backgroundColor = '#ffffff'

  const rows = Math.max(1, element.rows || element.data?.length || 1)
  const cols = Math.max(1, element.cols || element.data?.[0]?.length || 1)
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr')
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td')
      td.textContent = element.data?.[r]?.[c] || ''
      td.style.border = '1px solid #9CA3AF'
      td.style.padding = toPx(6 * Math.min(scaleX, scaleY))
      td.style.fontSize = toPx(12 * Math.min(scaleX, scaleY))
      td.style.color = '#111827'
      td.style.verticalAlign = 'middle'
      tr.appendChild(td)
    }
    table.appendChild(tr)
  }
  return table
}

const createMediaPlaceholder = (element, scaleX, scaleY) => {
  const wrapper = document.createElement('div')
  wrapper.style.width = '100%'
  wrapper.style.height = '100%'
  wrapper.style.display = 'flex'
  wrapper.style.alignItems = 'center'
  wrapper.style.justifyContent = 'center'
  wrapper.style.flexDirection = 'column'
  wrapper.style.gap = toPx(10 * Math.min(scaleX, scaleY))
  wrapper.style.background = element.type === 'video' ? '#111827' : '#f3f4f6'
  wrapper.style.color = element.type === 'video' ? '#ffffff' : '#111827'
  wrapper.style.borderRadius = toPx(10 * Math.min(scaleX, scaleY))
  wrapper.style.padding = toPx(12 * Math.min(scaleX, scaleY))

  const icon = document.createElement('div')
  icon.textContent = element.type === 'video' ? '?' : '?'
  icon.style.width = toPx(54 * Math.min(scaleX, scaleY))
  icon.style.height = toPx(54 * Math.min(scaleX, scaleY))
  icon.style.borderRadius = '9999px'
  icon.style.display = 'flex'
  icon.style.alignItems = 'center'
  icon.style.justifyContent = 'center'
  icon.style.background = element.type === 'video' ? 'rgba(255,255,255,0.12)' : '#10b981'
  icon.style.color = '#ffffff'
  icon.style.fontSize = toPx(24 * Math.min(scaleX, scaleY))
  wrapper.appendChild(icon)

  const label = document.createElement('div')
  label.textContent = element.title || (element.isYouTube ? 'Embedded video' : element.type === 'video' ? 'Video clip' : 'Audio clip')
  label.style.fontSize = toPx(16 * Math.min(scaleX, scaleY))
  label.style.fontWeight = '600'
  label.style.maxWidth = '100%'
  label.style.whiteSpace = 'nowrap'
  label.style.overflow = 'hidden'
  label.style.textOverflow = 'ellipsis'
  wrapper.appendChild(label)

  return wrapper
}

const createDrawingNode = (element) => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`)
  svg.style.width = '100%'
  svg.style.height = '100%'
  ;(element.paths || []).forEach((pathData) => {
    if (!pathData?.points?.length) return
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', `M ${pathData.points.map((point) => `${point.x} ${point.y}`).join(' L ')}`)
    path.setAttribute('stroke', pathData.color || '#111827')
    path.setAttribute('stroke-width', `${pathData.size || 2}`)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    svg.appendChild(path)
  })
  return svg
}

const createElementNode = (element, scaleX, scaleY) => {
  const node = document.createElement('div')
  applyBaseStyles(node, element, scaleX, scaleY)
  switch (element.type) {
    case 'text':
      node.appendChild(createTextNode(element, scaleX, scaleY))
      break
    case 'shape': {
      node.style.display = 'flex'
      node.style.alignItems = 'stretch'
      node.style.justifyContent = 'stretch'
      node.appendChild(createShapeGraphic(element))
      if (element.content) {
        const overlay = createTextNode({ ...element, backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, textAlign: element.textAlign || 'center' }, scaleX, scaleY, { lineHeight: '1.25' })
        overlay.style.position = 'absolute'
        overlay.style.inset = '0'
        overlay.style.padding = toPx(10 * Math.min(scaleX, scaleY))
        node.appendChild(overlay)
      }
      break
    }
    case 'image':
      node.appendChild(createImageNode(element, scaleX, scaleY))
      break
    case 'icon':
      node.appendChild(createIconNode(element, scaleX, scaleY))
      break
    case 'table':
      node.appendChild(createTableNode(element, scaleX, scaleY))
      break
    case 'video':
    case 'audio':
      node.appendChild(createMediaPlaceholder(element, scaleX, scaleY))
      break
    case 'drawing':
      node.appendChild(createDrawingNode(element))
      break
    default:
      node.style.backgroundColor = element.fill || element.backgroundColor || '#d1d5db'
      if (element.borderRadius) node.style.borderRadius = toPx(element.borderRadius * Math.min(scaleX, scaleY))
      break
  }
  return node
}

export const buildSlideRenderNode = (frame, { width = SLIDE_WIDTH, height = SLIDE_HEIGHT, header = null } = {}) => {
  const root = document.createElement('div')
  root.style.position = 'relative'
  root.style.width = toPx(width)
  root.style.height = toPx(height)
  root.style.overflow = 'hidden'
  root.style.backgroundColor = frame?.backgroundColor || '#ffffff'
  root.style.backgroundImage = frame?.backgroundImage ? `url(${frame.backgroundImage})` : 'none'
  root.style.backgroundSize = 'cover'
  root.style.backgroundPosition = 'center'
  root.style.backgroundRepeat = 'no-repeat'
  root.style.fontFamily = 'Arial, sans-serif'

  const scaleX = width / SLIDE_WIDTH
  const scaleY = height / SLIDE_HEIGHT
  ;(frame?.elements || []).forEach((element) => {
    if (!element || element.isPlaceholder) return
    root.appendChild(createElementNode(element, scaleX, scaleY))
  })

  // Project Header overlay — drawn at the top of every exported slide. Skipped
  // when the user hasn't replaced the default placeholder.
  if (header && header.content && !header.isPlaceholder) {
    const headerNode = document.createElement('div')
    headerNode.style.position = 'absolute'
    headerNode.style.top = '0'
    headerNode.style.left = '0'
    headerNode.style.width = '100%'
    headerNode.style.padding = `${20 * scaleY}px ${32 * scaleX}px`
    headerNode.style.boxSizing = 'border-box'
    headerNode.style.display = 'flex'
    headerNode.style.alignItems = 'center'
    headerNode.style.justifyContent =
      header.textAlign === 'right' ? 'flex-end' :
      header.textAlign === 'left' ? 'flex-start' : 'center'
    headerNode.style.zIndex = '999'
    headerNode.style.pointerEvents = 'none'

    const headerSpan = document.createElement('span')
    headerSpan.textContent = header.content
    headerSpan.style.fontSize = `${(header.fontSize || 48) * scaleY}px`
    headerSpan.style.fontFamily = header.fontFamily || 'Inter, Arial, sans-serif'
    headerSpan.style.fontWeight = header.fontWeight || 'bold'
    headerSpan.style.fontStyle = header.fontStyle || 'normal'
    headerSpan.style.textDecoration = header.textDecoration || 'none'
    headerSpan.style.color = header.color || '#1a1a1a'
    headerSpan.style.whiteSpace = 'nowrap'
    headerSpan.style.overflow = 'hidden'
    headerSpan.style.textOverflow = 'ellipsis'
    headerSpan.style.maxWidth = '100%'
    headerNode.appendChild(headerSpan)
    root.appendChild(headerNode)
  }

  return root
}
