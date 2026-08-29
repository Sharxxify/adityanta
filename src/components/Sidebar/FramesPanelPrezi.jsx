import { memo, useMemo, useState, useRef, useEffect } from 'react'
import { PREZI_FRAME_TEMPLATES } from '../../utils/templateData'

// Mini-map: shows every frame as a small rectangle in its real canvas
// position so the user can see the overall shape of the project. The
// active frame is highlighted in green.
const MiniMapPreview = memo(({ frameLayouts = [], activeFrameId, editorBackground }) => {
  const bounds = useMemo(() => {
    if (!frameLayouts || frameLayouts.length === 0) return null
    const minX = Math.min(...frameLayouts.map((f) => f.x))
    const minY = Math.min(...frameLayouts.map((f) => f.y))
    const maxX = Math.max(...frameLayouts.map((f) => f.x + f.width))
    const maxY = Math.max(...frameLayouts.map((f) => f.y + f.height))
    const w = maxX - minX
    const h = maxY - minY
    if (w <= 0 || h <= 0) return null
    // Pad a bit so frames don't sit flush against the thumbnail edges.
    const padX = w * 0.04
    const padY = h * 0.04
    return { minX: minX - padX, minY: minY - padY, w: w + padX * 2, h: h + padY * 2 }
  }, [frameLayouts])

  const bgStyle = editorBackground
    ? {
        backgroundImage: `url(${editorBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { backgroundColor: '#f5f5f2' }

  return (
    <div
      className="relative w-full aspect-[16/9] overflow-hidden rounded-md border border-gray-200 pointer-events-none select-none"
      style={bgStyle}
    >
      {bounds && (
        <svg
          viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full"
        >
          {frameLayouts.map((f) => {
            const isActive = f.id === activeFrameId
            const strokeW = Math.max(2, bounds.w / 220)
            return (
              <rect
                key={f.id}
                x={f.x}
                y={f.y}
                width={f.width}
                height={f.height}
                fill={isActive ? 'rgba(34, 197, 94, 0.55)' : 'rgba(255, 255, 255, 0.85)'}
                stroke={isActive ? '#15803d' : '#94a3b8'}
                strokeWidth={strokeW}
                rx={Math.max(2, bounds.w / 200)}
              />
            )
          })}
        </svg>
      )}
    </div>
  )
})
MiniMapPreview.displayName = 'MiniMapPreview'

const renderMiniElement = (el) => {
  const commonStyle = {
    position: 'absolute',
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.width || 100}px`,
    height: `${el.height || 60}px`,
    opacity: (el.opacity ?? 100) / 100,
    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
  }

  switch (el.type) {
    case 'text':
      return (
        <div
          key={el.id}
          style={{
            ...commonStyle,
            fontSize: `${el.fontSize || 16}px`,
            fontWeight: el.fontWeight || 'normal',
            fontFamily: el.fontFamily || 'Inter',
            fontStyle: el.fontStyle || 'normal',
            textDecoration: el.textDecoration || 'none',
            textAlign: el.textAlign || 'left',
            color: el.color || '#111827',
            padding: '8px',
            wordWrap: 'break-word',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
            userSelect: 'none',
          }}
          dangerouslySetInnerHTML={{ __html: el.content || '' }}
        />
      )

    case 'shape':
      const fill = el.fill || 'transparent'
      const border = el.strokeWidth
        ? `${el.strokeWidth}px ${el.borderStyle || 'solid'} ${el.strokeColor || '#333'}`
        : 'none'
      
      let shapeNode = null
      const shapeType = el.shapeType || 'rectangle'
      
      if (shapeType === 'circle' || shapeType === 'oval') {
        shapeNode = (
          <div
            className="w-full h-full rounded-full"
            style={{ backgroundColor: fill, border }}
          />
        )
      } else if (shapeType === 'roundedRectangle') {
        shapeNode = (
          <div
            className="w-full h-full"
            style={{ backgroundColor: fill, border, borderRadius: `${el.borderRadius ?? 16}px` }}
          />
        )
      } else if (shapeType === 'triangle') {
        shapeNode = (
          <svg className="w-full h-full" viewBox="0 0 200 150" preserveAspectRatio="none">
            <polygon points="100,0 0,150 200,150" fill={fill} stroke={el.strokeColor} strokeWidth={el.strokeWidth || 0} />
          </svg>
        )
      } else if (shapeType === 'diamond') {
        shapeNode = (
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon points="50,0 100,50 50,100 0,50" fill={fill} stroke={el.strokeColor} strokeWidth={el.strokeWidth || 0} />
          </svg>
        )
      } else {
        shapeNode = (
          <div
            className="w-full h-full"
            style={{ backgroundColor: fill, border }}
          />
        )
      }

      return (
        <div key={el.id} style={commonStyle}>
          <div className="relative w-full h-full">
            {shapeNode}
            {el.content && (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{
                  fontSize: `${el.fontSize || 16}px`,
                  fontWeight: el.fontWeight || 'normal',
                  fontFamily: el.fontFamily || 'Inter',
                  fontStyle: el.fontStyle || 'normal',
                  textDecoration: el.textDecoration || 'none',
                  textAlign: el.textAlign || 'center',
                  color: el.color || '#111827',
                  padding: '8px',
                  overflow: 'hidden',
                  wordWrap: 'break-word',
                }}
                dangerouslySetInnerHTML={{ __html: el.content }}
              />
            )}
          </div>
        </div>
      )

    case 'image':
      return (
        <div key={el.id} style={commonStyle}>
          <img
            src={el.src}
            alt="thumbnail-preview"
            className="w-full h-full object-contain rounded"
            style={{
              transform: `${el.flipH ? 'scaleX(-1)' : ''} ${el.flipV ? 'scaleY(-1)' : ''}`.trim() || undefined,
              borderRadius: typeof el.borderRadius === 'number' ? `${el.borderRadius}px` : (el.borderRadius || undefined)
            }}
          />
        </div>
      )

    case 'icon':
      const iconSize = Math.min(el.width || 50, el.height || 50) * 0.8
      const iconColor = el.color || '#2E7D32'
      return (
        <div key={el.id} style={{ ...commonStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>
      )

    default:
      return (
        <div
          key={el.id}
          className="rounded-sm bg-gray-200/80 border border-gray-300"
          style={{ ...commonStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="text-[10px] font-bold text-gray-500 uppercase">{el.type}</span>
        </div>
      )
  }
}

const MiniCanvasPreview = memo(({ frame, editorBackground = null }) => {
  const containerRef = useRef(null)
  const [scale, setScale] = useState(0.2)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const updateScale = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0) {
        setScale(rect.width / 1280)
      }
    }
    updateScale()
    const observer = new ResizeObserver(updateScale)
    observer.observe(el)
    window.addEventListener('resize', updateScale)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScale)
    }
  }, [])

  const elements = frame?.elements || []

  const bgStyle = frame?.backgroundImage
    ? { backgroundImage: `url(${frame.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : (frame?.backgroundColor && frame?.backgroundColor !== 'transparent'
        ? { backgroundColor: frame.backgroundColor }
        : (editorBackground
            ? { backgroundImage: `url(${editorBackground})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: 'transparent' }
            : { backgroundColor: '#ffffff' }))

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[16/9] overflow-hidden rounded-md bg-white border border-gray-200 pointer-events-none select-none"
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: '1280px',
          height: '720px',
          transform: `scale(${scale})`,
          ...bgStyle
        }}
      >
        {elements.map((el) => {
          if (!el || el.isPlaceholder) return null
          if (el.type === 'shape' && el.fill === '#f3f4f6') return null
          return renderMiniElement(el)
        })}
      </div>
    </div>
  )
})

