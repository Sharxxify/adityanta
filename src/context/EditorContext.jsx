import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { safeJSONParse, setToStorage } from '../utils/imageUtils'
import { saveAutosave, clearAutosave } from '../utils/indexedDBHelper'
import { API_CONFIG, AUTH_CONFIG } from '../config'
import logger from '../utils/logger'
import { buildPreziFrameTemplate } from '../utils/templateData'

const EditorContext = createContext(null)

export const useEditor = () => {
  const context = useContext(EditorContext)
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider')
  }
  return context
}

// Animation presets - PowerPoint-like animations
export const ANIMATION_PRESETS = {
  none: { name: 'None', duration: 0 },
  // Entrance animations
  fadeIn: { name: 'Fade In', duration: 500, keyframes: 'fadeIn' },
  slideInLeft: { name: 'Slide In Left', duration: 500, keyframes: 'slideInLeft' },
  slideInRight: { name: 'Slide In Right', duration: 500, keyframes: 'slideInRight' },
  slideInUp: { name: 'Slide In Up', duration: 500, keyframes: 'slideInUp' },
  slideInDown: { name: 'Slide In Down', duration: 500, keyframes: 'slideInDown' },
  zoomIn: { name: 'Zoom In', duration: 500, keyframes: 'zoomIn' },
  bounceIn: { name: 'Bounce In', duration: 700, keyframes: 'bounceIn' },
  rotateIn: { name: 'Rotate In', duration: 500, keyframes: 'rotateIn' },
  flipInX: { name: 'Flip In Horizontal', duration: 600, keyframes: 'flipInX' },
  flipInY: { name: 'Flip In Vertical', duration: 600, keyframes: 'flipInY' },
  lightSpeedIn: { name: 'Light Speed In', duration: 500, keyframes: 'lightSpeedIn' },
  rollIn: { name: 'Roll In', duration: 600, keyframes: 'rollIn' },
  // Exit animations
  fadeOut: { name: 'Fade Out', duration: 500, keyframes: 'fadeOut' },
  zoomOut: { name: 'Zoom Out', duration: 500, keyframes: 'zoomOut' },
  slideOutLeft: { name: 'Slide Out Left', duration: 500, keyframes: 'slideOutLeft' },
  slideOutRight: { name: 'Slide Out Right', duration: 500, keyframes: 'slideOutRight' },
  // Emphasis animations
  pulse: { name: 'Pulse', duration: 500, keyframes: 'pulse' },
  shake: { name: 'Shake', duration: 500, keyframes: 'shake' },
  swing: { name: 'Swing', duration: 600, keyframes: 'swing' },
  tada: { name: 'Tada', duration: 700, keyframes: 'tada' },
  wobble: { name: 'Wobble', duration: 700, keyframes: 'wobble' },
  heartBeat: { name: 'Heart Beat', duration: 800, keyframes: 'heartBeat' },
  rubberBand: { name: 'Rubber Band', duration: 600, keyframes: 'rubberBand' },
}

// Transition presets for slides
export const SLIDE_TRANSITIONS = {
  none: 'None',
  fade: 'Fade',
  slide: 'Slide',
  zoom: 'Zoom',
  flip: 'Flip',
  cube: 'Cube',
}

const CANVAS_WIDTH = 1280
const CANVAS_HEIGHT = 720
const FIT_PADDING = 8

const toFiniteNumber = (value, fallback = 0) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const estimateTextLines = (text, fontSize, maxWidth) => {
  const content = String(text || '')
  if (!content.trim()) return 1

  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.font = `${fontSize}px Inter, Arial, sans-serif`
        return content.split('\n').reduce((total, line) => {
          const words = line.split(/\s+/).filter(Boolean)
          if (words.length === 0) return total + 1
          let lineCount = 1
          let current = words[0]
          for (let i = 1; i < words.length; i += 1) {
            const candidate = `${current} ${words[i]}`
            if (ctx.measureText(candidate).width <= maxWidth) {
              current = candidate
            } else {
              lineCount += 1
              current = words[i]
            }
          }
          return total + lineCount
        }, 0)
      }
    }
  } catch (_e) {
    // no-op; fall back to approximation below
  }

  const avgCharWidth = Math.max(4, fontSize * 0.52)
  const maxCharsPerLine = Math.max(8, Math.floor(maxWidth / avgCharWidth))
  return content
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil((line.length || 1) / maxCharsPerLine)), 0)
}

const normalizeTextElement = (element, fitScale = 1) => {
  if (element.type !== 'text') return element
  const next = { ...element }
  const baseFont = toFiniteNumber(next.fontSize, 16)
  const fontSize = Math.max(8, Math.min(96, Math.round(baseFont * fitScale)))
  next.fontSize = fontSize

  const text = String(next.content || '')
  if (text.trim().length > 0) {
    const usableWidth = Math.max(40, toFiniteNumber(next.width, 120) - 12)
    const lineCount = estimateTextLines(text, fontSize, usableWidth)
    const neededHeight = Math.ceil(lineCount * fontSize * 1.35 + 12)
    next.height = Math.max(toFiniteNumber(next.height, 50), neededHeight)
  }

  return next
}

