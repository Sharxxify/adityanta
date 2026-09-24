import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useEditor } from '../../context/EditorContext'
import { useApp } from '../../context/AppContext'
import { SlideElement, getFrameBackgroundStyle, SLIDE_WIDTH, SLIDE_HEIGHT } from '../../components/Slide/SlideView'
import { computeSnakePosition } from '../../utils/snakeLayout'
import { displayBackground } from '../../utils/backgrounds'
import { viewTween, viewFromCamera, cameraFromView, viewForBox, readNavSpeedMs, SLIDE_FIT, OVERVIEW_FIT } from '../../utils/presentationCamera'

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


// ─── Eraser (#56) ─────────────────────────────────────────────────────────
// Erases only the part of a stroke under the eraser (like PowerPoint's
// "Eraser" pen in the slide show): points within the radius are removed and
// the stroke is split into the pieces that remain. Distances are measured in
// slide-width units with the 16:9 aspect taken into account.
const ERASER_RADIUS = 0.018
const ASPECT_Y = 9 / 16
const eraseDist = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * ASPECT_Y)

// distance from p to segment ab
const distToSegment = (p, a, b) => {
  const ax = a.x
  const ay = a.y * ASPECT_Y
  const bx = b.x
  const by = b.y * ASPECT_Y
  const px = p.x
  const py = p.y * ASPECT_Y
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Densify a stroke so long straight segments can be cut in the middle
const densify = (points, step = ERASER_RADIUS / 3) => {
  const out = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (i > 0) {
      const q = points[i - 1]
      const d = eraseDist(p, q)
      const n = Math.floor(d / step)
      for (let k = 1; k < n; k++) out.push({ x: q.x + ((p.x - q.x) * k) / n, y: q.y + ((p.y - q.y) * k) / n })
    }
    out.push(p)
  }
  return out
}

