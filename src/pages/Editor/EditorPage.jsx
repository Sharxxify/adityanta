import { useState, useRef, useEffect, useCallback, useMemo, startTransition } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useEditor, ANIMATION_PRESETS, SLIDE_TRANSITIONS } from '../../context/EditorContext'
import { useApp } from '../../context/AppContext'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { parsePPTX } from '../../utils/pptxImport'
import logger from '../../utils/logger'
import EditorToolbar from '../../components/Toolbar/EditorToolbar'
import FramesPanel from '../../components/Sidebar/FramesPanelPrezi'
import { computeSnakePosition, HEADER_LAYOUT } from '../../utils/snakeLayout'
import TextToolbar from '../../components/Toolbar/TextToolbar'
import RightClickMenu from '../../components/ContextMenu/RightClickMenu'
import ShareDropdown from '../../components/Toolbar/ShareDropdown'
import KeyboardShortcutsModal from '../../components/Modal/KeyboardShortcutsModal'
import UpgradePlanModal from '../../components/Modal/UpgradePlanModal'
import VideoExportModal from '../../components/Modal/VideoExportModal'
import { templates as mockTemplates } from '../../utils/templateData'
import backgroundData from '../../utils/backgroundData.json'

const SLIDE_WIDTH = 1280
const SLIDE_HEIGHT = 720
const WORLD_PADDING = 220

const FRAME_GAP = 20
const FRAME_MIN_H = 80
// Background bounds (from PREZI_LAYOUT_PRESETS with 40px padding each side)
const BG_L = 20, BG_T = 80, BG_R = 2940, BG_B = 1190
// Free-drag bounds — the area within which the user can drag/resize frames.
// Much larger than the BG rectangle so the user isn't invisibly constrained
// to the initial Prezi layout area. Negative origins allow dragging to the
// left/top of the default layout too.
const DRAG_L = -3000, DRAG_T = -2000, DRAG_R = 6000, DRAG_B = 4000
// Hero frame — fixed central position (frame 0)
const HERO_LAYOUT = { x: 820, y: 220, width: 1280, height: 720 }
// Side areas flanking the hero, entirely within background bounds
const LEFT_AREA  = { x: 40,   y: 100, w: 760, h: 1070 } // between bg-left and hero
const RIGHT_AREA = { x: 2120, y: 100, w: 800, h: 1070 } // between hero-right and bg-right

const clampToBg = (layout) => layout

// Distribute N frames inside one side area, auto-choosing column count so
// frame height stays >= FRAME_MIN_H. All positions guaranteed within background.
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
const templateRuntimeCache = new Map()
const PREZI_LAYOUT_PRESETS = [
  { x: 820, y: 220, width: 1280, height: 720 },
  { x: 60, y: 120, width: 640, height: 360 },
  { x: 60, y: 580, width: 640, height: 360 },
  { x: 2260, y: 300, width: 640, height: 360 },
  { x: 2260, y: 790, width: 640, height: 360 },
]
const PREZI_FLOW_ORDER = [1, 2, 0, 3, 4]

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

const normalizeTopicForBackground = (topic) => {
  const value = `${topic || ''}`.trim().toLowerCase()
  const topicMap = {
    business: 'Business',
    economics: 'Economics',
    history: 'History',
    geography: 'Geography',
    science: 'Science',
    marketing: 'Marketing',
    'legal studies': 'Legal Studies',
    'political science': 'Political Science',
    'music and dance': 'Music and dance',
    'technology & computer subjects': 'Technology & Computer Subjects',
    'physical & skill subjects': 'Physical & Skill Subjects',
    mathematics: 'Maths',
    maths: 'Maths',
    math: 'Maths',
    finance: 'Finance',
    'financial markets management': 'Finance',
    'fine arts / painting': 'Fine Arts - Painting',
    'fine arts - painting': 'Fine Arts - Painting',
    generic: 'Generic',
    general: 'Generic',
  }
  return topicMap[value] || topic || 'Generic'
}

const TOPIC_PROFILES = {
  Science: {
    lens: 'scientific thinking',
    foundation: ['Define the core question', 'Form a clear hypothesis', 'Choose measurable variables'],
    methods: ['Use controlled experiments', 'Collect repeatable observations', 'Validate findings with evidence'],
    evidence: ['Lab result snapshots', 'Trend patterns over time', 'Interpretation with limitations'],
    action: ['Summarize findings', 'Recommend next experiments', 'Share conclusions clearly'],
  },
  Finance: {
    lens: 'financial decision-making',
    foundation: ['Set financial objective', 'Assess risk tolerance', 'Define key constraints'],
    methods: ['Compare cost-benefit options', 'Track performance indicators', 'Review cash-flow impact'],
    evidence: ['Revenue and margin trends', 'Scenario comparison outcomes', 'Risk-adjusted return insights'],
    action: ['Prioritize high-impact moves', 'Set monitoring cadence', 'Align stakeholders on targets'],
  },
  History: {
    lens: 'historical perspective',
    foundation: ['Set historical context', 'Identify key actors', 'Map timeline milestones'],
    methods: ['Analyze primary sources', 'Compare interpretations', 'Connect causes and consequences'],
    evidence: ['Source excerpts', 'Timeline inflection points', 'Contrasting viewpoints'],
    action: ['Synthesize key lessons', 'Relate to present day', 'Frame discussion questions'],
  },
  'Technology & Computer Subjects': {
    lens: 'technology implementation',
    foundation: ['Define user problem', 'Select practical architecture', 'Set success metrics'],
    methods: ['Prototype and test quickly', 'Measure performance and reliability', 'Iterate from user feedback'],
    evidence: ['Before/after benchmarks', 'Adoption and usage insights', 'Scalability observations'],
    action: ['Ship phased rollout plan', 'Mitigate technical risks', 'Track outcome metrics'],
  },
  Generic: {
    lens: 'structured storytelling',
    foundation: ['Clarify presentation objective', 'Define audience expectations', 'Outline key talking points'],
    methods: ['Use concise message blocks', 'Support with simple visuals', 'Sequence ideas logically'],
    evidence: ['Key observations', 'Examples or mini case', 'Measured outcomes'],
    action: ['Recap core message', 'Highlight next steps', 'Close with clear call-to-action'],
  },
}

const getTopicProfile = (topic) => {
  const normalized = normalizeTopicForBackground(topic)
  return TOPIC_PROFILES[normalized] || TOPIC_PROFILES.Generic
}

const buildPolishedTemplateFrames = (title, topic) => {
  const topicName = normalizeTopicForBackground(topic || 'Generic')
  const profile = getTopicProfile(topicName)
  const cleanTitle = `${title || ''}`.trim() || `${topicName} Presentation`
  const icons = ['lightning', 'check', 'star', 'thumbsUp', 'heart']

  const slides = [
    {
      title: cleanTitle,
      subtitle: `A focused roadmap for ${topicName.toLowerCase()} using ${profile.lens}.`,
      bullets: profile.foundation,
      badge: 'Overview',
      visual: 'Core idea snapshot',
    },
    {
      title: `${topicName}: Foundation`,
      subtitle: 'Build the base before moving into deeper analysis.',
      bullets: profile.foundation,
      badge: 'Foundation',
      visual: 'Key concepts map',
    },
    {
      title: `${topicName}: Method`,
      subtitle: 'How the work is done step by step with consistency.',
      bullets: profile.methods,
      badge: 'Method',
      visual: 'Process flow preview',
    },
    {
      title: `${topicName}: Evidence`,
      subtitle: 'What the data, examples, or outcomes are showing.',
      bullets: profile.evidence,
      badge: 'Evidence',
      visual: 'Insight board',
    },
    {
      title: `${topicName}: Conclusion & Next Steps`,
      subtitle: 'Convert insights into a practical action plan.',
      bullets: profile.action,
      badge: 'Action',
      visual: 'Execution checklist',
    },
  ]

  return slides.map((slide, index) => {
    const baseId = (index + 1) * 1000
    const bulletText = `• ${slide.bullets.join('\n• ')}`

    return {
      id: index + 1,
      title: slide.title,
      preview: index === 0 ? 'Overview' : slide.title,
      backgroundColor: '#ffffff',
      backgroundImage: null,
      layout: PREZI_LAYOUT_PRESETS[index] ? { ...PREZI_LAYOUT_PRESETS[index] } : undefined,
      notes: '',
      transition: 'fade',
      elements: [
        {
          id: baseId + 1,
          type: 'shape',
          shapeType: 'rectangle',
          x: 64,
          y: 56,
          width: 170,
          height: 44,
          fill: '#111827',
          strokeColor: '#111827',
          strokeWidth: 0,
          rotation: 0,
          opacity: 100,
        },
        {
          id: baseId + 2,
          type: 'text',
          content: slide.badge,
          x: 64,
          y: 56,
          width: 170,
          height: 44,
          fontSize: 18,
          fontWeight: 'bold',
          fontFamily: 'Inter',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'center',
          color: '#ffffff',
          borderWidth: 0,
          borderColor: '#111827',
          borderRadius: 0,
          backgroundColor: 'transparent',
          isPlaceholder: false,
        },
        {
          id: baseId + 3,
          type: 'text',
          content: slide.title,
          x: 64,
          y: 128,
          width: 760,
          height: 82,
          fontSize: 54,
          fontWeight: 'bold',
          fontFamily: 'Inter',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'left',
          color: '#111827',
          borderWidth: 0,
          borderColor: '#111827',
          borderRadius: 0,
          backgroundColor: 'transparent',
          isPlaceholder: false,
        },
        {
          id: baseId + 4,
          type: 'text',
          content: slide.subtitle,
          x: 64,
          y: 220,
          width: 760,
          height: 62,
          fontSize: 25,
          fontWeight: 'normal',
          fontFamily: 'Inter',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'left',
          color: '#374151',
          borderWidth: 0,
          borderColor: '#374151',
          borderRadius: 0,
          backgroundColor: 'transparent',
          isPlaceholder: false,
        },
        {
          id: baseId + 5,
          type: 'text',
          content: bulletText,
          x: 76,
          y: 318,
          width: 700,
          height: 280,
          fontSize: 26,
          fontWeight: 'normal',
          fontFamily: 'Inter',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'left',
          color: '#111827',
          borderWidth: 0,
          borderColor: '#111827',
          borderRadius: 0,
          backgroundColor: 'transparent',
          isPlaceholder: false,
        },
        {
          id: baseId + 6,
          type: 'shape',
          shapeType: 'rectangle',
          x: 860,
          y: 140,
          width: 360,
          height: 450,
          fill: '#f3f4f6',
          strokeColor: '#d1d5db',
          strokeWidth: 2,
          rotation: 0,
          opacity: 100,
        },
        {
          id: baseId + 7,
          type: 'icon',
          iconType: icons[index] || 'check',
          x: 988,
          y: 250,
          width: 104,
          height: 104,
          color: '#111827',
          rotation: 0,
        },
        {
          id: baseId + 8,
          type: 'text',
          content: slide.visual,
          x: 888,
          y: 376,
          width: 300,
          height: 58,
          fontSize: 24,
          fontWeight: '600',
          fontFamily: 'Inter',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'center',
          color: '#4b5563',
          borderWidth: 0,
          borderColor: '#4b5563',
          borderRadius: 0,
          backgroundColor: 'transparent',
          isPlaceholder: false,
        },
      ],
    }
  })
}

