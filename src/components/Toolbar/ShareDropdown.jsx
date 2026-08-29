import { useState, useRef, useEffect } from 'react'
import { useEditor } from '../../context/EditorContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { exportToPDF, exportToPPTX, exportToMP4Universal, detectVideoCapabilities } from '../../utils/exportUtils'
import { isPremiumUser } from '../../utils/membership'
import { userAPI } from '../../services/api'
import { FRONTEND_CONFIG } from '../../config'
import logger from '../../utils/logger'
import { encodeSharePayload } from '../../utils/shareUtils'

const ShareDropdown = ({ onClose, onUpgrade, onExportVideo }) => {
  const { frames, projectTitle, exportProject, editorBackground, header } = useEditor()
  const { user, refreshUser } = useAuth()
  const toast = useToast()
  const [exporting, setExporting] = useState(null)
  const [videoCapabilities, setVideoCapabilities] = useState(null)
  const dropdownRef = useRef(null)

  const isPremium = isPremiumUser(user)

  // Detect video export capabilities on mount
  useEffect(() => {
    const capabilities = detectVideoCapabilities()
    setVideoCapabilities(capabilities)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Strip base64 image data from frames before sharing — keeps URL small
  const stripImagesFromFrames = (frames) => {
    if (!Array.isArray(frames)) return frames
    return frames.map(frame => ({
      ...frame,
      elements: Array.isArray(frame.elements)
        ? frame.elements.map(el => {
            if (el.src && typeof el.src === 'string' && el.src.startsWith('data:')) {
              return { ...el, src: '' }
            }
            if (el.backgroundImage && typeof el.backgroundImage === 'string' && el.backgroundImage.startsWith('data:')) {
              return { ...el, backgroundImage: '' }
            }
            return el
          })
        : frame.elements,
      // Also strip slide-level background images
      ...(frame.background && typeof frame.background === 'string' && frame.background.startsWith('data:')
        ? { background: '' }
        : {})
    }))
  }

  const isLocalhostUrl = (url) => {
    try {
      const { hostname } = new URL(url)
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')
    } catch {
      return false
    }
  }

  const shortenUrl = async (longUrl) => {
    // URL shorteners can't resolve local dev URLs — skip on localhost
    if (isLocalhostUrl(longUrl)) return null

    // Try TinyURL first (generous URL length limit)
    try {
      const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`)
      if (res.ok) {
        const short = (await res.text()).trim()
        if (short.startsWith('http')) return short
      }
    } catch (e) {
      logger.warn('TinyURL failed:', e)
    }
    // Fallback: is.gd
    try {
      const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`)
      const json = await res.json()
      if (json.shorturl) return json.shorturl
    } catch (e) {
      logger.warn('is.gd failed:', e)
    }
    return null
  }

  const handleGetLink = async () => {
    try {
      const data = exportProject()
      const sharedAt = new Date().toISOString()
      const shareId = 'share_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      const SHARE_STORAGE_KEY = 'adityanta_shares'
      let shares = {}
      try {
        shares = JSON.parse(localStorage.getItem(SHARE_STORAGE_KEY) || '{}')
      } catch (e) {
        logger.warn('Failed to parse share history:', e)
        localStorage.removeItem(SHARE_STORAGE_KEY)
      }

      const shareIds = Object.keys(shares)
      // Sort by date to delete oldest first, keep max 5 to save space
      if (shareIds.length >= 5) {
        const sortedIds = shareIds.sort((a, b) =>
          new Date(shares[a].sharedAt || 0).getTime() - new Date(shares[b].sharedAt || 0).getTime()
        )
        // Keep only the 4 newest, plus the 1 we are adding
        const toDelete = sortedIds.slice(0, sortedIds.length - 4)
        toDelete.forEach(id => delete shares[id])
      }

      shares[shareId] = {
        ...data,
        sharedAt
      }

      try {
        localStorage.setItem(SHARE_STORAGE_KEY, JSON.stringify(shares))
      } catch (storageErr) {
        logger.warn('Failed to save share history, possibly due to quota:', storageErr)
        // If quota exceeded, try to clear all old shares and just save this one
        try {
          localStorage.setItem(SHARE_STORAGE_KEY, JSON.stringify({ [shareId]: shares[shareId] }))
        } catch (e) {
          logger.warn('Failed to save even a single share to localStorage:', e)
        }
      }

      // Strip base64 images before encoding to keep URL small
      const shareData = {
        ...data,
        frames: stripImagesFromFrames(data.frames),
        sharedAt
      }

      const encodedPayload = await encodeSharePayload(shareData)
      const longShareUrl = `${FRONTEND_CONFIG.getShareUrl(shareId)}#data=${encodedPayload}`
      let shareUrl = longShareUrl

      const shortened = await shortenUrl(longShareUrl)
      if (shortened) {
        shareUrl = shortened
      } else {
        logger.warn('All URL shorteners failed, using long URL')
      }

      let copied = false
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(shareUrl)
          copied = true
        }
      } catch (clipErr) {
        logger.warn('Clipboard API failed, trying fallback:', clipErr)
      }

      if (!copied) {
        try {
          const textarea = document.createElement('textarea')
          textarea.value = shareUrl
          textarea.setAttribute('readonly', '')
          textarea.style.position = 'fixed'
          textarea.style.left = '-9999px'
          textarea.style.top = '-9999px'
          textarea.style.opacity = '0'
          document.body.appendChild(textarea)
          textarea.focus()
          textarea.select()
          textarea.setSelectionRange(0, textarea.value.length)
          copied = document.execCommand('copy')
          document.body.removeChild(textarea)
        } catch (fallbackErr) {
          logger.warn('Fallback copy also failed:', fallbackErr)
        }
      }

      if (!copied && navigator.share) {
        try {
          await navigator.share({
            title: data.title || 'Shared presentation',
            text: 'Open this Adityanta presentation',
            url: shareUrl
          })
          copied = true
          toast.success('Share sheet opened')
        } catch (shareErr) {
          if (shareErr?.name !== 'AbortError') {
            logger.warn('Native share failed:', shareErr)
          }
        }
      }

      if (copied) {
        toast.success('Link ready to share')
      } else {
        toast.info('Copy the link from the dialog')
        window.prompt('Copy this share link:', shareUrl)
      }
      logger.info('Share link generated:', shareUrl)
    } catch (error) {
      logger.error('Share error:', error)
      toast.error(`Failed to generate link: ${error.message || 'Unknown error'}`)
    }
    onClose()
  }

  const handleExport = async (format) => {
    setExporting(format)

    try {
      // We rely on backend limits

      // Optionally report download to backend without blocking export on error
      if (!isPremium) {
        try {
          await userAPI.reportDownload()
        } catch (err) {
          logger.warn('Report download call ignored:', err)
        }
      }

      toast.info(`Preparing ${format.toUpperCase()} export...`)

      let success = false

     switch (format) {
        case 'pdf':
          success = await exportToPDF(frames, projectTitle, header, editorBackground)
          break
        case 'pptx':
          success = await exportToPPTX(frames, projectTitle, header, editorBackground)
          break
        case 'mp4':
          success = await exportToMP4Universal(frames, projectTitle, {
            scrollDirection: 'vertical',
            slideDuration: 3000,
            transitionDuration: 500
          })
          break
        default:
          throw new Error('Unknown format')
      }

      if (success) {
        toast.success(`${format.toUpperCase()} exported successfully!`)
        // Refresh user profile to update free_downloads_remaining across the UI
        if (!isPremium && refreshUser) {
          refreshUser(undefined, { force: true }).catch(() => { })
        }
      } else {
        throw new Error('Export failed')
      }
    } catch (error) {
      logger.error('Export error:', error)
      toast.error(`Failed to export ${format.toUpperCase()}. Please try again.`)
    } finally {
      setExporting(null)
      onClose()
    }
  }

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg py-2 min-w-[200px] z-20"
    >
      {/* Get Link */}
      <button
        onClick={handleGetLink}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-all"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        Get Link
      </button>

      <div className="border-t border-gray-100 my-1" />

      {/* Export Options */}
      <div className="px-3 py-1">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Export As</span>
      </div>

      {/* PDF */}
      <button
        onClick={() => handleExport('pdf')}
        disabled={exporting}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
      >
        {exporting === 'pdf' ? (
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E53935" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M9 13h6" />
            <path d="M9 17h6" />
          </svg>
        )}
        <div className="flex-1 text-left">
          <span>PDF Document</span>
          <p className="text-xs text-gray-400">Best for printing</p>
        </div>
      </button>

      {/* PowerPoint */}
      <button
        onClick={() => handleExport('pptx')}
        disabled={exporting}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
      >
        {exporting === 'pptx' ? (
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D14424" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
          </svg>
        )}
        <div className="flex-1 text-left">
          <span>PowerPoint (.pptx)</span>
          <p className="text-xs text-gray-400">Preserves slide layout in PowerPoint</p>
        </div>
      </button>

      {/* Video Export - Free */}
      <div className="relative group">
        <button
          onClick={() => {
            onClose()
            onExportVideo?.()
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-all"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7B1FA2" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <div className="flex-1 text-left">
            <span>Video (.webm)</span>
            <p className="text-xs text-gray-400">Animated video export</p>
          </div>
        </button>
      </div>
    </div>
  )
}

export default ShareDropdown
