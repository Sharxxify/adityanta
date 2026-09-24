import { memo, useMemo, useState, useRef, useEffect } from 'react'
import { PREZI_FRAME_TEMPLATES } from '../../utils/templateData'
import SlideView from '../Slide/SlideView'
import SlideThumbnail, { useElementWidth } from '../Slide/SlideThumbnail'

// Mini-map: every slide drawn (with its real content) at its canvas position,
// so the Overview tile shows the true shape of the project. Active = green.
const MiniMapPreview = memo(({ frames = [], frameLayouts = [], activeFrameId, editorBackground }) => {
  const [ref, width] = useElementWidth()
  const height = (width * 9) / 16

  const bounds = useMemo(() => {
    if (!frameLayouts || frameLayouts.length === 0) return null
    const minX = Math.min(...frameLayouts.map((f) => f.x))
    const minY = Math.min(...frameLayouts.map((f) => f.y))
    const maxX = Math.max(...frameLayouts.map((f) => f.x + f.width))
    const maxY = Math.max(...frameLayouts.map((f) => f.y + f.height))
    const w = maxX - minX
    const h = maxY - minY
    if (w <= 0 || h <= 0) return null
    const padX = w * 0.04
    const padY = h * 0.04
    return { minX: minX - padX, minY: minY - padY, w: w + padX * 2, h: h + padY * 2 }
  }, [frameLayouts])

  const bgStyle = editorBackground
    ? { backgroundImage: `url("${editorBackground}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: '#f5f5f2' }

  const s = bounds && width ? Math.min(width / bounds.w, height / bounds.h) : 0
  const ox = bounds ? (width - bounds.w * s) / 2 : 0
  const oy = bounds ? (height - bounds.h * s) / 2 : 0
  const frameById = useMemo(() => new Map(frames.map((f) => [f.id, f])), [frames])

  return (
    <div
      ref={ref}
      className="relative w-full aspect-[16/9] overflow-hidden rounded-md border border-gray-200 pointer-events-none select-none"
      style={bgStyle}
    >
      {bounds && s > 0 && frameLayouts.map((f) => {
        const isActive = f.id === activeFrameId
        const w = f.width * s
        const h = f.height * s
        return (
          <div
            key={f.id}
            className="absolute overflow-hidden"
            style={{
              left: ox + (f.x - bounds.minX) * s,
              top: oy + (f.y - bounds.minY) * s,
              width: w,
              height: h,
              borderRadius: 2,
              boxShadow: isActive ? '0 0 0 2px #16a34a' : '0 0 0 1px rgba(148,163,184,0.9)',
            }}
          >
            <SlideView
              frame={frameById.get(f.id)}
              width={w}
              height={h}
              editorBackground={editorBackground}
              mode="export"
            />
          </div>
        )
      })}
    </div>
  )
})
MiniMapPreview.displayName = 'MiniMapPreview'

// Slide thumbnail: the real slide, drawn by the shared renderer
const MiniCanvasPreview = memo(({ frame, editorBackground = null }) => (
  <SlideThumbnail frame={frame} editorBackground={editorBackground} className="rounded-md bg-white border border-gray-200" />
))

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
            frames={frames}
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
              onClick={() => setActiveFrame(frame.id, isOverviewMode ? 'select' : 'frame')}
              onDoubleClick={() => setActiveFrame(frame.id, 'open')}
              title={isOverviewMode ? 'Click to select · double-click to open' : undefined}
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

                <div className="flex-1 min-w-0">
                  <div className="relative">
                    <MiniCanvasPreview frame={frame} editorBackground={editorBackground} />
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/95 border border-gray-300 text-[11px] flex items-center justify-center">
                      📍
                    </div>
                  </div>

                  <button
                    className="mt-1.5 w-full flex items-center justify-between px-1 py-0.5 rounded hover:bg-green-50 transition-all"
                    onClick={(e) => { e.stopPropagation(); setActiveFrame(frame.id, isOverviewMode ? 'select' : 'frame') }}
                    title={isOverviewMode ? 'Select this slide (double-click to open it)' : 'Go to this slide'}
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
