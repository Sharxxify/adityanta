import { API_CONFIG, AUTH_CONFIG } from '../config'
import logger from '../utils/logger'

// Helper function to delay retry attempts
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Helper function for handling rate limits on direct fetch calls
// Use this for fetch calls that bypass apiCall wrapper
// NOTE: Does NOT retry on 429 — retrying just keeps the rate limit active
export const fetchWithRateLimit = async (url, options = {}, retryCount = 0) => {
  try {
    const response = await fetch(url, options)
    // 429 = just return, let caller handle it (no retries)
    return response
  } catch (error) {
    // Network errors only - retry with exponential backoff
    if (retryCount < API_CONFIG.retryAttempts) {
      const backoffDelay = API_CONFIG.retryDelay * Math.pow(2, retryCount)
      logger.warn(`Network error, retrying in ${backoffDelay}ms:`, error.message)
      await delay(backoffDelay)
      return fetchWithRateLimit(url, options, retryCount + 1)
    }
    throw error
  }
}

// Helper function for API calls with retry logic and rate limit handling
const apiCall = async (endpoint, options = {}, retryCount = 0, isRateLimited = false) => {
  const url = `${API_CONFIG.baseURL}${endpoint}`
  const token = localStorage.getItem(AUTH_CONFIG.tokenKey)

  const defaultHeaders = {
    'Content-Type': 'application/json',
  }

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`
  }

  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  }

  try {
    const response = await fetch(url, config)

    // Handle 429 (Too Many Requests) — throw immediately, do NOT retry
    // Retrying on 429 just keeps the rate limit window active
    if (response.status === 429) {
      logger.warn('Rate limited (429), not retrying:', endpoint)
      throw new Error('Rate limited by server. Please wait a moment and try again.')
    }

    // Validate response is JSON before parsing
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Invalid response format: Expected JSON, got ${contentType || 'unknown'}`)
    }

    const data = await response.json()

    // Handle 401 Unauthorized - clear auth and redirect
    if (response.status === 401) {
      logger.warn('Authentication expired, clearing session')
      localStorage.removeItem(AUTH_CONFIG.tokenKey)
      localStorage.removeItem(AUTH_CONFIG.googleTokenKey)
      localStorage.removeItem('user_profile')
      // Only redirect if not already on login page
      if (window.location.pathname !== '/') {
        window.location.href = '/'
      }
      throw new Error('Session expired. Please login again.')
    }

    if (!response.ok) {
      // Log full error details for debugging
      logger.error('API error response:', {
        status: response.status,
        endpoint,
        data,
        errors: data.errors || data.error || 'No error details'
      })

      const error = new Error(data.message || `API request failed with status ${response.status}`)
      error.data = data // Attach data so callers can check error_code
      error.status = response.status
      throw error
    }

    return data
  } catch (error) {
    // Retry logic for network errors (only if not rate limited)
    if (!isRateLimited && retryCount < API_CONFIG.retryAttempts && error.message.includes('fetch')) {
      logger.warn(`Retrying API call (${retryCount + 1}/${API_CONFIG.retryAttempts}):`, endpoint)
      await delay(API_CONFIG.retryDelay * (retryCount + 1))
      return apiCall(endpoint, options, retryCount + 1, isRateLimited)
    }

    logger.error('API call failed:', endpoint, error)
    throw error
  }
}

// Auth APIs
export const authAPI = {
  // Send OTP to phone number
  login: (phone) =>
    apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  // Verify OTP (use 123456 for testing)
  verifyOTP: (phone, otp) =>
    apiCall('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
    }),

  // Refresh access token
  refreshToken: () =>
    apiCall('/auth/refresh', {
      method: 'POST',
    }),

  // Logout (server-side)
  logout: () =>
    apiCall('/auth/logout', {
      method: 'POST',
    }),
}