const normalizeFrameGeometry = (frame) => {
  const sourceElements = Array.isArray(frame?.elements) ? frame.elements : []
  const positioned = sourceElements
    .map((el) => ({
      ...el,
      x: toFiniteNumber(el?.x, 0),
      y: toFiniteNumber(el?.y, 0),
      width: Math.max(8, toFiniteNumber(el?.width, 120)),
      height: Math.max(8, toFiniteNumber(el?.height, 50)),
    }))

  if (positioned.length === 0) {
    return { ...frame, elements: [] }
  }

  const minX = Math.min(...positioned.map((el) => el.x))
  const minY = Math.min(...positioned.map((el) => el.y))
  const maxX = Math.max(...positioned.map((el) => el.x + el.width))
  const maxY = Math.max(...positioned.map((el) => el.y + el.height))

  const outOfBounds =
    minX < 0 ||
    minY < 0 ||
    maxX > CANVAS_WIDTH ||
    maxY > CANVAS_HEIGHT

  const bboxWidth = Math.max(1, maxX - minX)
  const bboxHeight = Math.max(1, maxY - minY)
  const availableWidth = CANVAS_WIDTH - FIT_PADDING * 2
  const availableHeight = CANVAS_HEIGHT - FIT_PADDING * 2
  const fitScale = outOfBounds
    ? Math.min(1, availableWidth / bboxWidth, availableHeight / bboxHeight)
    : 1

  const fitted = positioned.map((el) => {
    const scaledX = (el.x - minX) * fitScale + FIT_PADDING
    const scaledY = (el.y - minY) * fitScale + FIT_PADDING
    const scaledWidth = Math.max(8, el.width * fitScale)
    const scaledHeight = Math.max(8, el.height * fitScale)

    const clampedWidth = Math.min(scaledWidth, CANVAS_WIDTH)
    const clampedHeight = Math.min(scaledHeight, CANVAS_HEIGHT)

    const normalizedElement = normalizeTextElement({
      ...el,
      x: Math.max(0, Math.min(scaledX, CANVAS_WIDTH - clampedWidth)),
      y: Math.max(0, Math.min(scaledY, CANVAS_HEIGHT - clampedHeight)),
      width: clampedWidth,
      height: clampedHeight,
    }, fitScale)

    if (normalizedElement.y + normalizedElement.height > CANVAS_HEIGHT) {
      normalizedElement.y = Math.max(0, CANVAS_HEIGHT - normalizedElement.height)
      normalizedElement.height = Math.min(normalizedElement.height, CANVAS_HEIGHT)
    }

    return normalizedElement
  })

  return { ...frame, elements: fitted }
}

const normalizeFramesForCanvas = (sourceFrames = []) => {
  if (!Array.isArray(sourceFrames)) return []
  return sourceFrames.map((frame, index) => normalizeFrameGeometry({
    ...frame,
    id: frame?.id ?? index + 1,
    title: frame?.title || `Slide ${index + 1}`,
    preview: frame?.preview || frame?.title || `Slide ${index + 1}`,
    backgroundColor: frame?.backgroundColor || '#ffffff',
    notes: frame?.notes || '',
    transition: frame?.transition || 'fade',
  }))
}

// Create a blank frame with default text placeholders (like PowerPoint)
const createBlankFrame = (id, title = 'Slide 1') => ({
  id,
  title,
  preview: title,
  elements: [
    {
      id: id * 1000 + 1,
      type: 'text',
      content: 'Click to add title',
      x: 50,
      y: 100,
      width: 700,
      height: 70,
      fontSize: 40,
      fontWeight: 'bold',
      fontFamily: 'Inter',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center', // Center when placeholder
      color: '#333333',
      isPlaceholder: true,
      borderWidth: 0,
      borderColor: '#333333',
      borderRadius: 0,
      backgroundColor: 'transparent',
    },
    {
      id: id * 1000 + 2,
      type: 'text',
      content: 'Click to add content',
      x: 50,
      y: 200,
      width: 700,
      height: 300,
      fontSize: 20,
      fontWeight: 'normal',
      fontFamily: 'Inter',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center', // Center when placeholder
      color: '#666666',
      isPlaceholder: true,
      borderWidth: 0,
      borderColor: '#333333',
      borderRadius: 0,
      backgroundColor: 'transparent',
    },
  ],
  backgroundColor: 'transparent',
  notes: '', // Presenter notes
  transition: 'fade', // Slide transition effect
})

// Default frame with elements (for adding new slides)
const createDefaultFrame = (id, title = 'New Frame', templateType = 'title') =>
  buildPreziFrameTemplate(id, title, templateType)

