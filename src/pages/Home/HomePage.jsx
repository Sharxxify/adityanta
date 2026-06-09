import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { computeSnakePosition } from '../../utils/snakeLayout'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { useToast } from '../../context/ToastContext'
import { useEditor } from '../../context/EditorContext'
import logger from '../../utils/logger'
import { safeGetItem, safeSetItem } from '../../utils/safeStorage'
import Logo from '../../components/Logo'
import Skeleton from '../../components/Skeleton/Skeleton'
import EmptyState from '../../components/EmptyState/EmptyState'
import TemplateDetailModal from '../../components/Modal/TemplateDetailModal'
import UpgradePlanModal from '../../components/Modal/UpgradePlanModal'
import { topics, licenses, sortOptions, formatDownloads, getLicenseDisplay, templates as mockTemplates } from '../../utils/templateData'
import { escapeRegex } from '../../utils/imageUtils'
import { parsePPTX } from '../../utils/pptxImport'
import { isPremiumUser, getRemainingFreeDownloads } from '../../utils/membership'
import { userAPI } from '../../services/api'
import backgroundData from '../../utils/backgroundData.json'

const RECENT_TEMPLATES_KEY = 'adityanta_recent_templates'
const FILTER_PREFS_KEY = 'adityanta_filter_prefs'
const MAX_RECENT = 6
const DEFAULT_SORT_OPTION = 'New to Old'
const NEW_PROJECT_BG_KEY = 'adityanta_new_project_bg'

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

const normalizeSortLabel = (value) => {
  if (value === 'Most Popular' || value === 'Alphabetical') return value

  const normalizedValue = `${value || ''}`.toLowerCase()
  const newIndex = normalizedValue.indexOf('new')
  const oldIndex = normalizedValue.indexOf('old')

  if (newIndex !== -1 && oldIndex !== -1) {
    return newIndex < oldIndex ? 'New to Old' : 'Old to New'
  }

  return DEFAULT_SORT_OPTION
}

const isUrlLike = (value) => typeof value === 'string' && /^(https?:\/\/|www\.)/i.test(value.trim())

const normalizeTemplateImageUrl = (value) => {
  const raw = `${value || ''}`.trim()
  if (!raw) return ''
  if (/^www\./i.test(raw)) return `https://${raw}`
  if (/^http:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, 'https://')
  return raw
}

const getTemplatePreviewImage = (template) => {
  const fromThumbnail = normalizeTemplateImageUrl(template?.thumbnail_url)
  if (fromThumbnail && !/googleusercontent\.com\/image_collection\/image_retrieval\//i.test(fromThumbnail)) return fromThumbnail
  const fromPreview = normalizeTemplateImageUrl(template?.preview)
  if (!isUrlLike(fromPreview)) return ''
  if (/googleusercontent\.com\/image_collection\/image_retrieval\//i.test(fromPreview)) return ''
  return fromPreview
}

const getTemplateFallbackBackground = (template) => {
  const normalizedTopic = normalizeTopicForBackground(template?.topic)
  const options = backgroundData?.[normalizedTopic] || backgroundData?.Generic || []
  if (!Array.isArray(options) || options.length === 0) return ''

  const seed = `${template?.template_id || template?.id || template?.title || ''}`
  const hash = [...seed].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return options[hash % options.length]
}

const getTemplatePreviewLabel = (template) => {
  const preview = `${template?.preview || ''}`.trim()
  if (!preview || isUrlLike(preview)) {
    return (template?.title || 'Template').split(' ').slice(0, 3).join(' ')
  }
  return preview
}

const shouldHideTemplate = (template) => {
  const templateId = `${template?.template_id || template?.id || ''}`.trim().toLowerCase()
  const title = `${template?.title || ''}`.trim().toLowerCase()
  const preview = `${template?.preview || ''}`.trim().toLowerCase()

  // Auto-generated bulk uploads typically use tpl + long numeric suffix (e.g. tpl177329274...)
  const hasTimestampLikeId = /^tpl\d{8,}$/.test(templateId)

  // Placeholder template markers used by generated uploads
  const isPlaceholderTitle = title === 'ppt template'
  const isPlaceholderPreview = /^tpl\d{6,}/.test(preview)

  // Legacy/invalid templates explicitly removed by product request
  const isBlockedLegacyTitle = [
    'adda',
    'test2',
    'test3',
    'photo album',
    'world war i and interwar period - history - 10th grade by slidesgo',
  ].some((blocked) => title === blocked)

  return hasTimestampLikeId || isPlaceholderTitle || isPlaceholderPreview || isBlockedLegacyTitle
}

const HomePage = () => {
  const navigate = useNavigate()
  const { user, logout, refreshUser } = useAuth()
  const { config, favorites, fetchFavorites, addFavorite, removeFavorite, isFavorite, userFiles, trashedItems, deleteUserFile, restoreUserFile, permanentlyDeleteFile, saveProject, templates: apiTemplates, storeTemplates: apiStoreTemplates, fetchTemplates, isLoadingTemplates, isLoadingStoreTemplates, serverStatus } = useApp()
  const { createNewProject } = useEditor()
  const toast = useToast()

  // Restore saved filter preferences
  const savedFilters = useMemo(() => safeGetItem(FILTER_PREFS_KEY, {}), [])

  const [activeTab, setActiveTab] = useState('templates')
  const [showWelcome, setShowWelcome] = useState(false)
  const [isReturningUser, setIsReturningUser] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTopic, setSelectedTopic] = useState(savedFilters.topic || 'All')
  const [selectedLicense, setSelectedLicense] = useState(savedFilters.license || 'All')
  const [selectedSort, setSelectedSort] = useState(savedFilters.sort || 'New -> Old')
  const [showTopicDropdown, setShowTopicDropdown] = useState(false)
  const [showLicenseDropdown, setShowLicenseDropdown] = useState(false)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [recentTemplateIds, setRecentTemplateIds] = useState(() => safeGetItem(RECENT_TEMPLATES_KEY, []))
  const [selectedTrashItems, setSelectedTrashItems] = useState(new Set())
  const [showNewBgModal, setShowNewBgModal] = useState(false)
  const [newBgSearch, setNewBgSearch] = useState('')
  const [selectedStoreTopic, setSelectedStoreTopic] = useState('All')

  const templates = useMemo(() => {
    const filteredApiTemplates = (apiTemplates || []).filter((t) => !shouldHideTemplate(t))
    if (filteredApiTemplates.length > 0) return filteredApiTemplates
    return (mockTemplates || []).filter((t) => !shouldHideTemplate(t))
  }, [apiTemplates])

  const availableBackgrounds = useMemo(() => {
    const entries = Object.entries(backgroundData || {})
    if (!newBgSearch.trim()) return entries
    const q = newBgSearch.toLowerCase()
    return entries.filter(([topic]) => topic.toLowerCase().includes(q))
  }, [newBgSearch])

  const topicOptions = topics

  // Helper to get consistent template ID
  const getTemplateId = useCallback((template) => template?.template_id || template?.id, [])

  // Live search state
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)

  // Hover preview state
  const [hoverPreview, setHoverPreview] = useState(null)
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 })
  const hoverTimeoutRef = useRef(null)
  const lastLoadKeyRef = useRef('')
  const lastLoadAtRef = useRef(0)

  const topicRef = useRef(null)
  const licenseRef = useRef(null)
  const sortRef = useRef(null)
  const searchRef = useRef(null)

  // Upload state
  const [isUploading, setIsUploading] = useState(false)

  // User info
  const userName = user?.name || 'Guest User'
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const remainingDownloads = getRemainingFreeDownloads(user, config?.free_downloads_limit ?? 5)
  const isPremium = isPremiumUser(user)

