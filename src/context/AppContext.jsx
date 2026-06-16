import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { API_CONFIG, AUTH_CONFIG } from '../config'
import { fetchWithRateLimit } from '../services/api'
import { safeJSONParse, setToStorage } from '../utils/imageUtils'
import { safeSetItem, safeGetItem } from '../utils/safeStorage'
import { saveItem as idbSaveItem, loadItem as idbLoadItem, requestPersistentStorage } from '../utils/indexedDBHelper'
import logger from '../utils/logger'

const AppContext = createContext(null)

export const useApp = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}

export const AppProvider = ({ children }) => {
  const { token, user } = useAuth()
  const FAVORITES_KEY = 'adityanta_favorites'
  const [favorites, setFavorites] = useState(() => {
    const stored = safeGetItem(FAVORITES_KEY, [])
    return Array.isArray(stored) ? stored : []
  })
  const [userFiles, setUserFiles] = useState([])
  const [isUserFilesLoaded, setIsUserFilesLoaded] = useState(false)
  const [trashedItems, setTrashedItems] = useState([])
 const [templates, setTemplates] = useState([])
  const [storeTemplates, setStoreTemplates] = useState([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [isLoadingStoreTemplates, setIsLoadingStoreTemplates] = useState(false)
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false)
  const [serverStatus, setServerStatus] = useState('online')
  const templatesFetchRef = useRef({ inFlight: null, lastFetchedAt: 0, lastKey: null })
  const storeTemplatesFetchRef = useRef({ inFlight: null, lastFetchedAt: 0, lastKey: null })
  const favoritesFetchRef = useRef({ inFlight: null, lastFetchedAt: 0, lastToken: null })
  const [config, setConfig] = useState({
    pricing: {
      monthly: { amount: 29900, duration: 30, currency: 'INR' },
      quarterly: { amount: 79900, duration: 90, currency: 'INR' },
      yearly: { amount: 299900, duration: 365, currency: 'INR' }
    },
    free_downloads_limit: 5
  })

  const getHeaders = useCallback(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }), [token])

  // Default gradients for templates that don't have one
  const defaultGradients = [
    'from-cyan-400 to-blue-400',
    'from-sky-300 to-cyan-400',
    'from-yellow-100 to-yellow-200',
    'from-blue-200 to-sky-300',
    'from-teal-300 to-cyan-400',
    'from-green-200 to-green-300',
    'from-emerald-300 to-teal-400',
    'from-amber-200 to-orange-300',
    'from-pink-200 to-rose-300',
    'from-violet-200 to-purple-300',
  ]

  // Fetch config (pricing and free downloads limit)
  const fetchConfig = useCallback(async (retryCount = 0) => {
    // Skip if config was fetched recently in this session
    const cacheKey = 'adityanta_config_cache'
    const cacheTimeKey = 'adityanta_config_cache_ts'
    const cooldownKey = 'adityanta_config_cooldown'
    const now = Date.now()

    // If we were rate limited recently, skip entirely for 60s
    const cooldownUntil = Number(sessionStorage.getItem(cooldownKey) || 0)
    if (now < cooldownUntil) return

    const cachedTs = Number(sessionStorage.getItem(cacheTimeKey) || 0)
    if (now - cachedTs < 300000) { // 5 min cache
      try {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey))
        if (cached && cached.pricing) {
          setConfig(cached)
          return
        }
      } catch { /* use default */ }
    }

    try {
      const response = await fetch(`${API_CONFIG.baseURL}/templates/config`)

      // Handle rate limiting — do NOT retry, just use defaults and cooldown
      if (response.status === 429) {
        logger.warn('Config rate limited (429). Using default config, cooling down 60s.')
        sessionStorage.setItem(cooldownKey, String(now + 60000))
        return
      }

      if (!response.ok) {
        throw new Error(`Config fetch failed: ${response.status}`)
      }

      const data = await validateJSONResponse(response)
      if (data.success && data.pricing) {
        const newConfig = {
          pricing: data.pricing,
          free_downloads_limit: data.free_downloads_limit || 5
        }
        setConfig(newConfig)
        sessionStorage.setItem(cacheKey, JSON.stringify(newConfig))
        sessionStorage.setItem(cacheTimeKey, String(Date.now()))
      }
    } catch (error) {
      logger.error('Fetch config error:', error)
      // Keep default config on error - graceful fallback
    }
  }, [])

  // Fetch config on mount
  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  // Normalize template data from API to match frontend format
  const normalizeTemplate = useCallback((template, index) => {
    // Normalize frames count safely
    const count = parseInt(template.frames, 10)
    const normalizedFrames = isNaN(count)
      ? 5
      : Math.max(4, Math.min(count, 5))
    const rawPreview = `${template.preview || ''}`.trim()
    const isUrlLikePreview = /^(https?:\/\/|www\.)/i.test(rawPreview)
    const normalizedPreview = (!rawPreview || isUrlLikePreview)
      ? (template.title?.split(' ').slice(0, 2).join(' ').toUpperCase() || 'TEMPLATE')
      : rawPreview
    const normalizedPreviewImage = rawPreview
      ? (/^www\./i.test(rawPreview) ? `https://${rawPreview}` : rawPreview.replace(/^http:\/\//i, 'https://'))
      : ''

    return {
      ...template,
      id: template.id || template.template_id || template.templateId || index + 1,
      template_id: template.template_id || template.templateId || template.id,
      title: template.title || 'Untitled Template',
      topic: template.topic || 'General',
      frames: normalizedFrames,
      downloads: Math.max(0, parseInt(template.downloads, 10) || 0),
      license: template.license || 'FREE',
      gradient: template.gradient || defaultGradients[index % defaultGradients.length],
      preview: normalizedPreview,
      thumbnail_url: template.thumbnail_url || template.thumbnailUrl || (isUrlLikePreview ? normalizedPreviewImage : null),
      description: template.description || `A beautiful ${template.topic || 'educational'} template with slides.`,
      is_favourite: template.is_favourite || template.isFavourite || false,
      s3_file_url: template.s3_file_url || template.s3FileUrl || null,
      created_at: template.created_at || template.createdAt || new Date().toISOString(),
    }
  }, [])

  const normalizeFavoritesList = useCallback((list) => {
    if (!Array.isArray(list)) return []
    return list
      .map((entry, i) => normalizeTemplate(entry?.template || entry, i))
      .filter(Boolean)
  }, [normalizeTemplate])

  // Helper to validate JSON response
  const validateJSONResponse = async (response) => {
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('Invalid server response - expected JSON')
    }
    return response.json()
  }

  // Templates API - Fetch all in one call
  // Robust template fetcher with multiple retry strategies
  // storeMode: 'store' (catalog) or 'non_store' (user uploads / non-store). Defaults to 'non_store'.
  const fetchTemplates = useCallback(async (filters = {}, retryAttempt = 0) => {
    const storeMode = filters.storeMode === 'store' ? 'store' : 'non_store'
    const isStore = storeMode === 'store'

    const params = new URLSearchParams()
    params.append('store_mode', storeMode)
    if (filters.topic && filters.topic !== 'All') params.append('topic', filters.topic)
    if (filters.license && filters.license !== 'All') params.append('license', filters.license.toUpperCase())
    if (filters.sort) params.append('sort', filters.sort === 'New → Old' ? 'new' : 'old')
    params.append('limit', '50')

    const fetchRef = isStore ? storeTemplatesFetchRef : templatesFetchRef
    const setLoading = isStore ? setIsLoadingStoreTemplates : setIsLoadingTemplates
    const setData = isStore ? setStoreTemplates : setTemplates
    const currentData = isStore ? storeTemplates : templates

    const requestKey = `${token || 'anonymous'}::${params.toString()}`
    const now = Date.now()

    if (fetchRef.current.inFlight && fetchRef.current.lastKey === requestKey) {
      return fetchRef.current.inFlight
    }

    if (
      retryAttempt === 0 &&
      fetchRef.current.lastKey === requestKey &&
      now - fetchRef.current.lastFetchedAt < 8000 &&
      Array.isArray(currentData) &&
      currentData.length > 0
    ) {
      return currentData
    }

    setLoading(true)
    const requestPromise = (async () => {
      try {

        const url = `${API_CONFIG.baseURL}/templates?${params.toString()}`
        console.log(`[Templates:${storeMode}] Fetching from:`, url)

        let response
        try {
          response = await fetchWithRateLimit(url, {
            headers: token ? getHeaders() : {}
          })
        } catch (networkError) {
          console.error(`[Templates:${storeMode}] Network error on primary URL:`, networkError.message)
          const directUrl = `${window.location.origin}/api/v1/templates?${params.toString()}`
          console.log(`[Templates:${storeMode}] Trying origin fallback URL:`, directUrl)
          response = await fetch(directUrl, {
            headers: token ? getHeaders() : {}
          })
        }

        console.log(`[Templates:${storeMode}] Response status:`, response.status)

      if (response.status === 401) { localStorage.removeItem('adityanta_token'); localStorage.removeItem('adityanta_google_token'); localStorage.removeItem('user_profile'); if (window.location.pathname !== '/') window.location.href = '/'; throw new Error('Session expired'); }
        if (!response.ok) {
          console.error(`[Templates:${storeMode}] Response not OK:`, response.status, response.statusText)
          // On any non-OK response, retry without optional params (but keep store_mode — backend requires it)
          if (retryAttempt < 2) {
            console.log(`[Templates:${storeMode}] Retrying with only store_mode, attempt:`, retryAttempt + 1)
            const fallbackUrl = `${API_CONFIG.baseURL}/templates?store_mode=${storeMode}`
            const fallbackRes = await fetch(fallbackUrl, {
              headers: token ? getHeaders() : {}
            })
            if (fallbackRes.ok) {
              const text = await fallbackRes.text()
              try {
                const fallbackData = JSON.parse(text)
                if (fallbackData.success && Array.isArray(fallbackData.templates)) {
                  console.log(`[Templates:${storeMode}] Fallback succeeded, count:`, fallbackData.templates.length)
                  const normalizedTemplates = fallbackData.templates.map((t, i) => normalizeTemplate(t, i))
                  setData(normalizedTemplates)
                  return normalizedTemplates
                }
              } catch (parseErr) {
                console.error(`[Templates:${storeMode}] Fallback parse error:`, parseErr.message)
              }
            }
          }
          throw new Error(`Templates fetch failed: ${response.status}`)
        }

        // Parse response safely — don't rely on content-type header
        const text = await response.text()
        let data
        try {
          data = JSON.parse(text)
        } catch (parseError) {
          console.error(`[Templates:${storeMode}] JSON parse error:`, parseError.message, 'Response:', text.substring(0, 200))
          throw new Error('Invalid JSON response from server')
        }

        if (data.success && Array.isArray(data.templates)) {
          console.log(`[Templates:${storeMode}] Success! Loaded`, data.templates.length, 'templates')
          const normalizedTemplates = data.templates.map((t, i) => normalizeTemplate(t, i))
          setServerStatus('online')
          setData(normalizedTemplates)
          return normalizedTemplates
        } else {
          console.warn(`[Templates:${storeMode}] API returned unexpected data:`, { success: data.success, hasTemplates: !!data.templates })
          setServerStatus('online')
          return []
        }
      } catch (error) {
        console.error(`[Templates:${storeMode}] Fetch error:`, error.message)
        // Auto-retry once after 2 seconds on any error
        if (retryAttempt < 1) {
          console.log(`[Templates:${storeMode}] Auto-retrying in 2 seconds...`)
          await new Promise(r => setTimeout(r, 2000))
          return fetchTemplates(filters, retryAttempt + 1)
        }
        setServerStatus('offline')
        return []
      } finally {
        setLoading(false)
        fetchRef.current.inFlight = null
        fetchRef.current.lastFetchedAt = Date.now()
        fetchRef.current.lastKey = requestKey
      }
    })()

    fetchRef.current.inFlight = requestPromise
    fetchRef.current.lastKey = requestKey
    return requestPromise
  }, [token, getHeaders, normalizeTemplate, templates, storeTemplates])

  const downloadTemplate = useCallback(async (templateId) => {
    if (!token) {
      logger.warn('Download attempted without auth token')
      return { success: false, error: 'Not authenticated' }
    }
    try {
      const url = `${API_CONFIG.baseURL}/templates/${templateId}`
      logger.info('Downloading template from:', url)

      // Get template with all slides in one call
      const response = await fetch(url, {
        headers: getHeaders()
      })

      logger.info('Download response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        logger.error(`Download template HTTP error: ${response.status} ${response.statusText}`, errorText)
        return { success: false, error: `Server error: ${response.status}` }
      }

      const data = await response.json()
      logger.info('Download response data:', data)

      // Check for download limit exceeded error
      if (!data.success && data.error_code === 'DOWNLOAD_LIMIT_EXCEEDED') {
        return {
          success: false,
          error: data.message || 'Download limit exceeded. Upgrade to premium.',
          error_code: 'DOWNLOAD_LIMIT_EXCEEDED',
          total_downloads: data.total_downloads
        }
      }

      return data
    } catch (error) {
      logger.error('Download template error:', error)
      return { success: false, error: error.message || 'Network error' }
    }
  }, [token, getHeaders])

  const uploadTemplate = useCallback(async (formData) => {
    if (!token) return { success: false, error: 'Not authenticated' }
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/templates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      logger.error('Upload template error:', error)
      return { success: false, error: error.message }
    }
  }, [token])

  // Favorites API
  const fetchFavorites = useCallback(async () => {
    if (!token) {
      const localFavorites = normalizeFavoritesList(safeGetItem(FAVORITES_KEY, favorites))
      setFavorites(localFavorites)
      return localFavorites
    }

    const now = Date.now()
    if (favoritesFetchRef.current.inFlight && favoritesFetchRef.current.lastToken === token) {
      return favoritesFetchRef.current.inFlight
    }

    if (
      favoritesFetchRef.current.lastToken === token &&
      now - favoritesFetchRef.current.lastFetchedAt < 8000 &&
      Array.isArray(favorites) &&
      favorites.length > 0
    ) {
      return favorites
    }

    setIsLoadingFavorites(true)
    const requestPromise = (async () => {
      try {
        const response = await fetchWithRateLimit(`${API_CONFIG.baseURL}/user/favourites`, {
          headers: getHeaders()
        })

        if (!response.ok) {
          throw new Error(`Favorites fetch failed: ${response.status}`)
        }

        const data = await response.json()
        const rawList = data?.templates || data?.favourites || data?.favorites || data?.data?.templates || data?.data || []
        const normalizedFavorites = normalizeFavoritesList(rawList)

        setFavorites(normalizedFavorites)
        return normalizedFavorites
      } catch (error) {
        logger.error('Fetch favorites error:', error)
        const localFavorites = normalizeFavoritesList(safeGetItem(FAVORITES_KEY, favorites))
        setFavorites(localFavorites)
        return localFavorites
      } finally {
        setIsLoadingFavorites(false)
        favoritesFetchRef.current.inFlight = null
        favoritesFetchRef.current.lastFetchedAt = Date.now()
        favoritesFetchRef.current.lastToken = token
      }
    })()

    favoritesFetchRef.current.inFlight = requestPromise
    favoritesFetchRef.current.lastToken = token
    return requestPromise
  }, [token, getHeaders, normalizeFavoritesList, favorites])

  const addFavorite = useCallback(async (templateId, templateObj = null) => {
    const resolvedTemplate = templateObj || templates.find(t => String(t.template_id) === String(templateId) || String(t.id) === String(templateId)) || { id: templateId, template_id: templateId, title: 'Template' }
    const normalizedTemplateItem = normalizeTemplate(resolvedTemplate, 0)

    const addToLocal = () => {
      setFavorites(prev => {
        if (prev.some(f => String(f.template_id) === String(templateId) || String(f.id) === String(templateId))) return prev
        return [normalizedTemplateItem, ...prev]
      })
      favoritesFetchRef.current.lastFetchedAt = 0
    }

    if (!token) {
      addToLocal()
      return { success: true, localOnly: true }
    }

    try {
      const response = await fetchWithRateLimit(`${API_CONFIG.baseURL}/templates/${templateId}/favourite`, {
        method: 'POST',
        headers: getHeaders()
      })

      if (!response.ok) {
        addToLocal()
        return { success: true, localOnly: true, status: response.status }
      }

      const data = await response.json().catch(() => ({}))
      const isSuccess = data?.success !== false
      if (isSuccess) {
        addToLocal()
      }
      return { ...data, success: isSuccess }
    } catch (error) {
      logger.error('Add favorite error:', error)
      addToLocal()
      return { success: true, localOnly: true }
    }
  }, [token, getHeaders, templates, normalizeTemplate])

  const removeFavorite = useCallback(async (templateId) => {
    const removeFromLocal = () => {
      setFavorites(prev => prev.filter(t => String(t.template_id) !== String(templateId) && String(t.id) !== String(templateId)))
      favoritesFetchRef.current.lastFetchedAt = 0
    }

    if (!token) {
      removeFromLocal()
      return { success: true, localOnly: true }
    }

    try {
      const response = await fetchWithRateLimit(`${API_CONFIG.baseURL}/templates/${templateId}/favourite`, {
        method: 'DELETE',
        headers: getHeaders()
      })

      if (!response.ok) {
        removeFromLocal()
        return { success: true, localOnly: true, status: response.status }
      }

      const data = await response.json().catch(() => ({}))
      const isSuccess = data?.success !== false
      if (isSuccess) {
        removeFromLocal()
      }
      return { ...data, success: isSuccess }
    } catch (error) {
      logger.error('Remove favorite error:', error)
      removeFromLocal()
      return { success: true, localOnly: true }
    }
  }, [token, getHeaders])

  // Check if template is favorited
  const isFavorite = useCallback((templateId) => {
    if (!templateId) return false
    return favorites.some(t => String(t.template_id) === String(templateId) || String(t.id) === String(templateId))
  }, [favorites])

  // Persist favorites locally so bookmarks always work even if API favourite endpoint is unavailable
  useEffect(() => {
    safeSetItem(FAVORITES_KEY, Array.isArray(favorites) ? favorites : [])
  }, [favorites])

  // User Projects/Files API — persisted to IndexedDB to avoid the ~5MB
  // localStorage quota (slide decks with embedded images easily exceed it).
  // localStorage is still checked once on startup as a fallback for users
  // whose old data lives there, so nothing is lost during the migration.
  // Compute unique key for the current user to namespace IndexedDB and trash storage keys
  const userKey = useMemo(() => {
    if (!user) return 'anonymous'
    return String(user.id || user.user_id || user.phone || user.email || 'anonymous')
  }, [user])

  const USER_FILES_KEY = useMemo(() => `adityanta_user_files_${userKey}`, [userKey])
  const TRASH_KEY = useMemo(() => `adityanta_trash_${userKey}`, [userKey])
  const USER_FILES_IDB_KEY = useMemo(() => `adityanta_user_files_${userKey}`, [userKey])

  // Track if initial load is complete to avoid overwriting persisted data
  // with the empty-array initial state before IndexedDB has responded.
  const initialLoadComplete = useRef(false)

  // Load from IndexedDB (preferred) or localStorage (legacy) whenever the active account changes
  useEffect(() => {
    let cancelled = false
    initialLoadComplete.current = false
    setIsUserFilesLoaded(false) // Trigger loading spinner during account switches

    const loadUserFiles = async () => {
      // Request persistent storage so the browser does not erase our database on cache clears
      try {
        await requestPersistentStorage()
      } catch (e) {
        logger.error('AppContext: Persistent storage request failed:', e)
      }

      // 1. Try IndexedDB first — this is the authoritative store going forward.
      let files = null
      try {
        const fromIDB = await idbLoadItem(USER_FILES_IDB_KEY)
        if (Array.isArray(fromIDB)) files = fromIDB
      } catch (e) {
        logger.error('AppContext: IndexedDB load failed:', e)
      }

      // 2. Fallback to localStorage (legacy users from before the migration).
      //    If we find data there AND IndexedDB was empty, migrate it forward.
      if (!files) {
        // Try user-specific localStorage first
        const fromLS = safeGetItem(USER_FILES_KEY, null)
        if (Array.isArray(fromLS) && fromLS.length > 0) {
          files = fromLS
          try {
            await idbSaveItem(USER_FILES_IDB_KEY, fromLS)
            logger.info(`AppContext: Migrated userFiles from localStorage key ${USER_FILES_KEY} to IndexedDB`)
          } catch (e) {
            logger.error('AppContext: Migration write to IndexedDB failed:', e)
          }
        } else {
          // Try global legacy localStorage key
          const fromGlobalLS = safeGetItem('adityanta_user_files', null)
          if (Array.isArray(fromGlobalLS) && fromGlobalLS.length > 0) {
            files = fromGlobalLS
            try {
              await idbSaveItem(USER_FILES_IDB_KEY, fromGlobalLS)
              logger.info(`AppContext: Migrated legacy global userFiles to IndexedDB key ${USER_FILES_IDB_KEY}`)
              // Clean up global legacy localStorage so it doesn't cause mix-ups
              localStorage.removeItem('adityanta_user_files')
            } catch (e) {
              logger.error('AppContext: Migration write to IndexedDB failed:', e)
            }
          } else {
            files = []
          }
        }
      }

      if (cancelled) return
      logger.info(`AppContext: Loaded user files for key ${USER_FILES_IDB_KEY}:`, files.length)
      setUserFiles(files)

      // CRITICAL: only flip these flags AFTER the async load has populated
      // `userFiles`. If we flipped them before, the persist-on-change effect
      // below would see the empty initial state (`[]`) combined with
      // `initialLoadComplete === true` and would overwrite the user's saved
      // files in IndexedDB with `[]` — wiping their work on every refresh.
      initialLoadComplete.current = true
      setIsUserFilesLoaded(true)
    }

    loadUserFiles()

    const savedTrash = safeGetItem(TRASH_KEY, [])
    if (Array.isArray(savedTrash)) {
      // Convert deletedAt strings back to Date and filter out expired items
      const now = new Date()
      const validTrash = savedTrash
        .map(item => ({ ...item, deletedAt: new Date(item.deletedAt) }))
        .filter(item => {
          const daysSinceDelete = (now - item.deletedAt) / (1000 * 60 * 60 * 24)
          return daysSinceDelete < 15 // Keep items less than 15 days old
        })
      setTrashedItems(validTrash)
      // Update localStorage with cleaned trash
      setToStorage(TRASH_KEY, validTrash)
    } else {
      setTrashedItems([])
    }

    return () => { cancelled = true }
  }, [USER_FILES_IDB_KEY, TRASH_KEY, USER_FILES_KEY])

  // Save to IndexedDB whenever userFiles changes (including empty array).
  // We no longer write userFiles to localStorage — IndexedDB has a much
  // larger quota (~50MB+ in most browsers, and 50%+ of free disk in Chrome).
  useEffect(() => {
    if (initialLoadComplete.current && isUserFilesLoaded) {
      logger.info(`AppContext: Persisting userFiles to IndexedDB for key ${USER_FILES_IDB_KEY}:`, userFiles.length, 'files')
      idbSaveItem(USER_FILES_IDB_KEY, userFiles).catch((e) => {
        logger.error('AppContext: IndexedDB save failed:', e)
      })
    }
  }, [userFiles, USER_FILES_IDB_KEY, isUserFilesLoaded])

 

  // Save to localStorage whenever trashedItems changes
  useEffect(() => {
    if (initialLoadComplete.current) {
      setToStorage(TRASH_KEY, trashedItems)
    }
  }, [trashedItems, TRASH_KEY])

  // Auto-cleanup expired trash items every minute
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = new Date()
      setTrashedItems(prev => {
        const validItems = prev.filter(item => {
          const deletedAt = item.deletedAt instanceof Date ? item.deletedAt : new Date(item.deletedAt)
          const daysSinceDelete = (now - deletedAt) / (1000 * 60 * 60 * 24)
          return daysSinceDelete < 15
        })
        return validItems
      })
    }, 60000) // Check every minute
    return () => clearInterval(cleanupInterval)
  }, [])