const generateRandomName = () => {
  const adjectives = ['Creative', 'Brilliant', 'Dynamic', 'Elegant', 'Vibrant', 'Stunning', 'Epic', 'Sparkling', 'Radiant', 'Sleek'];
  const nouns = ['Presentation', 'Project', 'Deck', 'Slides', 'Vision', 'Blueprint', 'Concept', 'Idea', 'Story', 'Canvas'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj} ${noun}`;
}

// Default header settings for a fresh project. `isPlaceholder: true` means
// the user hasn't typed anything yet — the editor renders it greyed-out and
// exports skip it entirely until the user replaces it.
const DEFAULT_HEADER = {
  content: 'Add a Header text',
  x: 80,
  y: 80,
  width: 1280,
  fontSize: 64,
  fontWeight: 'bold',
  fontFamily: 'Inter',
  fontStyle: 'normal',
  textDecoration: 'none',
  textAlign: 'center',
  color: '#1a1a1a',
  isPlaceholder: true,
}

// Initial blank project - Create 10 slides by default
const createBlankProject = () => ({
    title: generateRandomName(),
    header: { ...DEFAULT_HEADER },
    frames: [{
      id: 1,
      title: 'Overview',
      preview: 'Overview',
      backgroundColor: 'transparent',
      notes: '',
      transition: 'fade',
      elements: [
        {
          id: 1001,
          type: 'text',
          content: 'Click to add title',
          x: 50,
          y: 100,
          width: 700,
          height: 70,
          fontSize: 80,
          fontWeight: 'bold',
          fontFamily: 'Inter',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'center',
          color: '#333333',
          isPlaceholder: true,
          borderWidth: 0,
          borderColor: '#333333',
          borderRadius: 0,
          backgroundColor: 'transparent',
        }
      ]
    }]
  })

  const AUTOSAVE_KEY = 'adityanta_autosave'
  const AUTOSAVE_INTERVAL = 30000 // 30 seconds
  const VERSION_HISTORY_KEY = 'adityanta_versions'
  const MAX_VERSIONS = 20

  export const EditorProvider = ({ children }) => {
    const getInitialState = () => {
      // Always start with blank project for now per user request (disable autosave restore)
      return createBlankProject()
    }

    const initialState = getInitialState()
    const [isInitializing, setIsInitializing] = useState(true) // Track async initialization

    const [projectTitle, setProjectTitle] = useState(initialState.title)
    const [header, setHeader] = useState(initialState.header || { ...DEFAULT_HEADER })
    const [frames, setFrames] = useState(initialState.frames)
    const [activeFrameId, setActiveFrameId] = useState(initialState.frames[0]?.id || 1)
    const [selectedElementId, setSelectedElementId] = useState(null)
    const [zoom, setZoom] = useState(100)
    const [clipboard, setClipboard] = useState(null)
    const clipboardRef = useRef(null) // #05 — Ref so pasteElement never reads stale closure
    const [history, setHistory] = useState([])
    const [historyIndex, setHistoryIndex] = useState(-1)
    const [isBlankProject, setIsBlankProject] = useState(false)
    const [lastSaved, setLastSaved] = useState(null)
    const [gridEnabled, setGridEnabled] = useState(false)
    const [gridSize, setGridSize] = useState(20)
    const [snapToGrid, setSnapToGrid] = useState(false)
    const [editorBackground, setEditorBackground] = useState(undefined)

    // Slide Master (global styling)
    const [slideMaster, setSlideMaster] = useState({
      backgroundColor: '#ffffff',
      fontFamily: 'Inter',
      titleFontSize: 40,
      titleColor: '#333333',
      bodyFontSize: 20,
      bodyColor: '#666666',
      accentColor: '#2E7D32',
    })

  // Version History
  const [versionHistory, setVersionHistory] = useState([])

  // Drawing mode
  const [isDrawingMode, setIsDrawingMode] = useState(false)
  const [drawingTool, setDrawingTool] = useState('pen') // pen, highlighter, eraser
  const [drawingColor, setDrawingColor] = useState('#000000')
  const [drawingSize, setDrawingSize] = useState(3)

  // Speaker notes panel visibility
  const [showSpeakerNotes, setShowSpeakerNotes] = useState(false)

  const elementCounterRef = useRef(100)

  // Refs for autosave and history
  const projectTitleRef = useRef(projectTitle)
  const framesRef = useRef(frames)
  const isMountedRef = useRef(true)
  const historyRef = useRef([])
  const historyIndexRef = useRef(-1)

  // Initialization: Push initial state to history on first load
  useEffect(() => {
    // Only push if history is empty
    if (historyRef.current.length === 0 && frames.length > 0) {
      historyRef.current = [JSON.stringify(frames)]
      historyIndexRef.current = 0
      setHistory(historyRef.current)
      setHistoryIndex(0)
    }
  }, [frames])

  // Keep refs in sync with state
  useEffect(() => {
    projectTitleRef.current = projectTitle
  }, [projectTitle])

  useEffect(() => {
    framesRef.current = frames
  }, [frames])

  // Track mount/unmount status
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Autosave restore on mount is DISABLED.
  // It was overwriting the template/project that EditorPage loads, causing
  // the editor to appear broken after a Ctrl+S or timed autosave.
  useEffect(() => {
    setIsInitializing(false)
  }, [])

  // Periodic autosave interval is DISABLED.
  // The EditorPage handles explicit saves via Ctrl+S / save button.
  // The old 30-second IndexedDB autosave conflicted with project loading.

  // Get active frame
  const activeFrame = frames.find(f => f.id === activeFrameId) || frames[0]

  // Get elements of active frame
  const elements = activeFrame?.elements || []

  // Get selected element
  const selectedElement = selectedElementId
    ? elements.find(el => el.id === selectedElementId)
    : null

  // Generate unique element ID
  const generateElementId = useCallback(() => {
    elementCounterRef.current += 1
    return elementCounterRef.current
  }, [])

  // Snap position to grid
  const snapPosition = useCallback((x, y) => {
    if (!snapToGrid) return { x, y }
    return {
      x: Math.round(x / gridSize) * gridSize,
      y: Math.round(y / gridSize) * gridSize,
    }
  }, [snapToGrid, gridSize])

  // Commit current or provided state to history
  const pushToHistory = useCallback((framesState) => {
    const stateToSave = framesState || framesRef.current
    const stateStr = JSON.stringify(stateToSave)
    const currentHistory = historyRef.current
    const currIndex = historyIndexRef.current

    // Don't save duplicate consecutive states
    if (currIndex >= 0 && currentHistory[currIndex] === stateStr) {
      return
    }

    const newHistory = currentHistory.slice(0, currIndex + 1)
    newHistory.push(stateStr)

    // Keep only last 50 states
    if (newHistory.length > 50) {
      newHistory.shift()
    }
    
    historyRef.current = newHistory
    historyIndexRef.current = newHistory.length - 1
    
    setHistory(historyRef.current)
    setHistoryIndex(historyIndexRef.current)
  }, [])

  // Provide explicit history commit function to context (replaces old saveToHistory)
  const commitHistory = pushToHistory

  // Legacy saveToHistory for internal backwards compatibility
  const saveToHistory = useCallback(() => {
    // Legacy calls expect it to save the "before" state. We actually want it to save the "after" state
    // But since it's called BEFORE updates in the old code, we'll just ignore it and use commitHistory 
    // explicitly when the frame changes, or we push the current state.
    pushToHistory(framesRef.current)
  }, [pushToHistory])

  // Undo
  const undo = useCallback(() => {
    const headIndex = historyIndexRef.current
    const currentHistory = historyRef.current
    const currState = JSON.stringify(framesRef.current)
    const headState = currentHistory[headIndex]

    // If current state differs from the head state and we are at the top of the history stack
    if (currState && headState && currState !== headState && headIndex === currentHistory.length - 1) {
      // Save current modified state to history so redo can get back to it, and revert to headIndex
      const newHistory = [...currentHistory, currState]
      if (newHistory.length > 50) newHistory.shift()
      historyRef.current = newHistory
      const targetIndex = Math.max(0, headIndex)
      historyIndexRef.current = targetIndex
      setHistory(newHistory)
      setHistoryIndex(targetIndex)
      setFrames(JSON.parse(newHistory[targetIndex]))
      return
    }

    if (headIndex > 0) {
      const newIndex = headIndex - 1
      historyIndexRef.current = newIndex
      setHistoryIndex(newIndex)
      setFrames(JSON.parse(currentHistory[newIndex]))
    }
  }, [])

  // Redo
  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      const newIndex = historyIndexRef.current + 1
      historyIndexRef.current = newIndex
      setHistoryIndex(newIndex)
      setFrames(JSON.parse(historyRef.current[newIndex]))
    }
  }, [])

  // Update elements in active frame (supports array or functional updater)
  const updateElements = useCallback((newElementsOrUpdater) => {
    setFrames(prev => prev.map(frame => {
      if (frame.id !== activeFrameId) return frame
      const current = frame.elements || []
      const next = typeof newElementsOrUpdater === 'function'
        ? newElementsOrUpdater(current)
        : newElementsOrUpdater
      return { ...frame, elements: next }
    }))
  }, [activeFrameId])

  // Add element to active frame
  const addElement = useCallback((element) => {
    saveToHistory()
    const position = snapPosition(element.x, element.y)
    const newElement = { ...element, ...position, id: generateElementId() }
    updateElements(prev => [...prev, newElement])
    setSelectedElementId(newElement.id)
    return newElement
  }, [updateElements, generateElementId, saveToHistory, snapPosition])

  // Update specific element
  const updateElement = useCallback((elementId, updates) => {
    updateElements(prev => prev.map(el => {
      if (el.id !== elementId) return el
      let resolvedUpdates = updates
      if (updates.x !== undefined || updates.y !== undefined) {
        const snapped = snapPosition(
          updates.x ?? el.x ?? 0,
          updates.y ?? el.y ?? 0
        )
        resolvedUpdates = { ...updates, x: snapped.x, y: snapped.y }
      }
      return { ...el, ...resolvedUpdates }
    }))
  }, [updateElements, snapPosition])

  // Refresh frame (force update to clear render artifacts)
  const refreshFrame = useCallback((frameId) => {
    setFrames(prev => prev.map(frame =>
      frame.id === frameId
        ? { ...frame, elements: [...frame.elements] }
        : frame
    ))
  }, [])

  // Sanitize frame
  const sanitizeFrame = useCallback(() => {}, [])

  // Delete element
  const deleteElement = useCallback((elementId) => {
    saveToHistory()
    updateElements(prev => prev.filter(el => el.id !== elementId))
    if (selectedElementId === elementId) {
      setSelectedElementId(null)
    }
  }, [updateElements, selectedElementId, saveToHistory])

  // Duplicate element
  const duplicateElement = useCallback((elementId) => {
    saveToHistory()
    let createdId = null
    updateElements(prev => {
      const element = prev.find(el => el.id === elementId)
      if (!element) return prev
      createdId = generateElementId()
      const newElement = {
        ...element,
        id: createdId,
        x: element.x + 20,
        y: element.y + 20
      }
      return [...prev, newElement]
    })
    if (createdId) {
      setSelectedElementId(createdId)
    }
  }, [updateElements, generateElementId, saveToHistory])

  // Copy element to clipboard
  const copyElement = useCallback((elementId) => {
    const element = elements.find(el => el.id === elementId)
    if (element) {
      const copy = { ...element }
      setClipboard(copy)
      clipboardRef.current = copy
    }
  }, [elements])

  // Paste element from clipboard
  const pasteElement = useCallback(() => {
    const src = clipboardRef.current
    if (src) {
      saveToHistory()
      const newId = generateElementId()
      const newElement = {
        ...src,
        id: newId,
        x: Math.min(src.x + 20, 1200),
        y: Math.min(src.y + 20, 680)
      }
      updateElements(prev => [...prev, newElement])
      setSelectedElementId(newId)
    }
  }, [updateElements, generateElementId, saveToHistory])

  // Move element
  const moveElement = useCallback((elementId, x, y) => {
    updateElement(elementId, { x, y })
  }, [updateElement])

  // Resize element
  const resizeElement = useCallback((elementId, width, height, x, y) => {
    updateElement(elementId, { width, height, x, y })
  }, [updateElement])

  // Frame operations
  const addFrame = useCallback((templateType = 'title', layout = null) => {
    saveToHistory()
    // Fix: Handle empty frames array to avoid -Infinity
    const maxId = frames.length > 0 ? Math.max(...frames.map(f => f.id)) : 0
    const newId = maxId + 1
    const newFrame = createDefaultFrame(newId, `Frame ${frames.length + 1}`, templateType)
    // If caller provides a layout (e.g. adjacent placement), bake it in
    if (layout) newFrame.layout = layout
    setFrames([...frames, newFrame])
    setActiveFrameId(newId)
  }, [frames, saveToHistory])

  const updateFrameTitle = useCallback((frameId, title) => {
    setFrames(prev => prev.map(frame =>
      frame.id === frameId
        ? { ...frame, title, preview: title }
        : frame
    ))
  }, [])

  const deleteFrame = useCallback((frameId) => {
    if (frames.length > 1) {
      saveToHistory()
      const newFrames = frames.filter(f => f.id !== frameId)
      setFrames(newFrames)
      if (activeFrameId === frameId) {
        setActiveFrameId(newFrames[0].id)
      }
    }
  }, [frames, activeFrameId, saveToHistory])

// Optional `layout` param: when provided, the duplicate is placed at that
  // exact canvas position. EditorPage uses this to find a non-overlapping
  // adjacent slot before calling. When omitted, the duplicate falls back to
  // its old behavior (inheriting source's layout, which may overlap).
  const duplicateFrame = useCallback((frameId, layout = null) => {
    saveToHistory()
    const frame = frames.find(f => f.id === frameId)
    if (frame) {
      // Fix: Handle empty frames array to avoid -Infinity
      const maxId = frames.length > 0 ? Math.max(...frames.map(f => f.id)) : 0
      const newId = maxId + 1
      const newFrame = {
        ...frame,
        id: newId,
        title: `${frame.title} (Copy)`,
        elements: frame.elements.map(el => ({ ...el, id: generateElementId() }))
      }
      // Apply caller-provided layout if any. Otherwise the duplicate inherits
      // frame.layout from the spread above (legacy behavior).
      if (layout) {
        newFrame.layout = layout
      }
      const index = frames.findIndex(f => f.id === frameId)
      const newFrames = [...frames]
      newFrames.splice(index + 1, 0, newFrame)
      setFrames(newFrames)
    }
  }, [frames, generateElementId, saveToHistory])

    const updateFrameBackgroundImage = useCallback((frameId, image) => {
    setFrames(prev => prev.map(frame =>
      frame.id === frameId
        ? { ...frame, backgroundImage: image }
        : frame
    ))
  }, [])

  const updateFrameBackground = useCallback((frameId, color) => {
    setFrames(prev => prev.map(frame =>
      frame.id === frameId
        ? { ...frame, backgroundColor: color }
        : frame
    ))
  }, [])

  // Update frame notes (for presenter view)
  const updateFrameNotes = useCallback((frameId, notes) => {
    setFrames(prev => prev.map(frame =>
      frame.id === frameId
        ? { ...frame, notes }
        : frame
    ))
  }, [])

  // Update frame transition
    const updateFrameLayout = useCallback((frameId, layout) => {
    setFrames(prev => prev.map(frame => 
      frame.id === frameId 
        ? { ...frame, layout: { ...(frame.layout || {}), ...layout } }
        : frame
    ))
  }, [])

  const updateFrameTransition = useCallback((frameId, transition) => {
    setFrames(prev => prev.map(frame =>
      frame.id === frameId
        ? { ...frame, transition }
        : frame
    ))
  }, [])

  // Reorder frames (drag and drop)
  const reorderFrames = useCallback((fromIndex, toIndex) => {
    saveToHistory()
    const newFrames = [...frames]
    const [removed] = newFrames.splice(fromIndex, 1)
    newFrames.splice(toIndex, 0, removed)
    setFrames(newFrames)
  }, [frames, saveToHistory])

  // Get elements of a specific frame (for presentation mode)
  const getFrameElements = useCallback((frameId) => {
    const frame = frames.find(f => f.id === frameId)
    return frame?.elements || []
  }, [frames])

  // Get frame by ID
  const getFrame = useCallback((frameId) => {
    return frames.find(f => f.id === frameId)
  }, [frames])

// Create new blank project
  const createNewProject = useCallback(() => {
    const blank = createBlankProject()
    setProjectTitle(blank.title)
    setHeader(blank.header || { ...DEFAULT_HEADER })
    setFrames(blank.frames)
    setActiveFrameId(1)
    setSelectedElementId(null)
    setHistory([])
    setHistoryIndex(-1)
    setIsBlankProject(true)
    // Clear autosave (both localStorage and IndexedDB for safety)
    localStorage.removeItem(AUTOSAVE_KEY)
    clearAutosave()
  }, [])

  // Load template into editor (from local data)
  const loadTemplate = useCallback((templateData) => {
    if (templateData && templateData.frames) {
      const normalizedFrames = normalizeFramesForCanvas(templateData.frames)
      if (normalizedFrames.length === 0) return
      // Clear autosave first so old edits don't persist
      localStorage.removeItem(AUTOSAVE_KEY)
      clearAutosave()
      setProjectTitle(templateData.title || 'Untitled Project')
      // Backwards-compat: templates saved before the Header feature won't have
      // a `header` field — fall back to the default placeholder.
      // Backwards-compat: bump any saved header with fontSize < 64 up to 64
      // so old projects look like new "heading" defaults.
      setHeader((() => {
        const h = templateData.header || { ...DEFAULT_HEADER }
        if (typeof h.fontSize === 'number' && h.fontSize < 64) h.fontSize = 64
        return h
      })())
      setFrames(normalizedFrames)
      setActiveFrameId(normalizedFrames[0]?.id || 1)
      setSelectedElementId(null)
      historyRef.current = [JSON.stringify(normalizedFrames)]
      historyIndexRef.current = 0
      setHistory(historyRef.current)
      setHistoryIndex(0)
      setIsBlankProject(false)
    }
  }, [])

  // Load template from backend API
  // This function fetches a PPT template converted to JSON from your backend
  // Expected API format: { id, title, slides: [{ id, backgroundColor, elements: [...] }] }
  const loadTemplateFromAPI = useCallback(async (templateId, apiBaseUrl = null) => {
    try {
      const baseUrl = apiBaseUrl || API_CONFIG.baseURL
      const token = localStorage.getItem(AUTH_CONFIG.tokenKey)
      const response = await fetch(`${baseUrl}/templates/${templateId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch template: ${response.status}`)
      }

      const apiData = await response.json()

      // Convert API format to EditorContext format if needed
      // Backend sends "slides", we use "frames"
      const rawFrames = (apiData.slides || apiData.frames || []).map((slide, index) => ({
        id: slide.id || index + 1,
        title: slide.title || `Slide ${index + 1}`,
        preview: slide.title || `Slide ${index + 1}`,
        backgroundColor: slide.backgroundColor || '#ffffff',
        notes: slide.notes || '',
        transition: slide.transition || 'fade',
        elements: (slide.elements || []).map((el, elIndex) => ({
          id: el.id || (index + 1) * 1000 + elIndex + 1,
          type: el.type || 'text',
          content: el.content || el.text || '',
          x: el.x || 0,
          y: el.y || 0,
          width: el.width || 200,
          height: el.height || 100,
          fontSize: el.fontSize || 24,
          fontWeight: el.fontWeight || 'normal',
          fontFamily: el.fontFamily || 'Inter',
          fontStyle: el.fontStyle || 'normal',
          textDecoration: el.textDecoration || 'none',
          textAlign: el.textAlign || 'left',
          color: el.color || '#333333',
          fill: el.fill || el.backgroundColor || '#4CAF50',
          src: el.src || el.imageUrl || '',
          shapeType: el.shapeType || 'rectangle',
          rotation: el.rotation || 0,
          opacity: el.opacity ?? 100,
          animation: el.animation || 'none',
          animationDelay: el.animationDelay || 0,
          borderWidth: el.borderWidth || 0,
          borderColor: el.borderColor || '#333333',
          borderRadius: el.borderRadius || 0,
          backgroundColor: el.backgroundColor || 'transparent',
        }))
      }))
      const frames = normalizeFramesForCanvas(rawFrames)

    // Update state with loaded template
      setProjectTitle(apiData.title || 'Loaded Template')
      // Header from API if present, else default placeholder.
      setHeader((() => {
        const h = apiData.header || { ...DEFAULT_HEADER }
        if (typeof h.fontSize === 'number' && h.fontSize < 64) h.fontSize = 64
        return h
      })())
      setFrames(frames)
      setActiveFrameId(frames[0]?.id || 1)
      setSelectedElementId(null)
      historyRef.current = [JSON.stringify(frames)]
      historyIndexRef.current = 0
      setHistory(historyRef.current)
      setHistoryIndex(0)
      setIsBlankProject(false)

      // Clear autosave since we loaded a new template
      localStorage.removeItem(AUTOSAVE_KEY)
      clearAutosave()

      return { success: true, template: apiData }
    } catch (error) {
      logger.error('Failed to load template from API:', error)
      return { success: false, error: error.message }
    }
  }, [])

// Export project data
  const exportProject = useCallback(() => {
    return {
      title: projectTitle,
      header,
      frames,
      createdAt: new Date().toISOString(),
      version: '1.0'
    }
  }, [projectTitle, header, frames])

  // Manual save
  const saveProject = useCallback(async () => {
    try {
      const data = {
        title: projectTitle,
        header,
        frames,
        savedAt: new Date().toISOString(),
      }
      // Use IndexedDB for manual save to avoid quota issues
      const success = await saveAutosave(data)
      if (success) {
        setLastSaved(new Date())
      }
      return success
    } catch (e) {
      logger.error('Save failed:', e)
      return false
    }
  }, [projectTitle, header, frames])

  // Clear autosave
  const clearAutosaveFromContext = useCallback(() => {
    localStorage.removeItem(AUTOSAVE_KEY)
    clearAutosave()
  }, [])

  // Add specific element types
  const addTextElement = useCallback((content = 'Click to edit text') => {
    return addElement({
      type: 'text',
      content,
      x: 100,
      y: 200,
      width: 400,
      height: 60,
      fontSize: 24,
      fontWeight: 'normal',
      fontFamily: 'Inter',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'left',
      color: '#1a1a1a',
      borderWidth: 0,
      borderColor: '#333333',
      borderRadius: 0,
      backgroundColor: 'transparent',
    })
  }, [addElement])

  const addShapeElement = useCallback((shapeType, customStyle = {}) => {
    const shapeStyles = {
      // Basic
      square: { width: 150, height: 150, fill: 'transparent', strokeWidth: 2, strokeColor: '#333333' },
      rectangle: { width: 200, height: 150, fill: 'transparent', strokeWidth: 2, strokeColor: '#333333' },
      circle: { width: 150, height: 150, fill: 'transparent', strokeWidth: 2, strokeColor: '#2196F3' },
      semicircle: { width: 150, height: 100, fill: 'transparent', strokeWidth: 2, strokeColor: '#4CAF50' },
      triangle: { width: 200, height: 150, fill: 'transparent', strokeWidth: 2, strokeColor: '#FF5722' },
      rightTriangle: { width: 200, height: 150, fill: 'transparent', strokeWidth: 2, strokeColor: '#FF9800' },
      parallelogram: { width: 200, height: 150, fill: 'transparent', strokeWidth: 2, strokeColor: '#E91E63' },
      diamond: { width: 150, height: 150, fill: 'transparent', strokeWidth: 2, strokeColor: '#00BCD4' },
      pentagon: { width: 120, height: 120, fill: 'transparent', strokeWidth: 2, strokeColor: '#8B5CF6' },
      hexagon: { width: 120, height: 100, fill: 'transparent', strokeWidth: 2, strokeColor: '#9C27B0' },
      octagon: { width: 120, height: 120, fill: 'transparent', strokeWidth: 2, strokeColor: '#7C3AED' },

      // Diagrams
      cylinder: { width: 120, height: 150, fill: 'transparent', strokeWidth: 2, strokeColor: '#607D8B' },
      chevronProcess: { width: 200, height: 120, fill: 'transparent', strokeWidth: 2, strokeColor: '#3F51B5' },
      shield: { width: 120, height: 150, fill: 'transparent', strokeWidth: 2, strokeColor: '#4CAF50' },
      waveFlag: { width: 180, height: 120, fill: 'transparent', strokeWidth: 2, strokeColor: '#FFC107' },
      folder: { width: 150, height: 120, fill: 'transparent', strokeWidth: 2, strokeColor: '#FF9800' },
      stickyNote: { width: 150, height: 150, fill: 'transparent', strokeWidth: 2, strokeColor: '#FFEB3B' },
      document: { width: 130, height: 160, fill: 'transparent', strokeWidth: 2, strokeColor: '#9E9E9E' },
      puzzle: { width: 140, height: 140, fill: 'transparent', strokeWidth: 2, strokeColor: '#E91E63' },

      // Arrows
      leftArrowBlock: { width: 180, height: 100, fill: '#333333', strokeWidth: 2, strokeColor: '#333333' },
      rightArrowBlock: { width: 180, height: 100, fill: '#333333', strokeWidth: 2, strokeColor: '#333333' },
      leftRightArrowBlock: { width: 200, height: 100, fill: '#333333', strokeWidth: 2, strokeColor: '#333333' },
      chevronArrowBlock: { width: 150, height: 100, fill: '#333333', strokeWidth: 2, strokeColor: '#333333' },
      pentagonArrowBlock: { width: 180, height: 100, fill: '#333333', strokeWidth: 2, strokeColor: '#333333' },

      // Accents
      crescent: { width: 120, height: 120, fill: 'transparent', strokeWidth: 2, strokeColor: '#795548' },
      star4: { width: 120, height: 120, fill: 'transparent', strokeWidth: 2, strokeColor: '#FFD700' },
      star: { width: 120, height: 120, fill: 'transparent', strokeWidth: 2, strokeColor: '#FFD700' },
      star6: { width: 120, height: 120, fill: 'transparent', strokeWidth: 2, strokeColor: '#FFD700' },
      star8: { width: 120, height: 120, fill: 'transparent', strokeWidth: 2, strokeColor: '#FFD700' },
      sun: { width: 130, height: 130, fill: 'transparent', strokeWidth: 2, strokeColor: '#FF5722' },
      teardrop: { width: 120, height: 150, fill: 'transparent', strokeWidth: 2, strokeColor: '#00BCD4' },
      ovalSpeech: { width: 180, height: 130, fill: 'transparent', strokeWidth: 2, strokeColor: '#4CAF50' },
      rectSpeech: { width: 180, height: 130, fill: 'transparent', strokeWidth: 2, strokeColor: '#4CAF50' },
      thoughtBubble: { width: 180, height: 140, fill: 'transparent', strokeWidth: 2, strokeColor: '#03A9F4' },
      cloud: { width: 150, height: 100, fill: 'transparent', strokeWidth: 2, strokeColor: '#3B82F6' },
      heart: { width: 120, height: 120, fill: 'transparent', strokeWidth: 2, strokeColor: '#EF4444' },
      cross: { width: 120, height: 120, fill: 'transparent', strokeWidth: 2, strokeColor: '#F44336' },
      flower: { width: 130, height: 130, fill: 'transparent', strokeWidth: 2, strokeColor: '#E91E63' },
      decagram: { width: 130, height: 130, fill: 'transparent', strokeWidth: 2, strokeColor: '#9C27B0' },
      roundedFlower: { width: 130, height: 130, fill: 'transparent', strokeWidth: 2, strokeColor: '#9E9E9E' },

      // Draw Lines
      line: { width: 200, height: 4, fill: 'transparent', strokeWidth: 2, strokeColor: '#333333' },
      arrow: { width: 200, height: 30, fill: '#333333', strokeWidth: 2, strokeColor: '#333333' },
      doubleArrow: { width: 200, height: 40, fill: '#333333', strokeWidth: 2, strokeColor: '#333333' },
      oval: { width: 200, height: 120, fill: 'transparent', strokeWidth: 2, strokeColor: '#333333' },
      roundedRectangle: { width: 200, height: 150, fill: 'transparent', strokeWidth: 2, strokeColor: '#333333', borderRadius: 16 },
      tallRectangle: { width: 120, height: 200, fill: 'transparent', strokeWidth: 2, strokeColor: '#333333' },
    }
    const style = shapeStyles[shapeType] || shapeStyles.rectangle

    return addElement({
      type: 'shape',
      shapeType,
      x: 200,
      y: 200,
      rotation: 0,
      opacity: 100,
      animation: 'none',
      animationDelay: 0,
      // Text support in shapes (PowerPoint-style)
      content: '',
      fontSize: 20,
      fontWeight: 'normal',
      fontFamily: 'Inter',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center',
      color: '#333333',
      ...style,
      ...customStyle
    })
  }, [addElement])

  const addImageElement = useCallback((src) => {
    return addElement({
      type: 'image',
      src,
      x: 150,
      y: 150,
      width: 300,
      height: 200,
      // Caption support for images
      caption: '',
      showCaption: false,
      captionFontSize: 14,
      captionColor: '#666666',
      captionFontFamily: 'Inter',
    })
  }, [addElement])

  const addIconElement = useCallback((iconType) => {
    return addElement({
      type: 'icon',
      iconType,
      x: 300,
      y: 250,
      width: 60,
      height: 60,
      color: '#2E7D32',
      // Text label support for icons
      content: '',
      fontSize: 14,
      fontWeight: 'normal',
      fontFamily: 'Inter',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'center',
      textColor: '#333333',
      showLabel: false, // Show label below icon
    })
  }, [addElement])

  const addTableElement = useCallback((rows = 3, cols = 3) => {
    return addElement({
      type: 'table',
      rows,
      cols,
      x: 100,
      y: 150,
      width: 400,
      height: 200,
      data: Array(rows).fill(null).map(() => Array(cols).fill('')),
      animation: 'none',
      animationDelay: 0,
    })
  }, [addElement])

  // Add video element (YouTube embed or uploaded)
  const addVideoElement = useCallback((videoUrl, isYouTube = false) => {
    let embedUrl = videoUrl
    if (isYouTube) {
      // Convert YouTube URL to embed format
      const videoId = videoUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)?.[1]
      if (videoId) {
        embedUrl = `https://www.youtube.com/embed/${videoId}`
      }
    }
    return addElement({
      type: 'video',
      src: embedUrl,
      isYouTube,
      x: 150,
      y: 150,
      width: 400,
      height: 225,
      autoplay: false,
      loop: false,
      muted: true,
      animation: 'none',
      animationDelay: 0,
    })
  }, [addElement])

  // Add audio element
  const addAudioElement = useCallback((audioUrl, title = 'Audio') => {
    return addElement({
      type: 'audio',
      src: audioUrl,
      title,
      x: 150,
      y: 300,
      width: 300,
      height: 60,
      autoplay: false,
      loop: false,
      animation: 'none',
      animationDelay: 0,
    })
  }, [addElement])

  // Add drawing/annotation element
  const addDrawingElement = useCallback((paths) => {
    return addElement({
      type: 'drawing',
      paths, // Array of path data with points, color, size
      x: 0,
      y: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    })
  }, [addElement])

  // Save presentation annotations to frames and commit to undo history
  const savePresentationAnnotations = useCallback((annotationsMap) => {
    if (!annotationsMap || typeof annotationsMap !== 'object') return false

    const hasAnyAnnotations = Object.values(annotationsMap).some(
      strokes => Array.isArray(strokes) && strokes.length > 0
    )
    if (!hasAnyAnnotations) return false

    // Push previous state to history first so undo reverts the drawing
    pushToHistory(framesRef.current)

    setFrames(prevFrames => {
      const nextFrames = prevFrames.map(frame => {
        const strokes = annotationsMap[frame.id]
        if (!Array.isArray(strokes) || strokes.length === 0) {
          return frame
        }

        // Convert normalized strokes (0..1) to slide-coordinate paths (1280x720)
        const paths = strokes.map(stroke => ({
          tool: stroke.tool || 'pen',
          color: stroke.color || '#1a73e8',
          size: stroke.size || 4,
          opacity: stroke.opacity ?? 1,
          points: (stroke.points || []).map(p => ({
            x: Math.round((p.x ?? 0) * CANVAS_WIDTH),
            y: Math.round((p.y ?? 0) * CANVAS_HEIGHT),
          })),
        }))

        const drawingElement = {
          id: generateElementId(),
          type: 'drawing',
          paths,
          x: 0,
          y: 0,
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
        }

        return {
          ...frame,
          elements: [...(frame.elements || []), drawingElement],
        }
      })

      // Push new state with drawings to history
      pushToHistory(nextFrames)
      return nextFrames
    })

    return true
  }, [pushToHistory, generateElementId])

  // Update element animation
  const updateElementAnimation = useCallback((elementId, animation, delay = 0) => {
    updateElement(elementId, { animation, animationDelay: delay })
  }, [updateElement])

  // Version History Functions
  const saveVersion = useCallback((versionName = '') => {
    const version = {
      id: Date.now(),
      name: versionName || `Version ${versionHistory.length + 1}`,
      timestamp: new Date().toISOString(),
      data: {
        title: projectTitle,
        frames: JSON.parse(JSON.stringify(frames)),
      }
    }
    const newHistory = [...versionHistory, version].slice(-MAX_VERSIONS)
    setVersionHistory(newHistory)
    // Use safe storage to handle quota errors
    if (!setToStorage(VERSION_HISTORY_KEY, newHistory)) {
      logger.warn('Version history storage quota may be exceeded - consider clearing old versions')
    }
    return version
  }, [projectTitle, frames, versionHistory])

  const loadVersion = useCallback((versionId) => {
    const version = versionHistory.find(v => v.id === versionId)
    if (version) {
      setProjectTitle(version.data.title)
      setFrames(version.data.frames)
      setActiveFrameId(version.data.frames[0]?.id || 1)
      setSelectedElementId(null)
      return true
    }
    return false
  }, [versionHistory])

  const deleteVersion = useCallback((versionId) => {
    const newHistory = versionHistory.filter(v => v.id !== versionId)
    setVersionHistory(newHistory)
    setToStorage(VERSION_HISTORY_KEY, newHistory)
  }, [versionHistory])

  // Load version history on mount using safe JSON parsing
  useEffect(() => {
    const saved = safeJSONParse(localStorage.getItem(VERSION_HISTORY_KEY), [])
    if (Array.isArray(saved)) {
      setVersionHistory(saved)
    }
  }, [])

  // Slide Master Functions
  const updateSlideMaster = useCallback((updates) => {
    setSlideMaster(prev => ({ ...prev, ...updates }))
  }, [])

  const applyMasterToAllSlides = useCallback(() => {
    saveToHistory()
    setFrames(prev => prev.map(frame => ({
      ...frame,
      backgroundColor: slideMaster.backgroundColor,
      elements: frame.elements.map(el => {
        if (el.type === 'text') {
          const isTitle = el.fontSize >= 30
          return {
            ...el,
            fontFamily: slideMaster.fontFamily,
            color: isTitle ? slideMaster.titleColor : slideMaster.bodyColor,
          }
        }
        return el
      })
    })))
  }, [slideMaster, saveToHistory])

  const applyMasterToCurrentSlide = useCallback(() => {
    saveToHistory()
    setFrames(prev => prev.map(frame => {
      if (frame.id !== activeFrameId) return frame
      return {
        ...frame,
        backgroundColor: slideMaster.backgroundColor,
        elements: frame.elements.map(el => {
          if (el.type === 'text') {
            const isTitle = el.fontSize >= 30
            return {
              ...el,
              fontFamily: slideMaster.fontFamily,
              color: isTitle ? slideMaster.titleColor : slideMaster.bodyColor,
            }
          }
          return el
        })
      }
}))
  }, [slideMaster, activeFrameId, saveToHistory])

  // Header (singleton project-level text). Setting `content` flips the
  // placeholder flag off so exports start including it.
  const updateHeader = useCallback((updates) => {
    setHeader((prev) => {
      const next = { ...prev, ...updates }
      if (Object.prototype.hasOwnProperty.call(updates, 'content')) {
        next.isPlaceholder = false
      }
      return next
    })
  }, [])

  // Bring element to front/back
  const bringToFront = useCallback((elementId) => {
    const element = elements.find(el => el.id === elementId)
    if (element) {
      saveToHistory()
      updateElements([...elements.filter(el => el.id !== elementId), element])
    }
  }, [elements, updateElements, saveToHistory])

  const sendToBack = useCallback((elementId) => {
    const element = elements.find(el => el.id === elementId)
    if (element) {
      saveToHistory()
      updateElements([element, ...elements.filter(el => el.id !== elementId)])
    }
  }, [elements, updateElements, saveToHistory])

  const value = {
    // Project
    projectTitle,
    setProjectTitle,
    header,
    updateHeader,
    exportProject,
    loadTemplate,
    loadTemplateFromAPI, // Load PPT template from backend
    createNewProject,
    saveProject,
    clearAutosave: clearAutosaveFromContext,
    lastSaved,
    isBlankProject,
    // Frames
    frames,
    setFrames,
    activeFrame,
    activeFrameId,
    setActiveFrameId,
    updateElements,
    addFrame,
    deleteFrame,
    duplicateFrame,
    updateFrameTitle,
    updateFrameBackgroundImage,
    updateFrameBackground,
    updateFrameNotes,
    updateFrameLayout,
      updateFrameTransition,
    reorderFrames,
    getFrameElements,
    getFrame,
    // Elements
    elements,
    selectedElement,
    selectedElementId,
    setSelectedElementId,
    addElement,
    updateElement,
    deleteElement,
    duplicateElement,
    moveElement,
    resizeElement,
    bringToFront,
    sendToBack,
    // Clipboard
    copyElement,
    pasteElement,
    clipboard,
    // History (Undo/Redo)
    undo,
    redo,
    commitHistory,
    canUndo: historyIndex > 0 || (history.length > 0 && history[history.length - 1] !== JSON.stringify(frames)), 
    canRedo: historyIndex < history.length - 1,
    // Zoom
    zoom,
    setZoom,
    // Grid
    gridEnabled,
    setGridEnabled,
    gridSize,
    setGridSize,
    snapToGrid,
    setSnapToGrid,
    // Element creators
    addTextElement,
    addShapeElement,
    addImageElement,
    addIconElement,
    addTableElement,
    addVideoElement,
    addAudioElement,
    addDrawingElement,
    savePresentationAnnotations,
    refreshFrame,
    sanitizeFrame,
    // Animation
    updateElementAnimation,
    // Version History
    versionHistory,
    saveVersion,
    loadVersion,
    deleteVersion,
    // Slide Master
    slideMaster,
    updateSlideMaster,
    applyMasterToAllSlides,
    applyMasterToCurrentSlide,
    // Drawing Mode
    isDrawingMode,
    setIsDrawingMode,
    drawingTool,
    setDrawingTool,
    drawingColor,
    setDrawingColor,
    drawingSize,
    setDrawingSize,
    // Speaker Notes
    showSpeakerNotes,
    setShowSpeakerNotes,
    // Editor Background
    editorBackground,
    setEditorBackground,
  }

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  )
}

export default EditorContext
