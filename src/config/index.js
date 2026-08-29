// Centralized configuration for the application

const normalizeBaseUrl = (baseUrl) => {
  if (!baseUrl) return '/api/v1'
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

const resolveFrontendDomain = () => {
  const configured = import.meta.env.VITE_FRONTEND_BASE_URL
  if (configured) {
    return configured.endsWith('/') ? configured.slice(0, -1) : configured
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

// Validate required environment variables
const validateRequiredEnvVars = () => {
  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
  ]

  const missing = required.filter(envVar => !import.meta.env[envVar])

  if (missing.length > 0) {
    console.warn(`Missing environment variables: ${missing.join(', ')}`)
  }
}

// Run validation on app startup
validateRequiredEnvVars()

// API Configuration
// Default uses same-origin proxy path (/api/v1) for portability across machines
// Can be overridden with VITE_API_BASE_URL when needed
export const API_CONFIG = {
  baseURL: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL),
  timeout: 10000,
  retryAttempts: 3,
  retryDelay: 1000,
}

// Frontend/Share Configuration
// Default uses current origin, can be overridden via VITE_FRONTEND_BASE_URL
export const FRONTEND_CONFIG = {
  domain: resolveFrontendDomain(),
  getShareUrl: (shareId) => `${resolveFrontendDomain()}/share/${shareId}`,
}

// Authentication Configuration
export const AUTH_CONFIG = {
  tokenKey: 'auth_token',
  googleTokenKey: 'google_token',
  sessionTimeout: 3600000, // 1 hour in ms
}

// Editor Configuration
export const EDITOR_CONFIG = {
  autosaveInterval: 30000, // 30 seconds
  autosaveKey: 'adityanta_autosave',
  versionHistoryKey: 'adityanta_versions',
  maxVersions: 20,
  canvasWidth: 800,
  canvasHeight: 600,
  defaultZoom: 100,
  minZoom: 25,
  maxZoom: 200,
  gridSize: 20,
}

// Default User Configuration
export const DEFAULT_USER = {
  membershipType: 'FREE',
  remainingDownloads: null,
}

// Environment Check
export const ENV = {
  isDevelopment: import.meta.env.MODE === 'development',
  isProduction: import.meta.env.MODE === 'production',
  hasBackend: true,
}

// Firebase Configuration
export const FIREBASE_CONFIG = {
  isConfigured: Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_API_KEY !== 'YOUR_FIREBASE_API_KEY'
  ),
}

// Export Options
export const EXPORT_CONFIG = {
  pdfOrientation: 'landscape',
  pdfWidth: 1280,
  pdfHeight: 720,
  pptxWidth: 10,
  pptxHeight: 5.625,
  jpegQuality: 0.92,
  pngScale: 2,
}

// Toast Configuration
export const TOAST_CONFIG = {
  defaultDuration: 4000,
  errorDuration: 5000,
  successDuration: 3000,
}