// Save project (create new or update existing)
  const saveProject = useCallback((projectData) => {
    const existingIndex = userFiles.findIndex(f => f.id === projectData.id)
    const now = new Date()
    const fileData = {
      ...projectData,
      id: projectData.id || Date.now(),
      // Save full frames data, and frameCount for display
      frames: projectData.frames, // Keep the full frames array
      frameCount: Array.isArray(projectData.frames) ? projectData.frames.length : (projectData.frames || 1),
      thumbnail: projectData.thumbnail || 'from-blue-400 to-purple-600',
      updatedAt: now.toISOString(),
      created: projectData.created || now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    }

    // Compute the next list synchronously so we can start persistence immediately.
    const nextFiles = existingIndex >= 0
      ? userFiles.map((f, i) => i === existingIndex ? fileData : f)
      : [fileData, ...userFiles]

    // Kick off the IndexedDB write RIGHT NOW (don't wait for the useEffect
    // that watches `userFiles`). The editor page typically navigates away
    // immediately after saving, and we want the write to be in-flight before
    // any unmount/navigation happens. IndexedDB transactions, once begun,
    // complete even if the page unmounts.
    idbSaveItem(USER_FILES_IDB_KEY, nextFiles).catch((e) => {
      logger.error('saveProject: IndexedDB write failed:', e)
    })

    setUserFiles(nextFiles)
    return fileData
  }, [userFiles, USER_FILES_IDB_KEY])

  // Get project by ID
  const getProject = useCallback((projectId) => {
    return userFiles.find(f => f.id === projectId || f.id === parseInt(projectId))
  }, [userFiles])

  const addUserFile = useCallback((file) => {
    const now = new Date()
    const newFile = {
      ...file,
      id: Date.now(),
      created: now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      updatedAt: now.toISOString()
    }
    setUserFiles(prev => [newFile, ...prev])
    return newFile
  }, [])

 const deleteUserFile = useCallback((fileId) => {
    const file = userFiles.find(f => f.id === fileId)
    if (file) {
      const updatedFiles = userFiles.filter(f => f.id !== fileId)
      setUserFiles(updatedFiles)
      setTrashedItems(prev => [{ ...file, deletedAt: new Date() }, ...prev])
      // Mirror the deletion to IndexedDB immediately so a post-delete refresh
      // doesn't resurrect the file.
      idbSaveItem(USER_FILES_IDB_KEY, updatedFiles).catch((e) => {
        logger.error('deleteUserFile: IndexedDB write failed:', e)
      })
    }
  }, [userFiles, USER_FILES_IDB_KEY])

  const restoreUserFile = useCallback((fileId) => {
    const file = trashedItems.find(f => f.id === fileId)
    if (file) {
      setTrashedItems(prev => prev.filter(f => f.id !== fileId))
      const { deletedAt, ...restoredFile } = file
      setUserFiles(prev => [restoredFile, ...prev])
    }
  }, [trashedItems])

  const permanentlyDeleteFile = useCallback((fileId) => {
    setTrashedItems(prev => prev.filter(f => f.id !== fileId))
  }, [])

  // Membership API
  const buyMembership = useCallback(async (plan, successUrl = null) => {
    if (!token) return { success: false, error: 'Not authenticated' }
    try {
      const payload = { plan: plan.toUpperCase() } // Backend expects MONTHLY, QUARTERLY, YEARLY
      if (successUrl) {
        payload.success_url = successUrl
      }

      const response = await fetchWithRateLimit(`${API_CONFIG.baseURL}/user/membership/buy`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      })

      // Check response status before parsing
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Server error' }))
        logger.error('Buy membership error:', { status: response.status, data })
        throw new Error(data.message || data.error || `Server error: ${response.status}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      logger.error('Buy membership error:', error)
      return { success: false, error: error.message || 'Payment initiation failed' }
    }
  }, [token, getHeaders])

  const verifyPayment = useCallback(async (paymentData) => {
    if (!token) return { success: false, error: 'Not authenticated' }
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/user/membership/verify`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          payment_id: paymentData.razorpay_payment_id || paymentData.payment_id,
          razorpay_order_id: paymentData.razorpay_order_id,
          razorpay_signature: paymentData.razorpay_signature
        })
      })

      if (!response.ok) {
        throw new Error(`Payment verification failed: ${response.status}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      logger.error('Verify payment error:', error)
      return { success: false, error: error.message }
    }
  }, [token, getHeaders])

  const value = {
    // Config
    config,
    fetchConfig,
   // Templates
    templates,
    storeTemplates,
    isLoadingTemplates,
    isLoadingStoreTemplates,
    serverStatus,
    fetchTemplates,
    downloadTemplate,
    uploadTemplate,
    // Favorites
    favorites,
    isLoadingFavorites,
    fetchFavorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    // User Files/Projects
    userFiles,
    isUserFilesLoaded,
    trashedItems,
    addUserFile,
    saveProject,
    getProject,
    deleteUserFile,
    restoreUserFile,
    permanentlyDeleteFile,
    // Membership
    buyMembership,
    verifyPayment
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export default AppContext