/** Strokes after erasing around `at` (returns the same array if untouched) */
const eraseStrokes = (strokes, at, radius = ERASER_RADIUS) => {
  let changed = false
  const out = []
  for (const stroke of strokes) {
    const pts = stroke.points || []
    const hit = pts.length === 1
      ? eraseDist(pts[0], at) < radius
      : pts.some((p, i) => i > 0 && distToSegment(at, pts[i - 1], p) < radius)
    if (!hit) { out.push(stroke); continue }
    changed = true
    let piece = []
    for (const p of densify(pts)) {
      if (eraseDist(p, at) < radius) {
        if (piece.length > 1) out.push({ ...stroke, points: piece })
        piece = []
      } else piece.push(p)
    }
    if (piece.length > 1) out.push({ ...stroke, points: piece })
  }
  return changed ? out : strokes
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
  const { frames, editorBackground, savePresentationAnnotations, undo, redo, getSession, updateSession, loadTemplate, setEditorBackground } = useEditor()
  const { loadProject, getProject, isUserFilesLoaded } = useApp()
  const { templateId: routeId } = useParams()
  const startSlide = location.state?.startSlide || 0
  // Where "exit" goes: the editor of this same project (in overview)
  const returnTo = location.state?.returnTo || `/editor/${getSession().routeId || routeId || 'new'}`

  // Opened directly (page refresh, bookmark): load the project from storage
  const [isLoadingProject, setIsLoadingProject] = useState(false)
  useEffect(() => {
    if (!routeId || routeId === 'new') return
    const session = getSession()
    if (session.key && (session.projectId === routeId || session.routeId === routeId)) return
    if (!isUserFilesLoaded || !getProject(routeId)) return
    let cancelled = false
    setIsLoadingProject(true)
    loadProject(routeId)
      .then((project) => {
        if (cancelled || !project?.frames?.length) return
        const loaded = loadTemplate({ title: project.title, frames: project.frames, header: project.header })
        setEditorBackground(project.editorBgImage)
        updateSession({
          key: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          routeId: String(project.id),
          projectId: String(project.id),
          sourceTemplateId: project.templateId || null,
          topic: project.topic || null,
          thumbnail: project.thumbnail || null,
          visibility: project.visibility || 'public',
          autoSnapshotTaken: false,
          // what is stored now — ink added while presenting is saved on exit
          baseline: loaded ? { frames: loaded.frames, title: loaded.title, header: loaded.header, editorBgImage: typeof project.editorBgImage === 'string' ? displayBackground(project.editorBgImage) : project.editorBgImage, visibility: project.visibility || 'public' } : null,
        })
      })
      .finally(() => { if (!cancelled) setIsLoadingProject(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, isUserFilesLoaded])
  const [currentSlideIndex, setCurrentSlideIndex] = useState(startSlide)
  const [hasStarted, setHasStarted] = useState(false)

  // ─── Annotation tools (persisted to presentation upon exit) ───────────
  // activeTool: null | 'pen' | 'pencil' | 'laser' | 'highlighter' | 'eraser'
  const [activeTool, setActiveTool] = useState(null)
  // strokes per slide: { [frameId]: Array<{ tool, color, size, opacity, points: [{x,y}] }> }
  const [annotations, setAnnotations] = useState({})
  const [undoneAnnotations, setUndoneAnnotations] = useState({})
  const annotationsRef = useRef(annotations)
  const undoneAnnotationsRef = useRef(undoneAnnotations)
  const committedRef = useRef(false)
  // Live stroke being drawn (mouse is down). Committed to annotations on mouseup.
  const liveStrokeRef = useRef(null)
  const [liveStrokeVersion, setLiveStrokeVersion] = useState(0) // bumps to force re-render

  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations])

  useEffect(() => {
    undoneAnnotationsRef.current = undoneAnnotations
  }, [undoneAnnotations])

  const commitAnnotations = useCallback(() => {
    if (committedRef.current) return
    const current = annotationsRef.current
    if (!current) return
    const hasAny = Object.values(current).some(strokes => Array.isArray(strokes) && strokes.length > 0)
    if (hasAny && typeof savePresentationAnnotations === 'function') {
      savePresentationAnnotations(current)
      committedRef.current = true
    }
  }, [savePresentationAnnotations])

  // Commit on unmount (e.g. browser back button navigation)
  useEffect(() => {
    return () => {
      commitAnnotations()
    }
  }, [commitAnnotations])

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
  // The camera animation writes the transform straight to the DOM each frame
  // (no React re-render per frame → smooth fly-through); state catches up at
  // the end of each move.
  const worldRef = useRef(null)
  const cameraLiveRef = useRef(camera)
  const applyCamera = (cam, commit) => {
    cameraLiveRef.current = cam
    const world = worldRef.current
    if (world) {
      world.style.transform = `scale(${cam.zoom}) translate(${cam.panX}px, ${cam.panY}px)`
      // #34 — a will-change layer keeps the resolution it was drawn at, so
      // slides looked blurry after zooming in; keep the hint only while moving
      world.style.willChange = commit ? 'auto' : 'transform'
    }
    if (commit) setCamera(cam)
  }

  // Slide transition speed — read from the same localStorage key the editor
  // writes to, so the presentation honours whatever the user set in the
  // "Slide Transition Speed" slider. Falls back to 3000ms if unset.
  const [navSpeedMs] = useState(readNavSpeedMs)

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

  // Every element is drawn by the shared slide renderer (same as the editor,
  // thumbnails and exports); presentation only adds entrance animations.
  const renderElement = (element, slideKey, elementIndex = 0) => {
    if (!element || element.isPlaceholder || element.hidden) return null
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
    return (
      <SlideElement
        key={`${element.id}-${slideKey}`}
        element={element}
        interactive
        className={animClass}
        style={animStyle}
      />
    )
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
    // Shared with the video export (utils/presentationCamera) so a
    // downloaded video moves exactly like the slideshow.
    const cameraAnimRef = useRef({ raf: null, token: 0 })

    const cancelCameraAnim = useCallback(() => {
      if (cameraAnimRef.current.raf) {
        cancelAnimationFrame(cameraAnimRef.current.raf)
        cameraAnimRef.current.raf = null
      }
      cameraAnimRef.current.token += 1
    }, [])

    // Animate from the current pose to `target` (a { center, width } view).
    // Writes the transform straight to the DOM each frame (no CSS transition).
    const animateCameraVanWijk = useCallback((target) => {
      cancelCameraAnim()
      const myToken = cameraAnimRef.current.token + 1
      cameraAnimRef.current.token = myToken

      const vpW = window.innerWidth
      const vpH = window.innerHeight
      const world = { width: worldBounds.width, height: worldBounds.height }
      const tween = viewTween(viewFromCamera(cameraLiveRef.current, vpW, vpH, world), target)
      // #07 — every transition takes the "Slide Transition Speed" set in the
      // editor, whatever the distance between the slides
      const totalDuration = navSpeedMs
      const startTime = performance.now()

      const tick = (now) => {
        if (cameraAnimRef.current.token !== myToken) return
        const t = Math.min(1, (now - startTime) / totalDuration)
        applyCamera(cameraFromView(tween(t), vpW, vpH, world), t >= 1)
        cameraAnimRef.current.raf = t < 1 ? requestAnimationFrame(tick) : null
      }
      cameraAnimRef.current.raf = requestAnimationFrame(tick)
    }, [worldBounds.width, worldBounds.height, cancelCameraAnim, navSpeedMs])

    // Cancel any in-flight camera animation on unmount.
    useEffect(() => {
      return () => cancelCameraAnim()
    }, [cancelCameraAnim])

    const updateCameraToBox = useCallback((box, zoomScale = SLIDE_FIT) => {
      if (!window.innerWidth || !box) return
      animateCameraVanWijk(viewForBox(box, window.innerWidth, window.innerHeight, zoomScale))
    }, [animateCameraVanWijk])

  const focusOverview = useCallback(() => {
    const width = Math.max(1, worldBounds.maxX - worldBounds.minX)
    const height = Math.max(1, worldBounds.maxY - worldBounds.minY)
    updateCameraToBox({ x: worldBounds.minX, y: worldBounds.minY, width, height }, OVERVIEW_FIT)
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
        }, SLIDE_FIT)
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

  const eraserLastRef = useRef(null)
  const eraseAtPoint = (at) => {
    setAnnotations((prev) => {
      const slideStrokes = prev[currentSlideKey] || []
      const next = eraseStrokes(slideStrokes, at)
      return next === slideStrokes ? prev : { ...prev, [currentSlideKey]: next }
    })
  }

  const handleAnnotationPointerDown = (e) => {
    if (!hasStarted || !activeTool || currentSlideKey == null) return
    if (activeTool === 'laser') return // laser doesn't draw

    const local = slideElementToLocal(e.clientX, e.clientY)
    if (!local) return

    if (activeTool === 'eraser') {
      eraserLastRef.current = local
      eraseAtPoint(local)
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
      // erase along the path of the pointer, not only where events land
      const prev = eraserLastRef.current || local
      const steps = Math.max(1, Math.ceil(eraseDist(prev, local) / (ERASER_RADIUS / 2)))
      for (let k = 1; k <= steps; k++) eraseAtPoint({ x: prev.x + ((local.x - prev.x) * k) / steps, y: prev.y + ((local.y - prev.y) * k) / steps })
      eraserLastRef.current = local
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
    setUndoneAnnotations((prev) => ({
      ...prev,
      [stroke.slideKey]: [],
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
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
    }
    commitAnnotations()
    // Back to the same project, in overview (the editor keeps the state,
    // including any ink kept from this presentation, and saves it)
    navigate(returnTo, { state: { fromPresentation: true } })
  }

  // Closing a running slideshow goes back to the presentation's overview
  // (the start screen); closing that screen goes back to the editor.
  const endSlideShow = () => {
    setActiveTool(null)
    setLaserPos(null)
    setHasStarted(false)
    setCurrentSlideIndex(0)
  }
  const closePresentation = () => (hasStarted ? endSlideShow() : exitPresentation())

  // #55 — the overview is part of the slideshow (Prezi path): Previous on the
  // first slide and Next on the last slide show the overview instead of
  // stopping; from the overview Next starts again at slide 1.
  const goToPrev = () => {
    setCurrentSlideIndex(prev => (prev <= 0 ? -1 : prev - 1))
  }
  const goToNext = () => {
    setCurrentSlideIndex(prev => (prev === -1 ? 0 : prev >= frames.length - 1 ? -1 : prev + 1))
  }
  const showOverviewInShow = () => setCurrentSlideIndex(-1)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closePresentation()
        return
      }

      // Undo (Ctrl+Z or Cmd+Z)
      if ((e.ctrlKey || e.metaKey) && (e.key?.toLowerCase() === 'z' || e.code === 'KeyZ')) {
        e.preventDefault()
        if (e.shiftKey) {
          // Redo via Ctrl+Shift+Z
          if (currentSlideKey != null && (undoneAnnotationsRef.current[currentSlideKey] || []).length > 0) {
            const undoneList = undoneAnnotationsRef.current[currentSlideKey]
            const strokeToRestore = undoneList[undoneList.length - 1]
            setUndoneAnnotations((prev) => ({
              ...prev,
              [currentSlideKey]: (prev[currentSlideKey] || []).slice(0, -1),
            }))
            setAnnotations((prev) => ({
              ...prev,
              [currentSlideKey]: [...(prev[currentSlideKey] || []), strokeToRestore],
            }))
          } else if (typeof redo === 'function') {
            redo()
          }
        } else {
          // Undo via Ctrl+Z
          if (currentSlideKey != null && (annotationsRef.current[currentSlideKey] || []).length > 0) {
            const strokeList = annotationsRef.current[currentSlideKey]
            const lastStroke = strokeList[strokeList.length - 1]
            setAnnotations((prev) => ({
              ...prev,
              [currentSlideKey]: (prev[currentSlideKey] || []).slice(0, -1),
            }))
            setUndoneAnnotations((prev) => ({
              ...prev,
              [currentSlideKey]: [...(prev[currentSlideKey] || []), lastStroke],
            }))
          } else if (typeof undo === 'function') {
            undo()
          }
        }
        return
      }

      // Redo (Ctrl+Y or Cmd+Y)
      if ((e.ctrlKey || e.metaKey) && (e.key?.toLowerCase() === 'y' || e.code === 'KeyY')) {
        e.preventDefault()
        if (currentSlideKey != null && (undoneAnnotationsRef.current[currentSlideKey] || []).length > 0) {
          const undoneList = undoneAnnotationsRef.current[currentSlideKey]
          const strokeToRestore = undoneList[undoneList.length - 1]
          setUndoneAnnotations((prev) => ({
            ...prev,
            [currentSlideKey]: (prev[currentSlideKey] || []).slice(0, -1),
          }))
          setAnnotations((prev) => ({
            ...prev,
            [currentSlideKey]: [...(prev[currentSlideKey] || []), strokeToRestore],
          }))
        } else if (typeof redo === 'function') {
          redo()
        }
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
      } else if (e.key === 'o' || e.key === 'O' || e.key === 'g' || e.key === 'G') {
        e.preventDefault()
        showOverviewInShow()
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
  }, [frames.length, hasStarted, currentSlideKey, undo, redo])

  if (isLoadingProject) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 text-white">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-3" />
        <p className="text-sm text-white/70">Opening presentation…</p>
      </div>
    )
  }

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
        ref={worldRef}
        className="absolute left-0 top-0"
        style={{
          width: `${worldBounds.width}px`,
          height: `${worldBounds.height}px`,
          transform: `scale(${cameraLiveRef.current.zoom}) translate(${cameraLiveRef.current.panX}px, ${cameraLiveRef.current.panY}px)`,
          transformOrigin: 'center center',
          // Camera is driven directly by animateCameraVanWijk's rAF loop —
          // no CSS transition or the JS animation would fight it.
          // will-change is set only while it moves (see applyCamera, #34)
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
          const contentScale = Math.min(frameBox.width / SLIDE_WIDTH, frameBox.height / SLIDE_HEIGHT)
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
                ...getFrameBackgroundStyle(frameData, { editorBackground }),
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
                className="relative"
                style={{
                  width: SLIDE_WIDTH,
                  height: SLIDE_HEIGHT,
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
              {/* Overview (stays in the slideshow) */}
              <button
                onClick={showOverviewInShow}
                className={`p-2 rounded-full transition-colors ${currentSlideIndex === -1 ? 'bg-white/25 text-white' : 'text-white hover:bg-white/20'}`}
                title="Overview (O)"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
              </button>

              {/* Prev */}
              <button
                onClick={goToPrev}
                disabled={currentSlideIndex === -1}
                className="p-2 text-white hover:bg-white/20 rounded-full transition-colors disabled:opacity-40"
                title="Previous slide"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 15l-6-6-6 6" />
                </svg>
              </button>

              {/* Slide counter */}
              <div className="text-gray-200 font-medium text-xs py-1 select-none">
                {currentSlideIndex === -1 ? 'All' : currentSlideIndex + 1}
                <span className="text-gray-400 mx-0.5">/</span>
                {frames.length}
              </div>

              {/* Next */}
              <button
                onClick={goToNext}
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
                title="Eraser (drag over ink to erase part of it)"
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
            onClick={closePresentation}
            className="p-2 text-red-400 hover:bg-red-400/20 rounded-full transition-colors"
            title={hasStarted ? 'End slideshow (Esc)' : 'Back to the editor (Esc)'}
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
