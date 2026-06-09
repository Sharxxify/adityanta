import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { safeGetItem, safeSetItem } from '../../utils/safeStorage'
import { buildSlideRenderNode, SLIDE_HEIGHT, SLIDE_WIDTH } from '../../utils/slideRender'
import { decodeSharePayload } from '../../utils/shareUtils'
import { useEditor } from '../../context/EditorContext'
import logo from '../../assets/logo.png'
import logger from '../../utils/logger'

const SHARE_STORAGE_KEY = 'adityanta_shares'

const getSharedPresentation = (shareId) => {
  const shares = safeGetItem(SHARE_STORAGE_KEY, {})
  logger.info('Checking shared presentation:', { shareId, availableShares: Object.keys(shares) })
  return shares[shareId] || null
}

const getHashSharePayload = () => {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
  const hashParams = new URLSearchParams(hash || '')
  return hashParams.get('data') || null
}

const SharePage = () => {
  const { shareId } = useParams()
  const navigate = useNavigate()
  const { loadTemplate } = useEditor()
  const slideViewportRef = useRef(null)
  const [presentation, setPresentation] = useState(null)
  const [currentSlide, setCurrentSlide] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewportSize, setViewportSize] = useState({ width: SLIDE_WIDTH, height: SLIDE_HEIGHT })

  useEffect(() => {
    const node = slideViewportRef.current
    if (!node) return undefined

    const updateSize = () => {
      setViewportSize({
        width: Math.max(320, node.clientWidth || SLIDE_WIDTH),
        height: Math.max(180, node.clientHeight || SLIDE_HEIGHT)
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadPresentation = async () => {
      try {
        const encodedPayload = getHashSharePayload()
        if (encodedPayload) {
          const decoded = await decodeSharePayload(encodedPayload)
          if (!cancelled) {
            setPresentation(decoded)
            const shares = safeGetItem(SHARE_STORAGE_KEY, {})
            shares[shareId] = {
              ...decoded,
              sharedAt: decoded.sharedAt || new Date().toISOString()
            }
            safeSetItem(SHARE_STORAGE_KEY, shares)
          }
        } else {
          const localData = getSharedPresentation(shareId)
          if (localData && !cancelled) {
            setPresentation(localData)
          } else if (!cancelled) {
            setError('Presentation not found or this link was created on another device without embedded data.')
          }
        }
      } catch (loadError) {
        logger.error('Failed to open share link:', loadError)
        if (!cancelled) setError(loadError.message || 'Unable to open this shared presentation')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPresentation()
    return () => { cancelled = true }
  }, [shareId])

  useEffect(() => {
    const mountNode = slideViewportRef.current
    const frame = presentation?.frames?.[currentSlide]
    if (!mountNode || !frame) return undefined

    mountNode.innerHTML = ''
    const slideNode = buildSlideRenderNode(frame, viewportSize)
    mountNode.appendChild(slideNode)
    return () => {
      mountNode.innerHTML = ''
    }
  }, [presentation, currentSlide, viewportSize])

  const handleOpenInEditor = async () => {
    if (!presentation) return
    try {
      const { saveProject } = await import('../../utils/indexedDBHelper')
      const newProjectId = `shared_${Date.now()}`
      const newProject = {
        id: newProjectId,
        title: `${presentation.title || 'Shared Project'} - Copy`,
        frames: presentation.frames || [],
        isUserUpload: true,
        uploadedAt: new Date().toISOString()
      }
      const success = saveProject(newProject)
      if (success) {
        navigate(`/editor/${newProjectId}`)
      } else {
        setError('Failed to create a local copy to edit.')
      }
    } catch (err) {
      logger.error('Failed to copy project for editing:', err)
      setError('Could not prepare project for editing.')
    }
  }

  // Keyboard navigation
  useEffect(() => {
    if (!presentation) return
    const total = presentation.frames?.length || 0
    const handler = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault()
        setCurrentSlide(s => Math.min(total - 1, s + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setCurrentSlide(s => Math.max(0, s - 1))
      } else if (e.key === 'Home') {
        setCurrentSlide(0)
      } else if (e.key === 'End') {
        setCurrentSlide(total - 1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [presentation])

  const handlePresent = () => {
    if (!presentation) return
    // Load shared frames into EditorContext directly — avoids overwriting the owner's autosave
    loadTemplate({ title: presentation.title, frames: presentation.frames })
    navigate('/present')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading presentation...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <img src={logo} alt="Adityanta" className="h-12 mx-auto mb-6" />
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" className="mx-auto mb-4">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Presentation Not Found</h1>
          <p className="text-gray-500 mb-6">{error}</p>
          <button
            onClick={() => navigate('/home')}
            className="px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <img src={logo} alt="Adityanta" className="h-8" />
          <div className="min-w-0">
            <h1 className="font-semibold text-gray-900 truncate">{presentation?.title || 'Shared Presentation'}</h1>
            <p className="text-xs text-gray-500">{presentation?.frames?.length || 0} slides</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleOpenInEditor}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>
          <button
            onClick={handlePresent}
            className="px-4 py-2 text-sm font-medium bg-primary text-white hover:bg-primary-dark rounded-lg transition-colors flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Present
          </button>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-6xl aspect-video">
          <div ref={slideViewportRef} className="w-full h-full bg-white rounded-xl shadow-2xl overflow-hidden" />
        </div>
      </div>

      <div className="bg-white border-t border-gray-200 px-4 py-3">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
            disabled={currentSlide === 0}
            aria-label="Previous slide"
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            {presentation?.frames?.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${index === currentSlide ? 'bg-primary w-6' : 'bg-gray-300 hover:bg-gray-400'}`}
              />
            ))}
          </div>

          <button
            onClick={() => setCurrentSlide(Math.min((presentation?.frames?.length || 1) - 1, currentSlide + 1))}
            disabled={currentSlide === (presentation?.frames?.length || 1) - 1}
            aria-label="Next slide"
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          <span className="text-sm text-gray-500 ml-4">
            {currentSlide + 1} / {presentation?.frames?.length || 0}
          </span>
        </div>
      </div>
    </div>
  )
}

export default SharePage