const navItems = [
    { id: 'templates', label: 'Templates', icon: 'grid' },
    { id: 'store', label: 'Store', icon: 'store' },
    { id: 'files', label: 'Your Files', icon: 'file' },
    { id: 'favourites', label: 'Bookmarks', icon: 'bookmark' },
    { id: 'trash', label: 'Trash', icon: 'trash' },
  ]

  const getIcon = (type) => {
    switch (type) {
      case 'grid':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        )
   case 'file':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
        )
      case 'store':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l1-5h16l1 5" />
            <path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
            <path d="M3 9h18" />
            <path d="M9 13h6" />
          </svg>
        )
      case 'star':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        )
      case 'bookmark':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        )
      case 'trash':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        )
      default:
        return null
    }
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (topicRef.current && !topicRef.current.contains(event.target)) setShowTopicDropdown(false)
      if (licenseRef.current && !licenseRef.current.contains(event.target)) setShowLicenseDropdown(false)
      if (sortRef.current && !sortRef.current.contains(event.target)) setShowSortDropdown(false)
      if (searchRef.current && !searchRef.current.contains(event.target)) setShowSearchSuggestions(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Ensure latest membership status is pulled when Home loads
  useEffect(() => {
    if (!refreshUser) return
    const cacheKey = 'adityanta_profile_refresh_ts'
    const forceKey = 'adityanta_force_profile_refresh'
    const shouldForce = sessionStorage.getItem(forceKey) === '1'
    const now = Date.now()
    const lastRefresh = Number(sessionStorage.getItem(cacheKey) || 0)

    // If a payment just happened, do ONE forced refresh and clear the flag
    if (shouldForce) {
      sessionStorage.removeItem(forceKey)
      sessionStorage.setItem(cacheKey, String(now))
      refreshUser(undefined, { force: true }).catch((error) => {
        logger.warn('HomePage: forced profile refresh failed:', error?.message || error)
      })
      return
    }

    if (now - lastRefresh < 30000) return
    sessionStorage.setItem(cacheKey, String(now))

    refreshUser(undefined, { force: false }).catch((error) => {
      logger.warn('HomePage: profile refresh skipped:', error?.message || error)
    })
  }, [refreshUser])

  // Finalize pending payment (robust fallback if redirect/webhook timing was delayed)
  useEffect(() => {
    const pendingPaymentId = localStorage.getItem('pending_payment_id')
    if (!pendingPaymentId || !refreshUser) return

    const attemptKey = `adityanta_payment_verify_attempts_${pendingPaymentId}`
    const attempts = Number(sessionStorage.getItem(attemptKey) || 0)
    if (attempts >= 2) {
      // Already tried enough — clear stale data
      localStorage.removeItem('pending_payment_id')
      localStorage.removeItem('pending_payment_plan')
      localStorage.removeItem('pending_payment_signature')
      return
    }
    sessionStorage.setItem(attemptKey, String(attempts + 1))

    let cancelled = false
    const verifyPendingPayment = async () => {
      try {
        const pendingSignature = localStorage.getItem('pending_payment_signature') || ''
        const verifyRes = await userAPI.verifyPayment(pendingPaymentId, pendingSignature)
        if (cancelled) return

        if (verifyRes?.success && (verifyRes.membership_active || verifyRes.plan)) {
          await refreshUser(undefined, { force: true })
          if (cancelled) return

          localStorage.removeItem('pending_payment_id')
          localStorage.removeItem('pending_payment_plan')
          localStorage.removeItem('pending_payment_signature')
          sessionStorage.removeItem(attemptKey)
          toast.success('Premium activated successfully!')
          return
        }

        // If backend verification is not ready yet, still refresh profile once
        await refreshUser(undefined, { force: true })
      } catch (error) {
        // On ANY error (404, 429, validation, network), clear stale payment data
        // This prevents the verify call from flooding the backend on every page load
        logger.warn('HomePage: clearing stale pending payment after error:', error?.message || error)
        localStorage.removeItem('pending_payment_id')
        localStorage.removeItem('pending_payment_plan')
        localStorage.removeItem('pending_payment_signature')
        sessionStorage.removeItem(attemptKey)
      }
    }

    verifyPendingPayment()
    return () => {
      cancelled = true
    }
  }, [refreshUser, toast])

  // Cleanup pending payment markers once premium state is visible
  useEffect(() => {
    if (!isPremium) return
    localStorage.removeItem('pending_payment_id')
    localStorage.removeItem('pending_payment_plan')
    localStorage.removeItem('pending_payment_signature')
  }, [isPremium])

  // Cleanup hover timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
      }
    }
  }, [])

  // Note: Profile completion is optional - users can skip and complete later

  // Fetch templates and favorites from API on mount and when premium status changes
  useEffect(() => {
    // Create a local flag to track if we're still mounted (prevents state updates after unmount)
    let isMounted = true

    const loadData = async () => {
      if (isMounted) {
        const loadKey = `${user?.id || 'guest'}::${user?.membership_type || 'none'}::${isPremium ? 'premium' : 'free'}`
        const now = Date.now()
        if (lastLoadKeyRef.current === loadKey && (now - lastLoadAtRef.current) < 15000) {
          return
        }
        lastLoadKeyRef.current = loadKey
        lastLoadAtRef.current = now
        logger.info('ðŸ”„ HomePage: Fetching templates - Premium status:', { isPremium, userId: user?.id, membership: user?.membership_type })
        try {
          // IMPORTANT: When premium status changes, we MUST fetch templates with fresh data
          // Clear any cached filters to ensure we get all available templates
          // store_mode=non_store: only user uploads / non-store templates on the home Templates tab
          const params = { storeMode: 'non_store' }
          // Don't filter by license - let backend decide based on user's membership
          // This ensures premium users see both FREE and PAID templates
          logger.info('ðŸ”„ HomePage: Calling fetchTemplates with params:', params)

          const templates = await fetchTemplates(params)
          logger.info('âœ… HomePage: Templates loaded:', { count: templates?.length || 0 })

          await fetchFavorites()
          logger.info('âœ… HomePage: Favorites loaded')
          // If no templates loaded and user IS premium, log warning
          if ((!templates || templates.length === 0) && isPremium) {
            logger.warn('âš ï¸ HomePage: No templates loaded for premium user! This might be a backend issue.')
          }
        } catch (error) {
          logger.error('âŒ HomePage: Error fetching templates:', error)
        }
      }
    }

    loadData()

    // Cleanup function to prevent state updates after unmount
   return () => {
      isMounted = false
    }
  }, [isPremium, user?.id, user?.membership_type, fetchTemplates, fetchFavorites])  // Re-fetch when premium status changes

  // Fetch store templates the first time user visits the Store tab.
  // The fetchTemplates() call inside AppContext already has its own 8-second
  // dedupe + in-flight guard, so revisits to this tab won't refire the request.
  useEffect(() => {
    if (activeTab !== 'store') return
    fetchTemplates({ storeMode: 'store' }).catch((err) => {
      logger.error('Store templates fetch error:', err)
    })
  }, [activeTab, fetchTemplates])

  // Show welcome message for returning users
  useEffect(() => {
    const lastVisit = localStorage.getItem('adityanta_last_visit')
    const hasVisitedBefore = localStorage.getItem('adityanta_has_visited')

    if (hasVisitedBefore && user?.name) {
      // Returning user - show welcome back
      setIsReturningUser(true)
      setShowWelcome(true)

      // Hide after 3 seconds
      const timer = setTimeout(() => {
        setShowWelcome(false)
      }, 3000)

      return () => clearTimeout(timer)
    } else if (user?.name) {
      // New user - mark as visited
      localStorage.setItem('adityanta_has_visited', 'true')
    }

    // Update last visit time
    localStorage.setItem('adityanta_last_visit', new Date().toISOString())
  }, [user?.name])

  // Live search suggestions - debounced
  const searchSuggestions = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 1) return []

    const query = searchQuery.toLowerCase()
    const suggestions = []

    // Suggest matching topics first
    topicOptions.filter(t => t !== 'All' && t.toLowerCase().includes(query)).forEach(topic => {
      suggestions.push({ type: 'topic', value: topic, label: `Topic: ${topic}` })
    })

    // Suggest matching template titles
    templates
      .filter(t => t.title.toLowerCase().includes(query))
      .slice(0, 5)
      .forEach(t => {
        suggestions.push({ type: 'template', value: t.title, label: t.title, template: t })
      })

    // Suggest based on description
    templates
      .filter(t => t.description?.toLowerCase().includes(query) && !suggestions.find(s => s.template?.id === t.id))
      .slice(0, 3)
      .forEach(t => {
        suggestions.push({ type: 'template', value: t.title, label: t.title, template: t, match: 'description' })
      })

    return suggestions.slice(0, 8)
  }, [searchQuery, templates, topicOptions])

  // Show suggestions when typing
  useEffect(() => {
    if (searchQuery.length > 0 && searchFocused) {
      setShowSearchSuggestions(true)
    }
  }, [searchQuery, searchFocused])

  const filteredTemplates = useMemo(() => {
    let result = [...templates]
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(t =>
        t.title.toLowerCase().includes(query) ||
        t.topic.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query)
      )
    }
    if (selectedTopic !== 'All') result = result.filter(t => `${t.topic || ''}`.toLowerCase() === selectedTopic.toLowerCase())
    if (selectedLicense !== 'All') result = result.filter(t => t.license === selectedLicense)
    switch (selectedSort) {
      case 'New -> Old': result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break
      case 'Old -> New': result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break
      case 'Most Popular': result.sort((a, b) => b.downloads - a.downloads); break
      case 'Alphabetical': result.sort((a, b) => a.title.localeCompare(b.title)); break
    }
   return result
  }, [searchQuery, selectedTopic, selectedLicense, selectedSort, templates])

  // Store-tab data: list of store templates after light filtering, the topic
  // pills derived from the response (only topics with >= 1 template), and the
  // currently visible templates after applying the selected pill + search.
  const storeTemplatesVisible = useMemo(() => {
    return (apiStoreTemplates || []).filter((t) => !shouldHideTemplate(t))
  }, [apiStoreTemplates])

  const storeTopics = useMemo(() => {
    // Build the canonical list of allowed topic labels (the 16 product wants).
    const canonical = [
      'Mathematics',
      'Science',
      'History',
      'Geography',
      'Political Science',
      'Economics',
      'Technology & Computer Subjects',
      'Legal Studies',
      'Marketing',
      'Financial Markets Management',
      'Fine Arts / Painting',
      'Music and dance',
      'Business',
      'Physical & Skill Subjects',
      'Generic',
    ]
    // Only show pills that have at least one template (case-insensitive match).
    const presentLower = new Set(
      storeTemplatesVisible
        .map((t) => `${t.topic || ''}`.trim().toLowerCase())
        .filter(Boolean)
    )
    const present = canonical.filter((label) => presentLower.has(label.toLowerCase()))
    return ['All', ...present]
  }, [storeTemplatesVisible])

  const filteredStoreTemplates = useMemo(() => {
    let result = [...storeTemplatesVisible]
    if (selectedStoreTopic !== 'All') {
      result = result.filter(
        (t) => `${t.topic || ''}`.trim().toLowerCase() === selectedStoreTopic.toLowerCase()
      )
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((t) =>
        (t.title || '').toLowerCase().includes(query) ||
        (t.topic || '').toLowerCase().includes(query) ||
        (t.description || '').toLowerCase().includes(query)
      )
    }
    return result
  }, [storeTemplatesVisible, selectedStoreTopic, searchQuery])

  // Reset store topic if it disappears from the available pills (e.g. after a refresh)
  useEffect(() => {
    if (selectedStoreTopic !== 'All' && !storeTopics.includes(selectedStoreTopic)) {
      setSelectedStoreTopic('All')
    }
  }, [storeTopics, selectedStoreTopic])

  const favoriteTemplates = useMemo(() => favorites.filter((t) => !shouldHideTemplate(t)), [favorites])

  // Check if template is in favorites (handles both id formats)
  const isTemplateFavorite = useCallback((template) => {
    const templateId = getTemplateId(template)
    return isFavorite(templateId)
  }, [isFavorite, getTemplateId])

  // Persist filter preferences
  useEffect(() => {
    safeSetItem(FILTER_PREFS_KEY, {
      topic: selectedTopic,
      license: selectedLicense,
      sort: normalizeSortLabel(selectedSort)
    })
  }, [selectedTopic, selectedLicense, selectedSort])

  // Track recently viewed templates
  const trackRecentTemplate = useCallback((template) => {
    const templateId = template?.template_id || template?.id
    if (!templateId) return
    setRecentTemplateIds(prev => {
      const filtered = prev.filter(id => id !== templateId)
      const updated = [templateId, ...filtered].slice(0, MAX_RECENT)
      safeSetItem(RECENT_TEMPLATES_KEY, updated)
      return updated
    })
  }, [])

  // Resolve recent template IDs to actual template objects
  const recentTemplates = useMemo(() => {
    if (!templates.length || !recentTemplateIds.length) return []
    return recentTemplateIds
      .map(id => templates.find(t => (t.template_id || t.id) === id))
      .filter(Boolean)
  }, [templates, recentTemplateIds])

  // Bulk trash helpers
  const toggleTrashSelection = (itemId) => {
    setSelectedTrashItems(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const toggleAllTrash = () => {
    if (selectedTrashItems.size === trashedItems.length) {
      setSelectedTrashItems(new Set())
    } else {
      setSelectedTrashItems(new Set(trashedItems.map(i => i.id)))
    }
  }

  const handleBulkDelete = () => {
    selectedTrashItems.forEach(id => permanentlyDeleteFile(id))
    toast.success(`${selectedTrashItems.size} item${selectedTrashItems.size > 1 ? 's' : ''} permanently deleted`)
    setSelectedTrashItems(new Set())
  }

  const handleCreateNew = () => {
    setShowNewBgModal(true)
  }

  const startNewProjectWithBackground = (backgroundPath = undefined) => {
    if (backgroundPath !== undefined) {
      sessionStorage.setItem(NEW_PROJECT_BG_KEY, JSON.stringify({ background: backgroundPath }))
    } else {
      sessionStorage.removeItem(NEW_PROJECT_BG_KEY)
    }
    createNewProject()
    setShowNewBgModal(false)
    navigate('/editor/new')
  }

  const handleLogout = () => { logout(); toast.success('Logged out successfully'); navigate('/') }

  const handleTemplateClick = (template) => {
    trackRecentTemplate(template)
    setSelectedTemplate(template)
  }

  const handleSuggestionClick = (suggestion) => {
    if (suggestion.type === 'topic') {
      setSelectedTopic(suggestion.value)
      setSearchQuery('')
    } else if (suggestion.template) {
      setSelectedTemplate(suggestion.template)
    } else {
      setSearchQuery(suggestion.value)
    }
    setShowSearchSuggestions(false)
  }

  const handleToggleFavorite = async (template, e) => {
    if (e) e.stopPropagation()
    const templateId = getTemplateId(template)
    if (!templateId) {
      toast.error('Unable to bookmark this template')
      return
    }
    try {
      let result
      if (isTemplateFavorite(template)) {
        result = await removeFavorite(templateId)
        if (result?.success === false) throw new Error(result?.error || 'Failed to remove bookmark')
        toast.success('Removed from bookmarks')
      } else {
        result = await addFavorite(templateId, template)
        if (result?.success === false) throw new Error(result?.error || 'Failed to add bookmark')
        toast.success('Added to bookmarks')
      }
    } catch (error) {
      logger.error('Favorite toggle error:', error)
      await fetchFavorites()
      toast.error('Failed to update bookmarks')
    }
  }

  const handleDeleteFile = (fileId) => { deleteUserFile(fileId); toast.success('File moved to trash') }

  const handleDuplicateFile = (file) => {
    const duplicatedFile = {
      ...file,
      id: Date.now(),
      title: `${file.title} (Copy)`,
      created: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      updatedAt: new Date().toISOString()
    }
    saveProject(duplicatedFile)
    toast.success('Project duplicated successfully')
  }
  const handleRestoreFile = (fileId) => { restoreUserFile(fileId); toast.success('File restored') }
  const handlePermanentDelete = (fileId) => { permanentlyDeleteFile(fileId); toast.success('File permanently deleted') }

  // Hover preview handlers
  const handleTemplateHover = useCallback((template, e) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    const target = e.currentTarget
    hoverTimeoutRef.current = setTimeout(() => {
      if (!target || !target.getBoundingClientRect) return
      const rect = target.getBoundingClientRect()
      setHoverPosition({
        x: rect.right + 10,
        y: Math.min(rect.top, window.innerHeight - 350)
      })
      setHoverPreview(template)
    }, 500)
  }, [])

  const handleTemplateLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    setHoverPreview(null)
  }, [])

  // Highlight matching text in suggestions (with regex injection protection)
  const highlightMatch = (text, query) => {
    if (!query || !text) return text
    try {
      // Escape special regex characters to prevent injection
      const escapedQuery = escapeRegex(query)
      const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'))
      return parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <span key={i} className="bg-yellow-200 text-gray-900">{part}</span>
          : part
      )
    } catch (e) {
      // Fallback to plain text if regex fails
      return text
    }
  }

  const FilterDropdown = ({ label, value, options, isOpen, setIsOpen, onSelect, dropdownRef }) => {
    const displayValue = (val) => {
      if (val === 'All') return <span className="font-bold uppercase">ALL</span>
      if (label === 'License') return getLicenseDisplay(val)
      // Make the first word bold in sort options
      if (label === 'Sort' && val.includes('->')) {
        const parts = val.split(' -> ')
        return <><span className="font-bold">{parts[0]}</span> &rarr; {parts[1]}</>
      }
      if (label === 'Sort' && (val === 'Most Popular' || val === 'Alphabetical')) {
        return <span className="font-bold">{val}</span>
      }
      return val
    }

    return (
      <div className="relative" ref={dropdownRef}>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{label}:</span>
          <button onClick={() => setIsOpen(!isOpen)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${isOpen ? 'border-primary bg-green-50 text-primary' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}>
            {displayValue(value)}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        </div>
        {isOpen && (
          <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg py-2 min-w-[140px] z-[100]">
            {options.map((option) => (
              <button key={option} onClick={() => { onSelect(option); setIsOpen(false) }} className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-all ${value === option ? 'text-primary font-medium' : 'text-gray-700'}`}>
                {option === 'All' ? <span className="font-bold uppercase">ALL</span> : (label === 'License' ? getLicenseDisplay(option) : (label === 'Sort' && option.includes('->') ? <><span className="font-semibold">{option.split(' -> ')[0]}</span> &rarr; {option.split(' -> ')[1]}</> : option))}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const TemplateCard = ({ template, showFavoriteButton = false }) => {
    const isFav = isTemplateFavorite(template)
    const previewImage = getTemplatePreviewImage(template)
    const fallbackImage = getTemplateFallbackBackground(template)
    const resolvedImage = previewImage || fallbackImage
    return (
      <div
        onClick={() => handleTemplateClick(template)}
        className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
      >
        <div className={`h-44 bg-gradient-to-br ${template.gradient} relative flex items-center justify-center overflow-hidden`}>
          {/* Thumbnail Image (if available from API) */}
          {resolvedImage ? (
            <>
              <img
                src={resolvedImage}
                alt={template.title}
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => {
                  if (fallbackImage && e.currentTarget.src !== new URL(fallbackImage, window.location.origin).href) {
                    e.currentTarget.src = fallbackImage
                    return
                  }
                  e.currentTarget.style.display = 'none'
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </>
          ) : (
            <>
              {/* Fallback decorative elements */}
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-3 left-3 w-12 h-3 bg-yellow-400 rounded transform rotate-12" />
                <div className="absolute bottom-4 left-4"><svg width="40" height="50" viewBox="0 0 40 50"><path d="M20 45 L10 35 L20 5 L30 35 Z" fill="#FF5722" opacity="0.8" /></svg></div>
                <div className="absolute top-6 right-8 w-10 h-10"><svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="#4CAF50" opacity="0.7" /></svg></div>
                <div className="absolute bottom-3 right-3"><svg width="35" height="35" viewBox="0 0 50 50"><circle cx="25" cy="25" r="18" fill="#2196F3" opacity="0.7" /><ellipse cx="25" cy="25" rx="25" ry="8" fill="none" stroke="#FFD700" strokeWidth="2" transform="rotate(-20 25 25)" /></svg></div>
              </div>
              <div className="text-center z-10 px-4"><h3 className="text-2xl font-black text-white drop-shadow-lg">{getTemplatePreviewLabel(template)}</h3></div>
            </>
          )}

          <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-md text-xs font-semibold z-10 ${template.license === 'FREE' ? 'bg-white/95 text-primary' : 'bg-orange-500 text-white'}`}>{getLicenseDisplay(template.license)}</div>
          {showFavoriteButton && (
            <button onClick={(e) => handleToggleFavorite(template, e)} className={`absolute top-3 left-3 w-8 h-8 rounded-full flex items-center justify-center transition-all z-10 ${isFav ? 'bg-yellow-400 text-white' : 'bg-white/80 text-gray-400 hover:bg-white hover:text-yellow-500'}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
            </button>
          )}
        </div>
        <div className="p-4">
          <h4 className="font-semibold text-gray-900 mb-2">{template.title || 'Untitled'}</h4>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{template.topic || 'General'}</span>
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <span>{template.frames || 1} frames</span>
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <div className="flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              {formatDownloads(template.downloads || 0)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Full-page loading overlay while templates are being fetched */}
      {isLoadingTemplates && templates.length === 0 && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mb-4" />
          <p className="text-gray-600 text-sm font-medium">Loading templates...</p>
        </div>
      )}
      {/* Full-page loading overlay while uploading/parsing a local PPT */}
      {isUploading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="w-14 h-14 border-4 border-green-200 border-t-green-500 rounded-full animate-spin mb-4" />
          <p className="text-gray-700 text-base font-semibold">Importing your presentation...</p>
          <p className="text-gray-400 text-sm mt-1">Parsing slides, images and layouts</p>
        </div>
      )}
      {/* Unified orange gradient background - covers header and extends down */}
      <div
        className="fixed left-0 top-0 h-full pointer-events-none z-0"
        style={{
          width: '100%',
          background: 'linear-gradient(135deg, rgba(255, 195, 140, 0.55) 0%, rgba(255, 210, 165, 0.4) 15%, rgba(255, 225, 190, 0.25) 35%, rgba(255, 240, 220, 0.1) 55%, transparent 75%)',
        }}
      />
      {/* Header - Logo and Search */}
      <header className="relative z-10 w-full px-4 sm:px-8 md:px-12 lg:px-24 xl:px-[200px] py-6 lg:py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Logo with tagline */}
          <div className="flex flex-col">
            <Logo />
            <span className="text-xs text-gray-400 ml-[72px] -mt-1 italic hidden sm:block">boundless like the sun</span>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-[320px] md:w-[400px] lg:w-[480px]" ref={searchRef}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              placeholder="Search Files, Templates"
              className="w-full pl-5 pr-12 py-4 rounded-full border border-gray-200 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-gray-50"
            />
            <button className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </button>

            {/* Auto-suggest dropdown */}
            {showSearchSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-30">
                {searchSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b border-gray-100 last:border-0"
                  >
                    {suggestion.type === 'topic' ? (
                      <span className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      </span>
                    ) : (
                      <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${suggestion.template?.gradient || 'from-blue-400 to-purple-500'} flex items-center justify-center text-white text-xs font-bold`}>
                        {suggestion.template?.title?.charAt(0)}
                      </span>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {highlightMatch(suggestion.label, searchQuery)}
                      </p>
                      {suggestion.type === 'topic' && (
                        <p className="text-xs text-gray-500">Filter by topic</p>
                      )}
                      {suggestion.template && (
                        <p className="text-xs text-gray-500">
                          {suggestion.template.topic} &bull; {suggestion.template.frames} frames
                          {suggestion.match === 'description' && ' &bull; Match in description'}
                        </p>
                      )}
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                ))}
                {searchQuery.length > 0 && (
                  <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">
                    Press Enter to search for "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Welcome Message */}
      {showWelcome && isReturningUser && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in-down">
          <div className="bg-gradient-to-r from-primary to-green-500 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3">
            <span className="text-xl">{'\u{1F44B}'}</span>
            <span className="font-semibold">Welcome back, {user?.name?.split(' ')[0] || 'User'}!</span>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="relative z-10 my-4 lg:my-8 mx-4 sm:mx-8 md:mx-12 lg:mx-24 xl:mx-[200px]">
        <div className="bg-white rounded-2xl lg:rounded-[32px] flex flex-col lg:flex-row shadow-sm p-4 sm:p-6 lg:p-12 gap-6 lg:gap-12">
          {/* Sidebar */}
          <aside className="w-full lg:w-[232px] lg:flex-shrink-0">
            {/* User Profile */}
            <div className="flex items-center gap-3 mb-6 cursor-pointer hover:bg-gray-50 rounded-xl p-2 -ml-2 transition-all group"
              onClick={() => navigate('/profile')}
              title="Click to edit profile"
            >
              <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center group-hover:ring-2 group-hover:ring-primary/30 transition-all">
                {(user?.profilePhoto || user?.picture || user?.avatar) ? (
                  <img src={user.profilePhoto || user.picture || user.avatar} alt={userName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold text-gray-600">{userInitials}</span>
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-semibold text-gray-900 group-hover:text-primary transition-colors">{userName}</span>
                <span className="text-xs text-gray-400">Click to edit profile</span>
              </div>
              <svg className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>

            {/* Downloads Remaining */}
            {isPremium ? (
              <div className="mb-6 bg-gradient-to-r from-green-100 to-emerald-50 rounded-xl p-3 -mx-1">
                <p className="text-sm text-green-800/70 mb-1">Premium Member</p>
                <div className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-lg font-bold text-green-900">Unlimited Downloads</span>
                </div>
              </div>
            ) : (
              <div className="mb-6 bg-gradient-to-r from-orange-100 to-amber-50 rounded-xl p-3 -mx-1">
                <p className="text-sm text-orange-800/70 mb-1">Free Downloads Remaining</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-orange-900">{remainingDownloads}</span>
                  <button
                    onClick={() => setShowUpgradeModal(true)}
                    className="flex items-center gap-1 text-sm font-semibold text-orange-500 hover:text-orange-600"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    Upgrade Now
                  </button>
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-gray-100 my-4" />

            {/* Navigation */}
            <nav className="flex flex-col gap-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === item.id
                    ? 'text-primary'
                    : 'text-gray-600 hover:bg-gray-50'
                    }`}
                >
                  <span className={activeTab === item.id ? 'text-primary' : 'text-gray-500'}>
                    {getIcon(item.icon)}
                  </span>
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Divider */}
            <div className="border-t border-gray-100 my-4" />

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 bg-red-50 hover:bg-red-100 w-full transition-all"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Logout
            </button>
          </aside>

          {/* Content Area */}
          <main className="flex-1" style={{ minWidth: 0 }}>
            {activeTab === 'templates' && (
              <>
                {/* Filter Row */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-3">
                  <div className="flex flex-wrap items-center gap-3 sm:gap-6">
                    <FilterDropdown label="Topic" value={selectedTopic} options={topicOptions} isOpen={showTopicDropdown} setIsOpen={setShowTopicDropdown} onSelect={setSelectedTopic} dropdownRef={topicRef} />
                    <FilterDropdown label="License" value={selectedLicense} options={licenses} isOpen={showLicenseDropdown} setIsOpen={setShowLicenseDropdown} onSelect={setSelectedLicense} dropdownRef={licenseRef} />
                    <FilterDropdown label="Sort" value={selectedSort} options={sortOptions} isOpen={showSortDropdown} setIsOpen={setShowSortDropdown} onSelect={(opt) => setSelectedSort(normalizeSortLabel(opt))} dropdownRef={sortRef} />
                  </div>
                  <button onClick={handleCreateNew} className="flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-semibold transition-all text-sm sm:text-base">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    <span className="hidden xs:inline">Create New</span>
                    <span className="xs:hidden">New</span>
                  </button>
                </div>

                {/* Server Status Indicator */}
                {serverStatus !== 'online' && (
                  <div className="flex items-center gap-2 mb-6 px-4 py-2 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 text-sm">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>Server currently unreachable. Using local template cache.</span>
                  </div>
                )}
                {/* Recently Viewed */}
                {recentTemplates.length > 0 && !searchQuery && selectedTopic === 'All' && selectedLicense === 'All' && (
                  <div className="mb-8">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Recently Viewed</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      {recentTemplates.map(t => (
                        (() => {
                          const previewImage = getTemplatePreviewImage(t)
                          const fallbackImage = getTemplateFallbackBackground(t)
                          const resolvedImage = previewImage || fallbackImage
                          return (
                        <button
                          key={t.template_id || t.id}
                          onClick={() => handleTemplateClick(t)}
                          className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all text-left border border-gray-100 group"
                        >
                          <div className={`h-20 bg-gradient-to-br ${t.gradient || 'from-blue-400 to-purple-600'} relative flex items-center justify-center overflow-hidden`}>
                            {resolvedImage ? (
                              <img
                                src={resolvedImage}
                                alt={t.title}
                                className="absolute inset-0 w-full h-full object-cover"
                                onError={(e) => {
                                  if (fallbackImage && e.currentTarget.src !== new URL(fallbackImage, window.location.origin).href) {
                                    e.currentTarget.src = fallbackImage
                                    return
                                  }
                                  e.currentTarget.style.display = 'none'
                                }}
                              />
                            ) : (
                              <span className="text-xs font-bold text-white drop-shadow-sm opacity-80 group-hover:opacity-100 transition-opacity">{t.preview || t.title?.slice(0, 8)}</span>
                            )}
                          </div>
                          <div className="px-2 py-1.5">
                            <p className="text-xs font-medium text-gray-800 truncate">{t.title}</p>
                          </div>
                        </button>
                          )
                        })()
                      ))}
                    </div>
                  </div>
                )}

                {/* Recently saved projects */}
                {userFiles.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Continue Editing
                      </h3>
                      <button
                        onClick={() => setActiveTab('files')}
                        className="text-xs text-primary hover:underline"
                      >
                        View all →
                      </button>
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
                      {userFiles.slice(0, 6).map((file) => (
                        <div
                          key={file.id}
                          onClick={() => navigate(`/editor/${file.id}`)}
                          className="flex-shrink-0 w-48 bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer border border-gray-100 group"
                        >
                          <div className={`h-28 bg-gradient-to-br ${file.thumbnail || 'from-blue-400 to-purple-600'} relative flex items-center justify-center`}>
                            <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-all" />
                            <span className="relative z-10 text-white text-xs font-bold px-2 text-center line-clamp-2">{file.title?.split(' ').slice(0, 3).join(' ').toUpperCase()}</span>
                          </div>
                          <div className="p-2.5">
                            <p className="text-xs font-semibold text-gray-900 truncate">{file.title || 'Untitled'}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{file.savedAt ? new Date(file.savedAt).toLocaleDateString() : (file.created || '')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Template Grid */}
                {isLoadingTemplates ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Skeleton variant="card" count={6} />
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <EmptyState
                    icon="search"
                    title="No templates found"
                    description="Try adjusting your filters or search query to find what you're looking for"
                  />
                ) : (
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">{filteredTemplates.map(t => <TemplateCard key={t.id || t.template_id} template={t} showFavoriteButton={true} />)}</div>
                )}
              </>
            )}

            {activeTab === 'store' && (
              <>
                {/* Topic pills - horizontal scrollable row */}
                <div className="mb-6 -mx-2">
                  <div
                    className="flex items-center gap-3 overflow-x-auto px-2 pb-2"
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    {storeTopics.map((topic) => {
                      const isActive = selectedStoreTopic === topic
                      const label = topic === 'All' ? 'ALL' : topic
                      return (
                        <button
                          key={topic}
                          onClick={() => setSelectedStoreTopic(topic)}
                          className={`flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all border ${
                            isActive
                              ? 'bg-orange-100 text-orange-600 border-orange-300'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Store templates grid */}
                {isLoadingStoreTemplates && filteredStoreTemplates.length === 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Skeleton variant="card" count={6} />
                  </div>
                ) : filteredStoreTemplates.length === 0 ? (
                  <EmptyState
                    icon="search"
                    title="No templates found"
                    description={
                      selectedStoreTopic === 'All'
                        ? 'No store templates are available right now.'
                        : `No templates found for "${selectedStoreTopic}". Try another topic.`
                    }
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredStoreTemplates.map((t) => (
                      <TemplateCard key={t.id || t.template_id} template={t} showFavoriteButton={true} />
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'files' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Your Files</h2>
                  {isPremium && (
                    <button
                      onClick={() => document.getElementById('header-upload-input')?.click()}
                      disabled={isUploading}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-600 hover:bg-orange-200 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isUploading ? (
                        <>
                          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Uploading...
                        </>
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          Upload Template
                        </>
                      )}
                    </button>
                  )}
                  <input
                    id="header-upload-input"
                    type="file"
                    accept=".pptx"
                    className="hidden"
                    disabled={isUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const ext = file.name.split('.').pop()?.toLowerCase()
                      if (ext !== 'pptx') {
                        toast.error('Please upload a .pptx PowerPoint file')
                        e.target.value = ''
                        return
                      }
                      setIsUploading(true)
                      try {
                        const parsed = await parsePPTX(file)
                        if (!parsed?.frames?.length) throw new Error('No slides found in file')
                        if (parsed.frames.length > 500) {
                          toast.warning('Only first 500 slides will be imported.')
                          parsed.frames = parsed.frames.slice(0, 500)
                        }
                        const projectData = {
                          id: `uploaded_${Date.now()}`,
                          title: (parsed.title || file.name.replace(/\.[^.]+$/, '')).substring(0, 100),
                          frames: parsed.frames,
                          thumbnail: 'from-green-400 to-emerald-500',
                          isUserUpload: true,
                          uploadedAt: new Date().toISOString(),
                        }
                        saveProject(projectData)
                        toast.success(`Imported "${projectData.title}" with ${parsed.frames.length} slides`)
                        setTimeout(() => navigate(`/editor/${projectData.id}`), 600)
                      } catch (error) {
                        toast.error(`Failed to parse file: ${error.message || 'Invalid PowerPoint file'}`)
                      } finally {
                        setIsUploading(false)
                        e.target.value = ''
                      }
                    }}
                  />
                </div>
                {userFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                        <polyline points="13 2 13 9 20 9" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">No files yet</h3>
                    <p className="text-gray-500 text-center mb-8 max-w-md">
                      Create your first project or upload a custom template to get started!
                    </p>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={handleCreateNew}
                        className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-semibold transition-all"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Create New Project
                      </button>
                      <button
                        onClick={() => {
                          if (isPremium) {
                            document.getElementById('template-upload-input')?.click()
                          } else {
                            setShowUpgradeModal(true)
                            toast.info('Upload templates is a premium feature')
                          }
                        }}
                        disabled={isUploading}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${isPremium
                          ? 'bg-orange-100 text-orange-600 hover:bg-orange-200 disabled:hover:bg-orange-100'
                          : 'border-2 border-gray-200 text-gray-600 hover:border-gray-300 disabled:hover:border-gray-200'
                          }`}
                      >
                        {isUploading ? (
                          <>
                            <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Uploading...
                          </>
                        ) : (
                          <>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            Upload Template
                            {!isPremium && (
                              <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[10px] font-bold rounded ml-1">PREMIUM</span>
                            )}
                          </>
                        )}
                      </button>
                    </div>
                    <input
                      id="template-upload-input"
                      type="file"
                      accept=".pptx,.ppt,.json"
                      className="hidden"
                      disabled={isUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return

                        // Validate file format
                        const acceptedExts = ['pptx']
                        const ext = file.name.split('.').pop()?.toLowerCase()
                        if (!ext || !acceptedExts.includes(ext)) {
                          toast.error('Please upload a .pptx PowerPoint file')
                          e.target.value = ''
                          return
                        }

                        // Validate file size (50MB limit)
                        if (file.size > 50 * 1024 * 1024) {
                          toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 50MB.`)
                          e.target.value = ''
                          return
                        }

                        // Check if file is too small (likely invalid)
                        if (file.size < 1024) {
                          toast.error('File too small. Please check your file.')
                          e.target.value = ''
                          return
                        }

                        setIsUploading(true)
                        const fileName = file.name.toLowerCase()

                        try {
                          // Allow import from JSON first
                          if (fileName.endsWith('.json')) {
                            toast.info('Loading JSON project...')
                            const { importFromJSON } = await import('../../utils/exportUtils')
                            const data = await importFromJSON(file)
                            if (data && data.frames && data.frames.length > 0) {
                              const projectData = {
                                id: `uploaded_${Date.now()}`,
                                title: (data.title || file.name.replace(/\.[^.]+$/, '')).substring(0, 100),
                                frames: data.frames,
                                thumbnail: 'from-green-400 to-emerald-500',
                                isUserUpload: true,
                                uploadedAt: new Date().toISOString(),
                              }
                              saveProject(projectData)
                              toast.success(`Loaded "${data.title || 'project'}" with ${data.frames.length} slides`)
                              setTimeout(() => navigate(`/editor/${projectData.id}`), 600)
                            } else {
                              toast.error('Invalid JSON file - no slides found')
                            }
                            setIsUploading(false)
                            e.target.value = ''
                            return
                          }

                          // Reject ppt
                          if (fileName.endsWith('.ppt') && !fileName.endsWith('.pptx')) {
                            toast.error('Old .ppt format is not supported. Please convert to .pptx first.')
                            e.target.value = ''
                            setIsUploading(false)
                            return
                          }

                          toast.info('Parsing presentation...')

                          // Parse PPTX file entirely on the frontend
                          const parsedData = await parsePPTX(file)
                          logger.info('PPTX parsed successfully:', { frames: parsedData.frames?.length || 0, title: parsedData.title })

                          // Validate parsed data
                          if (!parsedData.frames || !Array.isArray(parsedData.frames) || parsedData.frames.length === 0) {
                            throw new Error('No slides found in presentation')
                          }

                          // Cap at 500 slides
                          if (parsedData.frames.length > 500) {
                            toast.warning('Only first 500 slides will be imported.')
                            parsedData.frames = parsedData.frames.slice(0, 500)
                          }

                          // Create project from parsed PPTX â€” no backend upload needed
                          const projectData = {
                            id: `uploaded_${Date.now()}`,
                            title: (parsedData.title || file.name.replace(/\.[^.]+$/, '')).substring(0, 100),
                            frames: parsedData.frames,
                            thumbnail: 'from-green-400 to-emerald-500',
                            isUserUpload: true,
                            uploadedAt: new Date().toISOString(),
                          }

                          // Save project locally
                          const saved = saveProject(projectData)
                          if (!saved) {
                            toast.error('Failed to save project. Please clear browser storage and try again.')
                            e.target.value = ''
                            setIsUploading(false)
                            return
                          }

                          toast.success(`Imported "${projectData.title}" â€” ${parsedData.frames.length} slide${parsedData.frames.length > 1 ? 's' : ''}. Opening editor...`)

                          // Navigate to editor
                          setTimeout(() => {
                            navigate(`/editor/${projectData.id}`)
                          }, 600)

                        } catch (error) {
                          logger.error('PPTX upload error:', error)
                          toast.error(`Failed to parse file: ${error.message || 'Invalid PowerPoint file'}`)
                        } finally {
                          setIsUploading(false)
                          e.target.value = ''
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {userFiles.map((file) => (
                      <div
                        key={file.id}
                        className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all cursor-pointer group border border-gray-100"
                        onDoubleClick={() => navigate(`/editor/${file.id}`)}
                      >
                        <div className={`h-44 bg-gradient-to-br ${file.thumbnail || 'from-blue-400 to-purple-600'} relative flex items-center justify-center`}>
                          <div className="absolute inset-0 opacity-30 group-hover:opacity-50 transition-all bg-black" />
                          <div className="text-center z-10 px-4">
                            <h3 className="text-xl font-black text-white drop-shadow-lg">{file.title?.split(' ').slice(0, 2).join(' ').toUpperCase() || 'PROJECT'}</h3>
                          </div>
                          <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={(e) => { e.stopPropagation(); navigate(`/editor/${file.id}`) }} className="p-2 bg-white rounded-lg hover:bg-gray-100" title="Edit"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id) }} className="p-2 bg-white rounded-lg hover:bg-red-100" title="Move to Trash"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></button>
                          </div>
                        </div>
                        <div className="p-4" onClick={() => navigate(`/editor/${file.id}`)}>
                          <h4 className="font-semibold text-gray-900 mb-2">{file.title || 'Untitled'}</h4>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{file.frameCount || (Array.isArray(file.frames) ? file.frames.length : (typeof file.frames === 'number' ? file.frames : 1))} frames</span>
                            <span className="w-1 h-1 rounded-full bg-gray-300" />
                            <span>{file.created || 'Just now'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'favourites' && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-6">Bookmarked Templates</h2>
                {favoriteTemplates.length === 0 ? (
                  <EmptyState
                    icon="bookmark"
                    title="No bookmarks yet"
                    description="Save your favorite templates here for quick access later. Just click the bookmark icon on any template!"
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {favoriteTemplates.map((template) => (
                      (() => {
                        const previewImage = getTemplatePreviewImage(template)
                        const fallbackImage = getTemplateFallbackBackground(template)
                        const resolvedImage = previewImage || fallbackImage
                        const tId = getTemplateId(template)
                        return (
                      <div key={tId} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all cursor-pointer group border border-gray-100">
                        <div onClick={() => handleTemplateClick(template)} className={`h-44 bg-gradient-to-br ${template.gradient} relative flex items-center justify-center overflow-hidden`}>
                          <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-md text-xs font-semibold z-10 ${template.license === 'FREE' ? 'bg-white/95 text-primary' : 'bg-orange-500 text-white'}`}>{getLicenseDisplay(template.license)}</div>
                          {resolvedImage ? (
                            <img
                              src={resolvedImage}
                              alt={template.title}
                              className="absolute inset-0 w-full h-full object-cover"
                              onError={(e) => {
                                if (fallbackImage && e.currentTarget.src !== new URL(fallbackImage, window.location.origin).href) {
                                  e.currentTarget.src = fallbackImage
                                  return
                                }
                                e.currentTarget.style.display = 'none'
                              }}
                            />
                          ) : (
                            <div className="text-center z-10 px-4"><h3 className="text-2xl font-black text-white drop-shadow-lg">{getTemplatePreviewLabel(template)}</h3></div>
                          )}
                        </div>
                        <div className="p-4"><h4 className="font-semibold text-gray-900 mb-2">{template.title}</h4>
                          <div className="flex items-center justify-between"><div className="flex items-center gap-3 text-xs text-gray-500"><span>{template.topic}</span><span className="w-1 h-1 rounded-full bg-gray-300" /><span>{template.frames} frames</span></div>
                            <button onClick={(e) => handleToggleFavorite(template, e)} className="p-1.5 text-yellow-500 hover:bg-yellow-50 rounded-lg transition-all"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg></button>
                          </div>
                        </div>
                      </div>
                        )
                      })()
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'trash' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Trash</h2>
                  {trashedItems.length > 0 && (
                    <div className="flex items-center gap-2">
                      {selectedTrashItems.size > 0 && (
                        <button
                          onClick={handleBulkDelete}
                          className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-all flex items-center gap-1.5"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                          Delete {selectedTrashItems.size} selected
                        </button>
                      )}
                      <button
                        onClick={toggleAllTrash}
                        className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                      >
                        {selectedTrashItems.size === trashedItems.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                  )}
                </div>
                {trashedItems.length === 0 ? (
                  <EmptyState
                    icon="trash"
                    title="Trash is empty"
                    description="Deleted items will appear here and are automatically removed after 15 days"
                  />
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400 mb-4">Items are automatically deleted after 15 days</p>
                    {trashedItems.map((item) => {
                      const deletedAt = item.deletedAt instanceof Date ? item.deletedAt : new Date(item.deletedAt)
                      const daysDiff = Number.isNaN(deletedAt.getTime()) ? 0 : Math.floor((new Date() - deletedAt) / (1000 * 60 * 60 * 24))
                      const daysRemaining = Math.max(0, 15 - daysDiff)
                      const displayTitle = typeof item.title === 'string'
                        ? item.title
                        : (typeof item.name === 'string' ? item.name : 'Untitled Project')
                      const displayFrames = typeof item.frameCount === 'number'
                        ? item.frameCount
                        : (Array.isArray(item.frames) ? item.frames.length : (Number(item.frames) || 1))
                      const isSelected = selectedTrashItems.has(item.id)
                      return (
                        <div key={item.id} className={`flex items-center justify-between p-4 bg-white rounded-xl border-2 transition-all ${isSelected ? 'border-red-300 bg-red-50/30' : 'border-gray-200 hover:border-gray-300'}`}>
                          <div className="flex items-center gap-4">
                            <button
                              onClick={() => toggleTrashSelection(item.id)}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'bg-red-500 border-red-500' : 'border-gray-300 hover:border-gray-400'}`}
                            >
                              {isSelected && (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                              )}
                            </button>
                            <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${item.thumbnail || 'from-gray-400 to-gray-600'} flex items-center justify-center`}>
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="white" opacity="0.7"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /></svg>
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{displayTitle}</p>
                              <p className="text-xs text-gray-500">{displayFrames} frames &bull; <span className={daysRemaining <= 3 ? 'text-red-500 font-medium' : ''}>{daysRemaining} days left</span></p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleRestoreFile(item.id)} className="px-3 py-2 text-sm font-medium text-primary hover:bg-green-50 rounded-lg transition-all flex items-center gap-1">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                              Restore
                            </button>
                            <button onClick={() => handlePermanentDelete(item.id)} className="px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-all">Delete</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {selectedTemplate && <TemplateDetailModal template={selectedTemplate} onClose={() => setSelectedTemplate(null)} onUpgrade={() => { setSelectedTemplate(null); setShowUpgradeModal(true) }} onToggleFavorite={() => handleToggleFavorite(selectedTemplate)} isFavorite={isTemplateFavorite(selectedTemplate)} />}
      {showNewBgModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewBgModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Choose a background for your new project</h3>
                <p className="text-sm text-gray-500">You can change this later from the Design tab.</p>
              </div>
              <button onClick={() => setShowNewBgModal(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <input
                value={newBgSearch}
                onChange={(e) => setNewBgSearch(e.target.value)}
                placeholder="Search topic backgrounds..."
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={() => startNewProjectWithBackground(undefined)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700"
              >
                Use Random Default
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
              {availableBackgrounds.map(([topic, images]) => (
                <div key={topic}>
                  <p className="text-sm font-semibold text-gray-700 mb-2">{normalizeTopicForBackground(topic)}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {images.map((imgPath, idx) => (
                      <button
                        key={`${topic}-${idx}-${imgPath}`}
                        onClick={() => startNewProjectWithBackground(imgPath)}
                        className="relative aspect-[16/9] rounded-lg overflow-hidden border border-gray-200 hover:border-primary hover:shadow-md transition-all"
                        title={`${topic} ${idx + 1}`}
                      >
                        <img src={imgPath} alt={`${topic} ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {availableBackgrounds.length === 0 && (
                <p className="text-sm text-gray-500">No background topics match your search.</p>
              )}
            </div>
          </div>
        </div>
      )}
      {showUpgradeModal && <UpgradePlanModal onClose={() => setShowUpgradeModal(false)} />}
    </div>
  )
}

export default HomePage

