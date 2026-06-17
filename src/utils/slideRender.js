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

const convertRunsToHtml = (runs, scale = 1) => {
  if (!runs || runs.length === 0) return ''
  return runs.map(run => {
    if (run.text === '\n') return '<br>'
    
    const styles = []
    if (run.fontSize) styles.push(`font-size:${Math.round(run.fontSize * scale)}px`)
    if (run.fontWeight) {
      styles.push(`font-weight:${run.fontWeight === 'bold' || run.fontWeight === 700 ? 'bold' : 'normal'}`)
    }
    if (run.fontFamily) styles.push(`font-family:${run.fontFamily}`)
    if (run.fontStyle && run.fontStyle !== 'normal') styles.push(`font-style:${run.fontStyle}`)
    if (run.textDecoration && run.textDecoration !== 'none') styles.push(`text-decoration:${run.textDecoration}`)
    if (run.color) styles.push(`color:${run.color}`)
    if (run.lineHeight) styles.push(`line-height:${run.lineHeight}`)
    
    const styleAttr = styles.length > 0 ? ` style="${styles.join(';')}"` : ''
    const escapedText = (run.text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
    
    if (styleAttr) {
      return `<span${styleAttr}>${escapedText}</span>`
    }
    return escapedText
  }).join('')
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
  
  const scale = Math.min(scaleX, scaleY)
  if (element.runs && element.runs.length > 0) {
    node.innerHTML = convertRunsToHtml(element.runs, scale)
  } else {
    const listType = element.listType || 'none'
    const content = element.content || ''
    
    if (listType !== 'none' && content && !content.includes('<ul') && !content.includes('<ol')) {
      const lines = content.split('\n')
      let itemIndex = 0
      node.innerHTML = lines.map((line) => {
        if (!line.trim()) return '<div>&nbsp;</div>'
        itemIndex++
        let prefix = '•'
        switch (listType) {
          case 'bullet': prefix = '•'; break
          case 'bullet-hollow': prefix = '○'; break
          case 'bullet-square': prefix = '■'; break
          case 'bullet-dash': prefix = '-'; break
          case 'bullet-arrow': prefix = '➔'; break
          case 'bullet-check': prefix = '✓'; break
          case 'bullet-star': prefix = '★'; break
          case 'numbered': prefix = `${itemIndex}.`; break
          case 'numbered-paren': prefix = `${itemIndex})`; break
          case 'alpha': prefix = `${String.fromCharCode(65 + ((itemIndex - 1) % 26))}.`; break
          case 'alpha-lower': prefix = `${String.fromCharCode(97 + ((itemIndex - 1) % 26))}.`; break
          case 'roman': {
            const lookup = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 }
            let roman = '', num = itemIndex
            for (let i in lookup) {
              while (num >= lookup[i]) {
                roman += i
                num -= lookup[i]
              }
            }
            prefix = `${roman}.`;
            break
          }
        }
        return `<div style="display:flex;"><span style="flex-shrink:0;width:32px;">${prefix}</span><span>${line}</span></div>`
      }).join('')
    } else {
      node.innerHTML = content
    }
  }
  return node
}

