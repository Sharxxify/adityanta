import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useAuth } from './AuthContext'
import { API_CONFIG, AUTH_CONFIG } from '../config'
import { fetchWithRateLimit } from '../services/api'
import { safeJSONParse, setToStorage } from '../utils/imageUtils'
import { safeSetItem, safeGetItem } from '../utils/safeStorage'
import * as projectStore from '../utils/projectStore'
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
  const [isUserFilesLoaded, setIsUserFilesLoaded] = useState(false)
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
      if (data.success && (data.pricing || data.plans)) {
        const newConfig = {
          pricing: data.pricing || data.plans,
          plans: data.plans || data.pricing,
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

  // Template data from the API, kept exactly as the server sends it (#47).
  // Only field-name aliases (camelCase / snake_case) are resolved and the
  // card gradient is added; nothing is invented. (The old code clamped every
  // slide count to 4–5, and made up titles, topics, descriptions, licences
  // and "created today" dates when a field was missing.)
  const normalizeTemplate = useCallback((template, index) => {
    const t = template || {}
    const frameCount = (() => {
      const raw = t.frames ?? t.frame_count ?? t.slide_count ?? t.slides_count ?? t.slides
      if (Array.isArray(raw)) return raw.length
      const n = parseInt(raw, 10)
      return Number.isFinite(n) && n >= 0 ? n : null
    })()
    const rawPreview = `${t.preview || ''}`.trim()
    const isUrlLikePreview = /^(https?:\/\/|www\.)/i.test(rawPreview)
    const previewImage = isUrlLikePreview
      ? (/^www\./i.test(rawPreview) ? `https://${rawPreview}` : rawPreview.replace(/^http:\/\//i, 'https://'))
      : null
    const downloads = parseInt(t.downloads ?? t.download_count, 10)

    return {
      ...t,
      id: t.id ?? t.template_id ?? t.templateId ?? index + 1,
      template_id: t.template_id ?? t.templateId ?? t.id,
      title: t.title ?? '',
      topic: t.topic ?? '',
      sub_topic: t.sub_topic ?? t.subTopic ?? '',
      frames: frameCount,
      downloads: Number.isFinite(downloads) ? Math.max(0, downloads) : 0,
      license: t.license ?? null,
      gradient: t.gradient || defaultGradients[index % defaultGradients.length],
      preview: rawPreview,
      thumbnail_url: t.thumbnail_url || t.thumbnailUrl || previewImage,
      description: t.description ?? '',
      is_favourite: !!(t.is_favourite || t.isFavourite),
      s3_file_url: t.s3_file_url || t.s3FileUrl || null,
      created_at: t.created_at || t.createdAt || null,
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
    if (filters.sort) params.append('sort', /old\s*(to|->|→)\s*new/i.test(filters.sort) ? 'old' : 'new')
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
    // Retries run inside this request. (They used to call fetchTemplates()
    // again, which returned this very in-flight promise: a promise waiting
    // for itself never settles, so a failed load spun forever.)
    const run = async (attemptNo) => {
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

      if (response.status === 401) {
        // the session token lives in auth_token (the old code cleared a key that is never used)
        ['auth_token', 'adityanta_token', 'adityanta_google_token', 'user_profile'].forEach((k) => localStorage.removeItem(k))
        if (window.location.pathname !== '/') window.location.href = '/'
        throw new Error('Session expired')
      }
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
        if (attemptNo < 1) {
          console.log(`[Templates:${storeMode}] Auto-retrying in 2 seconds...`)
          await new Promise(r => setTimeout(r, 2000))
          return run(attemptNo + 1)
        }
        setServerStatus('offline')
        return []
      }
    }
    const requestPromise = run(retryAttempt).finally(() => {
      setLoading(false)
      if (fetchRef.current.inFlight === requestPromise) fetchRef.current.inFlight = null
      fetchRef.current.lastFetchedAt = Date.now()
      fetchRef.current.lastKey = requestKey
    })

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

  // User projects ("Your Files") live in this browser, one IndexedDB record
  // per project (see utils/projectStore.js). React state only holds the light
  // summaries used by the Home page; full projects are loaded on demand.
  const ownerKey = useMemo(() => {
    if (!user) return 'anonymous'
    return String(user.id || user.user_id || user.phone || user.email || 'anonymous')
  }, [user])
  const ownerRef = useRef(ownerKey)
  ownerRef.current = ownerKey

  const [projectSummaries, setProjectSummaries] = useState([])

  const refreshUserFiles = useCallback(async () => {
    const owner = ownerRef.current
    try {
      const list = await projectStore.listProjects(owner)
      if (ownerRef.current === owner) setProjectSummaries(list)
      return list
    } catch (e) {
      logger.error('AppContext: could not list projects', e)
      return []
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setIsUserFilesLoaded(false)
    ;(async () => {
      projectStore.requestPersistence().catch(() => {})
      try {
        await projectStore.migrateLegacyProjects(ownerKey)
      } catch (e) {
        logger.error('AppContext: migrating older projects failed (they are left untouched)', e)
      }
      try { await projectStore.purgeExpiredTrash(ownerKey) } catch (_e) { /* noop */ }
      if (cancelled) return
      await refreshUserFiles()
      if (!cancelled) setIsUserFilesLoaded(true)
    })()
    const off = projectStore.onProjectsChanged(() => { refreshUserFiles() })
    return () => { cancelled = true; off() }
  }, [ownerKey, refreshUserFiles])

  const userFiles = useMemo(() => projectSummaries.filter((m) => !m.deletedAt), [projectSummaries])
  const trashedItems = useMemo(() => projectSummaries.filter((m) => m.deletedAt), [projectSummaries])

  const upsertSummary = useCallback((summary) => {
    if (!summary) return
    setProjectSummaries((prev) => {
      const rest = prev.filter((m) => String(m.id) !== String(summary.id))
      return [summary, ...rest].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    })
  }, [])

  /**
   * Create or update a project (full data: frames, header, ...).
   * Resolves with the saved summary; rejects with a readable error.
   */
  const saveProject = useCallback(async (projectData) => {
    try {
      const summary = await projectStore.saveProjectRecord(ownerRef.current, projectData)
      upsertSummary(summary)
      projectStore.notifyProjectsChanged({ id: summary.id })
      return summary
    } catch (e) {
      const err = new Error(projectStore.describeStorageError(e))
      err.cause = e
      logger.error('saveProject failed:', e)
      throw err
    }
  }, [upsertSummary])

  const updateProjectSummary = useCallback(async (id, patch) => {
    const next = await projectStore.updateProjectSummary(id, patch)
    if (next) upsertSummary(next)
    return next
  }, [upsertSummary])

  /** Full project (media as blob: URLs), or null */
  const loadProject = useCallback((id) => projectStore.loadProject(id), [])

  /** Summary of a project by id (sync; only non-deleted projects) */
  const getProject = useCallback((projectId) => {
    if (projectId == null) return undefined
    return userFiles.find((f) => String(f.id) === String(projectId))
  }, [userFiles])

  /** Most recent copy the user made of a store template */
  const findTemplateCopy = useCallback((templateId) => {
    if (!templateId) return null
    return userFiles.find((f) => f.templateId && String(f.templateId) === String(templateId)) || null
  }, [userFiles])

  const duplicateProject = useCallback(async (id) => {
    const summary = await projectStore.duplicateProject(ownerRef.current, id)
    if (summary) { upsertSummary(summary); projectStore.notifyProjectsChanged({ id: summary.id }) }
    return summary
  }, [upsertSummary])

  const deleteUserFile = useCallback(async (fileId) => {
    const next = await projectStore.trashProject(fileId)
    if (next) upsertSummary(next)
    projectStore.notifyProjectsChanged({ id: fileId })
  }, [upsertSummary])

  const restoreUserFile = useCallback(async (fileId) => {
    const next = await projectStore.restoreProject(fileId)
    if (next) upsertSummary(next)
    projectStore.notifyProjectsChanged({ id: fileId })
  }, [upsertSummary])

  const permanentlyDeleteFile = useCallback(async (fileId) => {
    setProjectSummaries((prev) => prev.filter((m) => String(m.id) !== String(fileId)))
    await projectStore.deleteProjectForever(fileId)
    projectStore.notifyProjectsChanged({ id: fileId })
  }, [])

  const addUserFile = saveProject

  // Membership API
  const buyMembership = useCallback(async (plan, successUrl = null, autopay = false, planId = null) => {
    if (!token) return { success: false, error: 'Not authenticated' }
    try {
      const payload = {}
      if (planId) {
        payload.plan_id = planId
      }
      if (plan) {
        payload.plan = plan.toUpperCase()
        if (!payload.plan_id) {
          payload.plan_id = plan
        }
      }
      if (successUrl) {
        payload.success_url = successUrl
      }
      if (autopay) {
        payload.autopay = true
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
    ownerKey,
    userFiles,
    isUserFilesLoaded,
    trashedItems,
    addUserFile,
    saveProject,
    loadProject,
    getProject,
    findTemplateCopy,
    duplicateProject,
    updateProjectSummary,
    refreshUserFiles,
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
