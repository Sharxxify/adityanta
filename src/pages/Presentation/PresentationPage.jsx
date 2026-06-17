import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useEditor } from '../../context/EditorContext'
import { computeSnakePosition } from '../../utils/snakeLayout'

const WORLD_PADDING = 220
const PREZI_LAYOUT_PRESETS = [
  { x: 820, y: 220, width: 1280, height: 720 },
  { x: 60, y: 120, width: 640, height: 360 },
  { x: 60, y: 580, width: 640, height: 360 },
  { x: 2260, y: 300, width: 640, height: 360 },
  { x: 2260, y: 790, width: 640, height: 360 },
]
const PREZI_FLOW_ORDER = [1, 2, 0, 3, 4]

const FRAME_GAP = 20
const FRAME_MIN_H = 80
const BG_L = 20, BG_T = 80, BG_R = 2940, BG_B = 1190
const HERO_LAYOUT = { x: 820, y: 220, width: 1280, height: 720 }
const LEFT_AREA  = { x: 40,   y: 100, w: 760, h: 1070 }
const RIGHT_AREA = { x: 2120, y: 100, w: 800, h: 1070 }

const clampToBg = (layout) => layout


const fitGridInArea = (area, count) => {
  if (count === 0) return []
  let bestCols = 1
  let bestW = 0
  const gap = 20
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols)
    const w1 = (area.w - gap * (cols - 1)) / cols
    const maxH = (area.h - gap * (rows - 1)) / rows
    const w2 = maxH * (16 / 9)
    const w = Math.min(w1, w2, 320) // Clamp to 320px to make secondary frames smaller
    if (w > bestW) {
      bestW = w
      bestCols = cols
    }
  }
  
  const cols = bestCols
  const rows = Math.ceil(count / cols)
  const fw = bestW
  const fh = fw * 9 / 16
  
  const gridW = cols * fw + (cols - 1) * gap
  const gridH = rows * fh + (rows - 1) * gap
  const startX = area.x + (area.w - gridW) / 2
  const startY = area.y + (area.h - gridH) / 2
  
  return Array.from({ length: count }, (_, i) => ({
    x: startX + (i % cols) * (fw + gap),
    y: startY + Math.floor(i / cols) * (fh + gap),
    width: fw,
    height: fh,
  }))
}

const computeFrameLayouts = (sideCount) => {
  if (sideCount === 0) return []
  const leftN = Math.ceil(sideCount / 2)
  const rightN = sideCount - leftN
  const LEFT_AREA  = { x: 40,   y: 100, w: 760, h: 1070 }
  const RIGHT_AREA = { x: 2120, y: 100, w: 800, h: 1070 }
  return [
    ...fitGridInArea(LEFT_AREA, leftN),
    ...fitGridInArea(RIGHT_AREA, rightN)
  ]
}

const buildInterFrameConnectors = (layout) => {
  if (!Array.isArray(layout) || layout.length < 2) return []
  const order = (layout.length >= 5
    ? PREZI_FLOW_ORDER.filter((idx) => idx < layout.length)
    : layout.map((_, idx) => idx))

  const connectors = []
  for (let i = 0; i < order.length - 1; i += 1) {
    const from = layout[order[i]]
    const to = layout[order[i + 1]]
    if (!from || !to) continue

    const fromCx = from.x + (from.width / 2)
    const fromCy = from.y + (from.height / 2)
    const toCx = to.x + (to.width / 2)
    const toCy = to.y + (to.height / 2)

    const dx = toCx - fromCx
    const dy = toCy - fromCy
    const distance = Math.max(1, Math.hypot(dx, dy))
    const ux = dx / distance
    const uy = dy / distance

    const fromExtent = ((from.width / 2) * Math.abs(ux)) + ((from.height / 2) * Math.abs(uy))
    const toExtent = ((to.width / 2) * Math.abs(ux)) + ((to.height / 2) * Math.abs(uy))
    const margin = 34

    const startX = fromCx + (ux * (fromExtent + margin))
    const startY = fromCy + (uy * (fromExtent + margin))
    const endX = toCx - (ux * (toExtent + margin))
    const endY = toCy - (uy * (toExtent + margin))

    const arrowX = (startX + endX) / 2
    const arrowY = (startY + endY) / 2

    const horizontal = Math.abs(dx) >= Math.abs(dy)
    const symbol = horizontal
      ? (dx >= 0 ? '»»' : '««')
      : (dy >= 0 ? '⌄⌄' : '⌃⌃')

    connectors.push({
      id: `${from.id}-${to.id}`,
      x: arrowX,
      y: arrowY,
      symbol,
      horizontal,
    })
  }

  return connectors
}

// ─── Annotation overlay component ────────────────────────────────────────
// Renders all strokes (committed + in-progress) for the currently active
// slide. Reads the active slide's DOM rect on each animation frame so
// strokes stay perfectly locked to the slide even mid-zoom-animation.
const AnnotationOverlay = ({
  activeTool,
  annotations,
  currentSlideKey,
  liveStrokeRef,
  liveStrokeVersion, // eslint-disable-line no-unused-vars
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) => {
  const [slideRect, setSlideRect] = useState(null)
  const rafRef = useRef(null)

  // Continuously sample the active slide's rect — needed because the slide
  // moves during the camera animation and re-renders aren't synced to it.
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector('[data-active-slide="true"]')
      if (el) {
        const r = el.getBoundingClientRect()
        setSlideRect((prev) => {
          if (prev && prev.left === r.left && prev.top === r.top && prev.width === r.width && prev.height === r.height) {
            return prev
          }
          return { left: r.left, top: r.top, width: r.width, height: r.height }
        })
      }
      rafRef.current = requestAnimationFrame(measure)
    }
    rafRef.current = requestAnimationFrame(measure)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  if (!slideRect) return null

  const slideStrokes = (annotations[currentSlideKey] || [])
  const live = liveStrokeRef.current && liveStrokeRef.current.slideKey === currentSlideKey
    ? liveStrokeRef.current
    : null
  const allStrokes = live ? [...slideStrokes, live] : slideStrokes

  // Build SVG path "d" attribute from a list of normalized points.
  const buildPathD = (points, rect) => {
    if (!points || points.length === 0) return ''
    const screenPts = points.map((p) => [p.x * rect.width + rect.left, p.y * rect.height + rect.top])
    let d = `M ${screenPts[0][0]} ${screenPts[0][1]}`
    for (let i = 1; i < screenPts.length; i++) {
      d += ` L ${screenPts[i][0]} ${screenPts[i][1]}`
    }
    return d
  }

  // Pointer events only enabled when a non-laser tool is active.
  const interactive = activeTool && activeTool !== 'laser'
  const cursorClass =
    activeTool === 'eraser' ? 'cursor-cell' :
    activeTool === 'laser' ? 'cursor-none' :
    activeTool ? 'cursor-crosshair' : 'cursor-default'

  return (
    <div
      className={`fixed inset-0 ${cursorClass}`}
      style={{
        zIndex: 40, // below toolbar (50) but above slides
        pointerEvents: interactive ? 'auto' : 'none',
      }}
      onMouseDown={onPointerDown}
      onMouseMove={onPointerMove}
      onMouseUp={onPointerUp}
      onMouseLeave={onPointerUp}
    >
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {allStrokes.map((stroke, i) => (
          <path
            key={`${stroke.tool}-${i}-${stroke.points.length}`}
            d={buildPathD(stroke.points, slideRect)}
            stroke={stroke.color}
            strokeWidth={stroke.size}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={stroke.opacity}
          />
        ))}
      </svg>
    </div>
  )
}

const PresentationPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { frames, editorBackground } = useEditor()
  const startSlide = location.state?.startSlide || 0
  const [currentSlideIndex, setCurrentSlideIndex] = useState(startSlide)
  const [hasStarted, setHasStarted] = useState(false)

  // ─── Annotation tools (presentation only — wiped on exit) ─────────────
  // activeTool: null | 'pen' | 'pencil' | 'laser' | 'highlighter' | 'eraser'
  const [activeTool, setActiveTool] = useState(null)
  // strokes per slide: { [frameId]: Array<{ tool, color, size, points: [{x,y}] }> }
  const [annotations, setAnnotations] = useState({})
  // Live stroke being drawn (mouse is down). Committed to annotations on mouseup.
  const liveStrokeRef = useRef(null)
  const [liveStrokeVersion, setLiveStrokeVersion] = useState(0) // bumps to force re-render

  // Laser pointer follow-cursor position (only relevant when activeTool === 'laser')
  const [laserPos, setLaserPos] = useState(null)

  // Floating-toolbar drag state
  const TOOLBAR_DEFAULT_X = -24 // 24px from right edge (negative = anchored right)
  const TOOLBAR_DEFAULT_Y_RATIO = 0.5 // vertically centered
  const [toolbarPos, setToolbarPos] = useState(null) // null = use default; {x,y} = pinned
  const toolbarDragRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0, didMove: false })

  // Per-tool drawing color — user-customisable via the small color dot under
  // each tool button. Session-only state (not persisted across reloads, per
  // product spec). Pen/pencil/highlighter only; laser and eraser are fixed.
  const [toolColors, setToolColors] = useState({
    pen: '#1a73e8',
    pencil: '#444444',
    highlighter: '#ffd83d',
  })
  // Which tool's color picker popup is currently open (null = none open).
  const [openColorPicker, setOpenColorPicker] = useState(null)
  const colorPickerRef = useRef(null)

  // Tool definitions — color is dynamic (driven by toolColors state above);
  // size and opacity are fixed per spec. TOOL_DEFS is read at stroke-start
  // time (handleAnnotationPointerDown), so the latest color is always used.
  const TOOL_DEFS = {
    pen:         { color: toolColors.pen,         size: 4,  opacity: 1 },
    pencil:      { color: toolColors.pencil,      size: 2,  opacity: 1 },
    highlighter: { color: toolColors.highlighter, size: 28, opacity: 0.35 },
    laser:       { color: '#ff3838',              size: 8,  opacity: 1 }, // not drawn — follows cursor
    eraser:      { color: '#000000',              size: 0,  opacity: 0 }, // object-eraser
  }
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const containerRef = useRef(null)
  const controlsTimeoutRef = useRef(null)

  const [camera, setCamera] = useState({ zoom: 1, panX: 0, panY: 0 })

  // Slide transition speed — read from the same localStorage key the editor
  // writes to, so the presentation honours whatever the user set in the
  // "Slide Transition Speed" slider. Falls back to 3000ms if unset.
  const [navSpeedMs] = useState(() => {
    try {
      const saved = localStorage.getItem('adityanta_nav_speed_ms')
      const num = Number(saved)
      if (Number.isFinite(num) && num >= 300 && num <= 3000) return num
    } catch (_e) { /* ignore */ }
    return 1500
  })

  const getAnimationClass = (animation) => {
    if (!animation || animation === 'none') return ''
    const animMap = {
      'fadeIn': 'anim-fadeIn',
      'fadeOut': 'anim-fadeOut',
      'slideInLeft': 'anim-slideInLeft',
      'slideInRight': 'anim-slideInRight',
      'slideInUp': 'anim-slideInUp',
      'slideInDown': 'anim-slideInDown',
      'zoomIn': 'anim-zoomIn',
      'zoomOut': 'anim-zoomOut',
      'bounceIn': 'anim-bounceIn',
      'rotateIn': 'anim-rotateIn',
      'flipInX': 'anim-flipInX',
      'flipInY': 'anim-flipInY',
      'lightSpeedIn': 'anim-lightSpeedIn',
      'rollIn': 'anim-rollIn',
      'slideOutLeft': 'anim-slideOutLeft',
      'slideOutRight': 'anim-slideOutRight',
      'pulse': 'anim-pulse',
      'shake': 'anim-shake',
      'swing': 'anim-swing',
      'tada': 'anim-tada',
      'wobble': 'anim-wobble',
      'heartBeat': 'anim-heartBeat',
      'rubberBand': 'anim-rubberBand',
      // Legacy aliases
      'fade': 'anim-fadeIn',
      'slide-up': 'anim-slideInUp',
      'slide-right': 'anim-slideInRight',
      'zoom': 'anim-zoomIn',
      'bounce': 'anim-bounceIn',
    }
    return animMap[animation] || ''
  }

  const renderElement = (element, slideKey, elementIndex = 0) => {
    // Normalise animation — may be a string key or { type, duration } object
    const animType = typeof element.animation === 'object'
      ? (element.animation?.type || 'none')
      : (element.animation || 'none')
    const animDuration = typeof element.animation === 'object'
      ? (element.animation?.duration || element.animationSpeed || 500)
      : (element.animationSpeed || 500)
    const effectiveAnimation = (animType && animType !== 'none') ? animType : 'fadeIn'
    const animClass = getAnimationClass(effectiveAnimation)
    const animStyle = {
      '--anim-duration': `${Math.round(animDuration * 1.35)}ms`,
      '--anim-delay': `${(element.animationDelay || 0) + (elementIndex * 140)}ms`,
    }

    const baseStyle = {
      position: 'absolute',
      left: element.x,
      top: element.y,
      width: element.width,
      height: element.height,
      ...animStyle,
    }

    switch (element.type) {
      case 'text':
        return (
          <div
            key={`${element.id}-${slideKey}`}
            className={animClass}
            style={{
              ...baseStyle,
              fontSize: element.fontSize,
              fontWeight: element.fontWeight,
              fontFamily: element.fontFamily || 'Inter',
              fontStyle: element.fontStyle || 'normal',
              textDecoration: element.textDecoration || 'none',
              textAlign: element.textAlign || 'left',
              color: element.color,
              display: 'flex',
              alignItems: element.verticalAlign === 'middle' ? 'center' : element.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
              justifyContent: element.textAlign === 'center' ? 'center' : element.textAlign === 'right' ? 'flex-end' : 'flex-start',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
              paddingTop: element.padding?.top ?? 8,
              paddingBottom: element.padding?.bottom ?? 8,
              paddingLeft: element.padding?.left ?? 8,
              paddingRight: element.padding?.right ?? 8,
              border: element.borderWidth ? `${element.borderWidth}px solid ${element.borderColor || '#333333'}` : 'none',
              borderRadius: element.borderRadius ? `${element.borderRadius}px` : 0,
              backgroundColor: element.backgroundColor || 'transparent',
            }}
          >
            {element.content}
          </div>
        )

      case 'shape':
        const shapeOpacity = (element.opacity || 100) / 100
        const type = element.shapeType || 'rectangle'
        let pPageShapeContent
        switch(type) {
          case 'circle':
            pPageShapeContent = (
              <div
                key={`${element.id}-${slideKey}`}
                className={animClass}
                style={{
                  ...baseStyle,
                  backgroundColor: element.fill,
                  borderRadius: '50%',
                  opacity: shapeOpacity,
                  border: element.strokeWidth ? `${element.strokeWidth}px ${element.borderStyle || 'solid'} ${element.strokeColor}` : 'none',
                  transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
                }}
              />
            )
            break
          case 'semicircle':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 0 100 A 50 50 0 0 1 100 100 Z" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'triangle':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 200 150" preserveAspectRatio="none">
                <polygon points="100,0 0,150 200,150" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'rightTriangle':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="0,0 0,100 100,100" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'parallelogram':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="25,0 100,0 75,100 0,100" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'diamond':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="50,0 100,50 50,100 0,50" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'pentagon':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="50,5 95,38 78,92 22,92 5,38" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'hexagon':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 120 100" preserveAspectRatio="none">
                <polygon points="30,0 90,0 120,50 90,100 30,100 0,50" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'octagon':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="30,5 70,5 95,30 95,70 70,95 30,95 5,70 5,30" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'cylinder':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 10 20 L 10 80 A 40 10 0 0 0 90 80 L 90 20 A 40 10 0 0 0 10 20 M 10 20 A 40 10 0 0 0 90 20" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'chevronProcess':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="0,0 75,0 100,50 75,100 0,100 25,50" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'shield':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 10 10 L 90 10 L 90 50 Q 90 85 50 95 Q 10 85 10 50 Z" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'waveFlag':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 10 20 Q 30 10 50 20 T 90 20 L 90 80 Q 70 70 50 80 T 10 80 Z" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'folder':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 10 20 L 40 20 L 50 30 L 90 30 L 90 80 L 10 80 Z" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'stickyNote':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 10 10 L 90 10 L 90 70 L 70 90 L 10 90 Z M 90 70 L 70 70 L 70 90" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'document':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 15 10 L 70 10 L 85 25 L 85 90 L 15 90 Z M 70 10 L 70 25 L 85 25" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'puzzle':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 20 20 L 40 20 C 40 10, 60 10, 60 20 L 80 20 L 80 40 C 90 40, 90 60, 80 60 L 80 80 L 60 80 C 60 90, 40 90, 40 80 L 20 80 L 20 60 C 10 60, 10 40, 20 40 Z" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'leftArrowBlock':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="0,50 40,15 40,35 100,35 100,65 40,65 40,85" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'rightArrowBlock':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="100,50 60,15 60,35 0,35 0,65 60,65 60,85" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'leftRightArrowBlock':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="0,50 25,25 25,40 75,40 75,25 100,50 75,75 75,60 25,60 25,75" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'chevronArrowBlock':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="0,25 50,25 50,10 90,50 50,90 50,75 0,75 40,50" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'pentagonArrowBlock':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="0,35 60,35 60,15 100,50 60,85 60,65 0,65" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'crescent':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 80 15 A 35 35 0 1 0 80 85 A 30 30 0 1 1 80 15" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'star4':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="50,10 60,40 90,50 60,60 50,90 40,60 10,50 40,40" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'star':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'star6':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="50,5 63,28 90,28 72,50 90,72 63,72 50,95 37,72 10,72 28,50 10,28 37,28" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'star8':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="50,5 58,35 82,18 65,42 95,50 65,58 82,82 58,65 50,95 42,65 18,82 35,58 5,50 35,42 18,18 42,35" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'sun':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="50,5 53,23 68,14 64,31 81,19 72,36 89,30 76,46 95,50 76,54 89,70 72,64 81,81 64,69 68,86 53,77 50,95 47,77 32,86 36,69 19,81 28,64 11,70 24,54 5,50 24,46 11,30 28,36 19,19 36,31 32,14 47,23" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'teardrop':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 50 10 C 50 10 90 55 90 70 A 40 40 0 0 1 10 70 C 10 55 50 10 50 10 Z" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'ovalSpeech':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 50 10 C 25 10 5 25 5 45 C 5 60 18 73 35 77 L 25 95 L 48 80 C 49 80 50 80 50 80 C 75 80 95 65 95 45 C 95 25 75 10 50 10 Z" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'rectSpeech':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 10 10 L 90 10 L 90 70 L 45 70 L 25 90 L 25 70 L 10 70 Z" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'thoughtBubble':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 30 60 A 15 15 0 0 1 38 35 A 18 18 0 0 1 70 35 A 15 15 0 0 1 78 60 A 12 12 0 0 1 70 75 L 35 75 A 12 12 0 0 1 30 60 Z M 22 83 A 5 5 0 1 1 17 83 A 5 5 0 1 1 22 83 Z M 13 91 A 3 3 0 1 1 10 91 A 3 3 0 1 1 13 91 Z" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'cloud':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 25 60 A 15 15 0 0 1 35 35 A 20 20 0 0 1 70 35 A 15 15 0 0 1 80 60 A 12 12 0 0 1 75 80 L 25 80 A 12 12 0 0 1 25 60 Z" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'heart':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 50 30 C 50 10, 10 10, 10 40 C 10 65, 50 90, 50 95 C 50 90, 90 65, 90 40 C 90 10, 50 10, 50 30 Z" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'cross':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="35,5 65,5 65,35 95,35 95,65 65,65 65,95 35,95 35,65 5,65 5,35 35,35" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'flower':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 50,40 C 53,30 63,30 66,40 C 76,37 79,47 70,53 C 79,59 71,69 61,66 C 60,76 50,76 47,66 C 37,69 29,59 38,53 C 29,47 32,37 42,40 C 40,30 50,30 50,40 Z" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'decagram':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="50,5 57,20 72,12 70,28 85,25 78,39 92,45 81,54 88,70 75,72 77,88 63,83 59,95 48,87 37,95 33,83 19,88 21,72 8,70 15,54 4,45 18,39 11,25 26,28 24,12 39,20" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'roundedFlower':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 50,20 L 53,20 L 55,10 L 61,12 L 59,21 L 64,23 L 69,16 L 74,20 L 69,27 L 73,31 L 80,27 L 83,32 L 76,37 L 78,42 L 86,42 L 86,48 L 77,50 L 77,55 L 85,58 L 83,63 L 75,61 L 72,66 L 77,73 L 73,77 L 66,72 L 62,75 L 63,84 L 57,85 L 55,76 L 50,77 L 48,86 L 42,85 L 44,76 L 39,74 L 33,80 L 29,75 L 34,69 L 31,64 L 23,67 L 21,62 L 28,57 L 27,52 L 18,50 L 18,44 L 27,42 L 28,37 L 20,34 L 22,29 L 30,32 L 33,27 L 28,20 L 33,16 L 38,23 L 43,21 L 43,12 L 49,11 Z M 50,35 A 15,15 0 1 0 50,65 A 15,15 0 1 0 50,35 Z" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'line':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 200 10" preserveAspectRatio="none">
                <line x1="0" y1="5" x2="200" y2="5" stroke={element.fill || element.strokeColor} strokeWidth={element.strokeWidth || 2} strokeLinecap="round" strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'arrow':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 200 30" preserveAspectRatio="none">
                <line x1="0" y1="15" x2="170" y2="15" stroke={element.strokeColor || element.fill} strokeWidth={element.strokeWidth || 2} strokeLinecap="round" strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
                <polygon points="170,5 200,15 170,25" fill={element.strokeColor || element.fill} />
              </svg>
            )
            break
          case 'doubleArrow':
            pPageShapeContent = (
              <svg key={`${element.id}-${slideKey}`} className={animClass} style={{...baseStyle, opacity: shapeOpacity, transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined}} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 12 50 L 88 50 M 28 30 L 8 50 L 28 70 M 72 30 L 92 50 L 72 70" fill="none" stroke={element.strokeColor || element.fill} strokeWidth={element.strokeWidth || 3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={element.borderStyle === 'dashed' ? '5,5' : undefined} />
              </svg>
            )
            break
          case 'square':
          case 'rectangle':
          default:
            pPageShapeContent = (
              <div
                key={`${element.id}-${slideKey}`}
                className={animClass}
                style={{
                  ...baseStyle,
                  backgroundColor: element.fill,
                  borderRadius: element.borderRadius ? `${element.borderRadius}px` : (type === 'square' || type === 'rectangle' ? '4px' : '0px'),
                  opacity: shapeOpacity,
                  border: element.strokeWidth ? `${element.strokeWidth}px ${element.borderStyle || 'solid'} ${element.strokeColor}` : 'none',
                  transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
                }}
              />
            )
            break
        }
        return pPageShapeContent

      case 'image':
        return (
          <img
            key={`${element.id}-${slideKey}`}
            className={animClass}
            src={element.src || ''}
            alt="slide content"
            style={{
              ...baseStyle,
              objectFit: 'fill',
              borderRadius: '4px',
              display: element.src ? 'block' : 'none',
            }}
            onError={(e) => { e.target.style.display = 'none' }}
          />
        )

      case 'icon':
        const iconSize = Math.min(element.width, element.height) * 0.8
        const iconColor = element.color || '#2E7D32'
        return (
          <div
            key={`${element.id}-${slideKey}`}
            className={animClass}
            style={{
              ...baseStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {element.iconType === 'star' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            )}
            {element.iconType === 'heart' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            )}
            {element.iconType === 'check' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {element.iconType === 'lightning' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            )}
            {element.iconType === 'thumbsUp' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
              </svg>
            )}
          </div>
        )

      case 'table':
        return (
          <div
            key={`${element.id}-${slideKey}`}
            className={animClass}
            style={baseStyle}
          >
            <table
              style={{
                width: '100%',
                height: '100%',
                borderCollapse: 'collapse',
              }}
            >
              <tbody>
                {Array(element.rows).fill(null).map((_, rowIdx) => (
                  <tr key={rowIdx}>
                    {Array(element.cols).fill(null).map((_, colIdx) => (
                      <td
                        key={`${rowIdx}-${colIdx}`}
                        style={{
                          border: '1px solid #9ca3af',
                          padding: '8px',
                          fontSize: '14px',
                          textAlign: 'center',
                        }}
                      >
                        {element.data?.[rowIdx]?.[colIdx] || ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )

      case 'video':
        const isYouTube = element.src?.includes('youtube.com') || element.src?.includes('youtu.be')
        if (!element.src) return null
        return (
          <div
            key={`${element.id}-${slideKey}`}
            className={animClass}
            style={{...baseStyle, overflow: 'hidden', borderRadius: '8px'}}
          >
            {isYouTube ? (
              <iframe
                width="100%"
                height="100%"
                src={element.src}
                style={{ border: 'none' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video
                src={element.src}
                controls
                style={{ width: '100%', height: '100%', objectFit: 'fill' }}
              />
            )}
          </div>
        )

      case 'audio':
        if (!element.src) return null
        return (
          <div
            key={`${element.id}-${slideKey}`}
            className={`${animClass} bg-gray-100 rounded-lg p-4 flex items-center gap-3`}
            style={baseStyle}
          >
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
            </div>
            <audio controls src={element.src} style={{ flex: 1 }} />
          </div>
        )

      default:
        return null
    }
  }

    // Snake-layout default positions. User drags persist via `frame.layout`
  // (which still wins). No more "hero" treatment for frame 0 — every slide
  // is the same size and the snake order follows the slide index.
  const frameMapLayout = useMemo(() => {
    return frames.map((frame, index) => ({
      id: frame.id,
      ...(frame.layout ? clampToBg(frame.layout) : computeSnakePosition(index)),
    }))
  }, [frames])

  const sortedFramesByArea = useMemo(() => {
    return [...frameMapLayout].sort((a, b) => (b.width * b.height) - (a.width * a.height))
  }, [frameMapLayout])

  const worldBounds = useMemo(() => {
    if (!frameMapLayout.length) {
      return { width: 1800, height: 1100, minX: 0, minY: 0, maxX: 1800, maxY: 1100 }
    }
    const minX = Math.min(...frameMapLayout.map(f => f.x))
    const minY = Math.min(...frameMapLayout.map(f => f.y))
    const maxX = Math.max(...frameMapLayout.map(f => f.x + f.width))
    const maxY = Math.max(...frameMapLayout.map(f => f.y + f.height))
      return {
        minX,
        minY,
        maxX,
        maxY,
        width: Math.max(1800, maxX + WORLD_PADDING),
        height: Math.max(1100, maxY + WORLD_PADDING),
      }
    }, [frameMapLayout])

    const interFrameConnectors = useMemo(() => buildInterFrameConnectors(frameMapLayout), [frameMapLayout])

    // ─── Camera animation: Van Wijk smooth zoom-pan ──────────────────────
    // "Smooth and Efficient Zooming and Panning" — Van Wijk & Nuij, 2003.
    // The camera follows a hyperbolic arc through (pan, log-zoom) space at
    // constant perceived velocity, so distant jumps automatically pull back
    // in the middle and close jumps stay shallow. This is the Prezi feel.
    // rho=1.6 → cinematic mid-air pull-back; baseDuration=1600ms is the
    // duration for an "average" jump (auto-scaled by path length).
    const VAN_WIJK_RHO = 1.6
    const VAN_WIJK_RHO_SQ = VAN_WIJK_RHO * VAN_WIJK_RHO
    // navSpeedMs from the editor slider is the full-path duration for a "standard" jump.
    // We scale it down slightly for the base so very long paths don't feel sluggish.
    const VAN_WIJK_BASE_DURATION = navSpeedMs * 0.7

    const cameraAnimRef = useRef({ raf: null, token: 0 })

    const cancelCameraAnim = useCallback(() => {
      if (cameraAnimRef.current.raf) {
        cancelAnimationFrame(cameraAnimRef.current.raf)
        cameraAnimRef.current.raf = null
      }
      cameraAnimRef.current.token += 1
    }, [])

    // Build a Van Wijk path from (u0, w0) to (u1, w1) where u = world-space
    // pan vector and w = world-units visible across the viewport width.
    // Returns: { S: total path length, w(s), u(s) } evaluated at 0 ≤ s ≤ S.
    const buildVanWijkPath = (u0, u1, w0, w1) => {
      const ux = u1[0] - u0[0]
      const uy = u1[1] - u0[1]
      const u_dist = Math.hypot(ux, uy)

      // Same pan position → zoom-in-place. Skip the heavy math, use log lerp.
      if (u_dist < 1e-6) {
        const S = Math.abs(Math.log(w1 / w0)) / VAN_WIJK_RHO
        return {
          S: Math.max(S, 1e-6),
          w: (s) => w0 * Math.exp(VAN_WIJK_RHO * s * Math.sign(Math.log(w1 / w0))),
          u: () => [u0[0], u0[1]],
        }
      }

      const b0 = (w1 * w1 - w0 * w0 + VAN_WIJK_RHO_SQ * VAN_WIJK_RHO_SQ * u_dist * u_dist) / (2 * w0 * VAN_WIJK_RHO_SQ * u_dist)
      const b1 = (w1 * w1 - w0 * w0 - VAN_WIJK_RHO_SQ * VAN_WIJK_RHO_SQ * u_dist * u_dist) / (2 * w1 * VAN_WIJK_RHO_SQ * u_dist)
      const r0 = Math.log(-b0 + Math.sqrt(b0 * b0 + 1))
      const r1 = Math.log(-b1 + Math.sqrt(b1 * b1 + 1))
      const S = (r1 - r0) / VAN_WIJK_RHO

      const w = (s) => w0 * (Math.cosh(r0) / Math.cosh(VAN_WIJK_RHO * s + r0))
      const u = (s) => {
        const tanhTerm = w0 / VAN_WIJK_RHO_SQ * Math.cosh(r0) * Math.tanh(VAN_WIJK_RHO * s + r0) - w0 / VAN_WIJK_RHO_SQ * Math.sinh(r0)
        const frac = tanhTerm / u_dist
        return [u0[0] + frac * ux, u0[1] + frac * uy]
      }

      return { S: Math.max(Math.abs(S), 1e-6), w, u }
    }

    // Animate camera from current pose to (targetWorldCenter, targetWidth)
    // via the Van Wijk path. Drives setCamera each frame via rAF — no CSS
    // transition involved, so the world container's `transition` style
    // must be removed (see Edit 2).
    const animateCameraVanWijk = useCallback((targetWorldCenter, targetWidth) => {
      cancelCameraAnim()
      const myToken = cameraAnimRef.current.token + 1
      cameraAnimRef.current.token = myToken

      const viewportW = window.innerWidth
      const viewportH = window.innerHeight

      // Convert current camera into (u0, w0) world-coord form.
      const startZoom = camera.zoom
      const startPanX = camera.panX
      const startPanY = camera.panY
      const originX = worldBounds.width / 2
      const originY = worldBounds.height / 2
      const startCenterX = originX + (viewportW / 2 - originX) / startZoom - startPanX
      const startCenterY = originY + (viewportH / 2 - originY) / startZoom - startPanY
      const w0 = viewportW / startZoom
      const w1 = targetWidth

      const u0 = [startCenterX, startCenterY]
      const u1 = [targetWorldCenter[0], targetWorldCenter[1]]

      const path = buildVanWijkPath(u0, u1, w0, w1)
      // Auto-scale duration by path length so near jumps finish faster.
      // (path.S is roughly 1-3 for typical jumps; ÷2 keeps base meaningful.)
      const totalDuration = Math.max(300, VAN_WIJK_BASE_DURATION * (path.S / 2))

      const startTime = performance.now()

      const tick = (now) => {
        if (cameraAnimRef.current.token !== myToken) return

        const elapsed = now - startTime
        const t = Math.min(1, elapsed / totalDuration)
        // Gentle quadratic ease — Van Wijk gives constant perceived velocity,
        // but humans want a little wind-up and wind-down.
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        const s = eased * path.S

        const widthAtS = path.w(s)
        const centerAtS = path.u(s)
        const zoomAtS = viewportW / widthAtS

        const panX = originX + (viewportW / 2 - originX) / zoomAtS - centerAtS[0]
        const panY = originY + (viewportH / 2 - originY) / zoomAtS - centerAtS[1]

        setCamera({ zoom: zoomAtS, panX, panY })

        if (t < 1) {
          cameraAnimRef.current.raf = requestAnimationFrame(tick)
        } else {
          cameraAnimRef.current.raf = null
        }
      }

      cameraAnimRef.current.raf = requestAnimationFrame(tick)
    }, [camera.zoom, camera.panX, camera.panY, worldBounds.width, worldBounds.height, cancelCameraAnim])

    // Cancel any in-flight camera animation on unmount.
    useEffect(() => {
      return () => cancelCameraAnim()
    }, [cancelCameraAnim])

    const updateCameraToBox = useCallback((box, zoomScale = 0.8) => {
      if (!window.innerWidth || !box) return
      const viewportW = window.innerWidth
      const viewportH = window.innerHeight
      const targetZoom = Math.max(0.1, Math.min(40, Math.min((viewportW / box.width) * zoomScale, (viewportH / box.height) * zoomScale)))

      const worldCenterX = box.x + box.width / 2
      const worldCenterY = box.y + box.height / 2
      // targetWidth = world units visible on screen at the target zoom.
      const targetWidth = viewportW / targetZoom

      animateCameraVanWijk([worldCenterX, worldCenterY], targetWidth)
    }, [animateCameraVanWijk])

  const focusOverview = useCallback(() => {
    const width = Math.max(1, worldBounds.maxX - worldBounds.minX)
    const height = Math.max(1, worldBounds.maxY - worldBounds.minY)
    updateCameraToBox({ x: worldBounds.minX, y: worldBounds.minY, width, height }, 0.85)
  }, [worldBounds.maxX, worldBounds.maxY, worldBounds.minX, worldBounds.minY, updateCameraToBox])

 const focusSlide = useCallback((index) => {
    if (index === -1) {
      focusOverview()
    } else {
      const target = frameMapLayout[index]
      if (target) {
        // Fit-to-slide: zoom the camera to the slide's actual layout bounds.
        // Each slide fills the viewport individually — small frames just get
        // more zoom, large frames less. The slide itself never resizes in
        // the world, so adjacent slides can't overlap during the fly-through.
        updateCameraToBox({
          x: target.x,
          y: target.y,
          width: target.width,
          height: target.height,
        }, 0.9)
      }
    }
  }, [frameMapLayout, focusOverview, updateCameraToBox])

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!hasStarted) {
        focusOverview()
        return
      }
      focusSlide(currentSlideIndex)
    }, 50)
    return () => clearTimeout(timeout)
  }, [currentSlideIndex, hasStarted, focusOverview, focusSlide])

    useEffect(() => {
    return () => {
      setAnnotations({})
      setActiveTool(null)
      liveStrokeRef.current = null
    }
  }, [])

 // ── Annotation event handlers ────────────────────────────────────────
  // Convert a viewport-space mouse event into slide-local normalized coords
  // (0..1 across the active slide's rendered DOM bounds). Storing as 0..1
  // makes strokes layout-independent so they line up perfectly even if
  // the camera zoom changes mid-stroke.
  const slideElementToLocal = (clientX, clientY) => {
    const slideEl = document.querySelector('[data-active-slide="true"]')
    if (!slideEl) return null
    const rect = slideEl.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height
    return { x, y }
  }

  const currentSlideKey = useMemo(() => {
    if (!hasStarted) return null
    if (currentSlideIndex < 0 || currentSlideIndex >= frames.length) return null
    return frames[currentSlideIndex]?.id ?? null
  }, [hasStarted, currentSlideIndex, frames])

  const handleAnnotationPointerDown = (e) => {
    if (!hasStarted || !activeTool || currentSlideKey == null) return
    if (activeTool === 'laser') return // laser doesn't draw

    const local = slideElementToLocal(e.clientX, e.clientY)
    if (!local) return

    if (activeTool === 'eraser') {
      // Object eraser: remove any stroke whose path passes near this point.
      const HIT_RADIUS_NORM = 0.015 // ~1.5% of slide width
      setAnnotations((prev) => {
        const slideStrokes = prev[currentSlideKey] || []
        const kept = slideStrokes.filter((stroke) => {
          return !stroke.points.some((p) => {
            const dx = p.x - local.x
            const dy = p.y - local.y
            return Math.hypot(dx, dy) < HIT_RADIUS_NORM
          })
        })
        if (kept.length === slideStrokes.length) return prev
        return { ...prev, [currentSlideKey]: kept }
      })
      return
    }

    // Start a new stroke.
    const def = TOOL_DEFS[activeTool]
    liveStrokeRef.current = {
      tool: activeTool,
      color: def.color,
      size: def.size,
      opacity: def.opacity,
      slideKey: currentSlideKey,
      points: [local],
    }
    setLiveStrokeVersion((v) => v + 1)
    e.preventDefault()
  }

  const handleAnnotationPointerMove = (e) => {
    // Track laser cursor position whenever laser is active.
    if (activeTool === 'laser' && hasStarted) {
      setLaserPos({ x: e.clientX, y: e.clientY })
    }

    // Continue live stroke if drawing.
    if (liveStrokeRef.current) {
      const local = slideElementToLocal(e.clientX, e.clientY)
      if (!local) return
      // Eraser-while-dragging: also erase under cursor as it moves.
      if (liveStrokeRef.current.tool === 'eraser') return
      liveStrokeRef.current.points.push(local)
      setLiveStrokeVersion((v) => v + 1)
    }

    // Eraser drag-to-erase
    if (activeTool === 'eraser' && e.buttons === 1 && hasStarted && currentSlideKey != null) {
      const local = slideElementToLocal(e.clientX, e.clientY)
      if (!local) return
      const HIT_RADIUS_NORM = 0.015
      setAnnotations((prev) => {
        const slideStrokes = prev[currentSlideKey] || []
        const kept = slideStrokes.filter((stroke) => {
          return !stroke.points.some((p) => {
            const dx = p.x - local.x
            const dy = p.y - local.y
            return Math.hypot(dx, dy) < HIT_RADIUS_NORM
          })
        })
        if (kept.length === slideStrokes.length) return prev
        return { ...prev, [currentSlideKey]: kept }
      })
    }
  }

  const handleAnnotationPointerUp = () => {
    if (!liveStrokeRef.current) return
    const stroke = liveStrokeRef.current
    liveStrokeRef.current = null
    if (stroke.points.length < 2) {
      // Single-point click — discard
      setLiveStrokeVersion((v) => v + 1)
      return
    }
    setAnnotations((prev) => ({
      ...prev,
      [stroke.slideKey]: [...(prev[stroke.slideKey] || []), stroke],
    }))
    setLiveStrokeVersion((v) => v + 1)
  }

 // Track cursor position globally while the laser tool is active.
  // We use a window-level listener (instead of going through the
  // AnnotationOverlay) so the laser dot follows the cursor everywhere
  // — over slides, over the toolbar, over the background — without
  // requiring the overlay to be a pointer-event-capture surface.
  useEffect(() => {
    if (activeTool !== 'laser') {
      setLaserPos(null)
      return
    }
    const onMove = (e) => setLaserPos({ x: e.clientX, y: e.clientY })
    const onLeave = (e) => {
      // Only hide when cursor truly leaves the document, not just an iframe etc.
      if (!e.relatedTarget && !e.toElement) setLaserPos(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseout', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseout', onLeave)
    }
  }, [activeTool])

  // Hide the native cursor everywhere while laser tool is active so only
  // the red glowing dot is visible.
  useEffect(() => {
    if (activeTool !== 'laser') return
    document.body.style.cursor = 'none'
    return () => {
      document.body.style.cursor = ''
    }
  }, [activeTool])

  // ── Floating toolbar drag handlers ───────────────────────────────────
  const onToolbarGripDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    // Resolve the toolbar's CURRENT pixel position from its DOM rect so
    // the first drag from default position doesn't jump.
    const toolbarEl = document.querySelector('[data-pres-toolbar]')
    const rect = toolbarEl?.getBoundingClientRect()
    const originX = rect ? rect.left : window.innerWidth - 80
    const originY = rect ? rect.top : window.innerHeight / 2 - 200
    toolbarDragRef.current = { active: true, startX, startY, originX, originY, didMove: false }

    const onMove = (mv) => {
      const dx = mv.clientX - startX
      const dy = mv.clientY - startY
      if (!toolbarDragRef.current.didMove && Math.hypot(dx, dy) > 5) {
        toolbarDragRef.current.didMove = true
      }
      if (toolbarDragRef.current.didMove) {
        // Clamp to viewport
        const x = Math.max(8, Math.min(window.innerWidth - 80, originX + dx))
        const y = Math.max(8, Math.min(window.innerHeight - 100, originY + dy))
        setToolbarPos({ x, y })
      }
    }
    const onUp = () => {
      toolbarDragRef.current.active = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Close the color picker popup when clicking anywhere outside it (except
  // on a color-dot trigger, which toggles its own open state).
  useEffect(() => {
    if (!openColorPicker) return
    const handler = (e) => {
      if (colorPickerRef.current && colorPickerRef.current.contains(e.target)) return
      if (e.target.closest('[data-tool-color-dot]')) return
      setOpenColorPicker(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openColorPicker])

  // Renders the small color dot below a pen/pencil/highlighter button.
  // Click → opens a popup (presets + native RGB picker + hex input). Popup
  // appears to the LEFT of the toolbar so it doesn't get clipped against
  // the right edge of the viewport.
  const renderColorDot = (tool) => {
    const color = toolColors[tool]
    const isOpen = openColorPicker === tool
    const PRESET_COLORS = [
      '#1a73e8', '#000000', '#ffffff', '#ff3838',
      '#22c55e', '#f59e0b', '#a855f7', '#ec4899',
      '#06b6d4', '#84cc16', '#ffd83d', '#444444',
    ]
    return (
      <div className="relative">
        <button
          data-tool-color-dot
          onClick={(e) => {
            e.stopPropagation()
            setOpenColorPicker(isOpen ? null : tool)
          }}
          className="w-5 h-5 rounded-full border-2 border-white/40 hover:border-white/80 transition-all"
          style={{ backgroundColor: color }}
          title={`${tool.charAt(0).toUpperCase() + tool.slice(1)} color`}
        />
        {isOpen && (
          <div
            ref={colorPickerRef}
            className="absolute right-full top-1/2 -translate-y-1/2 mr-3 bg-white border border-gray-200 rounded-lg shadow-2xl p-3 w-64 z-[60]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3">
              <label className="text-xs text-gray-500 block mb-2">RGB Color</label>
              <input
                type="color"
                value={color}
                onChange={(e) => setToolColors(prev => ({ ...prev, [tool]: e.target.value }))}
                className="w-full h-24 cursor-pointer border border-gray-200 rounded"
              />
            </div>
            <div className="mb-3">
              <label className="text-xs text-gray-500 block mb-2">Preset Colors</label>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setToolColors(prev => ({ ...prev, [tool]: c }))}
                    className={`w-7 h-7 rounded-lg transition-all ${color.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-primary ring-offset-2' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c, border: c === '#ffffff' ? '1px solid #e5e5e5' : 'none' }}
                    title={c}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Hex</label>
              <input
                type="text"
                value={color}
                onChange={(e) => {
                  const v = e.target.value
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                    setToolColors(prev => ({ ...prev, [tool]: v }))
                  }
                }}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded font-mono"
                placeholder="#000000"
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  const startPresentation = () => {
    setHasStarted(true)
    setCurrentSlideIndex((prev) => Math.max(0, Math.min(frames.length - 1, prev)))
  }

  const handleMouseMove = () => {
    setShowControls(true)
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      }
      setIsFullscreen(false)
    }
  }

  const exitPresentation = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    navigate('/editor')
  }

  const goToPrev = () => {
    setCurrentSlideIndex(prev => Math.max(0, prev - 1))
  }
  const goToNext = () => {
    setCurrentSlideIndex(prev => Math.min(frames.length - 1, prev + 1))
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        exitPresentation()
        return
      }
      if (!hasStarted && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault()
        startPresentation()
        return
      }
      if (!hasStarted) return

      // Navigation
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'Enter' || e.key === 'PageDown' || e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        goToNext()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'Backspace' || e.key === 'PageUp' || e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        goToPrev()
      } else if (e.key === 'Home') {
        e.preventDefault()
        setCurrentSlideIndex(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setCurrentSlideIndex(frames.length - 1)
      } else if (e.key === 'f' || e.key === 'F' || e.key === 'F5' || e.key === 'F11') {
        e.preventDefault()
        toggleFullscreen()
      } else if (/^[1-9]$/.test(e.key)) {
        // Jump to slide 1-9
        const slideNum = parseInt(e.key) - 1
        if (slideNum < frames.length) setCurrentSlideIndex(slideNum)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [frames.length, hasStarted])

  return (
    <div
        className="fixed inset-0 flex items-center justify-center overflow-hidden"
        style={{
          backgroundColor: '#f5f5f2',
          backgroundImage: editorBackground
            ? `url("${editorBackground}")`
            : 'radial-gradient(circle, #c8c8c4 1px, transparent 1px)',
          backgroundSize: editorBackground ? 'cover' : '28px 28px',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      onMouseMove={handleMouseMove}
      ref={containerRef}
    >
     <div
        className="absolute left-0 top-0"
        style={{
          width: `${worldBounds.width}px`,
          height: `${worldBounds.height}px`,
          transform: `scale(${camera.zoom}) translate(${camera.panX}px, ${camera.panY}px)`,
          transformOrigin: 'center center',
          // Camera is driven directly by animateCameraVanWijk's rAF loop —
          // no CSS transition or the JS animation would fight it.
          willChange: 'transform',
        }}
      >
       {frameMapLayout.map((frameBox, frameIdx) => {
          const frameData = frames.find(f => f.id === frameBox.id) || frames[frameIdx];
          const sizeRank = sortedFramesByArea.findIndex(f => f.id === frameBox.id);
          const isActive = currentSlideIndex === frameIdx;
          // Every slide stays at its layout size in the world — no resize-on-
          // active hack, so neighbours can never overlap. The Van Wijk camera
          // (animateCameraVanWijk) handles zooming each frame into view, with
          // more zoom for smaller frames and less for larger ones. Content is
          // authored on a 1280×720 logical canvas and CSS-scaled down to fit.
          const renderW = frameBox.width
          const renderH = frameBox.height
          const renderLeft = frameBox.x
          const renderTop = frameBox.y
          // Counter-scale decoration sizes by camera zoom so they stay a
          // constant on-screen size regardless of how zoomed in we are.
          const invZoom = 1 / Math.max(0.0001, camera.zoom)
          const visualRadius = 12 * invZoom
          const visualRing = isActive ? 3 * invZoom : 0
          // Scale 1280×720 logical content down to fit the frame's layout box.
          const contentScale = frameBox.width / 1280
          // Presentation UX: once the user has started the presentation and a
          // specific slide is focused, hide the other (non-active) slides so
          // the viewer sees ONLY the current slide and isn't distracted by
          // bits of other frames bleeding into the screen. During the
          // overview shot (before start, or when user returned to overview)
          // we show all frames. opacity+pointerEvents handles both visibility
          // and accidental clicks.
          const showOverview = currentSlideIndex === -1 || !hasStarted
          const frameVisible = showOverview || isActive
          return (
            <div
              key={frameBox.id}
              className="absolute overflow-hidden shadow-xl"
              data-active-slide={isActive ? 'true' : 'false'}
              style={{
                left: renderLeft,
                top: renderTop,
                width: renderW,
                height: renderH,
                zIndex: isActive ? 1000 : (sizeRank * 10 + 1),
                background: frameData?.backgroundImage
                  ? `url("${frameData.backgroundImage}") center/cover no-repeat`
                  : ((frameData?.backgroundColor && frameData.backgroundColor !== 'transparent')
                    ? frameData.backgroundColor
                    : (frameData?.bg && frameData.bg !== 'transparent' ? frameData.bg : 'white')),
                borderRadius: `${visualRadius}px`,
                boxShadow: isActive
                  ? `0 0 0 ${visualRing}px #2E7D32, 0 10px 30px rgba(0,0,0,0.25)`
                  : '0 8px 24px rgba(15, 23, 42, 0.12)',
                  pointerEvents: frameVisible ? 'auto' : 'none',
              }}
              onClick={(e) => {
                  e.stopPropagation()
                  setCurrentSlideIndex(frameIdx)
              }}
            >
              <div 
                className="relative w-full h-full"
                style={{
                  transform: `scale(${contentScale})`,
                  transformOrigin: 'top left',
                }}
              >
                {frameData?.elements?.map((el, elementIndex) => {
                    const slideKey = isActive ? currentSlideIndex : frameBox.id;
                    return renderElement(el, slideKey, elementIndex)
                })}
              </div>
            </div>
          )
        })}
     </div>

      {/* ─── Annotation overlay (drawing canvas) ───────────────────────────
          A full-viewport SVG layer that renders annotation strokes for the
          active slide. Pointer events only pass through when an annotation
          tool is active. Strokes are stored in normalized 0..1 coords
          relative to the active slide, and projected back to screen pixels
          on each render — so they stay locked to the slide regardless of
          camera zoom. */}
      {hasStarted && (
        <AnnotationOverlay
          activeTool={activeTool}
          annotations={annotations}
          currentSlideKey={currentSlideKey}
          liveStrokeRef={liveStrokeRef}
          liveStrokeVersion={liveStrokeVersion}
          onPointerDown={handleAnnotationPointerDown}
          onPointerMove={handleAnnotationPointerMove}
          onPointerUp={handleAnnotationPointerUp}
        />
      )}

      {/* Laser pointer dot — follows cursor while laser tool is active */}
      {activeTool === 'laser' && hasStarted && laserPos && (
        <div
          className="fixed pointer-events-none"
          style={{
            left: laserPos.x,
            top: laserPos.y,
            transform: 'translate(-50%, -50%)',
            zIndex: 60,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#ff3838',
              boxShadow: '0 0 12px 4px rgba(255, 56, 56, 0.7), 0 0 24px 8px rgba(255, 56, 56, 0.35)',
            }}
          />
        </div>
      )}

      {showControls && (
        <div
          data-pres-toolbar
          className="absolute bg-gray-800/85 backdrop-blur rounded-2xl animate-fade-in shadow-2xl z-50 flex flex-col items-center gap-1 py-3 px-2"
          style={
            toolbarPos
              ? { left: toolbarPos.x, top: toolbarPos.y }
              : { right: 24, top: '50%', transform: 'translateY(-50%)' }
          }
        >
          {/* Drag grip — drag from here to move the toolbar */}
          <div
            onMouseDown={onToolbarGripDown}
            className="w-full flex items-center justify-center py-1 cursor-grab active:cursor-grabbing select-none"
            title="Drag to move"
          >
            <div className="flex flex-col gap-[3px]">
              <div className="flex gap-[3px]">
                <span className="w-1 h-1 rounded-full bg-white/40" />
                <span className="w-1 h-1 rounded-full bg-white/40" />
              </div>
              <div className="flex gap-[3px]">
                <span className="w-1 h-1 rounded-full bg-white/40" />
                <span className="w-1 h-1 rounded-full bg-white/40" />
              </div>
              <div className="flex gap-[3px]">
                <span className="w-1 h-1 rounded-full bg-white/40" />
                <span className="w-1 h-1 rounded-full bg-white/40" />
              </div>
            </div>
          </div>

          {!hasStarted && (
            <button
              onClick={startPresentation}
              className="px-3 py-2 my-1 rounded-lg bg-white text-gray-900 font-semibold hover:bg-gray-100 transition-colors text-sm whitespace-nowrap"
            >
              Start
            </button>
          )}

          {hasStarted && (
            <>
              {/* Prev */}
              <button
                onClick={goToPrev}
                disabled={currentSlideIndex === 0}
                className="p-2 text-white hover:bg-white/20 rounded-full transition-colors disabled:opacity-40"
                title="Previous slide"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 15l-6-6-6 6" />
                </svg>
              </button>

              {/* Slide counter */}
              <div className="text-gray-200 font-medium text-xs py-1 select-none">
                {currentSlideIndex + 1}
                <span className="text-gray-400 mx-0.5">/</span>
                {frames.length}
              </div>

              {/* Next */}
              <button
                onClick={goToNext}
                disabled={currentSlideIndex === frames.length - 1}
                className="p-2 text-white hover:bg-white/20 rounded-full transition-colors disabled:opacity-40"
                title="Next slide"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              <div className="h-px w-6 bg-white/20 my-1" />

              {/* ─── Annotation tools ─── */}
              {/* Pen */}
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={() => setActiveTool(activeTool === 'pen' ? null : 'pen')}
                  className={`p-2 rounded-full transition-colors ${activeTool === 'pen' ? 'bg-white/25 text-white' : 'text-white hover:bg-white/20'}`}
                  title="Pen"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19l7-7 3 3-7 7-3-3z" />
                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                    <path d="M2 2l7.586 7.586" />
                  </svg>
                </button>
                {renderColorDot('pen')}
              </div>

              {/* Pencil */}
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={() => setActiveTool(activeTool === 'pencil' ? null : 'pencil')}
                  className={`p-2 rounded-full transition-colors ${activeTool === 'pencil' ? 'bg-white/25 text-white' : 'text-white hover:bg-white/20'}`}
                  title="Pencil"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                {renderColorDot('pencil')}
              </div>

              {/* Highlighter */}
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={() => setActiveTool(activeTool === 'highlighter' ? null : 'highlighter')}
                  className={`p-2 rounded-full transition-colors ${activeTool === 'highlighter' ? 'bg-yellow-300/30 text-yellow-200' : 'text-white hover:bg-white/20'}`}
                  title="Highlighter"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l-6 6v3h3l6-6" />
                    <path d="M22 12L12 22l-2-2 9-9 1-1z" />
                    <path d="M15 5l3 3" />
                  </svg>
                </button>
                {renderColorDot('highlighter')}
              </div>

              {/* Laser pointer */}
              <button
                onClick={() => setActiveTool(activeTool === 'laser' ? null : 'laser')}
                className={`p-2 rounded-full transition-colors ${activeTool === 'laser' ? 'bg-red-500/30 text-red-300' : 'text-white hover:bg-white/20'}`}
                title="Laser pointer"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <circle cx="12" cy="12" r="8" strokeDasharray="2 4" />
                </svg>
              </button>

              {/* Eraser */}
              <button
                onClick={() => setActiveTool(activeTool === 'eraser' ? null : 'eraser')}
                className={`p-2 rounded-full transition-colors ${activeTool === 'eraser' ? 'bg-white/25 text-white' : 'text-white hover:bg-white/20'}`}
                title="Eraser (click stroke to remove)"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 17l6 6 12-12-6-6L3 17z" />
                  <path d="M9 23H21" />
                </svg>
              </button>

             <div className="h-px w-6 bg-white/20 my-1" />

              {/* Fullscreen */}
              <button onClick={toggleFullscreen} className="p-2 text-white hover:bg-white/20 rounded-full transition-colors" title="Fullscreen">
                {isFullscreen ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                  </svg>
                )}
              </button>
            </>
          )}

          <div className="h-px w-6 bg-white/20 my-1" />

          {/* Exit */}
          <button
            onClick={exitPresentation}
            className="p-2 text-red-400 hover:bg-red-400/20 rounded-full transition-colors"
            title="Exit presentation"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

export default PresentationPage