const createShapeGraphic = (element) => {
  const type = element.shapeType || 'rectangle'
  if (type === 'circle' || type === 'rectangle') {
    const div = document.createElement('div')
    div.style.width = '100%'
    div.style.height = '100%'
    div.style.backgroundColor = element.fill || '#4CAF50'
    div.style.borderRadius = type === 'circle' ? '50%' : `${element.borderRadius || (type === 'rectangle' ? 4 : 0)}px`
    if (element.strokeWidth) {
      div.style.border = `${element.strokeWidth}px ${element.borderStyle || 'solid'} ${element.strokeColor || '#333333'}`
    }
    return div
  }

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 100 100')
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.style.width = '100%'
  svg.style.height = '100%'

  const isLine = type === 'line' || type === 'arrow' || type === 'doubleArrow'
  const isPath = [
    'semicircle', 'cylinder', 'shield', 'waveFlag', 'folder', 'stickyNote', 
    'document', 'puzzle', 'crescent', 'teardrop', 'ovalSpeech', 'rectSpeech', 
    'thoughtBubble', 'cloud', 'heart', 'flower', 'roundedFlower', 'line', 
    'arrow', 'doubleArrow'
  ].includes(type)
  const shape = document.createElementNS(SVG_NS, isPath ? 'path' : 'polygon')
  const fill = element.fill || '#4CAF50'
  const stroke = element.strokeColor || fill
  const strokeWidth = `${element.strokeWidth || (type === 'line' || type === 'arrow' ? 3 : 1)}`

  if (type === 'triangle') shape.setAttribute('points', '50,4 4,96 96,96')
  if (type === 'rightTriangle') shape.setAttribute('points', '0,0 0,100 100,100')
  if (type === 'parallelogram') shape.setAttribute('points', '25,0 100,0 75,100 0,100')
  if (type === 'star') shape.setAttribute('points', '50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35')
  if (type === 'star4') shape.setAttribute('points', '50,10 60,40 90,50 60,60 50,90 40,60 10,50 40,40')
  if (type === 'star6') shape.setAttribute('points', '50,5 63,28 90,28 72,50 90,72 63,72 50,95 37,72 10,72 28,50 10,28 37,28')
  if (type === 'star8') shape.setAttribute('points', '50,5 58,35 82,18 65,42 95,50 65,58 82,82 58,65 50,95 42,65 18,82 35,58 5,50 35,42 18,18 42,35')
  if (type === 'sun') shape.setAttribute('points', '50,5 53,23 68,14 64,31 81,19 72,36 89,30 76,46 95,50 76,54 89,70 72,64 81,81 64,69 68,86 53,77 50,95 47,77 32,86 36,69 19,81 28,64 11,70 24,54 5,50 24,46 11,30 28,36 19,19 36,31 32,14 47,23')
  if (type === 'decagram') shape.setAttribute('points', '50,5 57,20 72,12 70,28 85,25 78,39 92,45 81,54 88,70 75,72 77,88 63,83 59,95 48,87 37,95 33,83 19,88 21,72 8,70 15,54 4,45 18,39 11,25 26,28 24,12 39,20')
  if (type === 'hexagon') shape.setAttribute('points', '30,0 90,0 120,50 90,100 30,100 0,50')
  if (type === 'diamond') shape.setAttribute('points', '50,0 100,50 50,100 0,50')
  if (type === 'pentagon') shape.setAttribute('points', '50,5 95,38 78,92 22,92 5,38')
  if (type === 'octagon') shape.setAttribute('points', '30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30')

  if (type === 'leftArrowBlock') shape.setAttribute('points', '0,50 40,15 40,35 100,35 100,65 40,65 40,85')
  if (type === 'rightArrowBlock') shape.setAttribute('points', '100,50 60,15 60,35 0,35 0,65 60,65 60,85')
  if (type === 'leftRightArrowBlock') shape.setAttribute('points', '0,50 25,25 25,40 75,40 75,25 100,50 75,75 75,60 25,60 25,75')
  if (type === 'chevronArrowBlock') shape.setAttribute('points', '0,25 50,25 50,10 90,50 50,90 50,75 0,75 40,50')
  if (type === 'pentagonArrowBlock') shape.setAttribute('points', '0,35 60,35 60,15 100,50 60,85 60,65 0,65')

  if (type === 'semicircle') {
    shape.setAttribute('d', 'M 0 100 A 50 50 0 0 1 100 100 Z')
  }
  if (type === 'cylinder') {
    shape.setAttribute('d', 'M 10 20 L 10 80 A 40 10 0 0 0 90 80 L 90 20 A 40 10 0 0 0 10 20 M 10 20 A 40 10 0 0 0 90 20')
  }
  if (type === 'shield') {
    shape.setAttribute('d', 'M 10 10 L 90 10 L 90 50 Q 90 85 50 95 Q 10 85 10 50 Z')
  }
  if (type === 'waveFlag') {
    shape.setAttribute('d', 'M 10 20 Q 30 10 50 20 T 90 20 L 90 80 Q 70 70 50 80 T 10 80 Z')
  }
  if (type === 'folder') {
    shape.setAttribute('d', 'M 10 20 L 40 20 L 50 30 L 90 30 L 90 80 L 10 80 Z')
  }
  if (type === 'stickyNote') {
    shape.setAttribute('d', 'M 10 10 L 90 10 L 90 70 L 70 90 L 10 90 Z M 90 70 L 70 70 L 70 90')
  }
  if (type === 'document') {
    shape.setAttribute('d', 'M 15 10 L 70 10 L 85 25 L 85 90 L 15 90 Z M 70 10 L 70 25 L 85 25')
  }
  if (type === 'puzzle') {
    shape.setAttribute('d', 'M 20 20 L 40 20 C 40 10, 60 10, 60 20 L 80 20 L 80 40 C 90 40, 90 60, 80 60 L 80 80 L 60 80 C 60 90, 40 90, 40 80 L 20 80 L 20 60 C 10 60, 10 40, 20 40 Z')
  }
  if (type === 'crescent') {
    shape.setAttribute('d', 'M 80 15 A 35 35 0 1 0 80 85 A 30 30 0 1 1 80 15')
  }
  if (type === 'teardrop') {
    shape.setAttribute('d', 'M 50 10 C 50 10 90 55 90 70 A 40 40 0 0 1 10 70 C 10 55 50 10 50 10 Z')
  }
  if (type === 'ovalSpeech') {
    shape.setAttribute('d', 'M 50 10 C 25 10 5 25 5 45 C 5 60 18 73 35 77 L 25 95 L 48 80 C 49 80 50 80 50 80 C 75 80 95 65 95 45 C 95 25 75 10 50 10 Z')
  }
  if (type === 'rectSpeech') {
    shape.setAttribute('d', 'M 10 10 L 90 10 L 90 70 L 45 70 L 25 90 L 25 70 L 10 70 Z')
  }
  if (type === 'thoughtBubble') {
    shape.setAttribute('d', 'M 30 60 A 15 15 0 0 1 38 35 A 18 18 0 0 1 70 35 A 15 15 0 0 1 78 60 A 12 12 0 0 1 70 75 L 35 75 A 12 12 0 0 1 30 60 Z M 22 83 A 5 5 0 1 1 17 83 A 5 5 0 1 1 22 83 Z M 13 91 A 3 3 0 1 1 10 91 A 3 3 0 1 1 13 91 Z')
  }
  if (type === 'heart') {
    shape.setAttribute('d', 'M 50 30 C 50 10, 10 10, 10 40 C 10 65, 50 90, 50 95 C 50 90, 90 65, 90 40 C 90 10, 50 10, 50 30 Z')
  }
  if (type === 'cloud') {
    shape.setAttribute('d', 'M 25 60 A 15 15 0 0 1 35 35 A 20 20 0 0 1 70 35 A 15 15 0 0 1 80 60 A 12 12 0 0 1 75 80 L 25 80 A 12 12 0 0 1 25 60 Z')
  }
  if (type === 'flower') {
    shape.setAttribute('d', 'M 50,40 C 53,30 63,30 66,40 C 76,37 79,47 70,53 C 79,59 71,69 61,66 C 60,76 50,76 47,66 C 37,69 29,59 38,53 C 29,47 32,37 42,40 C 40,30 50,30 50,40 Z')
  }
  if (type === 'roundedFlower') {
    shape.setAttribute('d', 'M 50,20 L 53,20 L 55,10 L 61,12 L 59,21 L 64,23 L 69,16 L 74,20 L 69,27 L 73,31 L 80,27 L 83,32 L 76,37 L 78,42 L 86,42 L 86,48 L 77,50 L 77,55 L 85,58 L 83,63 L 75,61 L 72,66 L 77,73 L 73,77 L 66,72 L 62,75 L 63,84 L 57,85 L 55,76 L 50,77 L 48,86 L 42,85 L 44,76 L 39,74 L 33,80 L 29,75 L 34,69 L 31,64 L 23,67 L 21,62 L 28,57 L 27,52 L 18,50 L 18,44 L 27,42 L 28,37 L 20,34 L 22,29 L 30,32 L 33,27 L 28,20 L 33,16 L 38,23 L 43,21 L 43,12 L 49,11 Z M 50,35 A 15,15 0 1 0 50,65 A 15,15 0 1 0 50,35 Z')
  }
  if (type === 'doubleArrow') {
    shape.setAttribute('d', 'M 12 50 L 88 50 M 28 30 L 8 50 L 28 70 M 72 30 L 92 50 L 72 70')
  }
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

  shape.setAttribute('fill', isLine ? 'none' : fill)
  shape.setAttribute('stroke', stroke)
  shape.setAttribute('stroke-width', strokeWidth)
  if (element.borderStyle === 'dashed') {
    shape.setAttribute('stroke-dasharray', '5,5')
  }
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

export const buildSlideRenderNode = (frame, { width = SLIDE_WIDTH, height = SLIDE_HEIGHT, header = null, editorBackground = null } = {}) => {
  const root = document.createElement('div')
  root.style.position = 'relative'
  root.style.width = toPx(width)
  root.style.height = toPx(height)
  root.style.overflow = 'hidden'
  root.style.backgroundColor = frame?.backgroundColor && frame.backgroundColor !== 'transparent'
    ? frame.backgroundColor
    : (editorBackground ? 'transparent' : '#ffffff')
  root.style.backgroundImage = frame?.backgroundImage
    ? `url(${frame.backgroundImage})`
    : (editorBackground && (!frame?.backgroundColor || frame.backgroundColor === 'transparent') ? `url(${editorBackground})` : 'none')
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
