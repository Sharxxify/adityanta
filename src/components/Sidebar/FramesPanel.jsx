import { useState, useCallback, memo, useRef, useMemo } from 'react'

// Mini canvas renderer for frame previews — renders proportional slide thumbnails
const MiniCanvasPreview = memo(({ elements = [], backgroundColor = '#ffffff', backgroundImage = null, scale = 0.15 }) => {
  const canvasWidth = 1280
  const canvasHeight = 720
  // Scale factor for text: thumbnail width (~260px) / canvas width (1280px) ≈ 0.2
  // We use 0.25 as a balanced factor for readability
  const textScale = 0.25

  const renderElement = (el) => {
    if (!el || el.isPlaceholder) return null

    // No position/size here — the outer wrapper handles that
    const baseStyle = {
      width: '100%',
      height: '100%',
    }

    switch (el.type) {
      case 'text':
        return (
          <div
            style={{
              ...baseStyle,
              fontSize: `${Math.max(5, (el.fontSize || 16) * textScale)}px`,
              fontWeight: el.fontWeight || 'normal',
              fontFamily: el.fontFamily || 'Inter',
              color: el.color || '#333',
              textAlign: el.textAlign || 'left',
              overflow: 'hidden',
              lineHeight: 1.3,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              padding: '1px 2px',
              letterSpacing: '-0.01em',
            }}
          >
            {el.content || ''}
          </div>
        )

      case 'shape':
        // Support both el.shape and el.shapeType (PPTX parser uses shapeType)
        const shapeType = el.shapeType || el.shape || 'rectangle'
        const shapeStyle = {
          ...baseStyle,
          backgroundColor: el.fill || el.backgroundColor || '#e5e7eb',
          border: el.stroke ? `1px solid ${el.stroke}` : 'none',
          borderRadius: shapeType === 'circle' || shapeType === 'ellipse' ? '50%' :
                        shapeType === 'roundedRect' ? `4px` : '0',
          opacity: el.opacity !== undefined ? el.opacity : 1,
        }

        if (shapeType === 'triangle') {
          return (
            <div style={{ ...baseStyle, overflow: 'hidden' }}>
              <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polygon points="50,0 100,100 0,100" fill={el.fill || '#e5e7eb'} stroke={el.stroke || 'none'} strokeWidth={el.strokeWidth || 0} />
              </svg>
            </div>
          )
        }

        if (shapeType === 'star') {
          return (
            <div style={{ ...baseStyle, overflow: 'hidden' }}>
              <svg width="100%" height="100%" viewBox="0 0 24 24">
                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" fill={el.fill || '#fbbf24'} />
              </svg>
            </div>
          )
        }

        if (shapeType === 'arrow' || shapeType === 'line') {
          return (
            <div style={{ ...baseStyle, overflow: 'hidden' }}>
              <svg width="100%" height="100%" viewBox="0 0 100 50">
                <line x1="0" y1="25" x2="100" y2="25" stroke={el.stroke || '#333'} strokeWidth={el.strokeWidth || 2} />
                {shapeType === 'arrow' && <polygon points="85,15 100,25 85,35" fill={el.stroke || '#333'} />}
              </svg>
            </div>
          )
        }

        return <div style={shapeStyle} />

      case 'image':
        return (
          <div style={{ ...baseStyle, overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
            {el.src ? (
              <img src={el.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="40%" height="40%" viewBox="0 0 24 24" fill="#9ca3af">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="none" stroke="#9ca3af" strokeWidth="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5" fill="#9ca3af"/>
                  <polyline points="21 15 16 10 5 21" stroke="#9ca3af" strokeWidth="2" fill="none"/>
                </svg>
              </div>
            )}
          </div>
        )

      case 'icon':
        return (
          <div style={{ ...baseStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', color: el.color || '#333' }}>
            <svg width="80%" height="80%" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
            </svg>
          </div>
        )

      case 'table':
        return (
          <div style={{ ...baseStyle, border: '1px solid #d1d5db', backgroundColor: '#fff' }}>
            <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateColumns: `repeat(${el.cols || 3}, 1fr)`, gridTemplateRows: `repeat(${el.rows || 3}, 1fr)` }}>
              {Array.from({ length: (el.rows || 3) * (el.cols || 3) }).map((_, i) => (
                <div key={i} style={{ border: '0.5px solid #e5e7eb' }} />
              ))}
            </div>
          </div>
        )

      case 'video':
        return (
          <div style={{ ...baseStyle, backgroundColor: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="30%" height="30%" viewBox="0 0 24 24" fill="#fff">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        paddingTop: '56.25%', // 16:9 aspect ratio matching 1280x720 canvas
        backgroundColor,
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
      }}>
        {elements.map((el) => {
          if (!el || el.isPlaceholder) return null
          
          return (
            <div
              key={el.id}
              style={{
                position: 'absolute',
                left: `${(el.x / canvasWidth) * 100}%`,
                top: `${(el.y / canvasHeight) * 100}%`,
                width: `${((el.width || 100) / canvasWidth) * 100}%`,
                height: `${((el.height || 50) / canvasHeight) * 100}%`,
                overflow: 'hidden',
              }}
            >
              {renderElement(el)}
            </div>
          )
        })}
      </div>
    </div>
  )
})

MiniCanvasPreview.displayName = 'MiniCanvasPreview'

const FramesPanel = ({
  frames,
  activeFrame,
  setActiveFrame,
  addNewFrame,
  deleteFrame,
  duplicateFrame,
  reorderFrames,
  projectTitle,
  templateGradient,
  templateThumbnailUrl,
}) => {
  const [hoveredFrame, setHoveredFrame] = useState(null)
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragNodeRef = useRef(null)

  // Drag and drop handlers for frame reordering
  const handleDragStart = useCallback((e, index) => {
    e.stopPropagation()
    setDraggedIndex(index)
    setIsDragging(true)
    dragNodeRef.current = e.target
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
    // Add a slight delay before applying dragging styles
    setTimeout(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.style.opacity = '0.5'
      }
    }, 0)
  }, [])

  const handleDragEnd = useCallback((e) => {
    e.stopPropagation()
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1'
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
    setIsDragging(false)
    dragNodeRef.current = null
  }, [])

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (draggedIndex !== null && index !== draggedIndex) {
      setDragOverIndex(index)
    }
  }, [draggedIndex])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e, toIndex) => {
    e.preventDefault()
    e.stopPropagation()
    const fromIndex = draggedIndex
    if (fromIndex !== null && fromIndex !== toIndex && reorderFrames) {
      reorderFrames(fromIndex, toIndex)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
    setIsDragging(false)
  }, [draggedIndex, reorderFrames])

  // Get the first frame as cover
  const coverFrame = frames[0]

  // Get sidebar background color based on template gradient or active frame
  const sidebarBgColor = frames.find(f => f.id === activeFrame)?.backgroundColor || '#ffffff'
  const isLightBg = sidebarBgColor === '#ffffff' || sidebarBgColor.toLowerCase().includes('fff') || sidebarBgColor.toLowerCase().includes('f5f5f5')

  // Parse gradient for sidebar styling (e.g., "from-cyan-400 to-blue-400")
  const getGradientStyle = useCallback(() => {
    if (!templateGradient) return { backgroundColor: isLightBg ? '#f9fafb' : sidebarBgColor + '20' }

    // Map Tailwind gradient classes to CSS
    const gradientMap = {
      'cyan-400': '#22d3d1',
      'blue-400': '#60a5fa',
      'sky-300': '#7dd3fc',
      'yellow-100': '#fef9c3',
      'yellow-200': '#fef08a',
      'blue-200': '#bfdbfe',
      'green-200': '#bbf7d0',
      'green-300': '#86efac',
      'teal-300': '#5eead4',
      'indigo-200': '#c7d2fe',
      'purple-200': '#e9d5ff',
      'pink-200': '#fbcfe8',
      'orange-200': '#fed7aa',
      'emerald-300': '#6ee7b7',
      'teal-400': '#2dd4bf',
      'amber-200': '#fde68a',
      'orange-300': '#fdba74',
      'rose-300': '#fda4af',
      'violet-200': '#ddd6fe',
      'purple-300': '#d8b4fe',
    }

    const fromMatch = templateGradient.match(/from-(\w+-\d+)/)
    const toMatch = templateGradient.match(/to-(\w+-\d+)/)

    if (fromMatch && toMatch) {
      const fromColor = gradientMap[fromMatch[1]] || '#f9fafb'
      const toColor = gradientMap[toMatch[1]] || '#ffffff'
      return {
        background: `linear-gradient(135deg, ${fromColor}30, ${toColor}20)`,
      }
    }
    return { backgroundColor: '#f9fafb' }
  }, [templateGradient, isLightBg, sidebarBgColor])

  // Memoize overview details to prevent unnecessary re-renders
  const overviewDetails = useMemo(() => ({
    id: coverFrame?.id,
    elements: coverFrame?.elements || [],
    backgroundColor: coverFrame?.backgroundColor || '#ffffff',
  }), [coverFrame?.id, coverFrame?.elements, coverFrame?.backgroundColor])

  return (
    <aside className="w-56 lg:w-64 xl:w-[17rem] flex flex-col h-full overflow-hidden border-r border-gray-100" style={getGradientStyle()}>
      {/* Overview - Cover Slide */}
      <div className="p-4">
        <div className="flex items-start gap-2">
          {/* Page number */}
          <div className="flex flex-col items-center pt-2">
            <span className="text-xs text-gray-400 font-medium">1</span>
            {activeFrame === coverFrame?.id && (
              <div className="w-1.5 h-1.5 bg-primary rounded-full mt-1" />
            )}
          </div>

          {/* Cover slide thumbnail - editable, same style as other frames */}
          <div
            className={`flex-1 relative cursor-pointer rounded-xl overflow-hidden transition-all ${
              activeFrame === coverFrame?.id
                ? 'ring-2 ring-primary shadow-md'
                : 'ring-1 ring-gray-200 hover:ring-gray-300 hover:shadow-sm'
            }`}
            onClick={() => coverFrame && setActiveFrame(coverFrame.id)}
            onMouseEnter={() => setHoveredFrame(coverFrame?.id)}
            onMouseLeave={() => setHoveredFrame(null)}
          >
            <div className="aspect-[16/9] relative bg-white overflow-hidden">
              {/* Show template cover photo if available, covering the full box */}
              {templateThumbnailUrl ? (
                <img
                  src={templateThumbnailUrl}
                  alt="Overview"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <>
                  <MiniCanvasPreview
                    elements={coverFrame?.elements || []}
                    backgroundColor={coverFrame?.backgroundColor || '#ffffff'}
                    backgroundImage={coverFrame?.backgroundImage || null}
                    scale={0.15}
                  />
                  {/* Fallback content if empty */}
                  {(!coverFrame?.elements || coverFrame?.elements?.length === 0 || coverFrame?.elements?.every(el => el.isPlaceholder)) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-bold text-gray-700">{projectTitle || 'Untitled'}</span>
                      <span className="text-xs text-gray-400">Overview</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Frame Label */}
            <div className="px-2 py-1.5 bg-white border-t border-gray-100">
              <p className="text-xs font-medium text-gray-800 truncate" title="Overview">
                Overview
              </p>
              <p className="text-[10px] text-gray-400 truncate">
                {coverFrame?.elements?.filter(el => !el.isPlaceholder).length || 0} elements
              </p>
            </div>

            {/* Hover Actions */}
            {hoveredFrame === coverFrame?.id && (
              <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
                {frames.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteFrame(coverFrame.id)
                    }}
                    className="w-6 h-6 bg-white rounded-md shadow-md flex items-center justify-center text-gray-400 hover:text-red-500 transition-all border border-gray-100"
                    title="Delete"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    duplicateFrame(coverFrame.id)
                  }}
                  className="w-6 h-6 bg-white rounded-md shadow-md flex items-center justify-center text-gray-400 hover:text-primary transition-all border border-gray-100"
                  title="Duplicate"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-2 ml-6 font-medium">Overview</p>
      </div>

      {/* Frames Header */}
      <div className="px-4 pb-2 flex items-center justify-between">
        <span className="text-sm text-gray-700 font-medium">Slides ({frames.length - 1})</span>
        <button
          onClick={addNewFrame}
          className="text-sm text-primary hover:text-primary-dark font-semibold flex items-center gap-1 transition-colors"
        >
          + New Frame
        </button>
      </div>

      {/* Slides List (Slide 2 onward - Overview is shown above) */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-3">
          {frames.slice(1).map((frame, index) => {
            // actualIndex is the real index in the frames array (offset by 1 since we skip frame[0])
            const actualIndex = index + 1
            const pageNumber = index + 2 // Slide 2, 3, 4... (Overview is shown above)

            return (
            <div
              key={frame.id}
              className={`flex items-start gap-2 ${dragOverIndex === actualIndex ? 'pt-8' : ''} transition-all duration-200`}
              onDragOver={(e) => handleDragOver(e, actualIndex)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, actualIndex)}
            >
              {/* Drop indicator */}
              {dragOverIndex === actualIndex && draggedIndex !== actualIndex && (
                <div className="absolute left-4 right-4 h-1 bg-primary rounded-full -mt-5" />
              )}

              {/* Frame Number with indicator */}
              <div className="flex flex-col items-center pt-2">
                <span className="text-xs text-gray-400 font-medium">
                  {isDragging && draggedIndex !== null ? (
                    draggedIndex === actualIndex ? pageNumber :
                    dragOverIndex !== null && draggedIndex < dragOverIndex && actualIndex > draggedIndex && actualIndex <= dragOverIndex ? pageNumber - 1 :
                    dragOverIndex !== null && draggedIndex > dragOverIndex && actualIndex < draggedIndex && actualIndex >= dragOverIndex ? pageNumber + 1 :
                    pageNumber
                  ) : pageNumber}
                </span>
                {activeFrame === frame.id && (
                  <div className="w-1.5 h-1.5 bg-primary rounded-full mt-1" />
                )}
              </div>

              {/* Frame Thumbnail - Draggable */}
              <div
                draggable="true"
                onDragStart={(e) => handleDragStart(e, actualIndex)}
                onDragEnd={handleDragEnd}
                onClick={() => setActiveFrame(frame.id)}
                onMouseEnter={() => setHoveredFrame(frame.id)}
                onMouseLeave={() => setHoveredFrame(null)}
                className={`flex-1 relative cursor-grab rounded-xl overflow-hidden transition-all ${
                  activeFrame === frame.id
                    ? 'ring-2 ring-primary shadow-md'
                    : 'ring-1 ring-gray-200 hover:ring-gray-300 hover:shadow-sm'
                } ${draggedIndex === actualIndex ? 'opacity-50 scale-95' : ''}`}
              >
                {/* Frame Preview */}
                <div className="aspect-[16/9] relative bg-white overflow-hidden">
                  <MiniCanvasPreview
                    elements={frame.elements || []}
                    backgroundColor={frame.backgroundColor || '#ffffff'}
                    backgroundImage={frame.backgroundImage || null}
                    scale={0.13}
                  />
                  {/* Frame empty fallback */}
                  {(!frame.elements || frame.elements.length === 0 || frame.elements.every(el => el.isPlaceholder)) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-semibold text-gray-400">
                        {frame.title || `Slide ${pageNumber}`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Frame Label */}
                <div className="px-2 py-1.5 bg-white border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-800 truncate" title={frame.title}>
                    {frame.title || `Slide ${pageNumber}`}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {frame.elements?.filter(el => !el.isPlaceholder).length || 0} elements
                  </p>
                </div>

                {/* Drag Handle - Always visible on hover */}
                {(hoveredFrame === frame.id || draggedIndex === actualIndex) && (
                  <div className="absolute top-1/2 left-1 -translate-y-1/2 cursor-grab active:cursor-grabbing">
                    <div className="w-5 h-8 bg-white/90 rounded flex items-center justify-center text-gray-400 shadow-sm">
                      <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                        <circle cx="3" cy="2" r="1.5" />
                        <circle cx="7" cy="2" r="1.5" />
                        <circle cx="3" cy="8" r="1.5" />
                        <circle cx="7" cy="8" r="1.5" />
                        <circle cx="3" cy="14" r="1.5" />
                        <circle cx="7" cy="14" r="1.5" />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Hover Actions */}
                {hoveredFrame === frame.id && (
                  <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
                    {frames.length > 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteFrame(frame.id)
                        }}
                        className="w-6 h-6 bg-white rounded-md shadow-md flex items-center justify-center text-gray-400 hover:text-red-500 transition-all border border-gray-100"
                        title="Delete"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        duplicateFrame(frame.id)
                      }}
                      className="w-6 h-6 bg-white rounded-md shadow-md flex items-center justify-center text-gray-400 hover:text-primary transition-all border border-gray-100"
                      title="Duplicate"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
            )
          })}
        </div>
      </div>
    </aside>
  )
}

export default memo(FramesPanel, (prevProps, nextProps) => {
  // Custom comparison for performance - only re-render if key props change
  return (
    prevProps.frames === nextProps.frames &&
    prevProps.activeFrame === nextProps.activeFrame &&
    prevProps.projectTitle === nextProps.projectTitle &&
    prevProps.templateGradient === nextProps.templateGradient &&
    prevProps.templateThumbnailUrl === nextProps.templateThumbnailUrl
  )
})