MiniCanvasPreview.displayName = 'MiniCanvasPreview'

const templatePreview = {
  title: (
    <div className="h-16 bg-white border border-gray-200 rounded-md flex flex-col items-center justify-center">
      <div className="text-[9px] font-bold text-gray-900">Your presentation title</div>
      <div className="text-[7px] text-gray-500 mt-1">Subtitle</div>
    </div>
  ),
  imageText: (
    <div className="h-16 bg-white border border-gray-200 rounded-md p-1.5 flex gap-1">
      <div className="w-3/5 text-[7px] text-gray-700">Heading + body</div>
      <div className="w-2/5 rounded bg-gray-300" />
    </div>
  ),
  boldStatement: (
    <div className="h-16 rounded-md bg-gray-900 border border-gray-700 p-1.5 flex items-end">
      <div className="text-[8px] text-white font-bold">Make a bold statement</div>
    </div>
  ),
  textInfo: (
    <div className="h-16 bg-white border border-gray-200 rounded-md p-1.5">
      <div className="text-[8px] font-semibold text-gray-900">Heading</div>
      <div className="text-[7px] text-gray-500 mt-1">Body paragraph text</div>
    </div>
  ),
  closing: (
    <div className="h-16 rounded-md bg-gray-900 border border-gray-700 p-1.5 flex items-center justify-center">
      <div className="text-[9px] text-white font-bold">THE END</div>
    </div>
  ),
}