const EditorPage = () => {
  const navigate = useNavigate()
  const { templateId } = useParams()
  const location = useLocation()
  // Background chosen in template modal, passed via navigate state
  const pendingBgRef = useRef(location.state?.selectedBackground ?? null)
  const canvasRef = useRef(null)
  const autoSaveTimerRef = useRef(null)
  const projectTitleRef = useRef(null)
  const currentProjectIdRef = useRef(null)
  const hasAutoNamedRef = useRef(false)
  const presentDropdownRef = useRef(null)
  const visibilityDropdownRef = useRef(null)
  const toast = useToast()
  const { user } = useAuth()
  const [isBookmarked, setIsBookmarked] = useState(false)

  const getDisplayUserName = (value) => {
    const resolved = [value?.name, value?.displayName, value?.username, value?.full_name, value?.fullName].find((v) => typeof v === 'string' && v.trim())
    if (resolved) return resolved.trim()
    const email = `${value?.email || ''}`.trim()
    if (email.includes('@')) return email.split('@')[0]
    return 'Guest User'
  }
  const userName = getDisplayUserName(user)
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'GU'

  // Get editor context
  const {
    projectTitle,
    setProjectTitle,
    frames,
    activeFrame,
    activeFrameId,
    setActiveFrameId,
    addFrame,
    deleteFrame,
    duplicateFrame,
    reorderFrames,
    updateFrameTitle,
    updateFrameBackgroundImage,
    updateFrameNotes,
    updateFrameBackground,
    updateFrameTransition,
    updateFrameLayout,
    elements,
    selectedElement,
    selectedElementId,
    setSelectedElementId,
    updateElement,
    deleteElement,
    duplicateElement,
    moveElement,
    resizeElement,
    copyElement,
    pasteElement,
    bringToFront,
    sendToBack,
    undo,
    redo,
    commitHistory,
    canUndo,
    canRedo,
    zoom,
    setZoom,
    addTextElement,
    addShapeElement,
    addImageElement,
    addIconElement,
    addTableElement,
    addVideoElement,
    addAudioElement,
    addDrawingElement,
    updateElementAnimation,
    loadTemplate,
    createNewProject,
    exportProject,
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
    // Auto-save
    lastSaved,
    header,
    updateHeader,
  } = useEditor()

  const { templates: apiTemplates, saveProject: saveToUserFiles, getProject, userFiles, isUserFilesLoaded, downloadTemplate } = useApp()

  const allTemplates = useMemo(() => {
    return [...(apiTemplates || []), ...mockTemplates]
  }, [apiTemplates])

  const projectTopic = useMemo(() => {
    const tpl = allTemplates.find(t => t.template_id === templateId)
    if (tpl?.topic) return tpl.topic
    const proj = isUserFilesLoaded ? getProject(templateId) : null
    return proj?.topic || null
  }, [templateId, allTemplates, isUserFilesLoaded, getProject])

  const defaultEditorBg = useMemo(() => {
    const topic = normalizeTopicForBackground(projectTopic || 'Generic')
    const bgs = backgroundData[topic] || backgroundData['Generic'] || []
    if (bgs.length === 0) return null

    const stableSeed = `${templateId || ''}|${projectTopic || topic}`
    const hash = [...stableSeed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    return bgs[hash % bgs.length]
  }, [projectTopic, templateId])

  const editorBgImage = editorBackground !== undefined ? editorBackground : defaultEditorBg

  useEffect(() => {
    if (editorBackground === undefined && defaultEditorBg !== null) {
      setEditorBackground(defaultEditorBg)
    }
  }, [editorBackground, defaultEditorBg, setEditorBackground])

  // Local UI state
  const [editingTextId, setEditingTextId] = useState(null)
  const [showMediaDropdown, setShowMediaDropdown] = useState(false)
  const [showShareDropdown, setShowShareDropdown] = useState(false)
  const [showTextToolbar, setShowTextToolbar] = useState(false)
  const [selectionFormatting, setSelectionFormatting] = useState({})
  const editableDivRef = useRef(null)
  const savedRangeRef = useRef(null)

  const convertRunsToHtml = (runs) => {
    if (!runs || runs.length === 0) return ''
    return runs.map(run => {
      if (run.text === '\n') return '<br>'
      
      const styles = []
      if (run.fontSize) styles.push(`font-size:${run.fontSize}px`)
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

  const rgbToHex = (rgb) => {
    if (!rgb) return '#1a1a1a'
    const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)
    if (!match) return rgb
    const r = parseInt(match[1]).toString(16).padStart(2, '0')
    const g = parseInt(match[2]).toString(16).padStart(2, '0')
    const b = parseInt(match[3]).toString(16).padStart(2, '0')
    return `#${r}${g}${b}`
  }

  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      const activeEl = document.activeElement
      if (activeEl && activeEl.isContentEditable && activeEl.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range
      }
    }
  }

  const restoreSelection = () => {
    if (savedRangeRef.current) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current)
    }
  }

  const updateSelectionFormatting = () => {
    const sel = window.getSelection()
    if (!sel.rangeCount) return

    const range = sel.getRangeAt(0)
    let node = range.startContainer
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentNode
    }

    const editableEl = document.querySelector('[data-text-editable="true"]') || editableDivRef.current
    if (editableEl && editableEl.contains(node)) {
      const computedStyle = window.getComputedStyle(node)
      setSelectionFormatting({
        fontSize: parseFloat(computedStyle.fontSize) || 16,
        fontWeight: computedStyle.fontWeight === 'bold' || parseInt(computedStyle.fontWeight) >= 700 ? 'bold' : 'normal',
        fontStyle: computedStyle.fontStyle === 'italic' ? 'italic' : 'normal',
        textDecoration: computedStyle.textDecoration.includes('underline') ? 'underline' : 'none',
        color: rgbToHex(computedStyle.color),
        fontFamily: computedStyle.fontFamily.replace(/['"]/g, '').split(',')[0].trim(),
      })
    }
  }

  const applyStyleToSelection = (updates) => {
    restoreSelection()
    
    try {
      document.execCommand('styleWithCSS', false, true)
    } catch (e) {}

    Object.keys(updates).forEach(key => {
      const val = updates[key]
      if (key === 'fontWeight') {
        document.execCommand('bold', false, null)
      } else if (key === 'fontStyle') {
        document.execCommand('italic', false, null)
      } else if (key === 'textDecoration') {
        document.execCommand('underline', false, null)
      } else if (key === 'color') {
        document.execCommand('foreColor', false, val)
      } else if (key === 'fontFamily') {
        document.execCommand('fontName', false, val)
      } else if (key === 'fontSize') {
        const selection = window.getSelection()
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          const span = document.createElement('span')
          span.style.fontSize = typeof val === 'number' ? `${val}px` : val
          
          if (range.collapsed) {
            try {
              span.appendChild(document.createTextNode('\u200B'))
              range.insertNode(span)
              
              const newRange = document.createRange()
              newRange.setStart(span.firstChild, 1)
              newRange.setEnd(span.firstChild, 1)
              selection.removeAllRanges()
              selection.addRange(newRange)
            } catch (err) {
              console.error('Failed to set font size on collapsed range:', err)
            }
          } else {
            try {
              const fragment = range.extractContents()
              span.appendChild(fragment)
              range.insertNode(span)
              
              const newRange = document.createRange()
              newRange.selectNodeContents(span)
              selection.removeAllRanges()
              selection.addRange(newRange)
            } catch (err) {
              console.error('Failed to set font size on selection:', err)
            }
          }
        }
      }
    })

    const activeEl = document.querySelector('[data-text-editable="true"]') || editableDivRef.current
    if (activeEl && activeEl.isContentEditable) {
      updateElement(selectedElementId, {
        content: activeEl.innerHTML,
        runs: null,
      })
      activeEl.focus()
    }
  }

  useEffect(() => {
    if (!editingTextId) return

    const handleSelectionChange = () => {
      saveSelection()
      updateSelectionFormatting()
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [editingTextId])

  useEffect(() => {
    if (editingTextId && editableDivRef.current) {
      const el = editableDivRef.current
      el.focus()
      
      try {
        const range = document.createRange()
        const sel = window.getSelection()
        range.selectNodeContents(el)
        range.collapse(false) // collapse to end
        sel.removeAllRanges()
        sel.addRange(range)
        savedRangeRef.current = range
      } catch (err) {
        console.error('Failed to focus/set cursor:', err)
      }
    }
  }, [editingTextId])

  // Header (singleton project-level text) selection + inline-edit state
  const [headerSelected, setHeaderSelected] = useState(false)
  const [headerEditing, setHeaderEditing] = useState(false)
  // Ref to the live header textarea so the click-outside handler can
  // commit its value before React unmounts the textarea.
  const headerTextareaRef = useRef(null)
// Click anywhere outside the header (or its toolbar) → commit any in-progress
  // text edit and deselect it. Critical: we must read the textarea's value and
  // save it BEFORE unmounting (setHeaderEditing(false)), because mousedown fires
  // before the textarea's onBlur — so without this manual commit, typed text
  // would be lost when the user clicks outside.
  useEffect(() => {
    if (!headerSelected) return
    const handler = (e) => {
      if (e.target.closest('[data-header-element]')) return
      if (e.target.closest('.text-toolbar') || e.target.closest('[data-text-toolbar]')) return

      // If currently editing, grab the textarea's value and persist it now.
      if (headerEditing && headerTextareaRef.current) {
        const next = headerTextareaRef.current.value
        if (!next.trim()) {
          updateHeader({ content: 'Add a Header text', isPlaceholder: true })
        } else {
          updateHeader({ content: next })
        }
      }
      setHeaderSelected(false)
      setHeaderEditing(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [headerSelected, headerEditing, updateHeader])

  // Selecting any frame element should deselect the header (mutually exclusive)
  useEffect(() => {
    if (selectedElementId) {
      setHeaderSelected(false)
      setHeaderEditing(false)
    }
  }, [selectedElementId])
  const [contextMenu, setContextMenu] = useState(null)
  const [showShapeOptions, setShowShapeOptions] = useState(false)
  const [showIconOptions, setShowIconOptions] = useState(false)
  const [showTableOptions, setShowTableOptions] = useState(false)
  const [tableGridHover, setTableGridHover] = useState({ rows: 0, cols: 0 })
  const [templateGradient, setTemplateGradient] = useState(null)
  const [templateThumbnailUrl, setTemplateThumbnailUrl] = useState(null)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showSlideMaster, setShowSlideMaster] = useState(false)
  const [showAnimationPanel, setShowAnimationPanel] = useState(false)
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [showVideoExportModal, setShowVideoExportModal] = useState(false)
  const [showWebImageModal, setShowWebImageModal] = useState(false)
  const [webImageQuery, setWebImageQuery] = useState('')
  const [webImageResults, setWebImageResults] = useState([])
  const [isSearchingWebImage, setIsSearchingWebImage] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [rightPanelTab, setRightPanelTab] = useState('properties') // properties, design, notes
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)
  const [isFrameFocused, setIsFrameFocused] = useState(true)
  const [editorMode, setEditorMode] = useState('overview')
 // Navigation transition duration — persisted across editor sessions
  const NAV_SPEED_KEY = 'adityanta_nav_speed_ms'
  const [navSpeedMs, setNavSpeedMs] = useState(() => {
    try {
      const saved = localStorage.getItem(NAV_SPEED_KEY)
      const num = Number(saved)
      if (Number.isFinite(num) && num >= 300 && num <= 3000) return num
    } catch (_e) { /* localStorage unavailable */ }
    return 1500
  })

  // Persist navigation speed whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(NAV_SPEED_KEY, String(navSpeedMs))
    } catch (_e) { /* ignore quota errors */ }
  }, [navSpeedMs])
  const [bgSearchFilter, setBgSearchFilter] = useState('')
  const [isAnimationPreview, setIsAnimationPreview] = useState(false)
  const [animationKey, setAnimationKey] = useState(0) // Used to restart animations
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedTime, setLastSavedTime] = useState(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const isInitialLoadRef = useRef(true)
  const [currentProjectId, setCurrentProjectId] = useState(null)
  const [hasAutoNamed, setHasAutoNamed] = useState(false)
  const [showPresentDropdown, setShowPresentDropdown] = useState(false)
  const [projectVisibility, setProjectVisibility] = useState('public')
  const [showVisibilityDropdown, setShowVisibilityDropdown] = useState(false)
  const [fitZoom, setFitZoom] = useState(100)
  const [camera, setCamera] = useState({ zoom: 0.75, panX: 0, panY: 0 })

  // Keep refs in sync for autosave closure (must be after state declarations)
  projectTitleRef.current = projectTitle
  currentProjectIdRef.current = currentProjectId
  hasAutoNamedRef.current = hasAutoNamed

  const inFlightTemplateRef = useRef({ id: null, promise: null })
  const hasInitializedCameraRef = useRef(false)
  const pendingFocusModeRef = useRef(null)
  const didFrameDragRef = useRef(false)
  // Ref so Ctrl+S in the keyboard effect always calls the latest handleSaveProject
  // without adding it to the deps array (handleSaveProject is declared further down)
  const saveProjectRef = useRef(null)

  // Drawing state
  const drawingCanvasRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentPath, setCurrentPath] = useState([])
  const [drawingPaths, setDrawingPaths] = useState([])

  // Track if template has been loaded to prevent re-loading
  // Using state instead of ref so it resets properly with React StrictMode
  const [templateLoaded, setTemplateLoaded] = useState(false)
  const [isTemplateLoading, setIsTemplateLoading] = useState(false)

  // Track unsaved changes
  useEffect(() => {
    if (isTemplateLoading) {
      isInitialLoadRef.current = true;
      return;
    }
    if (isInitialLoadRef.current && frames && frames.length > 0) {
      isInitialLoadRef.current = false;
      return;
    }
    if (!isInitialLoadRef.current) {
      setHasUnsavedChanges(true);
    }
  }, [frames, isTemplateLoading])

  // Drag-drop for images
  const [isDragOver, setIsDragOver] = useState(false)

  // Drag state
  const [isDragging, setIsDragging] = useState(false)
  const [isDragPending, setIsDragPending] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [elementStart, setElementStart] = useState({ x: 0, y: 0 })

  // Pan (grab) state
  const [isPanning, setIsPanning] = useState(false)
  const [isDraggingPan, setIsDraggingPan] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 })

  // Resize state
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState(null)
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0, elemX: 0, elemY: 0 })

  const [draggingFrameId, setDraggingFrameId] = useState(null)
  const [frameDragStart, setFrameDragStart] = useState({ x: 0, y: 0, frameX: 0, frameY: 0, frameW: 0, frameH: 0 })

  // Frame resize state
  const [isResizingFrame, setIsResizingFrame] = useState(false)
  const [frameResizeHandle, setFrameResizeHandle] = useState(null)
  const [frameResizeStart, setFrameResizeStart] = useState({ x: 0, y: 0, frameX: 0, frameY: 0, frameW: 0, frameH: 0, frameId: null })

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

  const interFrameConnectors = useMemo(() => buildInterFrameConnectors(frameMapLayout), [frameMapLayout])

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

  const activeFrameLayout = frameMapLayout.find((f) => f.id === activeFrameId) || { x: 400, y: 200, width: 640, height: 400 }

  // Background bounds are FIXED — always based on the initial PREZI_LAYOUT_PRESETS,
  // so the background image never grows when new frames are added.
  const frameBackgroundBounds = useMemo(() => {
    if (!frames.length) return null
    const padding = 40
    const minX = Math.min(...PREZI_LAYOUT_PRESETS.map((p) => p.x))
    const minY = Math.min(...PREZI_LAYOUT_PRESETS.map((p) => p.y))
    const maxX = Math.max(...PREZI_LAYOUT_PRESETS.map((p) => p.x + p.width))
    const maxY = Math.max(...PREZI_LAYOUT_PRESETS.map((p) => p.y + p.height))
    return {
      x: minX - padding,
      y: minY - padding,
      width: (maxX - minX) + padding * 2,
      height: (maxY - minY) + padding * 2,
    }
  }, [frames.length])

  // Ensure frames are always initialized - safety fallback
  useEffect(() => {
    if (frames.length === 0 && templateId !== 'new' && !templateLoaded) {
      logger.warn('EditorPage: Frames are empty, initializing with blank frame')
      // Pick a random background from the project topic
      const blankFrame = {
        id: 1,
        title: 'Slide 1',
        preview: 'Slide 1',
        backgroundColor: 'transparent',
        backgroundImage: null,
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
            fontSize: 40,
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
          },
          {
            id: 1002,
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
            textAlign: 'center',
            color: '#666666',
            isPlaceholder: true,
            borderWidth: 0,
            borderColor: '#333333',
            borderRadius: 0,
            backgroundColor: 'transparent',
          }
        ]
      }
      loadTemplate({ title: 'Presentation', frames: [blankFrame] })
      logger.info('EditorPage: Blank frame initialized')
    }
  }, [frames.length])

  // Keep slide fully visible in viewport area (no canvas scrolling)
  useEffect(() => {
    const updateFitZoom = () => {
      if (!canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      // Keep the full 16:9 slide visible between the side panels without adding scrollbars.
      const availableWidth = Math.max(360, rect.width - 12)
      const availableHeight = Math.max(260, rect.height - 60)
      const nextFit = Math.min(
        175,
        (availableWidth / SLIDE_WIDTH) * 100,
        (availableHeight / SLIDE_HEIGHT) * 100
      )
      setFitZoom(Math.max(50, Math.floor(nextFit)))
    }

    updateFitZoom()
    const observer = new ResizeObserver(updateFitZoom)
    if (canvasRef.current) observer.observe(canvasRef.current)
    window.addEventListener('resize', updateFitZoom)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateFitZoom)
    }
  }, [])

  // Auto-fit: always match fitZoom so slide fills available space without scrollbar
  useEffect(() => {
    setZoom(fitZoom)
  }, [fitZoom, setZoom])

  // Debounce syncing camera.zoom to EditorContext zoom to prevent performance lag during wheel zoom
  useEffect(() => {
    const handler = setTimeout(() => {
      setZoom(Math.round(camera.zoom * 100))
    }, 150)
    return () => clearTimeout(handler)
  }, [camera.zoom, setZoom])

  // Load template or user file on mount if templateId exists
  useEffect(() => {
    // Skip if already loaded
    if (templateLoaded) return
    if (!templateId || templateId === 'new') return

    if (templateId === 'prezi-demo') {
      import('../../utils/templateData').then(() => {
        const polishedFrames = buildPolishedTemplateFrames('Prezi Drag & Drop Demo', 'Generic')
        loadTemplate({ title: 'Prezi Drag & Drop Demo', frames: polishedFrames })
        setProjectTitle('Prezi Drag & Drop Demo')
        setTemplateLoaded(true)
        setIsTemplateLoading(false)
      })
      return
    }

    if (!isUserFilesLoaded) return
    if (inFlightTemplateRef.current.id === templateId && inFlightTemplateRef.current.promise) return

    let cancelled = false
    setIsTemplateLoading(true)

    // First, check if this is a saved user file (user file IDs are numeric timestamps)
    const userFile = getProject(templateId)

    logger.info('EditorPage: Loading templateId:', templateId, 'userFile:', !!userFile)

   if (userFile && Array.isArray(userFile.frames) && userFile.frames.length > 0) {
      setTemplateLoaded(true)
      setIsTemplateLoading(false)
      loadTemplate({ title: userFile.title, frames: userFile.frames })
      setProjectTitle(userFile.title)
      setTemplateGradient(userFile.thumbnail || null)
      setTemplateThumbnailUrl(userFile.thumbnailUrl || null)
      if ('editorBgImage' in userFile) {
        setEditorBackground(userFile.editorBgImage)
      } else {
        setEditorBackground(undefined)
      }
      setCurrentProjectId(userFile.id)
      try { localStorage.removeItem('adityanta_autosave') } catch (_e) { /* noop */ }
      return
    }

    // Not a user file → load template from backend
    // Clear autosave to prevent stale data
    localStorage.removeItem('adityanta_autosave')

    const loadFromBackend = async () => {
      try {
        logger.info('[TEMPLATE] Calling downloadTemplate for:', templateId)
        const result = await downloadTemplate(templateId)

        if (cancelled) return

        logger.info('[TEMPLATE] downloadTemplate response:', {
          success: result?.success,
          hasS3Url: !!result?.s3_file_url,
          templateTitle: result?.template?.title,
          error: result?.error
        })

        if (!result?.success) {
          logger.error('[TEMPLATE] Download failed:', result?.error)
          if (result?.error_code === 'DOWNLOAD_LIMIT_EXCEEDED') {
            toast.error('Download limit exceeded. Upgrade to premium for unlimited downloads.')
          }
          return null
        }

        // Backend returns s3_file_url → fetch PPTX from S3 and parse it
        if (result.s3_file_url) {
          logger.info('[TEMPLATE] Fetching PPTX from S3...')
          const pptxResponse = await fetch(result.s3_file_url)

          if (cancelled) return

          if (!pptxResponse.ok) {
            logger.error('[TEMPLATE] S3 fetch failed:', pptxResponse.status)
            return null
          }

          const pptxBlob = await pptxResponse.blob()
          logger.info('[TEMPLATE] PPTX blob size:', pptxBlob.size)

          if (pptxBlob.size === 0) {
            logger.error('[TEMPLATE] Empty PPTX blob!')
            return null
          }

          // Use the real template title from backend for the filename so parsePPTX gets a meaningful fallback
          const realTitle = result.template?.title || 'Presentation'
          const pptxFile = new File([pptxBlob], `${realTitle}.pptx`, {
            type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          })

          logger.info('[TEMPLATE] Parsing PPTX...')
          const parsed = await parsePPTX(pptxFile)
          logger.info('[TEMPLATE] Parsed! Title:', parsed.title, 'Slides:', parsed.frames?.length)

          if (cancelled) return

          if (parsed.frames && parsed.frames.length > 0) {
            // Prefer backend title over PPTX metadata title (which is often generic)
            return {
              title: result.template?.title || parsed.title || 'Presentation',
              frames: parsed.frames,
              topic: result.template?.topic || null,
              gradient: null,
              thumbnailUrl: result.template?.thumbnail_url || null
            }
          }
        }

        return null
      } catch (error) {
        logger.error('[TEMPLATE] Error loading template:', error)
        return null
      }
    }

    const requestPromise = loadFromBackend().then((templateData) => {
      if (cancelled) return

      setTemplateLoaded(true)
      setIsTemplateLoading(false)

      if (templateData) {
        // Successfully loaded template from backend
        const parsedFrames = (templateData.frames && templateData.frames.length > 0)
          ? templateData.frames
          : buildPolishedTemplateFrames(
              templateData.title,
              templateData.topic || projectTopic || 'Generic'
            )
        console.log('[TEMPLATE] SUCCESS - Loading polished deck:', parsedFrames.length, 'slides')
        templateRuntimeCache.set(templateId, { ...templateData, frames: parsedFrames })
        setProjectTitle(templateData.title)
        setTemplateGradient(templateData.gradient)
        setTemplateThumbnailUrl(templateData.thumbnailUrl)
        // Apply background chosen in modal (if any), otherwise use topic default
        const bgToApply = pendingBgRef.current
        pendingBgRef.current = null
        if (bgToApply !== null) {
          // Bake the chosen background into every frame
          const framesWithBg = parsedFrames.map(f => ({ ...f, backgroundImage: bgToApply }))
          loadTemplate({ title: templateData.title, frames: framesWithBg })
          setEditorBackground(bgToApply)
        } else {
          loadTemplate({ title: templateData.title, frames: parsedFrames })
          setEditorBackground(undefined)
        }
      } else {
        // Failed to load from backend → create fallback slides
        console.warn('[TEMPLATE] FALLBACK - Creating placeholder slides')
        toast.info('Loading template with default layout. Edit to customize!')

        // Find template title from API templates if available
        const apiTemplate = allTemplates.find(t => t.template_id === templateId)
        const fallbackTitle = apiTemplate?.title || 'Presentation'
        const projectTopic = apiTemplate?.topic || 'Generic'
        const fallbackFrames = buildPolishedTemplateFrames(fallbackTitle, projectTopic)

        setProjectTitle(fallbackTitle)
        setTemplateGradient(null)
        setTemplateThumbnailUrl(apiTemplate?.thumbnail_url || null)
        // Apply background chosen in modal (if any), otherwise use topic default
        const fallbackBgToApply = pendingBgRef.current
        pendingBgRef.current = null
        if (fallbackBgToApply !== null) {
          const framesWithBg = fallbackFrames.map(f => ({ ...f, backgroundImage: fallbackBgToApply }))
          loadTemplate({ title: fallbackTitle, frames: framesWithBg })
          setEditorBackground(fallbackBgToApply)
        } else {
          loadTemplate({ title: fallbackTitle, frames: fallbackFrames })
          setEditorBackground(undefined)
        }
      }
    })
    inFlightTemplateRef.current = { id: templateId, promise: requestPromise }

    return () => {
      cancelled = true
      if (inFlightTemplateRef.current.id === templateId) {
        inFlightTemplateRef.current = { id: null, promise: null }
      }
    }
  }, [templateId, templateLoaded, isUserFilesLoaded, getProject, loadTemplate, downloadTemplate, apiTemplates, projectTopic, toast, setProjectTitle])


  // Keyboard shortcuts - PowerPoint-like
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when editing text or typing in any input/textarea/select
      const tag = document.activeElement?.tagName?.toLowerCase()
      const isTypingInInput = tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable
      if (editingTextId && e.key !== 'Escape') return
      if (isTypingInInput && !editingTextId && e.key !== 'Escape') return

      // #12 — Save (Ctrl+S) — uses saveProjectRef to avoid TDZ with handleSaveProject
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveProjectRef.current?.()
        return
      }

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
          toast.info('Redo')
        } else {
          undo()
          toast.info('Undo')
        }
      }

      // Redo alternative (Ctrl+Y)
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        redo()
        toast.info('Redo')
      }

      // Copy (Ctrl+C)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedElementId) {
        e.preventDefault()
        copyElement(selectedElementId)
        toast.info('Copied to clipboard')
      }



      // Cut (Ctrl+X)
      if ((e.ctrlKey || e.metaKey) && e.key === 'x' && selectedElementId) {
        e.preventDefault()
        copyElement(selectedElementId)
        deleteElement(selectedElementId)
        toast.info('Cut to clipboard')
      }

      // Duplicate (Ctrl+D)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedElementId) {
        e.preventDefault()
        duplicateElement(selectedElementId)
        toast.success('Element duplicated')
      }

      // #12 — Select All (Ctrl+A): select the last element or could show a hint
      // Full multi-select is complex; for now we select the last element and show hint
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !editingTextId) {
        e.preventDefault()
        if (elements.length > 0) {
          setSelectedElementId(elements[elements.length - 1].id)
          toast.info(`${elements.length} element(s) on slide`)
        }
      }

      // Delete/Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId && !editingTextId) {
        e.preventDefault()
        deleteElement(selectedElementId)
      }

      // Escape - deselect
      if (e.key === 'Escape') {
        if (editingTextId) {
          setEditingTextId(null)
        } else if (selectedElementId) {
          setSelectedElementId(null)
          setShowTextToolbar(false)
        }
      }

      // Enter - start editing text
      if (e.key === 'Enter' && selectedElement?.type === 'text' && !editingTextId) {
        e.preventDefault()
        if (selectedElement.isPlaceholder) {
          updateElement(selectedElement.id, { content: '', isPlaceholder: false, textAlign: 'left' })
        }
        setEditingTextId(selectedElement.id)
      }

      // Arrow keys - nudge element
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedElementId && !editingTextId) {
        e.preventDefault()
        const nudgeAmount = e.shiftKey ? 10 : 1 // Hold Shift for larger nudge
        const element = elements.find(el => el.id === selectedElementId)
        if (element) {
          let newX = element.x
          let newY = element.y
          if (e.key === 'ArrowUp') newY -= nudgeAmount
          if (e.key === 'ArrowDown') newY += nudgeAmount
          if (e.key === 'ArrowLeft') newX -= nudgeAmount
          if (e.key === 'ArrowRight') newX += nudgeAmount
          moveElement(selectedElementId, Math.max(0, newX), Math.max(0, newY))
        }
      }

      // Bring to Front (Ctrl+Shift+])
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === ']' && selectedElementId) {
        e.preventDefault()
        bringToFront(selectedElementId)
        toast.info('Brought to front')
      }

      // Send to Back (Ctrl+Shift+[)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '[' && selectedElementId) {
        e.preventDefault()
        sendToBack(selectedElementId)
        toast.info('Sent to back')
      }

      // Text formatting shortcuts (only when a text element is selected)
      if (selectedElement?.type === 'text' && !editingTextId) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
          e.preventDefault()
          updateElement(selectedElementId, { fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold' })
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
          e.preventDefault()
          updateElement(selectedElementId, { fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic' })
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
          e.preventDefault()
          updateElement(selectedElementId, { textDecoration: selectedElement.textDecoration === 'underline' ? 'none' : 'underline' })
        }
      }

      // #12 — New Slide (Ctrl+M or Ctrl+Shift+N)
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault()
        pendingFocusModeRef.current = 'frame'
        addFrame()
        toast.success('New slide added')
      }

      // Present (F5)
      if (e.key === 'F5') {
        e.preventDefault()
        navigate(`/present/${templateId || 'new'}`)
      }

      // Show shortcuts modal
      if (e.key === '?' || e.key === 'F1') {
        e.preventDefault()
        setShowShortcutsModal(true)
      }

      // Space to pan
      if (e.code === 'Space' && !editingTextId) {
        e.preventDefault()
        setIsPanning(true)
      }
    }

    const handleKeyUp = (e) => {
      if (e.code === 'Space' && !editingTextId) {
        setIsPanning(false)
      }
    }

    const handlePaste = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      const isTypingInInput = tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable
      if (editingTextId || isTypingInInput) return

      // Prevent default to stop browser from doing unexpected things
      e.preventDefault()

      const items = e.clipboardData?.items || []
      let foundImage = false
      
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (!blob) continue
          const reader = new FileReader()
          reader.onload = (ev) => {
            addImageElement(ev.target.result, 400, 300)
            toast.success('Image pasted from clipboard')
          }
          reader.readAsDataURL(blob)
          foundImage = true
          break
        }
      }
      
      if (!foundImage) {
        // Fall back to internal element clipboard (shapes, text boxes, etc.)
        pasteElement()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    document.addEventListener('paste', handlePaste)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('paste', handlePaste)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementId, selectedElement, editingTextId, elements, undo, redo, copyElement, pasteElement, deleteElement, duplicateElement, setSelectedElementId, moveElement, bringToFront, sendToBack, addFrame, updateElement, setEditingTextId, navigate, templateId, toast])

  const handleContextMenu = (e) => {
    e.preventDefault()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    })
  }

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showShapeOptions || showIconOptions || showTableOptions) {
        const dropdown = document.querySelector('.dropdown-options')
        if (dropdown && !dropdown.contains(e.target)) {
          setShowShapeOptions(false)
          setShowIconOptions(false)
          setShowTableOptions(false)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showShapeOptions, showIconOptions, showTableOptions])

  // Close present/visibility dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (showPresentDropdown && presentDropdownRef.current && !presentDropdownRef.current.contains(e.target)) {
        setShowPresentDropdown(false)
      }
      if (showVisibilityDropdown && visibilityDropdownRef.current && !visibilityDropdownRef.current.contains(e.target)) {
        setShowVisibilityDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPresentDropdown, showVisibilityDropdown])

  const RANDOM_NAMES = [
    'Amber Cascade', 'Sapphire Heights', 'Golden Meridian', 'Crimson Horizon',
    'Indigo Summit', 'Emerald Drift', 'Cobalt Zenith', 'Ivory Crest',
    'Scarlet Peak', 'Violet Haven', 'Teal Expanse', 'Onyx Pinnacle',
    'Coral Surge', 'Slate Odyssey', 'Jade Circuit', 'Obsidian Voyage',
    'Azure Canopy', 'Russet Skyline', 'Mint Chronicle', 'Copper Solstice',
    'Sienna Loft', 'Cerulean Atlas', 'Mauve Equinox', 'Dusk Mosaic',
  ]

  const generateRandomName = useCallback(() => {
    return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]
  }, [])

  // Save project to Your Files
  const handleSaveProject = useCallback(() => {
    setIsSaving(true)
    try {
      const projectData = {
        id: currentProjectId,
        title: projectTitle || 'Untitled Presentation',
        frames: frames,
        templateId: templateId,
        thumbnail: templateGradient || 'from-blue-400 to-purple-600',
        editorBgImage: editorBgImage,
      }
      const savedFile = saveToUserFiles(projectData)
      if (savedFile && savedFile.id) {
        setCurrentProjectId(savedFile.id)
        // Mark template as loaded so that the URL change below does NOT cause
        // the load-on-mount effect to re-run and reset our current editor
        // state (history, frames, active frame, etc.).
        setTemplateLoaded(true)
        // Sync the URL to the saved project's id. Without this, a project
        // saved from /editor/new stays on that URL; reloading or returning
        // via browser back loses the work.
        const savedIdStr = String(savedFile.id)
        if (templateId !== savedIdStr) {
          navigate(`/editor/${savedIdStr}`, { replace: true })
        }
      }
      setLastSavedTime(new Date())
      setHasUnsavedChanges(false)
      toast.success('Project saved to Your Files!')
      return savedFile
    } catch (error) {
      logger.error('Save error:', error)
      toast.error('Failed to save project')
      return null
    } finally {
      setIsSaving(false)
    }
  }, [currentProjectId, projectTitle, frames, templateId, templateGradient, editorBgImage, saveToUserFiles, toast, navigate])
  // Keep saveProjectRef always pointing to the latest version (used by keyboard shortcut effect above)
  saveProjectRef.current = handleSaveProject

  // Back / Home navigation — always save first so no work is lost
  const handleGoHome = useCallback(() => {
    try {
      handleSaveProject()
    } catch (e) {
      logger.error('Pre-navigation save failed', e)
    }
    navigate('/home')
  }, [handleSaveProject, navigate])

  // Debounced auto-save: triggers 30s after the last frame change.
  // Previous implementation broke because it wrote ALL user files to
  // localStorage every 4s, exceeding the ~5MB quota. This new version
  // uses the existing handleSaveProject() which writes to IndexedDB
  // (essentially unlimited storage). We suppress the toast for auto-saves.
  useEffect(() => {
    // Don't auto-save until the project has been loaded / is ready.
    if (!frames || frames.length === 0) return
    // Don't auto-save while a template is still loading.
    if (isTemplateLoading) return

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)

    autoSaveTimerRef.current = setTimeout(() => {
      try {
        const projectData = {
          id: currentProjectIdRef.current,
          title: projectTitleRef.current || 'Untitled Presentation',
          frames: frames,
          templateId: templateId,
          thumbnail: templateGradient || 'from-blue-400 to-purple-600',
          editorBgImage: editorBgImage,
        }
        const savedFile = saveToUserFiles(projectData)
        if (savedFile && savedFile.id) {
          setCurrentProjectId(savedFile.id)
          setTemplateLoaded(true)
          const savedIdStr = String(savedFile.id)
          if (templateId !== savedIdStr) {
            navigate(`/editor/${savedIdStr}`, { replace: true })
          }
        }
        setLastSavedTime(new Date())
        setHasUnsavedChanges(false)
        logger.info('Auto-saved project')
      } catch (error) {
        logger.error('Auto-save failed:', error)
      }
    }, 30000) // 30 seconds after last change

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [frames, templateId, templateGradient, editorBgImage, saveToUserFiles, navigate, isTemplateLoading])

  const handlePresent = () => {
    navigate(`/present/${templateId || 'new'}`)
  }

  // Pan / Wheel State
  const isTransitioningRef = useRef(false);
  const transitionTimeoutRef = useRef(null);
  const [isNavigating, setIsNavigating] = useState(false); // Used to disable CSS transition

  const handlePanStart = (e) => {
    // middle click (button 1) or isPanning (hand tool) always pan
    // left-click drag only pans when nothing is selected
    // Stylus (pointerType === 'pen') fires PointerEvents; the synthetic
    // MouseEvent from the browser usually works, but touch-action:none on
    // the canvas + dual listeners below make it reliable.
    const canPan = e.button === 1 || isPanning || (!selectedElementId && e.button === 0)
    if (canPan) {
      e.preventDefault()
      setIsDraggingPan(true)
      setIsNavigating(true)
      setPanStart({
        x: e.clientX,
        y: e.clientY,
        cameraPanX: camera.panX,
        cameraPanY: camera.panY,
      })
    }
  }

  const handleWheel = (e) => {
    // React's onWheel is passive, so preventDefault here is a best-effort
    // (we also attach a native non-passive listener below for real prevention).
    if (showVersionHistory || showShortcutsModal || showSlideMaster || showAnimationPanel) return;

    // Disable transition — smooth fast response while wheeling
    setIsNavigating(true);
    if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
    transitionTimeoutRef.current = setTimeout(() => setIsNavigating(false), 120);

    if (e.ctrlKey || e.metaKey) {
      // Zoom always works regardless of selection
      // Trackpads emit many high-frequency events with small deltaY values (usually < 40).
      // Mouse wheels emit discrete ticks (usually >= 100).
      const isTrackpad = Math.abs(e.deltaY) < 40;
      const ZOOM_SENSITIVITY = isTrackpad ? 0.024 : 0.0025;
      
      let rect = null;
      let screenX = 0;
      let screenY = 0;
      if (canvasRef.current) {
        rect = canvasRef.current.getBoundingClientRect();
        screenX = e.clientX - rect.left;
        screenY = e.clientY - rect.top;
      }
      const originX = worldBounds.width / 2;
      const originY = worldBounds.height / 2;

      setCamera(prev => {
        const factor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
        const newZoom = Math.min(Math.max(0.05, prev.zoom * factor), 15.0);
        
        if (rect) {
          return {
            zoom: newZoom,
            panX: prev.panX + (screenX - originX) * (1 / newZoom - 1 / prev.zoom),
            panY: prev.panY + (screenY - originY) * (1 / newZoom - 1 / prev.zoom)
          };
        }
        return { ...prev, zoom: newZoom };
      });
    } else {
      // Pan — only when no element is selected
      if (selectedElementId) return;
      setCamera(prev => ({
        ...prev,
        panX: prev.panX - e.deltaX / prev.zoom,
        panY: prev.panY - e.deltaY / prev.zoom,
      }));
    }
  }

  useEffect(() => {
    const handlePanMove = (e) => {
      if (!isDraggingPan) return
      const dx = (e.clientX - panStart.x) / camera.zoom
      const dy = (e.clientY - panStart.y) / camera.zoom

      setCamera(prev => ({
        ...prev,
        panX: panStart.cameraPanX + dx,
        panY: panStart.cameraPanY + dy
      }))
    }

    const handlePanEnd = (e) => {
      if (e.button !== 1 && e.button !== 0 && !isPanning) return; // allow middle or left click to end pan
      if (isDraggingPan) {
        setIsDraggingPan(false)
        setIsNavigating(false)
      }
    }

    window.addEventListener('mousemove', handlePanMove)
    window.addEventListener('mouseup', handlePanEnd)
    // Pointer events for stylus / pen-tablet support
    window.addEventListener('pointermove', handlePanMove)
    window.addEventListener('pointerup', handlePanEnd)
    return () => {
      window.removeEventListener('mousemove', handlePanMove)
      window.removeEventListener('mouseup', handlePanEnd)
      window.removeEventListener('pointermove', handlePanMove)
      window.removeEventListener('pointerup', handlePanEnd)
    }
  }, [isDraggingPan, panStart, camera.zoom, isPanning])

  // Attach a NATIVE non-passive wheel listener so we can preventDefault on
  // ctrl/meta+wheel (trackpad pinch-zoom). React's synthetic onWheel is
  // passive by default, which means preventDefault there is a no-op and the
  // browser proceeds to zoom the whole page. This listener runs before
  // React and stops the default page-zoom behaviour.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const blockPageZoom = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
      }
    }
    el.addEventListener('wheel', blockPageZoom, { passive: false })
    return () => el.removeEventListener('wheel', blockPageZoom)
  }, [])

  // Handle placeholder click - clear placeholder text when editing starts
  const handlePlaceholderEdit = useCallback((element) => {
    if (element.isPlaceholder) {
      // Clear content, remove placeholder flag, and change alignment to left for typing
      updateElement(element.id, { content: '', isPlaceholder: false, textAlign: 'left' })
    }
    setEditingTextId(element.id)
  }, [updateElement])

  const handleElementClick = (element, e) => {
    e.stopPropagation()
    setSelectedElementId(element.id)
    setRightPanelTab('properties')
    // Auto-expand the right panel when something is selected (context-aware)
    setRightPanelCollapsed(false)
    setIsFrameFocused(true)
    if (element.type === 'text' || element.type === 'shape') {
      setShowTextToolbar(true)
      if (element.type === 'text' && element.isPlaceholder) {
        handlePlaceholderEdit(element)
      }
    } else {
      setShowTextToolbar(false)
    }
  }

  const handleElementDoubleClick = (element, e) => {
    e.stopPropagation()
    if (element.type === 'text') {
      handlePlaceholderEdit(element)
    } else if (element.type === 'shape' || element.type === 'icon') {
      // Enable text editing for shapes and icons (PowerPoint-style)
      setEditingTextId(element.id)
      setSelectedElementId(element.id)
    } else if (element.type === 'image' && element.showCaption) {
      // Enable caption editing for images
      setEditingTextId(element.id)
      setSelectedElementId(element.id)
    }
  }

 const handleCanvasClick = (e) => {
    // #11 — Clicking on empty canvas background must clear ALL selection.
    // We detect "empty background" as: the click target is NOT inside any
    // frame wrapper. Every frame outer div is tagged with data-frame="true",
    // so `closest('[data-frame]')` returns null when the click happened on
    // the scaled-world background OR on the canvas-area itself.
    const clickedOnFrame = e.target.closest('[data-frame="true"]')
    if (!clickedOnFrame) {
      setSelectedElementId(null)
      setShowTextToolbar(false)
      setEditingTextId(null)
      // Clear the active-frame FOCUS (visual deselect only — keep activeFrameId
      // internally so editing flows still know which frame is "current").
      // Also minimise the right panel, matching PowerPoint/Keynote behaviour.
      setIsFrameFocused(false)
      setRightPanelCollapsed(true)
    }
  }

  // #06 — Double-click on empty canvas background creates a text element at click position
  const handleCanvasDoubleClick = (e) => {
    // Only trigger on the actual canvas background
    if (e.target !== e.currentTarget && !e.target.classList.contains('canvas-area')) return
    e.preventDefault()
    e.stopPropagation()
    // Convert screen coords to canvas-local coords
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    // Find the active frame layout to compute position inside the frame
    const layout = frameMapLayout.find(f => f.id === activeFrameId)
    if (!layout) return
    // Compute world coords from screen coords
    const viewportW = rect.width
    const viewportH = rect.height
    const originX = worldBounds.width / 2
    const originY = worldBounds.height / 2
    // Reverse the transform: screen -> world
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top
    // The transform is: scale(zoom) translate(panX, panY) with origin at center
    // worldPt = (screenPt - viewportCenter) / zoom + worldOrigin - pan
    const worldX = (screenX - viewportW / 2) / camera.zoom + originX - camera.panX
    const worldY = (screenY - viewportH / 2) / camera.zoom + originY - camera.panY
    // Convert world coords to element coords within the active frame
    const frameScale = layout.width / SLIDE_WIDTH
    const elX = Math.max(10, Math.min(SLIDE_WIDTH - 410, (worldX - layout.x) / frameScale))
    const elY = Math.max(10, Math.min(SLIDE_HEIGHT - 70, (worldY - layout.y) / frameScale))
    // Create a new text element at this position
    const newEl = addTextElement('Type here')
    if (newEl) {
      updateElement(newEl.id, { x: Math.round(elX), y: Math.round(elY) })
      setEditingTextId(newEl.id)
      setSelectedElementId(newEl.id)
      setShowTextToolbar(true)
    }
  }

  // Drag handlers

  // #02 — Track original z-index of dragged frame for proper layering
  const [draggedFrameZBoost, setDraggedFrameZBoost] = useState(null)

  const handleFrameDragStart = (e, frameBox) => {
    if (e.button !== 0) return // only left click
    e.stopPropagation()
    didFrameDragRef.current = false
    setDraggingFrameId(frameBox.id)
    setDraggedFrameZBoost(frameBox.id) // #02 — boost z-index while dragging
    setFrameDragStart({
      x: e.clientX,
      y: e.clientY,
      frameX: frameBox.x,
      frameY: frameBox.y,
      frameW: frameBox.width,
      frameH: frameBox.height
    })
  }

  const handleFrameDragMove = useCallback((e) => {
    if (!draggingFrameId) return
    const deltaX = (e.clientX - frameDragStart.x) / camera.zoom
    const deltaY = (e.clientY - frameDragStart.y) / camera.zoom
    // Mark as real drag if moved more than 4px
    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      didFrameDragRef.current = true
    }
    updateFrameLayout(draggingFrameId, {
      x: Math.max(DRAG_L, Math.min(frameDragStart.frameX + deltaX, DRAG_R - frameDragStart.frameW)),
      y: Math.max(DRAG_T, Math.min(frameDragStart.frameY + deltaY, DRAG_B - frameDragStart.frameH)),
      width: frameDragStart.frameW,
      height: frameDragStart.frameH
    })
  }, [draggingFrameId, frameDragStart, camera.zoom, updateFrameLayout])

  const handleFrameDragEnd = useCallback(() => {
    setDraggingFrameId(null)
    setDraggedFrameZBoost(null) // #02 — restore z-index on drop
  }, [])

  const handleFrameResizeStart = (e, handle, frameBox) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    setIsResizingFrame(true)
    setFrameResizeHandle(handle)
    setFrameResizeStart({
      x: e.clientX,
      y: e.clientY,
      frameX: frameBox.x,
      frameY: frameBox.y,
      frameW: frameBox.width,
      frameH: frameBox.height,
      frameId: frameBox.id,
    })
  }

  const handleFrameResizeMove = useCallback((e) => {
    if (!isResizingFrame || !frameResizeHandle) return
    const dx = (e.clientX - frameResizeStart.x) / camera.zoom
    const dy = (e.clientY - frameResizeStart.y) / camera.zoom

    // Minimum frame dimensions to keep content legible (16:9 ≥ 160×90)
    const MIN_W = 80
    const MIN_H = 45
    const aspect = 16 / 9

    let x = frameResizeStart.frameX
    let y = frameResizeStart.frameY
    let w = frameResizeStart.frameW
    let h = frameResizeStart.frameH

    if (frameResizeHandle.includes('e')) w = Math.max(MIN_W, w + dx)
    if (frameResizeHandle.includes('s')) h = Math.max(MIN_H, h + dy)
    if (frameResizeHandle.includes('w')) {
      const d = Math.min(dx, w - MIN_W)
      x = x + d; w = w - d
    }
    if (frameResizeHandle.includes('n')) {
      const d = Math.min(dy, h - MIN_H)
      y = y + d; h = h - d
    }

    // Enforce 16:9 aspect ratio — choose constraining axis based on handle direction
    const isHoriz = frameResizeHandle.includes('e') || frameResizeHandle.includes('w')
    const isVert  = frameResizeHandle.includes('n') || frameResizeHandle.includes('s')
    if (isHoriz && isVert) {
      // Diagonal: drive by whichever delta is larger
      if (Math.abs(dx) >= Math.abs(dy)) {
        h = w / aspect
      } else {
        w = h * aspect
      }
    } else if (isHoriz) {
      h = w / aspect
    } else {
      w = h * aspect
    }

    // Secondary floor: after ratio enforcement both dims must still satisfy minimum
    if (w < MIN_W) { w = MIN_W; h = w / aspect }
    if (h < MIN_H) { h = MIN_H; w = h * aspect }

    // Clamp to expanded free-drag bounds (not the small background rectangle).
    // This lets users position and resize frames anywhere in the generous
    // working area instead of being constrained to the initial Prezi layout.
    x = Math.max(DRAG_L, x); y = Math.max(DRAG_T, y)
    w = Math.min(w, DRAG_R - x); h = Math.min(h, DRAG_B - y)
    updateFrameLayout(frameResizeStart.frameId, { x, y, width: Math.round(w), height: Math.round(h) })
  }, [isResizingFrame, frameResizeHandle, frameResizeStart, camera.zoom, updateFrameLayout])

  const handleFrameResizeEnd = useCallback(() => {
    setIsResizingFrame(false)
    setFrameResizeHandle(null)
    commitHistory()
  }, [commitHistory])


  const dragPendingRef = useRef(null)
  const DRAG_THRESHOLD = 4 // pixels before drag actually starts

  const handleDragStart = (e, element) => {
    if (editingTextId === element.id) return
    e.stopPropagation()
    // Store pending drag info — actual drag starts only after threshold
    dragPendingRef.current = { x: e.clientX, y: e.clientY, element }
    setIsDragPending(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setElementStart({ x: element.x, y: element.y })
  }

  const handleDragMove = useCallback((e) => {
    // Check if we have a pending drag that hasn't crossed threshold yet
    if (dragPendingRef.current && !isDragging) {
      const dx = e.clientX - dragPendingRef.current.x
      const dy = e.clientY - dragPendingRef.current.y
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        setIsDragging(true)
        setSelectedElementId(dragPendingRef.current.element.id)
      }
      return
    }
    if (!isDragging || !selectedElementId) return

    const scaleFactor = camera.zoom * (activeFrameLayout.width / SLIDE_WIDTH);
    const deltaX = (e.clientX - dragStart.x) / scaleFactor;
    const deltaY = (e.clientY - dragStart.y) / scaleFactor;

    moveElement(selectedElementId,
      Math.max(0, elementStart.x + deltaX),
      Math.max(0, elementStart.y + deltaY)
    )
  }, [isDragging, selectedElementId, dragStart, elementStart, camera.zoom, activeFrameLayout.width, moveElement, setSelectedElementId])

  const handleDragEnd = useCallback(() => {
    dragPendingRef.current = null
    setIsDragPending(false)
    setIsDragging(false)
  }, [])

  // Resize handlers
  const handleResizeStart = (e, handle, element) => {
    e.stopPropagation()
    e.preventDefault()
    setIsResizing(true)
    setResizeHandle(handle)
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: element.width,
      height: element.height,
      elemX: element.x,
      elemY: element.y
    })
  }

  const handleResizeMove = useCallback((e) => {
    if (!isResizing || !selectedElementId || !resizeHandle) return

    const scaleFactor = camera.zoom * (activeFrameLayout.width / SLIDE_WIDTH);
    const deltaX = (e.clientX - resizeStart.x) / scaleFactor;
    const deltaY = (e.clientY - resizeStart.y) / scaleFactor;

    let newWidth = resizeStart.width
    let newHeight = resizeStart.height
    let newX = resizeStart.elemX
    let newY = resizeStart.elemY

    if (resizeHandle.includes('e')) {
      newWidth = Math.max(50, resizeStart.width + deltaX)
    }
    if (resizeHandle.includes('w')) {
      newWidth = Math.max(50, resizeStart.width - deltaX)
      newX = resizeStart.elemX + deltaX
    }
    if (resizeHandle.includes('s')) {
      newHeight = Math.max(30, resizeStart.height + deltaY)
    }
    if (resizeHandle.includes('n')) {
      newHeight = Math.max(30, resizeStart.height - deltaY)
      newY = resizeStart.elemY + deltaY
    }

    resizeElement(selectedElementId, newWidth, newHeight, newX, newY)
  }, [isResizing, selectedElementId, resizeHandle, resizeStart, camera.zoom, activeFrameLayout.width, resizeElement])

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false)
    setResizeHandle(null)
  }, [])

  // Mouse move/up for drag and resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragPending || isDragging) handleDragMove(e)
      if (isResizing) handleResizeMove(e)
      if (draggingFrameId) handleFrameDragMove(e)
      if (isResizingFrame) handleFrameResizeMove(e)
    }

    const handleMouseUp = () => {
      if (isDragPending || isDragging) {
        const didDrag = isDragging
        handleDragEnd()
        if (didDrag) commitHistory()
      }
      if (isResizing) handleResizeEnd()
      if (draggingFrameId) { handleFrameDragEnd(); commitHistory() }
      if (isResizingFrame) handleFrameResizeEnd()
    }

    if (isDragPending || isDragging || isResizing || draggingFrameId || isResizingFrame) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      // Pointer events for stylus / pen-tablet support
      document.addEventListener('pointermove', handleMouseMove)
      document.addEventListener('pointerup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.removeEventListener('pointermove', handleMouseMove)
        document.removeEventListener('pointerup', handleMouseUp)
      }
    }
  }, [isDragPending, isDragging, isResizing, handleDragMove, handleDragEnd, handleResizeMove, handleResizeEnd, handleFrameDragMove, handleFrameDragEnd, draggingFrameId, isResizingFrame, handleFrameResizeMove, handleFrameResizeEnd])

  // Handle text content change
  const handleTextChange = (elementId, newContent) => {
    const currentElement = elements.find((el) => el.id === elementId)
    if (!currentElement || currentElement.type !== 'text') {
      updateElement(elementId, { content: newContent })
      return
    }
    
    let fontSize = Number(currentElement.fontSize) || 16

    // If we are about to clear rich-text runs, adopt the dominant font size 
    // (weighted by text length) so body text doesn't blow up to the heading's size.
    if (currentElement.runs && currentElement.runs.length > 0) {
      const counts = {}
      let maxCount = 0
      currentElement.runs.forEach(r => {
        const sz = Number(r.fontSize) || fontSize
        const len = (r.text || '').length
        counts[sz] = (counts[sz] || 0) + len
        if (counts[sz] > maxCount) {
          maxCount = counts[sz]
          fontSize = sz
        }
      })
    }

    const usableWidth = Math.max(40, (Number(currentElement.width) || 120) - 12)
    const avgCharWidth = Math.max(4, fontSize * 0.55)
    const maxCharsPerLine = Math.max(8, Math.floor(usableWidth / avgCharWidth))
    const lineCount = String(newContent || '')
      .split('\n')
      .reduce((sum, line) => sum + Math.max(1, Math.ceil((line.length || 1) / maxCharsPerLine)), 0)
    const neededHeight = Math.ceil(lineCount * fontSize * 1.35 + 12)

    updateElement(elementId, {
      content: newContent,
      runs: null,
      fontSize: fontSize,
      height: Math.max(Number(currentElement.height) || 50, neededHeight),
    })
  }

  // Add image handler
  const handleAddImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (event) => {
          addImageElement(event.target.result)
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
  }

  // Drag and drop for images
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (event) => {
          addImageElement(event.target.result)
        }
        reader.readAsDataURL(file)
      } else if (file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file)
        addVideoElement(url, false)
        toast.success('Video added')
      } else if (file.type.startsWith('audio/')) {
        const url = URL.createObjectURL(file)
        addAudioElement(url, file.name)
        toast.success('Audio added')
      }
    })
  }

  // Add video handler
  const handleAddVideo = () => {
    setShowVideoModal(true)
  }

  const handleVideoSubmit = () => {
    if (videoUrl.trim()) {
      const isYouTube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')
      addVideoElement(videoUrl, isYouTube)
      setVideoUrl('')
      setShowVideoModal(false)
      toast.success('Video added')
    }
  }

  // Add audio handler
  const handleAddAudio = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (file) {
        const url = URL.createObjectURL(file)
        addAudioElement(url, file.name)
        toast.success('Audio added')
      }
    }
    input.click()
  }

  // Drawing handlers
  const handleDrawingStart = (e) => {
    if (!isDrawingMode) return
    const rect = drawingCanvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setIsDrawing(true)
    const x = (e.clientX - rect.left) / (zoom / 100)
    const y = (e.clientY - rect.top) / (zoom / 100)
    setCurrentPath([{ x, y }])
  }

  const handleDrawingMove = (e) => {
    if (!isDrawing || !isDrawingMode) return
    const rect = drawingCanvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (e.clientX - rect.left) / (zoom / 100)
    const y = (e.clientY - rect.top) / (zoom / 100)
    setCurrentPath(prev => [...prev, { x, y }])
  }

  const handleDrawingEnd = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    if (currentPath.length > 1) {
      const newPath = {
        points: currentPath,
        color: drawingTool === 'highlighter' ? drawingColor + '80' : drawingColor,
        size: drawingTool === 'highlighter' ? drawingSize * 3 : drawingSize,
        tool: drawingTool,
      }
      setDrawingPaths(prev => [...prev, newPath])
    }
    setCurrentPath([])
  }

  const clearDrawings = () => {
    setDrawingPaths([])
  }

  const saveDrawingAsElement = () => {
    if (drawingPaths.length > 0) {
      addDrawingElement(drawingPaths)
      setDrawingPaths([])
      setIsDrawingMode(false)
      toast.success('Drawing saved')
    }
  }

  // Context menu actions
  const handleContextMenuAction = (action, data) => {
    switch (action) {
      case 'paste':
        pasteElement()
        break
      case 'text':
        addTextElement()
        break
      case 'image':
        handleAddImage()
        break
      case 'shape':
        setShowShapeOptions(true)
        break
      case 'table':
        addTableElement()
        break
      case 'icon':
        setShowIconOptions(true)
        break
      case 'previewBackground':
        updateFrameBackground(activeFrameId, data)
        break
      case 'setBackground':
        // Apply and finalize background color
        updateFrameBackground(activeFrameId, data)
        commitHistory()
        toast.success('Background color changed')
        break
      case 'background':
        // This opens the color picker in the right-click menu
        break
      case 'color':
        // Color picker handled in context menu; no immediate apply
        break
      case 'previewElementColor':
        if (selectedElement) {
          if (selectedElement.type === 'shape') {
            updateElement(selectedElementId, { fill: data })
          } else if (selectedElement.type === 'text') {
            updateElement(selectedElementId, { color: data })
          } else if (selectedElement.type === 'icon') {
            updateElement(selectedElementId, { color: data })
          }
        }
        break
      case 'setElementColor':
        if (selectedElement) {
          if (selectedElement.type === 'shape') {
            updateElement(selectedElementId, { fill: data })
          } else if (selectedElement.type === 'text') {
            updateElement(selectedElementId, { color: data })
          } else if (selectedElement.type === 'icon') {
            updateElement(selectedElementId, { color: data })
          }
          commitHistory()
          toast.success('Color changed')
        } else {
          toast.info('Select an element to change its color')
        }
        break
      case 'video':
        handleAddVideo()
        break
      case 'audio':
        handleAddAudio()
        break
      case 'duplicate':
        if (selectedElementId) {
          duplicateElement(selectedElementId)
          toast.success('Element duplicated')
        }
        break
      case 'delete':
        if (selectedElementId) {
          deleteElement(selectedElementId)
        }
        break
      case 'copy':
        if (selectedElementId) {
          copyElement(selectedElementId)
          toast.info('Copied to clipboard')
        }
        break
      case 'bringToFront':
        if (selectedElementId) {
          bringToFront(selectedElementId)
        }
        break
      case 'sendToBack':
        if (selectedElementId) {
          sendToBack(selectedElementId)
        }
        break
      default:
      // Unknown action - safely ignore
    }
    setContextMenu(null)
  }

  // Helper for roman numerals
  const getRoman = (num) => {
    if (num <= 0) return ''
    const lookup = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 }
    let roman = '', i
    for (i in lookup) {
      while (num >= lookup[i]) {
        roman += i
        num -= lookup[i]
      }
    }
    return roman
  }

  // Render text with list formatting
  const renderTextContent = (element) => {
    const content = element.content || ''
    const listType = element.listType || 'none'

    if (element.runs && element.runs.length > 0) {
      return element.runs.map((run, index) => {
        const style = {
          fontSize: run.fontSize ? `${run.fontSize}px` : undefined,
          fontWeight: run.fontWeight,
          fontFamily: run.fontFamily,
          fontStyle: run.fontStyle,
          textDecoration: run.textDecoration,
          color: run.color,
          lineHeight: run.lineHeight,
        }
        return (
          <span key={index} style={style}>
            {run.text}
          </span>
        )
      })
    }

    if (listType === 'none' || !content) {
      return <div dangerouslySetInnerHTML={{ __html: content }} style={{ width: '100%', height: '100%' }} />
    }

    const lines = content.split('\n')
    let itemIndex = 0
    return lines.map((line, index) => {
      if (!line.trim()) return <div key={index}>&nbsp;</div>

      itemIndex++
      let prefix = ''

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
        case 'roman': prefix = `${getRoman(itemIndex)}.`; break
        default: prefix = '•'
      }

      return (
        <div key={index} className="flex">
          <span className="flex-shrink-0 w-8">{prefix}</span>
          <span dangerouslySetInnerHTML={{ __html: line }}></span>
        </div>
      )
    })
  }

  // Normalise animation — may be { type, duration } object or legacy string key
  const getAnimType = (element) => {
    if (!element.animation) return 'none'
    if (typeof element.animation === 'object') return element.animation.type || 'none'
    return element.animation
  }

  const getAnimDuration = (element) => {
    if (typeof element.animation === 'object') return element.animation.duration || element.animationSpeed || 500
    return element.animationSpeed || 500
  }

  // Get animation class for an element
  const getAnimationClass = (element) => {
    const animType = getAnimType(element)
    if (!isAnimationPreview || !animType || animType === 'none') return ''

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
    }

    return animMap[animType] || ''
  }

  // Get animation style variables
  const getAnimationStyle = (element) => {
    const animType = getAnimType(element)
    if (!isAnimationPreview || !animType || animType === 'none') return {}

    return {
      '--anim-duration': `${getAnimDuration(element)}ms`,
      '--anim-delay': `${element.animationDelay || 0}ms`,
    }
  }

  // Preview animations function
  const previewAnimations = () => {
    setIsAnimationPreview(false)
    setAnimationKey(prev => prev + 1)
    setTimeout(() => {
      setIsAnimationPreview(true)
    }, 50)
  }

  // Render element content
  const renderElement = (element) => {
    switch (element.type) {
      case 'text':
        if (editingTextId === element.id) {
          const initialHtml = element.runs && element.runs.length > 0 
            ? convertRunsToHtml(element.runs) 
            : (element.content || '')

          return (
            <div
              ref={editableDivRef}
              contentEditable
              suppressContentEditableWarning
              data-text-editable="true"
              className="w-full h-full bg-transparent border-none outline-none resize-none whitespace-pre-wrap text-editable relative z-20 overflow-y-auto"
              style={{
                fontSize: element.fontSize,
                fontWeight: element.fontWeight,
                fontFamily: element.fontFamily || 'Inter',
                fontStyle: element.isPlaceholder ? 'italic' : (element.fontStyle || 'normal'),
                textDecoration: element.textDecoration || 'none',
                textAlign: element.textAlign || 'left',
                color: element.isPlaceholder ? '#9ca3af' : element.color,
                lineHeight: 1.5,
                paddingTop: element.padding?.top ?? 8, paddingBottom: element.padding?.bottom ?? 8, paddingLeft: element.padding?.left ?? 8, paddingRight: element.padding?.right ?? 8, border: element.borderWidth ? `${element.borderWidth}px solid ${element.borderColor || '#333333'}` : 'none',
                borderRadius: element.borderRadius ? `${element.borderRadius}px` : 0,
                backgroundColor: element.backgroundColor || 'transparent',
                caretColor: '#0078d7',
                outline: 'none',
              }}
              dangerouslySetInnerHTML={{ __html: initialHtml }}
              onInput={(e) => {
                const target = e.currentTarget
                const newHeight = Math.max(Number(element.height) || 50, target.scrollHeight)
                target.style.height = `${newHeight}px`
              }}
              onBlur={(e) => {
                const relatedTarget = e.relatedTarget
                if (relatedTarget && (
                  relatedTarget.closest('[data-text-toolbar]') ||
                  relatedTarget.closest('.color-picker') ||
                  relatedTarget.closest('.dropdown-options') ||
                  relatedTarget.closest('.dropdown')
                )) {
                  return
                }

                const newHtml = e.currentTarget.innerHTML
                const newHeight = Math.max(Number(element.height) || 50, e.currentTarget.scrollHeight)
                updateElement(element.id, {
                  content: newHtml,
                  runs: null,
                  height: newHeight
                })
                setEditingTextId(null)
                commitHistory()
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Escape') {
                  e.preventDefault()
                  const newHtml = e.currentTarget.innerHTML
                  updateElement(element.id, {
                    content: newHtml,
                    runs: null,
                  })
                  setEditingTextId(null)
                  setSelectedElementId(null)
                  commitHistory()
                }
              }}
              onKeyUp={saveSelection}
              onMouseUp={saveSelection}
            />
          )
        }
        return (
          <div
            className={`w-full h-full whitespace-pre-wrap overflow-hidden transition-colors duration-150 ${element.isPlaceholder
              ? 'text-placeholder cursor-text hover:bg-blue-50/50'
              : ''
              }`}
            style={{
              fontSize: element.fontSize,
              fontWeight: element.fontWeight,
              fontFamily: element.fontFamily || 'Inter',
              fontStyle: element.isPlaceholder ? 'italic' : (element.fontStyle || 'normal'),
              textDecoration: element.textDecoration || 'none',
              textAlign: element.textAlign || 'left',
              color: element.isPlaceholder ? '#9ca3af' : element.color,
              lineHeight: 1.5,
              paddingTop: element.padding?.top ?? 8, paddingBottom: element.padding?.bottom ?? 8, paddingLeft: element.padding?.left ?? 8, paddingRight: element.padding?.right ?? 8, border: element.borderWidth ? `${element.borderWidth}px solid ${element.borderColor || '#333333'}` : 'none',
              borderRadius: element.borderRadius ? `${element.borderRadius}px` : 0,
              backgroundColor: element.backgroundColor || 'transparent',
            }}
          >
            {renderTextContent(element)}
          </div>
        )

      case 'shape':
        const shapeStyle = {
          opacity: (element.opacity || 100) / 100,
          transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        }

        // Shape rendering with text overlay support
        let shapeContent
        if (element.shapeType === 'circle') {
          shapeContent = (
            <div
              className="w-full h-full rounded-full"
              style={{ backgroundColor: element.fill, border: element.strokeWidth ? `${element.strokeWidth}px solid ${element.strokeColor}` : 'none', ...shapeStyle }}
            />
          )
        } else if (element.shapeType === 'triangle') {
          shapeContent = (
            <svg className="w-full h-full" viewBox="0 0 200 150" preserveAspectRatio="none" style={shapeStyle}>
              <polygon points="100,0 0,150 200,150" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} />
            </svg>
          )
        } else if (element.shapeType === 'line') {
          shapeContent = (
            <svg className="w-full h-full" viewBox="0 0 200 10" preserveAspectRatio="none" style={shapeStyle}>
              <line x1="0" y1="5" x2="200" y2="5" stroke={element.fill} strokeWidth={element.strokeWidth || 2} strokeLinecap="round" />
            </svg>
          )
        } else if (element.shapeType === 'arrow') {
          shapeContent = (
            <svg className="w-full h-full" viewBox="0 0 200 30" preserveAspectRatio="none" style={shapeStyle}>
              <line x1="0" y1="15" x2="170" y2="15" stroke={element.fill} strokeWidth={element.strokeWidth || 2} strokeLinecap="round" />
              <polygon points="170,5 200,15 170,25" fill={element.fill} />
            </svg>
          )
        } else if (element.shapeType === 'star') {
          shapeContent = (
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" style={shapeStyle}>
              <polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} />
            </svg>
          )
        } else if (element.shapeType === 'hexagon') {
          shapeContent = (
            <svg className="w-full h-full" viewBox="0 0 120 100" preserveAspectRatio="none" style={shapeStyle}>
              <polygon points="30,0 90,0 120,50 90,100 30,100 0,50" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} />
            </svg>
          )
        } else if (element.shapeType === 'diamond') {
          shapeContent = (
            <svg className="w-full h-full" viewBox="0 0 100 140" preserveAspectRatio="none" style={shapeStyle}>
              <polygon points="50,0 100,70 50,140 0,70" fill={element.fill} stroke={element.strokeColor} strokeWidth={element.strokeWidth || 0} />
            </svg>
          )
        } else {
          // Default rectangle
          shapeContent = (
            <div
              className="w-full h-full rounded"
              style={{ backgroundColor: element.fill, border: element.strokeWidth ? `${element.strokeWidth}px solid ${element.strokeColor}` : 'none', ...shapeStyle }}
            />
          )
        }

        // Wrap shape with text overlay
        return (
          <div className="relative w-full h-full">
            {shapeContent}
            {editingTextId === element.id ? (
              <div
                ref={editableDivRef}
                contentEditable
                suppressContentEditableWarning
                data-text-editable="true"
                className="absolute inset-0 bg-transparent border-none outline-none resize-none p-2 text-center flex items-center justify-center overflow-y-auto"
                style={{
                  fontSize: `${element.fontSize}px`,
                  fontWeight: element.fontWeight,
                  fontFamily: element.fontFamily || 'Inter',
                  fontStyle: element.fontStyle || 'normal',
                  textDecoration: element.textDecoration || 'none',
                  textAlign: element.textAlign || 'center',
                  color: element.color,
                  caretColor: '#0078d7',
                  outline: 'none',
                }}
                dangerouslySetInnerHTML={{ __html: element.runs && element.runs.length > 0 ? convertRunsToHtml(element.runs) : (element.content || '') }}
                onBlur={(e) => {
                  const relatedTarget = e.relatedTarget
                  if (relatedTarget && (
                    relatedTarget.closest('[data-text-toolbar]') ||
                    relatedTarget.closest('.color-picker') ||
                    relatedTarget.closest('.dropdown-options') ||
                    relatedTarget.closest('.dropdown')
                  )) {
                    return
                  }

                  const newHtml = e.currentTarget.innerHTML
                  updateElement(element.id, {
                    content: newHtml,
                    runs: null,
                  })
                  setEditingTextId(null)
                  commitHistory()
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    const newHtml = e.currentTarget.innerHTML
                    updateElement(element.id, {
                      content: newHtml,
                      runs: null,
                    })
                    setEditingTextId(null)
                    setSelectedElementId(null)
                    commitHistory()
                  }
                }}
                onKeyUp={saveSelection}
                onMouseUp={saveSelection}
              />
            ) : element.content ? (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{
                  fontSize: `${element.fontSize}px`,
                  fontWeight: element.fontWeight,
                  fontFamily: element.fontFamily || 'Inter',
                  fontStyle: element.fontStyle || 'normal',
                  textDecoration: element.textDecoration || 'none',
                  textAlign: element.textAlign || 'center',
                  color: element.color,
                  padding: '8px',
                  overflow: 'hidden',
                  wordWrap: 'break-word',
                }}
                dangerouslySetInnerHTML={{ __html: element.content }}
              />
            ) : null}
          </div>
        )

      case 'image':
        return (
          <div className={`w-full h-full flex flex-col ${element.caption && element.showCaption ? 'gap-1' : ''}`} style={{ transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined }}>
            <img
              src={element.src}
              alt={element.caption || "canvas"}
              className={`${element.caption && element.showCaption ? 'flex-1' : 'w-full h-full'} object-contain rounded`}
              style={{
                transform: (`${element.flipH ? 'scaleX(-1)' : ''} ${element.flipV ? 'scaleY(-1)' : ''}`).trim() || undefined,
                borderRadius: typeof element.borderRadius === 'number' ? `${element.borderRadius}px` : (element.borderRadius || undefined)
              }}
              draggable={false}
              onError={(e) => {
                e.target.style.display = 'none'
                e.target.parentNode.classList.add('bg-gray-100')
              }}
            />
            {/* Image caption support */}
            {element.caption && element.showCaption && (
              editingTextId === element.id ? (
                <input
                  type="text"
                  className="w-full bg-gray-100 border-none outline-none text-center px-2 py-1 rounded"
                  style={{
                    fontSize: `${element.captionFontSize}px`,
                    color: element.captionColor,
                    fontFamily: element.captionFontFamily,
                    caretColor: '#0078d7',
                  }}
                  value={element.caption || ''}
                  onChange={(e) => updateElement(element.id, { caption: e.target.value })}
                  onBlur={() => setEditingTextId(null)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setEditingTextId(null)
                      setSelectedElementId(null)
                    }
                  }}
                  autoFocus
                  placeholder="Add caption..."
                />
              ) : (
                <div
                  className="w-full text-center px-2 py-1 bg-gray-100 rounded overflow-hidden text-ellipsis"
                  style={{
                    fontSize: `${element.captionFontSize}px`,
                    color: element.captionColor,
                    fontFamily: element.captionFontFamily,
                  }}
                >
                  {element.caption}
                </div>
              )
            )}
          </div>
        )

      case 'icon':
        const iconSize = Math.min(element.width, element.height) * (element.content && element.showLabel ? 0.6 : 0.8)
        const iconColor = element.color || '#2E7D32'
        return (
          <div className={`w-full h-full flex items-center justify-center ${element.content && element.showLabel ? 'flex-col gap-1' : ''}`}>
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
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {element.iconType === 'x' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            )}
            {element.iconType === 'arrowRight' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            )}
            {element.iconType === 'arrowUp' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
              </svg>
            )}
            {element.iconType === 'lightning' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            )}
            {element.iconType === 'sun' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke={iconColor} strokeWidth="1">
                <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
            {element.iconType === 'moon' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
            {element.iconType === 'cloud' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
            )}
            {element.iconType === 'thumbsUp' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
              </svg>
            )}
            {element.iconType === 'thumbsDown' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
              </svg>
            )}
            {element.iconType === 'flag' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke={iconColor} strokeWidth="1">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
              </svg>
            )}
            {element.iconType === 'bell' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke={iconColor} strokeWidth="1">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            )}
            {element.iconType === 'bookmark' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            )}
            {element.iconType === 'lock' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            )}
            {element.iconType === 'trophy' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke={iconColor} strokeWidth="1">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 22V8a6 6 0 0 0-6-6v1a5 5 0 0 0 5 5h6a5 5 0 0 0 5-5V2a6 6 0 0 0-6 6v14" />
              </svg>
            )}
            {element.iconType === 'gift' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
              </svg>
            )}
            {element.iconType === 'arrowDown' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
              </svg>
            )}
            {element.iconType === 'arrowLeft' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
            )}
            {element.iconType === 'unlock' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
            )}
            {element.iconType === 'home' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            )}
            {element.iconType === 'user' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            )}
            {element.iconType === 'users' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            )}
            {element.iconType === 'settings' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            )}
            {element.iconType === 'search' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            )}
            {element.iconType === 'mail' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
              </svg>
            )}
            {element.iconType === 'phone' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            )}
            {element.iconType === 'calendar' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            )}
            {element.iconType === 'clock' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            )}
            {element.iconType === 'camera' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
              </svg>
            )}
            {element.iconType === 'image' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
              </svg>
            )}
            {element.iconType === 'video' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
            )}
            {element.iconType === 'music' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
            )}
            {element.iconType === 'headphones' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
              </svg>
            )}
            {element.iconType === 'mic' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
            {element.iconType === 'wifi' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
            )}
            {element.iconType === 'download' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            {element.iconType === 'upload' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
            {element.iconType === 'share' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            )}
            {element.iconType === 'link' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            )}
            {element.iconType === 'pin' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" fill="white" />
              </svg>
            )}
            {element.iconType === 'globe' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            )}
            {element.iconType === 'coffee' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" />
              </svg>
            )}
            {element.iconType === 'briefcase' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            )}
            {element.iconType === 'folder' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            )}
            {element.iconType === 'file' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" />
              </svg>
            )}
            {element.iconType === 'clipboard' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
            )}
            {element.iconType === 'edit' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            )}
            {element.iconType === 'trash' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            )}
            {element.iconType === 'plus' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            )}
            {element.iconType === 'minus' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            )}
            {element.iconType === 'refresh' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            )}
            {element.iconType === 'power' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
              </svg>
            )}
            {element.iconType === 'zap' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            )}
            {element.iconType === 'target' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
              </svg>
            )}
            {element.iconType === 'award' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
              </svg>
            )}
            {element.iconType === 'shield' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            )}
            {element.iconType === 'eye' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
              </svg>
            )}
            {element.iconType === 'eyeOff' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
            {element.iconType === 'smile' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            )}
            {element.iconType === 'frown' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            )}
            {element.iconType === 'meh' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="8" y1="15" x2="16" y2="15" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            )}
            {element.iconType === 'fire' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M12 23c-3.9 0-7-3.1-7-7 0-2.1.9-4.1 2.5-5.5L12 6l4.5 4.5c1.6 1.4 2.5 3.4 2.5 5.5 0 3.9-3.1 7-7 7z" />
              </svg>
            )}
            {element.iconType === 'droplet' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
              </svg>
            )}
            {element.iconType === 'leaf' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
              </svg>
            )}
            {element.iconType === 'rocket' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
              </svg>
            )}
            {element.iconType === 'anchor' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="5" r="3" /><line x1="12" y1="22" x2="12" y2="8" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" />
              </svg>
            )}
            {element.iconType === 'compass' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
            )}
            {element.iconType === 'umbrella' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7" />
              </svg>
            )}
            {element.iconType === 'lightbulb' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="9" y1="18" x2="15" y2="18" /><line x1="10" y1="22" x2="14" y2="22" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
              </svg>
            )}
            {element.iconType === 'key' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
              </svg>
            )}
            {element.iconType === 'crown' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M2 16l4-10 6 6 6-6 4 10z" />
              </svg>
            )}
            {element.iconType === 'gem' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <polygon points="12 2 2 7 12 22 22 7 12 2" /><polyline points="2 7 12 12 22 7" /><line x1="12" y1="12" x2="12" y2="22" />
              </svg>
            )}
            {element.iconType === 'dollar' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            )}
            {element.iconType === 'percent' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
              </svg>
            )}
            {element.iconType === 'hash' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
              </svg>
            )}
            {element.iconType === 'at' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
              </svg>
            )}
            {element.iconType === 'infinity' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z" />
              </svg>
            )}
            {element.iconType === 'info' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            )}
            {element.iconType === 'alertCircle' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
            {element.iconType === 'helpCircle' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            )}
            {element.iconType === 'checkCircle' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
            {element.iconType === 'xCircle' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            {element.iconType === 'minusCircle' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            )}
            {element.iconType === 'plusCircle' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            )}
            {/* Additional icons - flower, tree, mountain, plane, car, bike, battery, bluetooth */}
            {element.iconType === 'flower' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <circle cx="12" cy="12" r="3" /><path d="M12 2a3 3 0 0 1 0 6 3 3 0 0 1 0-6zM12 16a3 3 0 0 1 0 6 3 3 0 0 1 0-6zM4.93 4.93a3 3 0 0 1 4.24 4.24 3 3 0 0 1-4.24-4.24zM14.83 14.83a3 3 0 0 1 4.24 4.24 3 3 0 0 1-4.24-4.24zM2 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0zM16 12a3 3 0 0 1 6 0 3 3 0 0 1-6 0zM4.93 19.07a3 3 0 0 1 4.24-4.24 3 3 0 0 1-4.24 4.24zM14.83 9.17a3 3 0 0 1 4.24-4.24 3 3 0 0 1-4.24 4.24z" />
              </svg>
            )}
            {element.iconType === 'tree' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={iconColor} stroke="none">
                <path d="M12 2L4 12h4l-3 5h4l-3 5h12l-3-5h4l-3-5h4L12 2z" />
              </svg>
            )}
            {element.iconType === 'mountain' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M8 21l6-9 4 5h4L12 3 2 21h6z" />
              </svg>
            )}
            {element.iconType === 'plane' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 1 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
              </svg>
            )}
            {element.iconType === 'car' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <path d="M16 8l2 4h2a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-1.09a3 3 0 0 1-5.82 0H9.91a3 3 0 0 1-5.82 0H3a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h10z" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
              </svg>
            )}
            {element.iconType === 'bike' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" /><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h3" />
              </svg>
            )}
            {element.iconType === 'battery' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <rect x="1" y="6" width="18" height="12" rx="2" ry="2" /><line x1="23" y1="13" x2="23" y2="11" />
              </svg>
            )}
            {element.iconType === 'bluetooth' && (
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2">
                <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
              </svg>
            )}
            {/* Icon label support */}
            {element.content && element.showLabel && (
              editingTextId === element.id ? (
                <input
                  type="text"
                  className="w-full bg-transparent border-none outline-none text-center px-1"
                  style={{
                    fontSize: `${element.fontSize}px`,
                    fontWeight: element.fontWeight,
                    fontFamily: element.fontFamily,
                    color: element.textColor,
                    caretColor: '#0078d7',
                  }}
                  value={element.content || ''}
                  onChange={(e) => handleTextChange(element.id, e.target.value)}
                  onBlur={() => setEditingTextId(null)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setEditingTextId(null)
                      setSelectedElementId(null)
                    }
                  }}
                  autoFocus
                  placeholder="Label"
                />
              ) : (
                <div
                  className="w-full text-center px-1 overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{
                    fontSize: `${element.fontSize}px`,
                    fontWeight: element.fontWeight,
                    fontFamily: element.fontFamily,
                    color: element.textColor,
                  }}
                >
                  {element.content}
                </div>
              )
            )}
          </div>
        )

      case 'table':
        return (
          <table className="w-full h-full border-collapse border border-gray-400">
            <tbody>
              {Array(element.rows).fill(null).map((_, rowIdx) => (
                <tr key={rowIdx}>
                  {Array(element.cols).fill(null).map((_, colIdx) => (
                    <td
                      key={`${rowIdx}-${colIdx}`}
                      className="border border-gray-400 p-2 text-xs outline-none focus:bg-primary/5"
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        const newData = (element.data || []).map(r => [...r])
                        if (!newData[rowIdx]) newData[rowIdx] = []
                        newData[rowIdx][colIdx] = e.currentTarget.textContent
                        updateElement(element.id, { data: newData })
                      }}
                    >
                      {element.data?.[rowIdx]?.[colIdx] || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )

      case 'video':
        return element.isYouTube ? (
          <iframe
            src={element.src}
            className="w-full h-full rounded"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <video
            src={element.src}
            className="w-full h-full rounded bg-black"
            controls
            muted={element.muted}
            loop={element.loop}
          />
        )

      case 'audio':
        return (
          <div className="w-full h-full bg-gray-100 rounded-lg flex items-center gap-3 px-4">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{element.title}</p>
              <audio src={element.src} controls className="w-full h-8 mt-1" />
            </div>
          </div>
        )

      case 'drawing':
        return (
          <svg className="w-full h-full" viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}>
            {element.paths?.map((path, pathIdx) => (
              <path
                key={pathIdx}
                d={`M ${path.points.map(p => `${p.x} ${p.y}`).join(' L ')}`}
                stroke={path.color}
                strokeWidth={path.size}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        )

      default:
        return null
    }
  }


  const resolveFrameKind = useCallback((frame, index) => {
    const textNodes = (frame?.elements || []).filter(el => el?.type === 'text' && !el?.isPlaceholder)
    const imageNodes = (frame?.elements || []).filter(el => el?.type === 'image')
    const headline = (textNodes[0]?.content || frame?.title || '').toLowerCase()
    if (index === 0 || /presentation|title|untitled/.test(headline)) return 'title'
    if (/closing|end/.test(headline)) return 'closing'
    if (/bold|statement/.test(headline) || ((frame?.backgroundColor || '').toLowerCase() !== '#ffffff' && imageNodes.length > 0)) return 'bold'
    if (imageNodes.length > 0) return 'content'
    return 'text'
  }, [])



// ─── Prezi-style two-stage camera animator ─────────────────────────────
  // Uses requestAnimationFrame to interpolate camera through a "pull back,
  // dive in" arc instead of a single linear transition. The midpoint zoom
  // is the fit-zoom of the bounding box of source + target frames, so
  // adjacent frames get a small dip and far-apart frames get a deep
  // zoom-out — exactly like Prezi.
  const cameraAnimRef = useRef({ raf: null, token: 0 })

  const cancelCameraAnim = useCallback(() => {
    if (cameraAnimRef.current.raf) {
      cancelAnimationFrame(cameraAnimRef.current.raf)
      cameraAnimRef.current.raf = null
    }
    cameraAnimRef.current.token += 1
  }, [])

  // easeInOutCubic — symmetric, smooth start and end.
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

  // Read viewport dimensions the same way updateCameraToBox does.
  const getViewportSize = useCallback(() => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      return { w: Math.max(360, rect.width), h: Math.max(280, rect.height) }
    }
    return { w: window.innerWidth, h: window.innerHeight }
  }, [])

  const cameraForCenter = useCallback((targetZoom, worldCenterX, worldCenterY) => {
    const { w, h } = getViewportSize()
    const originX = worldBounds.width / 2
    const originY = worldBounds.height / 2
    const panX = originX + (w / 2 - originX) / targetZoom - worldCenterX
    const panY = originY + (h / 2 - originY) / targetZoom - worldCenterY
    return { panX, panY }
  }, [worldBounds.width, worldBounds.height, getViewportSize])

  const fitZoomForBox = useCallback((box, zoomScale = 0.95) => {
    const { w, h } = getViewportSize()
    const rawZoom = Math.min(
      (w / Math.max(1, box.width)) * zoomScale,
      (h / Math.max(1, box.height)) * zoomScale
    )
    return Math.max(0.05, Math.min(40, rawZoom))
  }, [getViewportSize])
// ─── Van Wijk smooth zoom-pan ─────────────────────────────────────────
  // Implements "Smooth and efficient zooming and panning" by Jarke J. van
  // Wijk and Wim A.A. Nuij (2003). The camera follows a hyperbolic arc
  // through (pan, log-zoom) space at constant perceived velocity, so every
  // frame of the animation feels equally fast to the viewer regardless of
  // whether the jump is near or far. Distant jumps automatically pull back
  // further and take longer; close jumps stay shallow and finish quicker.
  // This is the algorithm Prezi (and most "smooth zoom" tools) use.
  //
  // u0, u1: source/target pan vectors in world coords (the world-space
  //         center the camera is looking at)
  // w0, w1: source/target widths — i.e. how much world fits on screen at
  //         each end. Smaller w = more zoomed in.
  // rho:    zoom/pan tradeoff. ~1.4 = paper's recommended value, gives the
  //         signature "pull back and dive" feel.
  // V:      animation speed (world distance per second).
  const VAN_WIJK_RHO = 1.4
  const VAN_WIJK_RHO_SQ = VAN_WIJK_RHO * VAN_WIJK_RHO

  // Returns { S: total path length, w: function(s) -> width at position s,
  //          u: function(s) -> pan vector at position s }
  const buildVanWijkPath = (u0, u1, w0, w1) => {
    const ux = u1[0] - u0[0]
    const uy = u1[1] - u0[1]
    const u_dist = Math.hypot(ux, uy) // pan distance in world coords

    // Edge case: same pan position (just a zoom-in-place). Skip the heavy
    // formulas and use plain log interpolation for zoom.
    if (u_dist < 1e-6) {
      const S = Math.abs(Math.log(w1 / w0)) / VAN_WIJK_RHO
      return {
        S: Math.max(S, 1e-6),
        w: (s) => w0 * Math.exp(VAN_WIJK_RHO * s * Math.sign(Math.log(w1 / w0))),
        u: () => [u0[0], u0[1]],
      }
    }

    // Standard van Wijk math.
    const b0 = (w1 * w1 - w0 * w0 + VAN_WIJK_RHO_SQ * VAN_WIJK_RHO_SQ * u_dist * u_dist) / (2 * w0 * VAN_WIJK_RHO_SQ * u_dist)
    const b1 = (w1 * w1 - w0 * w0 - VAN_WIJK_RHO_SQ * VAN_WIJK_RHO_SQ * u_dist * u_dist) / (2 * w1 * VAN_WIJK_RHO_SQ * u_dist)
    const r0 = Math.log(-b0 + Math.sqrt(b0 * b0 + 1))
    const r1 = Math.log(-b1 + Math.sqrt(b1 * b1 + 1))
    const S = (r1 - r0) / VAN_WIJK_RHO

    const w = (s) => w0 * (Math.cosh(r0) / Math.cosh(VAN_WIJK_RHO * s + r0))
    const u = (s) => {
      const tanhTerm = w0 / (VAN_WIJK_RHO_SQ) * Math.cosh(r0) * Math.tanh(VAN_WIJK_RHO * s + r0) - w0 / VAN_WIJK_RHO_SQ * Math.sinh(r0)
      const frac = tanhTerm / u_dist
      return [u0[0] + frac * ux, u0[1] + frac * uy]
    }

    return { S: Math.max(Math.abs(S), 1e-6), w, u }
  }

  // Run a van Wijk smooth-zoom animation. duration is in ms but is
  // automatically scaled by path length S so close jumps finish faster
  // (constant perceived speed). baseDuration is the duration for an
  // S-of-1 path; real duration = baseDuration * S.
  const animateCameraVanWijk = useCallback((targetWorldCenter, targetWidth, baseDuration) => {
    cancelCameraAnim()
    const myToken = cameraAnimRef.current.token + 1
    cameraAnimRef.current.token = myToken

    const { w: viewportW } = getViewportSize()

    // Start state — convert current camera into (u0, w0) world-coord form.
    const startZoom = camera.zoom
    const startPanX = camera.panX
    const startPanY = camera.panY
    const originX = worldBounds.width / 2
    const originY = worldBounds.height / 2
    const { w: vpW, h: vpH } = getViewportSize()
    const startCenterX = originX + (vpW / 2 - originX) / startZoom - startPanX
    const startCenterY = originY + (vpH / 2 - originY) / startZoom - startPanY
    // "Width on screen at this zoom" = viewport width / zoom (world units visible)
    const w0 = viewportW / startZoom
    const w1 = viewportW / (viewportW / targetWidth) // = targetWidth (world units to show)

    const u0 = [startCenterX, startCenterY]
    const u1 = [targetWorldCenter[0], targetWorldCenter[1]]

    const path = buildVanWijkPath(u0, u1, w0, w1)
    const totalDuration = Math.max(300, baseDuration * (path.S / 2))
    // (path.S is roughly 1-3 for typical jumps; dividing by 2 keeps the
    //  user-set baseDuration meaningful for "average" jumps.)

    const startTime = performance.now()
    setIsNavigating(true)

    const tick = (now) => {
      if (cameraAnimRef.current.token !== myToken) return

      const elapsed = now - startTime
      const t = Math.min(1, elapsed / totalDuration)
      // Apply a gentle ease so the very start and very end aren't abrupt.
      // (Van Wijk gives constant perceived velocity, but humans expect a
      //  little wind-up and wind-down.)
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      const s = eased * path.S

      const widthAtS = path.w(s)
      const centerAtS = path.u(s)
      const zoomAtS = viewportW / widthAtS

      // Convert (worldCenter, zoom) back to (panX, panY) using existing helper.
      const { panX, panY } = cameraForCenter(zoomAtS, centerAtS[0], centerAtS[1])

      setCamera({ zoom: zoomAtS, panX, panY })
      setZoom(Math.round(zoomAtS * 100))

      if (t < 1) {
        cameraAnimRef.current.raf = requestAnimationFrame(tick)
      } else {
        cameraAnimRef.current.raf = null
        setIsNavigating(false)
      }
    }

    cameraAnimRef.current.raf = requestAnimationFrame(tick)
  }, [camera.zoom, camera.panX, camera.panY, worldBounds.width, worldBounds.height, getViewportSize, cameraForCenter, setZoom, cancelCameraAnim])
  const updateCameraToBox = useCallback((box, zoomScale = 0.8) => {
    if (!canvasRef.current || !box) return
    const rect = canvasRef.current.getBoundingClientRect()
    const viewportW = Math.max(360, rect.width)
    const viewportH = Math.max(280, rect.height)

    // Cap zoom-in at 40 (4000%). The formula already produces a constant
    // on-screen coverage across frame dimensions — the cap is just a sanity
    // rail. Previous cap of 10 was too low: a small resized frame (e.g. ~160px
    // wide) needed ~15× zoom to fill the viewport, was clamped to 10×, and
    // ended up showing lots of empty background instead of covering the screen.
    const rawZoom = Math.min((viewportW / box.width) * zoomScale, (viewportH / box.height) * zoomScale)
    const targetZoom = Math.max(0.05, Math.min(40, rawZoom))

    const worldCenterX = box.x + box.width / 2
    const worldCenterY = box.y + box.height / 2
    const originX = worldBounds.width / 2
    const originY = worldBounds.height / 2
    const viewportCenterX = viewportW / 2
    const viewportCenterY = viewportH / 2

    const panX = originX + (viewportCenterX - originX) / targetZoom - worldCenterX
    const panY = originY + (viewportCenterY - originY) / targetZoom - worldCenterY

    // Always use smooth transitions (CSS handles animation via isNavigating=false)
    setIsNavigating(false)
    setCamera({ zoom: targetZoom, panX, panY })
    setZoom(Math.round(targetZoom * 100))
  }, [worldBounds.height, worldBounds.width, setZoom])

  const focusOverview = useCallback(() => {
    const width = Math.max(1, worldBounds.maxX - worldBounds.minX)
    const height = Math.max(1, worldBounds.maxY - worldBounds.minY)
    updateCameraToBox({ x: worldBounds.minX, y: worldBounds.minY, width, height }, 0.85)
    setEditorMode('overview')
  }, [worldBounds.maxX, worldBounds.maxY, worldBounds.minX, worldBounds.minY, updateCameraToBox, setEditorMode])

const focusFrameById = useCallback((frameId) => {
    const target = frameMapLayout.find(f => f.id === frameId)
    if (target) updateCameraToBox(target, 0.96)
  }, [frameMapLayout, updateCameraToBox])

// Prezi-style smooth zoom: van Wijk single-curve animation.
  // Replaces the old "pull back and dive" two-stage approach with a
  // mathematically smooth path through (pan, log-zoom) space. Feels
  // continuous, no perceptible stage break, constant on-screen speed.
  const animateToFrameTwoStage = useCallback((targetBox, zoomScale = 0.85) => {
    // Target world-space center and the world-width we want to show.
    const targetCenterX = targetBox.x + targetBox.width / 2
    const targetCenterY = targetBox.y + targetBox.height / 2

    // What "width of world" do we want to show on screen at the target?
    // = box dimension scaled up by 1/zoomScale so there's a little padding.
    const { w: vpW, h: vpH } = getViewportSize()
    const targetW = Math.max(
      targetBox.width / zoomScale,
      (targetBox.height / zoomScale) * (vpW / vpH)
    )

    animateCameraVanWijk([targetCenterX, targetCenterY], targetW, navSpeedMs)
  }, [getViewportSize, animateCameraVanWijk, navSpeedMs])

// Reset the camera-init flag whenever a template starts loading, so the
  // overview effect below will re-fire after the new template's frames and
  // worldBounds have settled. Without this, switching from one template to
  // another would skip re-initialization and leave the camera at its old
  // position from the previous template.
  useEffect(() => {
    if (isTemplateLoading) {
      hasInitializedCameraRef.current = false
    }
  }, [isTemplateLoading])

  // Initialize / re-initialize camera to overview when:
  //   1. Component first mounts and frames are ready, OR
  //   2. A template just finished loading.
  // We wait for `isTemplateLoading === false` AND a non-empty frameMapLayout
  // so worldBounds has settled to the real values (not the 1800×1100 fallback).
  // Use a snap (no animation) so the user lands at the correct overview
  // position immediately, without a weird "fly in from default zoom" effect.
  useEffect(() => {
    if (hasInitializedCameraRef.current) return
    if (isTemplateLoading) return
    if (frameMapLayout.length === 0) return

    hasInitializedCameraRef.current = true
    // Snap, don't animate — for first-load there's no source position to
    // animate from, and any animation here would be visually jarring.
    cancelCameraAnim()
    setIsNavigating(true)
    const width = Math.max(1, worldBounds.maxX - worldBounds.minX)
    const height = Math.max(1, worldBounds.maxY - worldBounds.minY)
    const box = { x: worldBounds.minX, y: worldBounds.minY, width, height }
    // Compute final camera state directly (no animation), same math as
    // updateCameraToBox but bypassing the CSS transition.
    const targetZoom = fitZoomForBox(box, 0.85)
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const { panX, panY } = cameraForCenter(targetZoom, cx, cy)
    setCamera({ zoom: targetZoom, panX, panY })
    setZoom(Math.round(targetZoom * 100))
    setEditorMode('overview')
    // Re-enable CSS transitions for subsequent (non-rAF) interactions.
    requestAnimationFrame(() => setIsNavigating(false))
  }, [isTemplateLoading, frameMapLayout.length, worldBounds.minX, worldBounds.minY, worldBounds.maxX, worldBounds.maxY, fitZoomForBox, cameraForCenter, cancelCameraAnim, setZoom, setEditorMode])

const handleFrameFocus = useCallback((frameId, mode = 'frame') => {
    // Skip focus/zoom if user just finished dragging a frame
    if (didFrameDragRef.current) {
      didFrameDragRef.current = false
      return
    }

    // Same-frame click. setActiveFrameId won't trigger the zoom-on-change
    // useEffect (no state change), so handle the camera move inline.
    if (frameId === activeFrameId) {
      if (mode === 'frame') {
        const target = frameMapLayout.find(f => f.id === frameId)
        // Re-clicking the active frame: just snap-zoom in single-stage. There's
        // nothing to "fly between", so the two-stage arc would feel weird.
        if (target) updateCameraToBox(target, 0.85)
      } else if (mode === 'overview') {
        // Overview from any state stays single-stage (Q7).
        focusOverview()
      }
      pendingFocusModeRef.current = null
      setEditorMode(mode)
      return
    }

    // Frame → frame navigation. Use two-stage Prezi animation.
    if (mode === 'frame') {
      const target = frameMapLayout.find(f => f.id === frameId)
      if (target) {
        animateToFrameTwoStage(target, 0.85)
      }
      setActiveFrameId(frameId)
      pendingFocusModeRef.current = null
      setEditorMode('frame')
      return
    }

    // 'overview' mode while on a different frame: single-stage zoom-out (Q7).
    if (mode === 'overview') {
      focusOverview()
      setActiveFrameId(frameId)
      pendingFocusModeRef.current = null
      setEditorMode('overview')
      return
    }

    // 'select' or other modes: no camera move, just update active frame.
    pendingFocusModeRef.current = mode
    setActiveFrameId(frameId)
    setEditorMode(mode)
  }, [setActiveFrameId, activeFrameId, frameMapLayout, updateCameraToBox, focusOverview, animateToFrameTwoStage, setEditorMode])

 // #01 — Single click selects, double-click zooms to frame
  const handleFrameSingleClick = useCallback((frameId) => {
    pendingFocusModeRef.current = null
    setActiveFrameId(frameId)
    setSelectedElementId(null)
    setShowTextToolbar(false)
    setEditingTextId(null)
    // Re-focus the frame visually and re-expand the right panel so the user
    // sees the Properties/Design/Notes tabs again.
    setIsFrameFocused(true)
    setRightPanelCollapsed(false)
  }, [setActiveFrameId, setSelectedElementId, setShowTextToolbar, setEditingTextId])

const handleFrameDoubleClick = useCallback((frameId) => {
    // Double-click zooms into the frame
    pendingFocusModeRef.current = 'frame'
    setActiveFrameId(frameId)
    // Re-focus so borders/handles/panel come back
    setIsFrameFocused(true)
    setRightPanelCollapsed(false)
    const target = frameMapLayout.find(f => f.id === frameId)
    if (target) {
      updateCameraToBox(target, 0.85)
    }
    setEditorMode('frame')
  }, [setActiveFrameId, frameMapLayout, updateCameraToBox, setEditorMode])

  // Wrap addFrame so new slide lands adjacent to the currently active frame
const handleAddFrame = useCallback((templateType) => {
    pendingFocusModeRef.current = 'frame'
    // Compute a layout right next to the active frame (gap = 40px, same y)
    const activeLay = frameMapLayout.find(f => f.id === activeFrameId)
    if (activeLay) {
      const GAP = 40
      const newW = activeLay.width
      const newH = activeLay.height
      const newX = activeLay.x + activeLay.width + GAP
      const newY = activeLay.y
      addFrame(templateType, { x: newX, y: newY, width: newW, height: newH })
    } else {
      addFrame(templateType)
    }
    setEditorMode('frame')
  }, [addFrame, frameMapLayout, activeFrameId, setEditorMode])

  // Find a non-overlapping adjacent slot for a duplicated frame.
  // Tries Right → Below → Left → Above (in that order). Falls back to
  // "far right of all existing frames" if every adjacent slot is occupied.
  // Returns a layout object {x, y, width, height} that the caller can pass
  // to duplicateFrame.
  const findFreeAdjacentLayout = useCallback((sourceFrameId) => {
    const source = frameMapLayout.find(f => f.id === sourceFrameId)
    if (!source) return null

    const GAP_X = 60
    const GAP_Y = 40
    const w = source.width
    const h = source.height

    // Build list of all existing frame rects (excluding the source itself
    // is fine — overlapping the source you're copying from is meaningless).
    const others = frameMapLayout.filter(f => f.id !== sourceFrameId)

    const overlaps = (a, others) => others.some(b => (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    ))

    // Candidate slots in priority order: right, below, left, above.
    const candidates = [
      { x: source.x + source.width + GAP_X, y: source.y, width: w, height: h }, // right
      { x: source.x, y: source.y + source.height + GAP_Y, width: w, height: h }, // below
      { x: source.x - source.width - GAP_X, y: source.y, width: w, height: h }, // left
      { x: source.x, y: source.y - source.height - GAP_Y, width: w, height: h }, // above
    ]

    for (const cand of candidates) {
      if (!overlaps(cand, others)) return cand
    }

    // Fallback: place far-right of all existing frames so it never overlaps
    // anything (canvas is unbounded — there's always free space to the right).
    const maxRight = others.reduce((m, f) => Math.max(m, f.x + f.width), source.x + source.width)
    return {
      x: maxRight + GAP_X,
      y: source.y,
      width: w,
      height: h,
    }
  }, [frameMapLayout])

  // Sidebar duplicate button → place duplicate at a non-overlapping slot.
  const handleDuplicateFrame = useCallback((frameId) => {
    const layout = findFreeAdjacentLayout(frameId)
    duplicateFrame(frameId, layout)
  }, [findFreeAdjacentLayout, duplicateFrame])

  return (
    <div className="h-screen flex flex-col bg-gray-100 relative">
      {/* Template Loading Overlay */}
      {isTemplateLoading && (
        <div className="absolute inset-0 z-[100] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4"></div>
          <h3 className="text-xl font-semibold text-gray-800">Loading Template...</h3>
          <p className="text-gray-500 mt-2 text-sm">Please wait while we set up your workspace</p>
        </div>
      )}

      {/* Left side faint orange tint */}
      <div
        className="fixed left-0 top-0 h-full pointer-events-none z-0"
        style={{
          width: '150px',
          background: 'linear-gradient(to right, rgba(255, 237, 213, 0.3) 0%, rgba(255, 245, 235, 0.15) 50%, transparent 100%)',
        }}
      />
      {/* Top Header Bar */}
      <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-4 relative z-10">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={handleGoHome}
            className="p-2 hover:bg-gray-100 rounded-md transition-all text-gray-600"
            title="Home"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="flex items-center group relative">
            <input
              type="text"
              value={projectTitle || 'Untitled presentation'}
              onChange={(e) => setProjectTitle(e.target.value)}
              className="text-base font-semibold text-gray-800 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-1 py-1 min-w-[170px]"
              placeholder="Untitled presentation"
            />
            <button
              onClick={() => {
                const adjectives = ['Creative', 'Brilliant', 'Dynamic', 'Elegant', 'Vibrant', 'Stunning', 'Epic', 'Sparkling', 'Radiant', 'Sleek']
                const nouns = ['Presentation', 'Project', 'Deck', 'Slides', 'Vision', 'Blueprint', 'Concept', 'Idea', 'Story', 'Canvas']
                const name = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`
                setProjectTitle(name)
              }}
              className="p-1.5 ml-1 opacity-0 group-hover:opacity-100 hover:bg-gray-100 rounded text-gray-400 hover:text-primary transition-all"
              title="Generate random name"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><circle cx="15.5" cy="8.5" r="1.5"></circle><circle cx="15.5" cy="15.5" r="1.5"></circle><circle cx="8.5" cy="15.5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle></svg>
            </button>
          </div>

          <div className="relative" ref={visibilityDropdownRef}>
            <button
              onClick={() => setShowVisibilityDropdown(v => !v)}
              className={`h-8 px-3 rounded-md text-white text-sm font-semibold flex items-center gap-1.5 transition-all ${
                projectVisibility === 'public' ? 'bg-[#3dba4e] hover:bg-[#33a845]' : 'bg-gray-600 hover:bg-gray-700'
              }`}
            >
              {projectVisibility === 'public' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              )}
              {projectVisibility === 'public' ? 'Public' : 'Private'}
              <span className="text-xs">▾</span>
            </button>
            {showVisibilityDropdown && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[180px] z-50">
                <button
                  onClick={() => { setProjectVisibility('public'); setShowVisibilityDropdown(false) }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all ${projectVisibility === 'public' ? 'bg-green-50 text-green-700' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <div className="text-left">
                    <span className="font-medium">Public</span>
                    <p className="text-xs text-gray-400">Anyone with the link can view</p>
                  </div>
                  {projectVisibility === 'public' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" className="ml-auto"><polyline points="20 6 9 17 4 12" /></svg>}
                </button>
                <button
                  onClick={() => { setProjectVisibility('private'); setShowVisibilityDropdown(false) }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all ${projectVisibility === 'private' ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <div className="text-left">
                    <span className="font-medium">Private</span>
                    <p className="text-xs text-gray-400">Only you can access</p>
                  </div>
                  {projectVisibility === 'private' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.5" className="ml-auto"><polyline points="20 6 9 17 4 12" /></svg>}
                </button>
              </div>
            )}
          </div>
        </div>

        <EditorToolbar
          showMediaDropdown={showMediaDropdown}
          setShowMediaDropdown={setShowMediaDropdown}
          onSave={handleSaveProject}
          onAddText={() => addTextElement()}
          onAddShape={() => setShowShapeOptions(!showShapeOptions)}
          onAddImage={handleAddImage}
          onAddWebImage={() => setShowWebImageModal(true)}
          onAddVideo={handleAddVideo}
          onAddAudio={handleAddAudio}
          onAddIcon={() => setShowIconOptions(!showIconOptions)}
          onAddTable={() => setShowTableOptions(!showTableOptions)}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
        />

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <div className="hidden lg:block text-xs text-gray-400">
              {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Unsaved' : lastSavedTime ? `Saved` : lastSaved ? 'Saved' : 'Unsaved'}
            </div>
            <button
              onClick={handleSaveProject}
              disabled={isSaving}
              title="Save (Ctrl+S)"
              className="h-8 px-3 rounded-md border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Save
            </button>
          </div>

          <div
            className="w-8 h-8 rounded-full bg-cyan-500 text-white text-xs font-bold flex items-center justify-center uppercase select-none"
            title={user?.name || user?.email || 'User'}
          >
            {(user?.name || user?.email || 'U').slice(0, 2)}
          </div>

          <div className="relative" ref={presentDropdownRef}>
            <div className="flex items-center">
              <button
                onClick={handlePresent}
                className="h-9 px-3 rounded-l-md bg-[#2f7df6] hover:bg-[#226de1] text-white text-sm font-semibold flex items-center gap-1.5 transition-all"
              >
                <span>▶</span>
                <span>Present</span>
              </button>
              <button
                onClick={() => setShowPresentDropdown(v => !v)}
                className="h-9 px-1.5 rounded-r-md bg-[#2f7df6] hover:bg-[#226de1] text-white text-sm border-l border-white/20 transition-all"
              >
                <span className="text-xs">▾</span>
              </button>
            </div>
            {showPresentDropdown && (
              <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[200px] z-50">
                <button
                  onClick={() => { setShowPresentDropdown(false); navigate(`/present/${templateId || 'new'}`) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-all"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <div className="text-left">
                    <span className="font-medium">From Beginning</span>
                    <p className="text-xs text-gray-400">Start from slide 1</p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setShowPresentDropdown(false)
                    const idx = frames.findIndex(f => f.id === activeFrameId)
                    navigate(`/present/${templateId || 'new'}`, { state: { startSlide: Math.max(0, idx) } })
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-all"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="2" width="20" height="20" rx="2" />
                    <polygon points="10 8 16 12 10 16 10 8" />
                  </svg>
                  <div className="text-left">
                    <span className="font-medium">From Current Slide</span>
                    <p className="text-xs text-gray-400">Start from active frame</p>
                  </div>
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={() => { setShowPresentDropdown(false); previewAnimations() }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-all"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <div className="text-left">
                    <span className="font-medium">Preview Animations</span>
                    <p className="text-xs text-gray-400">Preview on canvas</p>
                  </div>
                </button>
              </div>
            )}
          </div>

            <div className="relative">
              <button
                onClick={() => setShowShareDropdown(!showShareDropdown)}
                className="h-9 px-3 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-semibold flex items-center gap-1.5 transition-all"
              >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>Share</span>
            </button>
            {showShareDropdown && (
              <ShareDropdown
                onClose={() => setShowShareDropdown(false)}
                onUpgrade={() => setShowUpgradeModal(true)}
                onExport={() => {
                  exportProject()
                  toast.success('Project exported')
                }}
                onExportVideo={() => setShowVideoExportModal(true)}
              />
            )}
          </div>
        </div>
      </header>

      {/* Text Toolbar (shown when text or shape is selected) */}
     {showTextToolbar && (selectedElement?.type === 'text' || selectedElement?.type === 'shape') && (
        <TextToolbar
          element={{ ...selectedElement, ...selectionFormatting }}
          onUpdate={(updates) => {
            if (editingTextId === selectedElementId) {
              const inlineKeys = ['fontWeight', 'fontStyle', 'textDecoration', 'color', 'fontFamily', 'fontSize']
              const inlineUpdates = {}
              const containerUpdates = {}
              
              Object.keys(updates).forEach(key => {
                if (inlineKeys.includes(key)) {
                  inlineUpdates[key] = updates[key]
                } else {
                  containerUpdates[key] = updates[key]
                }
              })
              
              if (Object.keys(inlineUpdates).length > 0) {
                applyStyleToSelection(inlineUpdates)
              }
              if (Object.keys(containerUpdates).length > 0) {
                updateElement(selectedElementId, containerUpdates)
              }
            } else {
              updateElement(selectedElementId, updates)
            }
          }}
          onAnimationChange={(animation) => {
            updateElementAnimation(selectedElementId, animation)
          }}
        />
      )}

      {/* TextToolbar bound to the project Header — visible only when header is selected. */}
      {headerSelected && header && (
        <TextToolbar
          element={{ ...header, type: 'text' }}
          onUpdate={(updates) => updateHeader(updates)}
          onAnimationChange={() => { /* header doesn't animate */ }}
        />
      )}

      {/* Shape Options Dropdown */}
      {showShapeOptions && (
        <div className="dropdown-options absolute top-24 left-1/2 transform -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-30 max-w-4xl max-h-[600px] overflow-y-auto">
          <p className="text-sm font-semibold text-gray-900 mb-3">Add Shape (50+ Options)</p>
          <div className="grid grid-cols-8 gap-3">
            <button
              onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <div className="w-10 h-8 bg-green-500 rounded" />
              <span className="text-xs text-gray-600">Rectangle</span>
            </button>
            <button
              onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <div className="w-10 h-10 bg-blue-500 rounded-full" />
              <span className="text-xs text-gray-600">Circle</span>
            </button>
            <button
              onClick={() => { addShapeElement('triangle'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,4 2,20 22,20" fill="#FF5722" /></svg>
              <span className="text-xs text-gray-600">Triangle</span>
            </button>
            <button
              onClick={() => { addShapeElement('line'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <svg width="24" height="8" viewBox="0 0 24 8"><line x1="0" y1="4" x2="24" y2="4" stroke="#333" strokeWidth="3" /></svg>
              <span className="text-xs text-gray-600">Line</span>
            </button>
            <button
              onClick={() => { addShapeElement('arrow'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <svg width="24" height="12" viewBox="0 0 24 12"><line x1="0" y1="6" x2="18" y2="6" stroke="#333" strokeWidth="2" /><polygon points="18,2 24,6 18,10" fill="#333" /></svg>
              <span className="text-xs text-gray-600">Arrow</span>
            </button>
            <button
              onClick={() => { addShapeElement('star'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9" fill="#FFD700" /></svg>
              <span className="text-xs text-gray-600">Star</span>
            </button>
            <button
              onClick={() => { addShapeElement('hexagon'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="6,2 18,2 24,12 18,22 6,22 0,12" fill="#9C27B0" /></svg>
              <span className="text-xs text-gray-600">Hexagon</span>
            </button>
            <button
              onClick={() => { addShapeElement('diamond'); setShowShapeOptions(false); }}
              className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all"
            >
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,2 22,12 12,22 2,12" fill="#00BCD4" /></svg>
              <span className="text-xs text-gray-600">Diamond</span>
            </button>
            {/* Additional 42 shapes */}
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-8 bg-red-500 rounded" />
              <span className="text-xs text-gray-600">Red Rect</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-10 bg-purple-500 rounded-full" />
              <span className="text-xs text-gray-600">Purple Circle</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-6 bg-yellow-500 rounded-full" />
              <span className="text-xs text-gray-600">Oval</span>
            </button>
            <button onClick={() => { addShapeElement('triangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,4 2,20 22,20" fill="#4CAF50" /></svg>
              <span className="text-xs text-gray-600">Green Triangle</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-8 bg-orange-500 rounded-lg" />
              <span className="text-xs text-gray-600">Rounded Rect</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-10 bg-teal-500 rounded-full" />
              <span className="text-xs text-gray-600">Teal Circle</span>
            </button>
            <button onClick={() => { addShapeElement('line'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="8" viewBox="0 0 24 8"><line x1="0" y1="4" x2="24" y2="4" stroke="#E91E63" strokeWidth="3" /></svg>
              <span className="text-xs text-gray-600">Pink Line</span>
            </button>
            <button onClick={() => { addShapeElement('arrow'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="12" viewBox="0 0 24 12"><line x1="0" y1="6" x2="18" y2="6" stroke="#2196F3" strokeWidth="2" /><polygon points="18,2 24,6 18,10" fill="#2196F3" /></svg>
              <span className="text-xs text-gray-600">Blue Arrow</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-8 bg-indigo-500" />
              <span className="text-xs text-gray-600">Square</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-12 bg-cyan-500 rounded" />
              <span className="text-xs text-gray-600">Tall Rect</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-10 bg-lime-500 rounded-full" />
              <span className="text-xs text-gray-600">Lime Circle</span>
            </button>
            <button onClick={() => { addShapeElement('triangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,4 2,20 22,20" fill="#9C27B0" /></svg>
              <span className="text-xs text-gray-600">Purple Triangle</span>
            </button>
            <button onClick={() => { addShapeElement('star'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9" fill="#F44336" /></svg>
              <span className="text-xs text-gray-600">Red Star</span>
            </button>
            <button onClick={() => { addShapeElement('hexagon'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="6,2 18,2 24,12 18,22 6,22 0,12" fill="#3F51B5" /></svg>
              <span className="text-xs text-gray-600">Blue Hexagon</span>
            </button>
            <button onClick={() => { addShapeElement('diamond'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,2 22,12 12,22 2,12" fill="#FF9800" /></svg>
              <span className="text-xs text-gray-600">Orange Diamond</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-10 h-2 bg-gray-700" />
              <span className="text-xs text-gray-600">Thin Bar</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <div className="w-6 h-6 bg-pink-500 rounded-full" />
              <span className="text-xs text-gray-600">Small Circle</span>
            </button>
            {/* More varied shapes using SVG for proper rendering */}
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="24" viewBox="0 0 32 24"><rect x="1" y="1" width="30" height="22" fill="none" stroke="#3B82F6" strokeWidth="2" rx="2" /></svg>
              <span className="text-xs text-gray-600">Blue Rect</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="none" stroke="#10B981" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Green Circle</span>
            </button>
            <button onClick={() => { addShapeElement('triangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="24" viewBox="0 0 28 24"><polygon points="14,2 26,22 2,22" fill="none" stroke="#EF4444" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Red Triangle</span>
            </button>
            <button onClick={() => { addShapeElement('diamond'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="28" viewBox="0 0 24 28"><polygon points="12,2 22,14 12,26 2,14" fill="none" stroke="#8B5CF6" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Purple Diamond</span>
            </button>
            <button onClick={() => { addShapeElement('star'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,2 17,10 26,10 19,16 21,25 14,20 7,25 9,16 2,10 11,10" fill="none" stroke="#F59E0B" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Yellow Star</span>
            </button>
            <button onClick={() => { addShapeElement('hexagon'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,2 25,8 25,20 14,26 3,20 3,8" fill="none" stroke="#06B6D4" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Cyan Hexagon</span>
            </button>
            <button onClick={() => { addShapeElement('arrow'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="16" viewBox="0 0 32 16"><line x1="2" y1="8" x2="24" y2="8" stroke="#374151" strokeWidth="2" /><polygon points="24,4 30,8 24,12" fill="#374151" /></svg>
              <span className="text-xs text-gray-600">Arrow</span>
            </button>
            <button onClick={() => { addShapeElement('line'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="8" viewBox="0 0 32 8"><line x1="2" y1="4" x2="30" y2="4" stroke="#EC4899" strokeWidth="3" /></svg>
              <span className="text-xs text-gray-600">Pink Line</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" fill="none" stroke="#1F2937" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Square</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="20" viewBox="0 0 32 20"><ellipse cx="16" cy="10" rx="14" ry="8" fill="none" stroke="#7C3AED" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Oval</span>
            </button>
            <button onClick={() => { addShapeElement('triangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="24" viewBox="0 0 28 24"><polygon points="2,22 26,22 14,2" fill="none" stroke="#F97316" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Inverted Tri</span>
            </button>
            <button onClick={() => { addShapeElement('star'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,4 16,11 24,11 18,15 20,23 14,19 8,23 10,15 4,11 12,11" fill="none" stroke="#DC2626" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Red Star</span>
            </button>
            <button onClick={() => { addShapeElement('hexagon'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="26" viewBox="0 0 28 26"><polygon points="7,2 21,2 27,13 21,24 7,24 1,13" fill="none" stroke="#4F46E5" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Wide Hexagon</span>
            </button>
            <button onClick={() => { addShapeElement('diamond'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="12,1 23,12 12,23 1,12" fill="none" stroke="#0EA5E9" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Diamond</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="18" viewBox="0 0 32 18"><rect x="1" y="1" width="30" height="16" rx="8" fill="none" stroke="#059669" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Capsule</span>
            </button>
            <button onClick={() => { addShapeElement('star'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,1 17,9 26,9 19,15 22,24 14,19 6,24 9,15 2,9 11,9" fill="none" stroke="#BE185D" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Pink Star</span>
            </button>
            <button onClick={() => { addShapeElement('arrow'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="16" height="32" viewBox="0 0 16 32"><line x1="8" y1="28" x2="8" y2="6" stroke="#374151" strokeWidth="2" /><polygon points="4,6 8,1 12,6" fill="#374151" /></svg>
              <span className="text-xs text-gray-600">Up Arrow</span>
            </button>
            <button onClick={() => { addShapeElement('arrow'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="16" height="32" viewBox="0 0 16 32"><line x1="8" y1="4" x2="8" y2="26" stroke="#374151" strokeWidth="2" /><polygon points="4,26 8,31 12,26" fill="#374151" /></svg>
              <span className="text-xs text-gray-600">Down Arrow</span>
            </button>
            <button onClick={() => { addShapeElement('arrow'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="16" viewBox="0 0 32 16"><line x1="28" y1="8" x2="6" y2="8" stroke="#374151" strokeWidth="2" /><polygon points="6,4 1,8 6,12" fill="#374151" /></svg>
              <span className="text-xs text-gray-600">Left Arrow</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="20" viewBox="0 0 32 20"><rect x="1" y="1" width="30" height="18" rx="3" fill="none" stroke="#6366F1" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Rounded Rect</span>
            </button>
            <button onClick={() => { addShapeElement('triangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="24" viewBox="0 0 24 24"><polygon points="2,12 22,2 22,22" fill="none" stroke="#0D9488" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Right Triangle</span>
            </button>
            <button onClick={() => { addShapeElement('hexagon'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="24" viewBox="0 0 28 24"><polygon points="6,2 22,2 26,12 22,22 6,22 2,12" fill="none" stroke="#7C3AED" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Octagon</span>
            </button>
            <button onClick={() => { addShapeElement('star'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,2 16,12 26,14 16,16 14,26 12,16 2,14 12,12" fill="none" stroke="#F59E0B" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">4-Point Star</span>
            </button>
            <button onClick={() => { addShapeElement('diamond'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="24" viewBox="0 0 28 24"><polygon points="14,2 26,10 22,22 6,22 2,10" fill="none" stroke="#8B5CF6" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Pentagon</span>
            </button>
            <button onClick={() => { addShapeElement('line'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><line x1="4" y1="24" x2="24" y2="4" stroke="#EF4444" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Diagonal Line</span>
            </button>
            <button onClick={() => { addShapeElement('line'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><line x1="4" y1="4" x2="24" y2="24" stroke="#10B981" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Diagonal Line 2</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="none" stroke="#3B82F6" strokeWidth="2" strokeDasharray="4 2" /></svg>
              <span className="text-xs text-gray-600">Dashed Circle</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="22" viewBox="0 0 28 22"><rect x="2" y="2" width="24" height="18" fill="none" stroke="#1F2937" strokeWidth="2" strokeDasharray="4 2" /></svg>
              <span className="text-xs text-gray-600">Dashed Rect</span>
            </button>
            <button onClick={() => { addShapeElement('star'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,1 16.5,8 24,8 18,13 20,21 14,17 8,21 10,13 4,8 11.5,8" fill="none" stroke="#4ADE80" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Green Star</span>
            </button>
            <button onClick={() => { addShapeElement('triangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="24" viewBox="0 0 28 24"><polygon points="14,22 2,4 26,4" fill="none" stroke="#6366F1" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Flip Triangle</span>
            </button>
            <button onClick={() => { addShapeElement('hexagon'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="14,2 26,7 26,21 14,26 2,21 2,7" fill="none" stroke="#F472B6" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Tall Hexagon</span>
            </button>
            <button onClick={() => { addShapeElement('diamond'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="20" viewBox="0 0 32 20"><polygon points="16,2 30,10 16,18 2,10" fill="none" stroke="#0EA5E9" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Wide Diamond</span>
            </button>
            <button onClick={() => { addShapeElement('rectangle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="24" height="32" viewBox="0 0 24 32"><rect x="2" y="2" width="20" height="28" fill="none" stroke="#DC2626" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Tall Rect</span>
            </button>
            <button onClick={() => { addShapeElement('circle'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="18" viewBox="0 0 28 18"><ellipse cx="14" cy="9" rx="12" ry="7" fill="none" stroke="#0D9488" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Flat Oval</span>
            </button>
            <button onClick={() => { addShapeElement('arrow'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="32" height="20" viewBox="0 0 32 20"><polygon points="1,10 12,2 12,7 20,7 20,2 31,10 20,18 20,13 12,13 12,18" fill="none" stroke="#374151" strokeWidth="2" /></svg>
              <span className="text-xs text-gray-600">Double Arrow</span>
            </button>
            <button onClick={() => { addShapeElement('hexagon'); setShowShapeOptions(false); }} className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-50 transition-all">
              <svg width="28" height="28" viewBox="0 0 28 28"><polygon points="5,5 23,5 23,23 5,23" fill="none" stroke="#7C3AED" strokeWidth="2" transform="rotate(45 14 14)" /></svg>
              <span className="text-xs text-gray-600">Rotated Square</span>
            </button>
          </div>
        </div>
      )}

      {/* Icon Options Dropdown - 100+ Icons */}
      {showIconOptions && (
        <div className="dropdown-options absolute top-24 left-1/2 transform -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-30 max-w-3xl max-h-[500px] overflow-y-auto">
          <p className="text-sm font-semibold text-gray-900 mb-3">Add Icon (100+ Options)</p>
          <div className="grid grid-cols-10 gap-2">
            {/* Basic Icons */}
            <button onClick={() => { addIconElement('star'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Star">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD700" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
            </button>
            <button onClick={() => { addIconElement('heart'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Heart">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#e53e3e" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>
            </button>
            <button onClick={() => { addIconElement('check'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Check">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
            </button>
            <button onClick={() => { addIconElement('x'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="X">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
            <button onClick={() => { addIconElement('arrowRight'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Arrow Right">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
            </button>
            <button onClick={() => { addIconElement('arrowUp'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Arrow Up">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
            </button>
            <button onClick={() => { addIconElement('arrowDown'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Arrow Down">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>
            </button>
            <button onClick={() => { addIconElement('arrowLeft'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Arrow Left">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            </button>
            <button onClick={() => { addIconElement('lightning'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Lightning">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            </button>
            <button onClick={() => { addIconElement('sun'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Sun">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /></svg>
            </button>
            <button onClick={() => { addIconElement('moon'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Moon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#6366f1" stroke="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            </button>
            <button onClick={() => { addIconElement('cloud'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Cloud">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#60a5fa" stroke="none"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>
            </button>
            <button onClick={() => { addIconElement('thumbsUp'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Thumbs Up">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#22c55e" stroke="none"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
            </button>
            <button onClick={() => { addIconElement('thumbsDown'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Thumbs Down">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" /></svg>
            </button>
            <button onClick={() => { addIconElement('flag'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Flag">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="1"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
            </button>
            <button onClick={() => { addIconElement('bell'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Bell">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            </button>
            <button onClick={() => { addIconElement('bookmark'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Bookmark">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#3b82f6" stroke="none"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
            </button>
            <button onClick={() => { addIconElement('lock'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Lock">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            </button>
            <button onClick={() => { addIconElement('unlock'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Unlock">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>
            </button>
            <button onClick={() => { addIconElement('trophy'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Trophy">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22h10c0-2-1-3.25-2.03-3.79-.5-.23-.97-.66-.97-1.21v-2.34" /><path d="M8 2c0 4 4 6 4 6s4-2 4-6H8Z" /></svg>
            </button>
            {/* More icons */}
            <button onClick={() => { addIconElement('gift'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Gift">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2"><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
            </button>
            <button onClick={() => { addIconElement('home'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Home">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
            </button>
            <button onClick={() => { addIconElement('user'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="User">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            </button>
            <button onClick={() => { addIconElement('users'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Users">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            </button>
            <button onClick={() => { addIconElement('settings'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Settings">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </button>
            <button onClick={() => { addIconElement('search'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            </button>
            <button onClick={() => { addIconElement('mail'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Mail">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
            </button>
            <button onClick={() => { addIconElement('phone'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Phone">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
            </button>
            <button onClick={() => { addIconElement('calendar'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Calendar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
            </button>
            <button onClick={() => { addIconElement('clock'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Clock">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </button>
            <button onClick={() => { addIconElement('camera'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Camera">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
            </button>
            <button onClick={() => { addIconElement('image'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Image">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            </button>
            <button onClick={() => { addIconElement('video'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Video">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
            </button>
            <button onClick={() => { addIconElement('music'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Music">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            </button>
            <button onClick={() => { addIconElement('headphones'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Headphones">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>
            </button>
            <button onClick={() => { addIconElement('mic'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Microphone">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
            </button>
            <button onClick={() => { addIconElement('wifi'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="WiFi">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>
            </button>
            <button onClick={() => { addIconElement('battery'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Battery">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><rect x="1" y="6" width="18" height="12" rx="2" ry="2" /><line x1="23" y1="13" x2="23" y2="11" /></svg>
            </button>
            <button onClick={() => { addIconElement('bluetooth'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Bluetooth">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" /></svg>
            </button>
            <button onClick={() => { addIconElement('download'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Download">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            </button>
            <button onClick={() => { addIconElement('upload'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Upload">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            </button>
            <button onClick={() => { addIconElement('share'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Share">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
            </button>
            <button onClick={() => { addIconElement('link'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            </button>
            <button onClick={() => { addIconElement('pin'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Map Pin">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="1"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" fill="white" /></svg>
            </button>
            <button onClick={() => { addIconElement('globe'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Globe">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
            </button>
            <button onClick={() => { addIconElement('coffee'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Coffee">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#78350f" strokeWidth="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg>
            </button>
            <button onClick={() => { addIconElement('briefcase'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Briefcase">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
            </button>
            <button onClick={() => { addIconElement('folder'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Folder">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
            </button>
            <button onClick={() => { addIconElement('file'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="File">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            </button>
            <button onClick={() => { addIconElement('clipboard'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Clipboard">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>
            </button>
            <button onClick={() => { addIconElement('edit'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Edit">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            </button>
            <button onClick={() => { addIconElement('trash'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Trash">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            </button>
            <button onClick={() => { addIconElement('plus'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Plus">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
            <button onClick={() => { addIconElement('minus'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Minus">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
            <button onClick={() => { addIconElement('refresh'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Refresh">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
            </button>
            <button onClick={() => { addIconElement('power'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Power">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></svg>
            </button>
            <button onClick={() => { addIconElement('zap'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Zap">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            </button>
            <button onClick={() => { addIconElement('target'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Target">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
            </button>
            <button onClick={() => { addIconElement('award'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Award">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></svg>
            </button>
            <button onClick={() => { addIconElement('shield'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Shield">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            </button>
            <button onClick={() => { addIconElement('eye'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Eye">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            </button>
            <button onClick={() => { addIconElement('eyeOff'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Eye Off">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
            </button>
            <button onClick={() => { addIconElement('smile'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Smile">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="#000" strokeWidth="2" fill="none" /><line x1="9" y1="9" x2="9.01" y2="9" stroke="#000" strokeWidth="3" /><line x1="15" y1="9" x2="15.01" y2="9" stroke="#000" strokeWidth="3" /></svg>
            </button>
            <button onClick={() => { addIconElement('frown'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Frown">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#60a5fa" stroke="#60a5fa" strokeWidth="1"><circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" stroke="#000" strokeWidth="2" fill="none" /><line x1="9" y1="9" x2="9.01" y2="9" stroke="#000" strokeWidth="3" /><line x1="15" y1="9" x2="15.01" y2="9" stroke="#000" strokeWidth="3" /></svg>
            </button>
            <button onClick={() => { addIconElement('meh'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Meh">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1"><circle cx="12" cy="12" r="10" /><line x1="8" y1="15" x2="16" y2="15" stroke="#000" strokeWidth="2" /><line x1="9" y1="9" x2="9.01" y2="9" stroke="#000" strokeWidth="3" /><line x1="15" y1="9" x2="15.01" y2="9" stroke="#000" strokeWidth="3" /></svg>
            </button>
            <button onClick={() => { addIconElement('fire'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Fire">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f97316" stroke="#f97316" strokeWidth="1"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>
            </button>
            <button onClick={() => { addIconElement('droplet'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Droplet">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#3b82f6" stroke="#3b82f6" strokeWidth="1"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></svg>
            </button>
            <button onClick={() => { addIconElement('leaf'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Leaf">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#22c55e" stroke="#22c55e" strokeWidth="1"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" fill="none" stroke="#166534" strokeWidth="2" /></svg>
            </button>
            <button onClick={() => { addIconElement('flower'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Flower">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ec4899" stroke="#ec4899" strokeWidth="1"><path d="M12 7.5a4.5 4.5 0 1 1 4.5 4.5M12 7.5A4.5 4.5 0 1 0 7.5 12M12 7.5V9m-4.5 3a4.5 4.5 0 1 0 4.5 4.5M7.5 12H9m7.5 0a4.5 4.5 0 1 1-4.5 4.5m4.5-4.5H15m-3 4.5V15" /><circle cx="12" cy="12" r="3" fill="#fbbf24" /></svg>
            </button>
            <button onClick={() => { addIconElement('tree'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Tree">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><path d="M10 21h4m-2-8v8m6-5-6-8-6 8h12zm-2-5-4-5-4 5h8z" /></svg>
            </button>
            <button onClick={() => { addIconElement('mountain'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Mountain">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="m8 3 4 8 5-5 5 15H2L8 3z" /></svg>
            </button>
            <button onClick={() => { addIconElement('plane'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Plane">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></svg>
            </button>
            <button onClick={() => { addIconElement('car'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Car">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2" /><circle cx="6.5" cy="16.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /></svg>
            </button>
            <button onClick={() => { addIconElement('bike'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Bike">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="18.5" cy="17.5" r="3.5" /><circle cx="5.5" cy="17.5" r="3.5" /><circle cx="15" cy="5" r="1" /><path d="M12 17.5V14l-3-3 4-3 2 3h2" /></svg>
            </button>
            <button onClick={() => { addIconElement('rocket'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Rocket">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>
            </button>
            <button onClick={() => { addIconElement('anchor'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Anchor">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="12" cy="5" r="3" /><line x1="12" y1="22" x2="12" y2="8" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" /></svg>
            </button>
            <button onClick={() => { addIconElement('compass'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Compass">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="#ef4444" /></svg>
            </button>
            <button onClick={() => { addIconElement('umbrella'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Umbrella">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2"><path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7" /></svg>
            </button>
            <button onClick={() => { addIconElement('lightbulb'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Lightbulb">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1"><path d="M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" /></svg>
            </button>
            <button onClick={() => { addIconElement('key'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Key">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
            </button>
            <button onClick={() => { addIconElement('crown'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Crown">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" /></svg>
            </button>
            <button onClick={() => { addIconElement('gem'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Gem">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><polygon points="6 3 18 3 22 9 12 22 2 9" /><path d="M12 22 6 9l6 13 6-13" /><line x1="2" y1="9" x2="22" y2="9" /></svg>
            </button>
            <button onClick={() => { addIconElement('dollar'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Dollar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </button>
            <button onClick={() => { addIconElement('percent'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Percent">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>
            </button>
            <button onClick={() => { addIconElement('hash'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Hash">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>
            </button>
            <button onClick={() => { addIconElement('at'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="At">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" /></svg>
            </button>
            <button onClick={() => { addIconElement('infinity'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Infinity">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2"><path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z" /></svg>
            </button>
            <button onClick={() => { addIconElement('info'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Info">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#3b82f6" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" fill="#3b82f6" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            </button>
            <button onClick={() => { addIconElement('alertCircle'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Alert">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" fill="#ef4444" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            </button>
            <button onClick={() => { addIconElement('helpCircle'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Help">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#6366f1" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" fill="#6366f1" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            </button>
            <button onClick={() => { addIconElement('checkCircle'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Check Circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#22c55e" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" fill="#22c55e" /><polyline points="9 12 11 14 15 10" /></svg>
            </button>
            <button onClick={() => { addIconElement('xCircle'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="X Circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" fill="#ef4444" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
            </button>
            <button onClick={() => { addIconElement('minusCircle'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Minus Circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#f59e0b" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" fill="#f59e0b" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
            </button>
            <button onClick={() => { addIconElement('plusCircle'); setShowIconOptions(false); }} className="p-2 rounded-lg hover:bg-gray-50 transition-all" title="Plus Circle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#22c55e" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" fill="#22c55e" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Table Options Dropdown - Grid Picker */}
      {showTableOptions && (
        <div className="dropdown-options absolute top-24 left-1/2 transform -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-30 w-64">
          <p className="text-sm font-semibold text-gray-900 mb-3">Insert Table</p>

          {/* Grid Preview */}
          <div className="mb-4">
            <p className="text-xs text-gray-500 mb-2">
              {tableGridHover.rows > 0 && tableGridHover.cols > 0
                ? `${tableGridHover.rows} × ${tableGridHover.cols} Table`
                : 'Hover to select size'}
            </p>
            <div className="grid grid-cols-5 gap-1">
              {Array.from({ length: 5 }, (_, row) =>
                Array.from({ length: 5 }, (_, col) => (
                  <button
                    key={`${row}-${col}`}
                    onMouseEnter={() => setTableGridHover({ rows: row + 1, cols: col + 1 })}
                    onMouseLeave={() => setTableGridHover({ rows: 0, cols: 0 })}
                    onClick={() => {
                      addTableElement(row + 1, col + 1)
                      setShowTableOptions(false)
                      setTableGridHover({ rows: 0, cols: 0 })
                    }}
                    className={`w-8 h-8 border rounded transition-all ${row < tableGridHover.rows && col < tableGridHover.cols
                      ? 'bg-primary/30 border-primary'
                      : 'bg-gray-100 border-gray-200 hover:bg-gray-200'
                      }`}
                  />
                ))
              ).flat()}
            </div>
          </div>

          {/* Preset Sizes */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-500 mb-2">Quick Presets</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { rows: 2, cols: 2, label: '2×2' },
                { rows: 2, cols: 3, label: '2×3' },
                { rows: 3, cols: 2, label: '3×2' },
                { rows: 3, cols: 3, label: '3×3' },
                { rows: 3, cols: 4, label: '3×4' },
                { rows: 4, cols: 3, label: '4×3' },
                { rows: 4, cols: 4, label: '4×4' },
                { rows: 4, cols: 5, label: '4×5' },
                { rows: 5, cols: 4, label: '5×4' },
              ].map(({ rows, cols, label }) => (
                <button
                  key={label}
                  onClick={() => {
                    addTableElement(rows, cols)
                    setShowTableOptions(false)
                  }}
                  className="px-3 py-2 text-xs font-medium bg-gray-50 hover:bg-gray-100 rounded-lg transition-all border border-gray-200"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative z-0">
        {/* Left Panel - Frames */}
        <FramesPanel
          frames={frames}
          activeFrame={activeFrameId}
          isFrameFocused={isFrameFocused}
          setActiveFrame={handleFrameFocus}
          addNewFrame={handleAddFrame}
          deleteFrame={deleteFrame}
          duplicateFrame={handleDuplicateFrame}
          reorderFrames={reorderFrames}
          projectTitle={projectTitle}
          templateGradient={templateGradient}
          templateThumbnailUrl={templateThumbnailUrl}
          frameLayouts={frameMapLayout}
          editorBackground={editorBgImage}
          editorMode={editorMode}
        />

        {/* Canvas Area - keep slide fully visible, centered horizontally, toolbar separated below */}
        <div
          ref={canvasRef}
          className={`flex-1 flex flex-col canvas-area relative ${isDragOver ? 'bg-primary/10' : ''} ${isPanning && !selectedElementId ? (isDraggingPan ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
          style={{
            background: editorBgImage
              ? `radial-gradient(circle, rgba(0,0,0,0.15) 1.5px, transparent 1.5px), url("${editorBgImage}") center/cover no-repeat`
              : `radial-gradient(circle, rgba(0,0,0,0.15) 1.5px, transparent 1.5px)`,
            backgroundColor: editorBgImage 
              ? '#111827' // or another default
              : ((frames[0]?.backgroundColor && frames[0]?.backgroundColor !== 'transparent') ? frames[0].backgroundColor : '#f5f5f2'),
            backgroundSize: editorBgImage ? '28px 28px, cover' : '28px 28px',
            minHeight: 0,
            overflow: 'hidden',
            transition: 'all 0.2s ease',
            touchAction: 'none', // Prevent browser from intercepting stylus/touch for scroll/zoom
          }}
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDoubleClick}
          onContextMenu={handleContextMenu}
          onPointerDown={handlePanStart}
          onWheel={handleWheel}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag-drop indicator */}
          {isDragOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary z-50 pointer-events-none">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto text-primary mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-lg font-medium text-primary">Drop images, videos, or audio files here</p>
              </div>
            </div>
          )}
          {/* Infinite canvas viewport */}
          <div className="flex-1 min-h-0 relative overflow-hidden">
            {/* Fixed background rectangle — stays put relative to the viewport
                while the scaled world (slides) pan/zoom behind/above it.
                Rendered OUTSIDE the scale transform so it's visually static. */}
            {editorBgImage && (
              <div
                className="absolute inset-0 rounded-2xl"
                style={{
                  backgroundImage: `url("${editorBgImage}")`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  pointerEvents: 'none',
                  zIndex: 0,
                }}
              />
            )}
            <div
              className="absolute left-0 top-0"
              style={{
                width: `${worldBounds.width}px`,
                height: `${worldBounds.height}px`,
                transform: `scale(${camera.zoom}) translate(${camera.panX}px, ${camera.panY}px)`,
                transformOrigin: 'center center',
                // Nav speed driven by user slider (navSpeedMs)
                transition: isNavigating ? 'none' : `transform ${navSpeedMs}ms cubic-bezier(0.4, 0, 0.2, 1)`,
               zIndex: 1,
              }}
            >
              {/* ===== Project Header (singleton, draggable) ===== */}
              {(() => {
                // Effective position: header.x/y from state when present
                // (set by drag), with a fallback to legacy HEADER_LAYOUT for
                // projects saved before drag was a feature.
                const headerX = (typeof header?.x === 'number') ? header.x : HEADER_LAYOUT.x
                const headerY = (typeof header?.y === 'number') ? header.y : HEADER_LAYOUT.y
                const headerW = (typeof header?.width === 'number') ? header.width : HEADER_LAYOUT.width
                // Hard-floor font size at 64 so legacy projects (saved with
                // fontSize=48) still look like the new "heading" defaults.
                // Once the user changes it via TextToolbar, that value wins.
                const fontSize = Math.max(64, header?.fontSize || 64)

                return (
                  <div
                    data-header-element
                    className="absolute"
                    style={{
                      left: headerX,
                      top: headerY,
                      width: headerW,
                      minHeight: HEADER_LAYOUT.height,
                      cursor: headerEditing ? 'text' : (headerSelected ? 'move' : 'pointer'),
                      zIndex: 5,
                      userSelect: headerEditing ? 'text' : 'none',
                    }}
                    onMouseDown={(e) => {
                      if (headerEditing) return
                      // "Click vs drag" gesture: ≥5px movement counts as drag,
                      // otherwise it's a click → select. Camera zoom is
                      // factored in so screen-px translates to world-px.
                      const startX = e.clientX
                      const startY = e.clientY
                      const startHX = headerX
                      const startHY = headerY
                      let didDrag = false

                      const onMove = (mv) => {
                        const dx = mv.clientX - startX
                        const dy = mv.clientY - startY
                        if (!didDrag && Math.hypot(dx, dy) > 5) {
                          didDrag = true
                          // Once a real drag begins, force-select.
                          setHeaderSelected(true)
                          setSelectedElementId(null)
                          setEditingTextId(null)
                        }
                        if (didDrag) {
                          const worldDx = dx / camera.zoom
                          const worldDy = dy / camera.zoom
                          updateHeader({ x: startHX + worldDx, y: startHY + worldDy })
                        }
                      }
                      const onUp = () => {
                        window.removeEventListener('mousemove', onMove)
                        window.removeEventListener('mouseup', onUp)
                        window.removeEventListener('pointermove', onMove)
                        window.removeEventListener('pointerup', onUp)
                        if (!didDrag) {
                          // Treat as click → select header.
                          setHeaderSelected(true)
                          setSelectedElementId(null)
                          setShowTextToolbar(false)
                          setEditingTextId(null)
                        }
                      }
                      window.addEventListener('mousemove', onMove)
                      window.addEventListener('mouseup', onUp)
                      window.addEventListener('pointermove', onMove)
                      window.addEventListener('pointerup', onUp)
                      e.stopPropagation()
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setHeaderSelected(true)
                      setHeaderEditing(true)
                      setSelectedElementId(null)
                      setShowTextToolbar(false)
                    }}
                  >
                    {headerEditing ? (
                      <textarea
                        autoFocus
                        defaultValue={header?.isPlaceholder ? '' : (header?.content || '')}
                        ref={(el) => { if (el) headerTextareaRef.current = el }}
                        onBlur={(e) => {
                          const next = e.target.value
                          if (!next.trim()) {
                            updateHeader({ content: 'Add a Header text', isPlaceholder: true })
                          } else {
                            updateHeader({ content: next })
                          }
                          setHeaderEditing(false)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') { e.target.blur() }
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur() }
                        }}
                        // Stop drag-start from hijacking textarea text-selection
                        onMouseDown={(e) => e.stopPropagation()}
                        placeholder="Add a Header text"
                        style={{
                          width: '100%',
                          minHeight: HEADER_LAYOUT.height,
                          background: 'transparent',
                          border: '2px solid #1a73e8',
                          borderRadius: '6px',
                          textAlign: header?.textAlign || 'center',
                          fontSize: `${fontSize}px`,
                          lineHeight: 1.15,
                          fontFamily: header?.fontFamily || 'Inter',
                          fontWeight: header?.fontWeight || 'bold',
                          fontStyle: header?.fontStyle || 'normal',
                          textDecoration: header?.textDecoration || 'none',
                          color: header?.color || '#1a1a1a',
                          padding: '12px 24px',
                          outline: 'none',
                          resize: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <div
                        className="w-full flex items-center"
                        style={{
                          minHeight: HEADER_LAYOUT.height,
                          justifyContent:
                            (header?.textAlign === 'right') ? 'flex-end' :
                            (header?.textAlign === 'left') ? 'flex-start' : 'center',
                          border: headerSelected ? '2px solid #1a73e8' : '2px solid transparent',
                          borderRadius: '6px',
                          padding: '12px 24px',
                          boxSizing: 'border-box',
                        }}
                      >
                        <span style={{
                          fontSize: `${fontSize}px`,
                          lineHeight: 1.15,
                          fontFamily: header?.fontFamily || 'Inter',
                          fontWeight: header?.fontWeight || 'bold',
                          fontStyle: header?.fontStyle || 'normal',
                          textDecoration: header?.textDecoration || 'none',
                          color: header?.color || '#1a1a1a',
                          opacity: header?.isPlaceholder ? 0.4 : 1,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          textAlign: header?.textAlign || 'center',
                          width: '100%',
                        }}>
                          {header?.content || 'Add a Header text'}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })()}
              {/* ===== /Project Header ===== */}

              {frameMapLayout.map((frameBox, frameIdx) => {
                const selected = frameBox.id === activeFrameId
                const sizeRank = sortedFramesByArea.findIndex(f => f.id === frameBox.id)
                // Bug 1: only show selection decorations (blue border, shadow
                // boost, resize handles) when the frame also has visual focus.
                // `selected` stays true internally so editing logic keeps using
                // the correct active frame.
                const selectedVisual = selected && isFrameFocused
                const frameData = frames.find(f => f.id === frameBox.id)
                const frameElements = selected ? elements : (frameData?.elements || [])
                // Frame 0 is always the hero/overview — check by index not by preview text
                // All frames including the first (hero) are now resizable and draggable
                const isOverviewFrame = false // removed restriction — hero frame is now also resizable
                // Resize cursor for the active frame border area
                const frameCursor = draggingFrameId === frameBox.id ? 'grabbing' : 'grab'
                // Bug 2: counter-scale border width and border radius by camera
                // zoom so they render at the SAME screen size regardless of how
                // zoomed-in the canvas is. Without this, at zoom 10× a 2px
                // border becomes 20px and a 16px radius becomes 160px, making
                // small frames look absurdly bloated.
                const invZoom = 1 / Math.max(0.0001, camera.zoom)
                const visualBorderWidth = selectedVisual ? 2 * invZoom : 1 * invZoom
                const visualBorderRadius = 16 * invZoom
                return (
                 // Outer wrapper: no overflow-clip, holds resize handles
                  <div
                    key={frameBox.id}
                    data-frame="true"
                    className="absolute"
                    style={{
                      left: frameBox.x, top: frameBox.y,
                      width: frameBox.width, height: frameBox.height,
                      zIndex: draggedFrameZBoost === frameBox.id ? 1000 : (sizeRank * 10 + (selected ? 5 : 0)),
                    }}
                  >
                    {/* Inner frame: clip content, handle click/drag */}
                    <div
                      onClick={(e) => { e.stopPropagation(); handleFrameSingleClick(frameBox.id); }}
                      onDoubleClick={(e) => { e.stopPropagation(); handleFrameDoubleClick(frameBox.id); }}
                      onPointerDown={(e) => { if (!isResizingFrame) handleFrameDragStart(e, frameBox) }}
                      className="absolute inset-0"
                      style={{
                        cursor: frameCursor,
                        border: selectedVisual ? `${visualBorderWidth}px solid #1a73e8` : `${visualBorderWidth}px solid #e5e7eb`,
                        borderRadius: `${visualBorderRadius}px`,
                        opacity: 1,
                        background: frameData?.backgroundImage
                          ? `url("${frameData.backgroundImage}") center/cover no-repeat`
                          : (frameData?.backgroundColor && frameData.backgroundColor !== 'transparent' ? frameData.backgroundColor : 'white'),
                        boxShadow: selectedVisual ? '0 14px 40px rgba(15, 23, 42, 0.18)' : '0 8px 24px rgba(15, 23, 42, 0.12)',
                        overflow: 'hidden',
                        transition: 'border 0.15s, box-shadow 0.15s',
                      }}
                      title={`Frame ${frameIdx + 1}`}
                    >
                    {/* #03 — Force 16:9 content with letterboxing if frame doesn't match */}
                    <div style={{
                      width: SLIDE_WIDTH,
                      height: SLIDE_HEIGHT,
                      transform: `scale(${Math.min(frameBox.width / SLIDE_WIDTH, frameBox.height / SLIDE_HEIGHT)})`,
                      transformOrigin: 'top left',
                      pointerEvents: (selected && isFrameFocused) ? 'auto' : 'none'
                    }}>
                      {/* Canvas Elements */}
                      {frameElements.map((element) => (
                        <div
                          key={`${element.id}-${selected ? animationKey : 'static'}`}
                          onClick={(e) => handleElementClick(element, e)}
                          onDoubleClick={(e) => handleElementDoubleClick(element, e)}
                          onPointerDown={(e) => {
                            if (!isResizing && editingTextId !== element.id && !element.isPlaceholder) {
                              handleDragStart(e, element)
                            }
                          }}
                          className={`absolute transition-shadow duration-150 ${isDragging && selectedElementId === element.id ? 'is-dragging opacity-90 shadow-lg' : ''
                            } ${editingTextId === element.id ? 'cursor-text is-editing' : (element.isPlaceholder ? 'cursor-text' : 'cursor-move')
                            } ${selectedElementId === element.id
                              ? 'ring-2 ring-[#0078d7] ring-offset-1 z-50'
                              : 'hover:ring-2 hover:ring-[#0078d7]/30'
                            } ${getAnimationClass(element)}`}
                          style={{
                            left: element.x,
                            top: element.y,
                            width: element.width,
                            height: (editingTextId === element.id && element.type === 'text') ? 'auto' : element.height,
                            minHeight: (editingTextId === element.id && element.type === 'text') ? element.height : undefined,
                            ...getAnimationStyle(element),
                          }}
                        >
                          {renderElement(element)}

                          {/* #09 — Resize Handles: clean minimal directional arrows at corners/edges */}
                          {selectedElementId === element.id && !editingTextId && (
                            <>
                              {/* Corner handles — small transparent hit areas with directional arrows */}
                              <div className="absolute -top-2.5 -left-2.5 w-5 h-5 cursor-nw-resize flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, 'nw', element)} title="Resize">
                                <svg width="10" height="10" viewBox="0 0 10 10" stroke="#0078d7" strokeWidth="2" fill="none"><path d="M1 9L1 1L9 1" /></svg>
                              </div>
                              <div className="absolute -top-2.5 -right-2.5 w-5 h-5 cursor-ne-resize flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, 'ne', element)} title="Resize">
                                <svg width="10" height="10" viewBox="0 0 10 10" stroke="#0078d7" strokeWidth="2" fill="none"><path d="M9 9L9 1L1 1" /></svg>
                              </div>
                              <div className="absolute -bottom-2.5 -left-2.5 w-5 h-5 cursor-sw-resize flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, 'sw', element)} title="Resize">
                                <svg width="10" height="10" viewBox="0 0 10 10" stroke="#0078d7" strokeWidth="2" fill="none"><path d="M1 1L1 9L9 9" /></svg>
                              </div>
                              <div className="absolute -bottom-2.5 -right-2.5 w-5 h-5 cursor-se-resize flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, 'se', element)} title="Resize">
                                <svg width="10" height="10" viewBox="0 0 10 10" stroke="#0078d7" strokeWidth="2" fill="none"><path d="M9 1L9 9L1 9" /></svg>
                              </div>
                              {/* Edge handles — thin lines with arrow hints */}
                              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-2 cursor-n-resize flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, 'n', element)}>
                                <svg width="12" height="4" viewBox="0 0 12 4" stroke="#0078d7" strokeWidth="1.5" fill="none"><path d="M2 3L6 1L10 3" /></svg>
                              </div>
                              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-2 cursor-s-resize flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, 's', element)}>
                                <svg width="12" height="4" viewBox="0 0 12 4" stroke="#0078d7" strokeWidth="1.5" fill="none"><path d="M2 1L6 3L10 1" /></svg>
                              </div>
                              <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-6 cursor-w-resize flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, 'w', element)}>
                                <svg width="4" height="12" viewBox="0 0 4 12" stroke="#0078d7" strokeWidth="1.5" fill="none"><path d="M3 2L1 6L3 10" /></svg>
                              </div>
                              <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-6 cursor-e-resize flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity" onMouseDown={(e) => handleResizeStart(e, 'e', element)}>
                                <svg width="4" height="12" viewBox="0 0 4 12" stroke="#0078d7" strokeWidth="1.5" fill="none"><path d="M1 2L3 6L1 10" /></svg>
                              </div>

                              <div className="absolute -top-10 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); copyElement(element.id); toast.info('Copied to clipboard'); }} className="p-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded transition-all" title="Copy (Ctrl+C)">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); duplicateElement(element.id); toast.success('Duplicated'); }} className="p-1.5 bg-primary hover:bg-primary-dark text-white rounded transition-all" title="Duplicate (creates copy here)">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /><path d="M14 11v6M11 14h6" /></svg>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); deleteElement(element.id); }} className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded transition-all" title="Delete (Del)">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    </div>

                    {/* #09 — Frame resize handles: minimal directional arrows */}
                    {/* Handles are inverse-scaled by the current camera zoom so they remain
                        a constant size on screen regardless of how zoomed the canvas is. */}
                    {selectedVisual && !isOverviewFrame && (
                      <>
                        {/* Corner handles — directional L-shaped arrows */}
                        <div className="absolute -top-2.5 -left-2.5 w-5 h-5 cursor-nw-resize flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity z-20" style={{ transform: `scale(${1 / camera.zoom})`, transformOrigin: 'top left' }} onMouseDown={(e) => handleFrameResizeStart(e, 'nw', frameBox)}>
                          <svg width="10" height="10" viewBox="0 0 10 10" stroke="#1a73e8" strokeWidth="2" fill="none"><path d="M1 9L1 1L9 1" /></svg>
                        </div>
                        <div className="absolute -top-2.5 -right-2.5 w-5 h-5 cursor-ne-resize flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity z-20" style={{ transform: `scale(${1 / camera.zoom})`, transformOrigin: 'top right' }} onMouseDown={(e) => handleFrameResizeStart(e, 'ne', frameBox)}>
                          <svg width="10" height="10" viewBox="0 0 10 10" stroke="#1a73e8" strokeWidth="2" fill="none"><path d="M9 9L9 1L1 1" /></svg>
                        </div>
                        <div className="absolute -bottom-2.5 -left-2.5 w-5 h-5 cursor-sw-resize flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity z-20" style={{ transform: `scale(${1 / camera.zoom})`, transformOrigin: 'bottom left' }} onMouseDown={(e) => handleFrameResizeStart(e, 'sw', frameBox)}>
                          <svg width="10" height="10" viewBox="0 0 10 10" stroke="#1a73e8" strokeWidth="2" fill="none"><path d="M1 1L1 9L9 9" /></svg>
                        </div>
                        <div className="absolute -bottom-2.5 -right-2.5 w-5 h-5 cursor-se-resize flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity z-20" style={{ transform: `scale(${1 / camera.zoom})`, transformOrigin: 'bottom right' }} onMouseDown={(e) => handleFrameResizeStart(e, 'se', frameBox)}>
                          <svg width="10" height="10" viewBox="0 0 10 10" stroke="#1a73e8" strokeWidth="2" fill="none"><path d="M9 1L9 9L1 9" /></svg>
                        </div>
                        {/* Edge handles — directional chevrons */}
                        <div className="absolute top-1/2 -translate-y-1/2 -left-2 w-3 h-6 cursor-w-resize flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity z-20" style={{ transform: `translateY(-50%) scale(${1 / camera.zoom})`, transformOrigin: 'left center' }} onMouseDown={(e) => handleFrameResizeStart(e, 'w', frameBox)}>
                          <svg width="5" height="14" viewBox="0 0 5 14" stroke="#1a73e8" strokeWidth="1.5" fill="none"><path d="M4 2L1 7L4 12" /></svg>
                        </div>
                        <div className="absolute top-1/2 -translate-y-1/2 -right-2 w-3 h-6 cursor-e-resize flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity z-20" style={{ transform: `translateY(-50%) scale(${1 / camera.zoom})`, transformOrigin: 'right center' }} onMouseDown={(e) => handleFrameResizeStart(e, 'e', frameBox)}>
                          <svg width="5" height="14" viewBox="0 0 5 14" stroke="#1a73e8" strokeWidth="1.5" fill="none"><path d="M1 2L4 7L1 12" /></svg>
                        </div>
                        <div className="absolute left-1/2 -translate-x-1/2 -top-2 h-3 w-6 cursor-n-resize flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity z-20" style={{ transform: `translateX(-50%) scale(${1 / camera.zoom})`, transformOrigin: 'top center' }} onMouseDown={(e) => handleFrameResizeStart(e, 'n', frameBox)}>
                          <svg width="14" height="5" viewBox="0 0 14 5" stroke="#1a73e8" strokeWidth="1.5" fill="none"><path d="M2 4L7 1L12 4" /></svg>
                        </div>
                        <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 h-3 w-6 cursor-s-resize flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity z-20" style={{ transform: `translateX(-50%) scale(${1 / camera.zoom})`, transformOrigin: 'bottom center' }} onMouseDown={(e) => handleFrameResizeStart(e, 's', frameBox)}>
                          <svg width="14" height="5" viewBox="0 0 14 5" stroke="#1a73e8" strokeWidth="1.5" fill="none"><path d="M2 1L7 4L12 1" /></svg>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}

              {/* Text edit hint - PowerPoint style */}
              {selectedElement?.type === 'text' && !editingTextId && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-gray-900/90 text-white text-xs px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 backdrop-blur-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  <span>{selectedElement.isPlaceholder ? 'Click to start typing' : 'Double-click to edit'}</span>
                  <span className="kbd">Enter</span>
                </div>
              )}
            </div>
          </div>

          {/* Description / context hint — shown when slide has no elements selected */}
          {!selectedElementId && !editingTextId && elements.length === 0 && (
            <div className="flex items-center justify-center py-3 flex-shrink-0">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Use the toolbar above to add text, shapes, or images to your slide.</p>
                <p className="text-xs text-gray-400 mt-0.5">Click on the slide to start editing · Double-click a text block to type</p>
              </div>
            </div>
          )}

          {/* Bottom Floating Navigation */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20" onClick={(e) => e.stopPropagation()}>
            <div className="h-10 px-3 rounded-xl bg-white border border-gray-200 shadow-md flex items-center gap-3 text-gray-700">
              <button
                onClick={() => {
                  setSelectedElementId(null)
                  setIsPanning(prev => !prev)
                }}
                className={`text-base hover:text-gray-900 transition-all ${isPanning ? 'bg-blue-100 rounded px-1' : ''}`}
                title="Hand tool (Space)"
              >
                ✋
              </button>

              <span className="text-sm font-semibold text-gray-600 min-w-[40px] text-center" title="Current frame">
                {Math.max(1, frames.findIndex(f => f.id === activeFrameId) + 1)} / {frames.length}
              </span>

              <button
                onClick={() => {
                  const currentIndex = frames.findIndex(f => f.id === activeFrameId)
                  if (currentIndex > 0) {
                    pendingFocusModeRef.current = 'frame'
                    handleFrameFocus(frames[currentIndex - 1].id, 'frame')
                  }
                }}
                disabled={frames.findIndex(f => f.id === activeFrameId) <= 0}
                className="text-lg hover:text-gray-900 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                title="Previous frame"
              >
                ←
              </button>

              <button
                onClick={() => {
                  const currentIndex = frames.findIndex(f => f.id === activeFrameId)
                  if (currentIndex < frames.length - 1) {
                    pendingFocusModeRef.current = 'frame'
                    handleFrameFocus(frames[currentIndex + 1].id, 'frame')
                  }
                }}
                disabled={frames.findIndex(f => f.id === activeFrameId) >= frames.length - 1}
                className="text-lg hover:text-gray-900 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next frame"
              >
                →
              </button>

              <button
                onClick={() => frames[0] && handleFrameFocus(frames[0].id, 'overview')}
                className="text-sm hover:text-gray-900 transition-all"
                title="Overview"
              >
                🏠
              </button>

              <button
                onClick={() => {
                  // #04 — Smooth zoom with CSS transition
                  setIsNavigating(false) // enable CSS transition
                  const next = Math.max(0.1, camera.zoom - 0.1)
                  if (canvasRef.current) {
                    const rect = canvasRef.current.getBoundingClientRect()
                    const originX = worldBounds.width / 2
                    const originY = worldBounds.height / 2
                    const viewportCenterX = rect.width / 2
                    const viewportCenterY = rect.height / 2
                    setCamera(prev => ({
                      zoom: next,
                      panX: prev.panX + (viewportCenterX - originX) * (1 / next - 1 / prev.zoom),
                      panY: prev.panY + (viewportCenterY - originY) * (1 / next - 1 / prev.zoom)
                    }))
                  } else {
                    setCamera(prev => ({ ...prev, zoom: next }))
                  }
                  setZoom(Math.round(next * 100))
                }}
                className="text-lg hover:text-gray-900 transition-all"
                title="Zoom out"
              >
                −
              </button>

              <button
                onClick={focusOverview}
                className="text-sm font-semibold hover:text-gray-900 transition-all"
                title="Reset zoom"
              >
                {Math.round(camera.zoom * 100)}%
              </button>

              <button
                onClick={() => {
                  // #04 — Smooth zoom with CSS transition
                  setIsNavigating(false) // enable CSS transition
                  const next = Math.min(15.0, camera.zoom + 0.1)
                  if (canvasRef.current) {
                    const rect = canvasRef.current.getBoundingClientRect()
                    const originX = worldBounds.width / 2
                    const originY = worldBounds.height / 2
                    const viewportCenterX = rect.width / 2
                    const viewportCenterY = rect.height / 2
                    setCamera(prev => ({
                      zoom: next,
                      panX: prev.panX + (viewportCenterX - originX) * (1 / next - 1 / prev.zoom),
                      panY: prev.panY + (viewportCenterY - originY) * (1 / next - 1 / prev.zoom)
                    }))
                  } else {
                    setCamera(prev => ({ ...prev, zoom: next }))
                  }
                  setZoom(Math.round(next * 100))
                }}
                className="text-lg hover:text-gray-900 transition-all"
                title="Zoom in"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel — context-aware, collapsible */}
        <div
          className="bg-white border-l border-gray-200 flex flex-col overflow-hidden transition-all duration-200"
          style={{ width: rightPanelCollapsed ? '32px' : undefined, minWidth: rightPanelCollapsed ? '32px' : '220px', maxWidth: rightPanelCollapsed ? '32px' : '256px' }}
        >
          {/* Collapse toggle strip */}
          <button
            onClick={() => setRightPanelCollapsed(c => !c)}
            className="flex items-center justify-center h-8 border-b border-gray-200 hover:bg-gray-50 transition-all shrink-0"
            title={rightPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {rightPanelCollapsed
                ? <polyline points="15 18 9 12 15 6" />
                : <polyline points="9 18 15 12 9 6" />}
            </svg>
          </button>

          {!rightPanelCollapsed && (
          <>
          {/* Tab Header */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setRightPanelTab('properties')}
              className={`flex-1 px-2 py-2 text-xs font-medium transition-all ${rightPanelTab === 'properties' ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {selectedElement ? selectedElement.type.charAt(0).toUpperCase() + selectedElement.type.slice(1) : 'Properties'}
            </button>
            <button
              onClick={() => setRightPanelTab('design')}
              className={`flex-1 px-2 py-2 text-xs font-medium transition-all ${rightPanelTab === 'design' ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Design
            </button>
            <button
              onClick={() => setRightPanelTab('notes')}
              className={`flex-1 px-2 py-2 text-xs font-medium transition-all ${rightPanelTab === 'notes' ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Notes
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Properties Tab */}
            {rightPanelTab === 'properties' && selectedElement && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Type</label>
                  <p className="text-sm text-gray-900 capitalize">{selectedElement.type}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">X</label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.x)}
                      onChange={(e) => updateElement(selectedElementId, { x: parseInt(e.target.value) || 0 })}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Y</label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.y)}
                      onChange={(e) => updateElement(selectedElementId, { y: parseInt(e.target.value) || 0 })}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Width</label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.width)}
                      onChange={(e) => updateElement(selectedElementId, { width: Math.max(50, parseInt(e.target.value) || 50) })}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Height</label>
                    <input
                      type="number"
                      value={Math.round(selectedElement.height)}
                      onChange={(e) => updateElement(selectedElementId, { height: Math.max(30, parseInt(e.target.value) || 30) })}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                    />
                  </div>
                </div>

                {/* Shape Properties - Full controls */}
                {selectedElement.type === 'shape' && (
                  <>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Fill Color</label>
                      <input
                        type="color"
                        value={selectedElement.fill || '#2E7D32'}
                        onChange={(e) => updateElement(selectedElementId, { fill: e.target.value })}
                        className="w-full h-8 cursor-pointer rounded border border-gray-200"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Opacity ({selectedElement.opacity || 100}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={selectedElement.opacity || 100}
                        onChange={(e) => updateElement(selectedElementId, { opacity: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1">Rotation ({selectedElement.rotation || 0}°)</label>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={selectedElement.rotation || 0}
                        onChange={(e) => updateElement(selectedElementId, { rotation: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>
                  </>
                )}

                {/* Icon Properties - Simplified */}
                {selectedElement.type === 'icon' && (
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Icon Color</label>
                    <input
                      type="color"
                      value={selectedElement.color || '#333333'}
                      onChange={(e) => updateElement(selectedElementId, { color: e.target.value })}
                      className="w-full h-8 cursor-pointer rounded border border-gray-200"
                    />
                  </div>
                )}

                {/* Animation Controls */}
                <div className="pt-3 border-t border-gray-100">
                  <label className="text-xs text-gray-500 block mb-2">Animation</label>
                  <select
                    value={selectedElement.animation?.type || selectedElement.animation || 'none'}
                    onChange={(e) => updateElementAnimation(selectedElementId, { type: e.target.value, duration: ANIMATION_PRESETS[e.target.value]?.duration || 500 })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded mb-2"
                  >
                    {Object.entries(ANIMATION_PRESETS).map(([key, preset]) => (
                      <option key={key} value={key}>{preset.name}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-400">Speed (ms)</label>
                      <input
                        type="number"
                        min="100"
                        max="2000"
                        step="50"
                        value={selectedElement.animation?.duration || selectedElement.animationSpeed || 300}
                        onChange={(e) => updateElementAnimation(selectedElementId, { type: selectedElement.animation?.type || selectedElement.animation || 'none', duration: parseInt(e.target.value) || 300 })}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Delay (ms)</label>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={selectedElement.animationDelay || 0}
                        onChange={(e) => updateElement(selectedElementId, { animationDelay: parseInt(e.target.value) || 0 })}
                        className="w-full px-2 py-1 text-sm border border-gray-200 rounded"
                      />
                    </div>
                  </div>
                  <button
                    onClick={previewAnimations}
                    className="w-full mt-2 px-3 py-2 text-sm bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Preview All Animations
                  </button>
                </div>

                {/* Layer controls */}
                <div className="pt-3 border-t border-gray-100">
                  <label className="text-xs text-gray-500 block mb-2">Layer Order</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => bringToFront(selectedElementId)}
                      className="flex-1 px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-all"
                    >
                      Bring to Front
                    </button>
                    <button
                      onClick={() => sendToBack(selectedElementId)}
                      className="flex-1 px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-all"
                    >
                      Send to Back
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100">
                  <div className="flex gap-2">
                    <button
                      onClick={() => duplicateElement(selectedElementId)}
                      className="flex-1 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-all"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => deleteElement(selectedElementId)}
                      className="flex-1 px-3 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-all"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

            {rightPanelTab === 'properties' && !selectedElement && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Frame title</label>
                  <input
                    type="text"
                    value={activeFrame?.title || ''}
                    onChange={(e) => updateFrameTitle(activeFrameId, e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-sm border border-gray-200 rounded-lg"
                    placeholder="Frame title"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wider">Next frame preview</label>
                  {(() => {
                    const currentIndex = frames.findIndex((f) => f.id === activeFrameId)
                    const next = currentIndex >= 0 ? frames[currentIndex + 1] : null
                    if (!next) return <p className="text-xs text-gray-400 mt-2">No next frame</p>
                    return (
                      <div
                        className="mt-2 rounded-xl border border-gray-200 p-2 bg-gray-50 cursor-pointer hover:border-primary/40 transition-all"
                        onClick={() => handleFrameFocus(next.id, 'frame')}
                        title="Click to go to next frame"
                      >
                        <div className="relative aspect-[16/9] rounded-md border border-gray-200 bg-white overflow-hidden">
                          <div className="absolute inset-0" style={{
                            backgroundColor: next.backgroundColor || '#ffffff',
                            backgroundImage: next.backgroundImage ? `url(${next.backgroundImage})` : 'none',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }} />
                          {(next.elements || []).slice(0, 6).map(el => {
                            if (!el || el.isPlaceholder) return null
                            return (
                              <div key={el.id} className="absolute overflow-hidden" style={{
                                left: `${(el.x / 1280) * 100}%`,
                                top: `${(el.y / 720) * 100}%`,
                                width: `${((el.width || 100) / 1280) * 100}%`,
                                height: `${((el.height || 60) / 720) * 100}%`,
                                background: el.type === 'text' ? 'transparent' : '#d1d5db',
                                color: '#111827',
                                fontSize: '6px',
                                fontWeight: 700,
                                borderRadius: '1px',
                              }}>
                                {el.type === 'text' ? (el.content || '').slice(0, 20) : null}
                              </div>
                            )
                          })}
                        </div>
                        <p className="text-center text-[11px] font-medium text-gray-600 mt-1.5">
                          {next.title || `Frame ${currentIndex + 2}`}
                        </p>
                        <div className="text-center text-gray-400 text-xs mt-0.5">˅˅</div>
                      </div>
                    )
                  })()}
                </div>

                <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">
                  Frame size on canvas: {Math.round(activeFrameLayout.width)} × {Math.round(activeFrameLayout.height)}
                </div>
              </div>
            )}

            {/* Design Tab (Background Images) */}
            {rightPanelTab === 'design' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500 font-medium">Presentation Background</p>

                {/* Remove background button */}
                <button
                  onClick={() => {
                    setEditorBackground(null)
                    // Clear background from all frames
                    // Clear background from all frames removed
                  }}
                  className={`w-full px-3 py-2 text-xs rounded-lg transition-all flex items-center gap-2 ${
                    !editorBgImage
                      ? 'bg-primary/10 text-primary border border-primary/30'
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200'
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  No Background
                </button>

                {/* Search filter */}
                <input
                  type="text"
                  value={bgSearchFilter}
                  onChange={(e) => setBgSearchFilter(e.target.value)}
                  placeholder="Search backgrounds..."
                  className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                />

                {/* Background images grouped by topic */}
                {Object.entries(backgroundData)
                  .filter(([topic]) => !bgSearchFilter || topic.toLowerCase().includes(bgSearchFilter.toLowerCase()))
                  .map(([topic, images]) => (
                  <div key={topic}>
                    <p className="text-xs font-semibold text-gray-700 mb-1.5 mt-2">{topic}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {images.map((imgPath, idx) => (
                        <button
                          key={imgPath}
                          onClick={() => {
                            setEditorBackground(imgPath)
                            // Apply to all frames so slides actually show the background
                            // Apply to all frames removed
                          }}
                          className={`relative aspect-[16/9] rounded-md overflow-hidden border-2 transition-all hover:scale-105 hover:shadow-md ${
                            editorBgImage === imgPath
                              ? 'border-primary ring-2 ring-primary/30 shadow-md'
                              : 'border-gray-200 hover:border-gray-400'
                          }`}
                          title={`${topic} ${idx + 1}`}
                        >
                          <img
                            src={imgPath}
                            alt={`${topic} ${idx + 1}`}
                            className="w-full h-full object-fill"
                            loading="lazy"
                          />
                          {editorBgImage === imgPath && (
                            <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Notes Tab (Speaker Notes) */}
            {rightPanelTab === 'notes' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Speaker notes for this slide (visible only to presenter)</p>
                <textarea
                  value={activeFrame?.notes || ''}
                  onChange={(e) => updateFrameNotes(activeFrameId, e.target.value)}
                  placeholder="Add speaker notes for this slide..."
                  className="w-full h-64 px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div>
                  <label className="text-xs text-gray-500 block mb-2">Slide Transition</label>
                  <select
                    value={activeFrame?.transition || 'fade'}
                    onChange={(e) => updateFrameTransition(activeFrameId, e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                  >
                    {Object.entries(SLIDE_TRANSITIONS).map(([key, name]) => (
                      <option key={key} value={key}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Navigation Speed — always visible at bottom of panel */}
            <div className="pt-4 border-t border-gray-100 mt-2">
              <label className="text-xs text-gray-500 block mb-1">Slide Transition Speed</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Fast</span>
                <input
                  type="range" min="300" max="3000" step="100"
                  value={navSpeedMs}
                  onChange={e => setNavSpeedMs(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-xs text-gray-400">Slow</span>
              </div>
              <p className="text-xs text-gray-400 text-center mt-0.5">{(navSpeedMs / 1000).toFixed(1)}s</p>
            </div>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Right Click Context Menu */}
      {contextMenu && (
        <RightClickMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onAction={handleContextMenuAction}
          hasSelection={!!selectedElementId}
          currentBackground={activeFrame?.backgroundColor || '#ffffff'}
          currentColor={selectedElement?.fill || selectedElement?.color || '#2E7D32'}
        />
      )}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
        mode="editor"
      />

      {/* Video Export Modal */}
      <VideoExportModal 
        isOpen={showVideoExportModal} 
        onClose={() => setShowVideoExportModal(false)} 
      />

      {/* Web Image Search Modal */}
      {showWebImageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] shadow-xl flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Search Images from Web</h3>
              <button onClick={() => setShowWebImageModal(false)} className="text-gray-400 hover:text-gray-800">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={webImageQuery}
                onChange={(e) => setWebImageQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // search
                    setIsSearchingWebImage(true);
                    setTimeout(() => {
                      const results = Array.from({length: 12}).map((_, i) => ({
                        id: `img_${Date.now()}_${i}`,
                        url: `https://picsum.photos/seed/${webImageQuery.replace(/[^a-zA-Z0-9]/g, '')}${i}/800/600`,
                        thumb: `https://picsum.photos/seed/${webImageQuery.replace(/[^a-zA-Z0-9]/g, '')}${i}/200/150`
                      }));
                      setWebImageResults(results);
                      setIsSearchingWebImage(false);
                    }, 600);
                  }
                }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Type to search and press Enter..."
                autoFocus
              />
              <button 
                onClick={() => {
                  setIsSearchingWebImage(true);
                  setTimeout(() => {
                    const results = Array.from({length: 12}).map((_, i) => ({
                      id: `img_${Date.now()}_${i}`,
                      url: `https://picsum.photos/seed/${webImageQuery.replace(/[^a-zA-Z0-9]/g, '')}${i}/800/600`,
                      thumb: `https://picsum.photos/seed/${webImageQuery.replace(/[^a-zA-Z0-9]/g, '')}${i}/200/150`
                    }));
                    setWebImageResults(results);
                    setIsSearchingWebImage(false);
                  }, 600);
                }}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                Search
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-[300px] border border-gray-100 rounded-lg p-2 bg-gray-50">
              {isSearchingWebImage ? (
                <div className="w-full h-full flex items-center justify-center text-gray-500">Searching...</div>
              ) : webImageResults.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {webImageResults.map(img => (
                    <button 
                      key={img.id}
                      onClick={() => {
                        // integrate image into canvas
                        addImageElement(img.url);
                        setShowWebImageModal(false);
                        toast.success('Image added from web');
                      }}
                      className="aspect-video relative rounded-md overflow-hidden border border-gray-200 hover:border-primary hover:shadow-md transition-all group"
                    >
                      <img src={img.thumb} alt="Search result" className="w-full h-full object-fill" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                        <span className="text-white text-xs font-semibold">Add Image</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                  <p>Search for images to add to your slide</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Video URL Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Add Video</h3>
            <p className="text-sm text-gray-600 mb-4">Enter a YouTube URL or paste a video link</p>
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=... or video URL"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowVideoModal(false); setVideoUrl(''); }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleVideoSubmit}
                disabled={!videoUrl.trim()}
                className="flex-1 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-all disabled:opacity-50"
              >
                Add Video
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3 text-center">Or drag & drop a video file onto the canvas</p>
          </div>
        </div>
      )}

      {/* Web Image Search Modal */}
      {/* Version History Panel */}
      {showVersionHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Version History</h3>
              <button onClick={() => setShowVersionHistory(false)} className="p-1 hover:bg-gray-100 rounded">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <button
              onClick={() => { saveVersion(); toast.success('Version saved'); }}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-all mb-4"
            >
              Save Current Version
            </button>
            <div className="flex-1 overflow-y-auto space-y-2">
              {versionHistory.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No versions saved yet</p>
              ) : (
                versionHistory.slice().reverse().map((version) => (
                  <div key={version.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{version.name}</p>
                      <p className="text-xs text-gray-500">{new Date(version.timestamp).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { loadVersion(version.id); setShowVersionHistory(false); toast.success('Version restored'); }}
                        className="px-3 py-1 text-xs bg-primary text-white rounded hover:bg-primary-dark transition-all"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => deleteVersion(version.id)}
                        className="px-3 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200 transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Plan Modal */}
      {showUpgradeModal && (
        <UpgradePlanModal onClose={() => setShowUpgradeModal(false)} />
      )}

    </div>
  )
}

export default EditorPage