// User APIs
export const userAPI = {
  // Get user profile
  getProfile: () => apiCall('/user/profile'),

  // Update user profile
  updateProfile: (data) =>
    apiCall('/user/profile', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Upload profile picture
  uploadProfilePicture: async (file) => {
    const token = localStorage.getItem(AUTH_CONFIG.tokenKey)
    const formData = new FormData()
    formData.append('profilePicture', file)

    const response = await fetch(`${API_CONFIG.baseURL}/user/upload-profile-picture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Profile picture upload failed')
    }

    return response.json()
  },

  // Get user usage statistics
  getUsage: () => apiCall('/user/usage'),

  // Get user favourites
  getFavourites: () => apiCall('/user/favourites'),

  // Initiate membership payment
  // Plans: MONTHLY (₹299), QUARTERLY (₹799), YEARLY (₹2999)
  // Returns: { success, payment_id, payment_link }
  buyMembership: (plan, successUrl = null) => {
    const payload = { plan }
    if (successUrl) {
      payload.success_url = successUrl
    }
    logger.info('Buy membership request:', { endpoint: '/user/membership/buy', payload })
    return apiCall('/user/membership/buy', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  // Verify membership payment
  // Returns: { success, membership_active, plan, expires_at } or { success: false, error_code, message }
  verifyPayment: (paymentId, razorpaySignature) =>
    apiCall('/user/membership/verify', {
      method: 'POST',
      body: JSON.stringify({
        payment_id: paymentId,
        razorpay_signature: razorpaySignature,
      }),
    }),

  // Report a download (must be called before allowing export for free users)
  // Returns: { success, message, free_downloads_remaining }
  // Error: { success: false, error_code: "NO_FREE_DOWNLOADS", message, free_downloads_remaining: 0 }
  reportDownload: () =>
    apiCall('/user/report-download', {
      method: 'POST',
    }),
}

// Template APIs
export const templateAPI = {
  // Get pricing and free downloads configuration
  // Returns: { success, pricing: { monthly, quarterly, yearly }, free_downloads_limit }
  getConfig: () => apiCall('/templates/config'),

  // Get all templates with optional filters and pagination
  // Returns: { success, templates: [{ template_id, title, thumbnail_url, topic, license, downloads, is_favourite }], pagination }
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString()
    return apiCall(`/templates${queryString ? `?${queryString}` : ''}`)
  },

  // Search templates
  search: (query, filters = {}) => {
    const params = new URLSearchParams({ ...filters, q: query })
    return apiCall(`/templates/search?${params.toString()}`)
  },

  // Download template by ID (subject to download limits)
  // Free users: 5 total downloads ever, Premium: Unlimited
  // Returns: { success, s3_file_url, template } or error { error_code: "DOWNLOAD_LIMIT_EXCEEDED" }
  download: (templateId) => apiCall(`/templates/${templateId}`),

  // Get template by ID (metadata only)
  getById: (id) => apiCall(`/templates/${id}/info`),

  // Get template data for editing (legacy)
  getTemplateData: (id) => apiCall(`/templates/${id}/data`),

  // Upload new template (FormData upload)
  upload: async (formData) => {
    const token = localStorage.getItem(AUTH_CONFIG.tokenKey)
    const response = await fetch(`${API_CONFIG.baseURL}/templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData, // FormData for file upload
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Upload failed')
    }

    return response.json()
  },

  // Add template to favourites
  addFavourite: (id) => apiCall(`/templates/${id}/favourite`, { method: 'POST' }),

  // Remove template from favourites
  removeFavourite: (id) => apiCall(`/templates/${id}/favourite`, { method: 'DELETE' }),

  // Save edited template
  save: (id, data) =>
    apiCall(`/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  // Track template view
  trackView: (id) => apiCall(`/templates/${id}/views`, { method: 'POST' }),

  // Convert WebM video to MP4 (Universal - works for all browsers/platforms)
  convertToMP4: async (webmBlob, fileName = 'presentation.webm') => {
    const token = localStorage.getItem(AUTH_CONFIG.tokenKey)
    const formData = new FormData()
    formData.append('video', webmBlob, fileName)

    const response = await fetch(`${API_CONFIG.baseURL}/templates/convert-to-mp4`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'MP4 conversion failed')
    }

    return response.blob()
  },
}

// Admin APIs
export const adminAPI = {
  // Upload template (admin)
  uploadTemplate: async (formData) => {
    const token = localStorage.getItem(AUTH_CONFIG.tokenKey)
    const response = await fetch(`${API_CONFIG.baseURL}/admin/templates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Admin upload failed')
    }

    return response.json()
  },

  // List templates (admin)
  getTemplates: () => apiCall('/admin/templates'),

  // List all users
  getUsers: () => apiCall('/admin/users'),

  // List subscribed users
  getSubscribedUsers: () => apiCall('/admin/users/subscribed'),
}

export default {
  baseURL: API_CONFIG.baseURL,
  auth: authAPI,
  user: userAPI,
  template: templateAPI,
  admin: adminAPI,
}