const FramesPanelPrezi = ({
  frames,
  activeFrame,
  isFrameFocused = true,
  setActiveFrame,
  addNewFrame,
  deleteFrame,
  duplicateFrame,
  reorderFrames,
  frameLayouts = [],
  editorBackground = null,
  editorMode = 'overview',
}) => {
  const isOverviewMode = editorMode === 'overview'
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const dragIndexRef = useRef(null)
  const templatePickerRef = useRef(null)

  // Close template picker on outside click
  useEffect(() => {
    const handler = (e) => {
      if (templatePickerRef.current && !templatePickerRef.current.contains(e.target)) {
        setShowTemplatePicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeIndex = useMemo(() => frames.findIndex((f) => f.id === activeFrame), [frames, activeFrame])

  const handleDragStart = (e, index) => {
    if (!isOverviewMode) {
      e.preventDefault()
      return
    }
    dragIndexRef.current = index
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  const handleDragOver = (e, index) => {
    if (!isOverviewMode) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (index !== dragIndexRef.current) setDragOverIndex(index)
  }

  const handleDrop = (e, toIndex) => {
    if (!isOverviewMode) return
    e.preventDefault()
    const fromIndex = dragIndexRef.current
    if (fromIndex !== null && fromIndex !== toIndex) {
      reorderFrames(fromIndex, toIndex)
    }
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    dragIndexRef.current = null
    setDragOverIndex(null)
  }

  const handleAddFrame = (templateId) => {
    addNewFrame(templateId)
    setShowTemplatePicker(false)
  }

  if (isCollapsed) {
    return (
      <aside className="relative w-6 bg-white border-r border-gray-200 transition-all duration-200">
        <button
          className="absolute top-1/2 -translate-y-1/2 right-0 w-6 h-14 rounded-r-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-900 transition-all"
          onClick={() => setIsCollapsed(false)}
          title="Expand frames panel"
        >
          ›
        </button>
      </aside>
    )
  }

  return (
    <aside className="relative w-72 bg-white border-r border-gray-200 flex flex-col transition-all duration-200">
      <div className="p-3 border-b border-gray-100">
        <div className="relative" ref={templatePickerRef}>
          <button
            onClick={() => setShowTemplatePicker((v) => !v)}
            className="w-full h-11 bg-[#3dba4e] hover:bg-[#34a745] text-white rounded-md px-3 flex items-center justify-between font-semibold transition-all"
          >
            <span>+ Add frame</span>
            <span className="text-sm">▾</span>
          </button>

          {showTemplatePicker && (
            <div className="absolute left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-30">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Choose template</p>
              <div className="grid grid-cols-2 gap-2">
                {PREZI_FRAME_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => handleAddFrame(tpl.id)}
                    className="text-left p-2 rounded-lg border border-gray-200 hover:border-[#3dba4e] hover:bg-green-50 transition-all"
                  >
                    {templatePreview[tpl.id]}
                    <div className="text-[11px] font-medium text-gray-700 mt-1">{tpl.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <button
          onClick={() => frames[0] && setActiveFrame(frames[0].id, 'overview')}
          className="w-full text-left rounded-xl bg-gray-50 p-2 border-2 border-transparent hover:border-gray-200 transition-all"
        >
          <MiniMapPreview
            frameLayouts={frameLayouts}
            activeFrameId={activeFrame}
            editorBackground={editorBackground}
          />
          <div className="mt-2 text-sm font-semibold text-gray-700 text-center">Overview</div>
        </button>

        {frames.map((frame, index) => {
          // Frame 0 is now just "Slide 1" — no special hero treatment.
          // The Overview tile above is decoupled from any frame.
          const slideNumber = index + 1
          const isActive = activeFrame === frame.id && isFrameFocused
          const isDragTarget = dragOverIndex === index
          return (
            <div
              key={frame.id}
              draggable={isOverviewMode}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => setActiveFrame(frame.id, isOverviewMode ? 'overview' : 'frame')}
              className={`group ${isOverviewMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} rounded-xl p-2 border-2 transition-all ${
                isActive ? 'border-[#3dba4e] bg-green-50/50' : 'border-gray-200 hover:border-gray-300'
              } ${isDragTarget ? 'ring-2 ring-[#3dba4e] ring-offset-1 scale-[0.98]' : ''}`}
              style={isActive ? { borderWidth: '3px' } : undefined}
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-center gap-1">
                  <div className="mt-1 w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-bold flex items-center justify-center">
                    {slideNumber}
                  </div>
                  {isOverviewMode && <div className="text-gray-300 text-[10px] leading-none select-none">⠿</div>}
                </div>

                <div className="flex-1">
                  <div className="relative">
                    <MiniCanvasPreview frame={frame} editorBackground={editorBackground} />
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/95 border border-gray-300 text-[11px] flex items-center justify-center">
                      📍
                    </div>
                  </div>

                  <button
                    className="mt-1.5 w-full flex items-center justify-between px-1 py-0.5 rounded hover:bg-green-50 transition-all"
                    onClick={(e) => { e.stopPropagation(); setActiveFrame(frame.id, isOverviewMode ? 'overview' : 'frame') }}
                    title={isOverviewMode ? "Select this frame" : "Click to zoom into this frame"}
                  >
                    <p className="text-xs font-bold text-gray-700">{frame.title || `Slide ${slideNumber}`}</p>
                    {!isOverviewMode && <span className="text-green-600 text-sm font-bold">»</span>}
                  </button>
                </div>
              </div>

              <div className="mt-1 flex items-center justify-end gap-1 min-h-[28px]" onClick={(e) => e.stopPropagation()}>
                {confirmDeleteId === frame.id ? (
                  <>
                    <span className="text-[11px] text-gray-500">Delete?</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFrame(frame.id) }}
                      className="text-[11px] px-2 py-1 rounded border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 transition-all font-semibold"
                    >Yes</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                      className="text-[11px] px-2 py-1 rounded border border-gray-200 hover:bg-white transition-all"
                    >No</button>
                  </>
                ) : (
                  <div className="hidden group-hover:flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicateFrame(frame.id) }}
                      className="text-[11px] px-2 py-1 rounded border border-gray-200 hover:bg-white transition-all"
                    >Duplicate</button>
                    {frames.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(frame.id) }}
                        className="text-[11px] px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 transition-all"
                      >Delete</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <button
        className="absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-14 rounded-r-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-900 transition-all"
        onClick={() => setIsCollapsed(true)}
        title="Collapse frames panel"
      >
        ‹
      </button>
    </aside>
  )
}

export default memo(FramesPanelPrezi)
