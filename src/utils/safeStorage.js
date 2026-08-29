import logger from './logger'

/**
 * Safe localStorage wrapper with quota error handling
 */

const QUOTA_EXCEEDED_ERROR_CODES = [
  'QuotaExceededError',
  'NS_ERROR_DOM_QUOTA_REACHED',
  'QUOTA_EXCEEDED_ERR',
  22 // Legacy error code
]

const isQuotaExceededError = (error) => {
  return (
    QUOTA_EXCEEDED_ERROR_CODES.includes(error.name) ||
    error.code === 22 ||
    error.message?.includes('quota')
  )
}

/**
 * Safely set item in localStorage with quota error handling
 * @param {string} key - Storage key
 * @param {any} value - Value to store (will be JSON stringified)
 * @param {Object} options - Options
 * @param {boolean} options.compress - Whether to try compression on quota error
 * @returns {boolean} - Success status
 */
export const safeSetItem = (key, value, options = {}) => {
  try {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
    localStorage.setItem(key, stringValue)
    return true
  } catch (error) {
    if (isQuotaExceededError(error)) {
      logger.warn(`localStorage quota exceeded for key: ${key}`)

      // Try to free up space by removing old items
      if (options.compress !== false) {
        const freedSpace = freeUpSpace(key)
        if (freedSpace) {
          // Retry after freeing space
          try {
            const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
            localStorage.setItem(key, stringValue)
            logger.info(`Successfully stored ${key} after freeing space`)
            return true
          } catch (retryError) {
            logger.error(`Failed to store ${key} even after freeing space`, retryError)
            return false
          }
        }
      }

      logger.error(`Cannot store ${key}: localStorage quota exceeded`)
      return false
    }

    logger.error(`Error storing ${key} in localStorage`, error)
    return false
  }
}

/**
 * Safely get item from localStorage
 * @param {string} key - Storage key
 * @param {any} defaultValue - Default value if key doesn't exist
 * @returns {any} - Parsed value or default
 */
export const safeGetItem = (key, defaultValue = null) => {
  try {
    const item = localStorage.getItem(key)
    if (item === null) return defaultValue

    try {
      return JSON.parse(item)
    } catch {
      // If JSON.parse fails, return as string
      return item
    }
  } catch (error) {
    logger.error(`Error getting ${key} from localStorage`, error)
    return defaultValue
  }
}

/**
 * Safely remove item from localStorage
 * @param {string} key - Storage key
 * @returns {boolean} - Success status
 */
export const safeRemoveItem = (key) => {
  try {
    localStorage.removeItem(key)
    return true
  } catch (error) {
    logger.error(`Error removing ${key} from localStorage`, error)
    return false
  }
}

/**
 * Free up localStorage space by removing old/large items
 * Priority: old autosaves, old versions, old trash items
 * @param {string} excludeKey - Key to exclude from cleanup
 * @returns {boolean} - Whether space was freed
 */
const freeUpSpace = (excludeKey) => {
  try {
    // IMPORTANT: 'adityanta_user_files' is the user's permanent saved work and
    // MUST NEVER be auto-evicted. Evicting it silently lost the user's projects
    // after a refresh. Keep eviction limited to regenerable caches only.
    const itemsToCleanup = [
      'adityanta_autosave',
      'adityanta_versions',
      'adityanta_trash',
      'adityanta_last_visit',
      'adityanta_recent_templates',
      'adityanta_config_cache',
      'adityanta_filter_prefs',
    ].filter(key => key !== excludeKey)

    let freedSpace = false

    for (const key of itemsToCleanup) {
      const item = localStorage.getItem(key)
      if (item) {
        const sizeMB = (item.length * 2) / (1024 * 1024) // Rough size in MB
        if (sizeMB > 1) { // Only remove items larger than 1MB
          localStorage.removeItem(key)
          logger.info(`Removed ${key} (${sizeMB.toFixed(2)}MB) to free space`)
          freedSpace = true
          break // Free one at a time and retry
        }
      }
    }

    return freedSpace
  } catch (error) {
    logger.error('Error freeing up localStorage space', error)
    return false
  }
}

/**
 * Get approximate localStorage usage
 * @returns {Object} - Usage information
 */
export const getStorageInfo = () => {
  try {
    let totalSize = 0
    const items = {}

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      const value = localStorage.getItem(key)
      const size = value ? value.length * 2 : 0 // Rough byte size
      items[key] = size
      totalSize += size
    }

    const totalMB = totalSize / (1024 * 1024)
    const limitMB = 5 // Most browsers allow ~5-10MB
    const usagePercent = (totalMB / limitMB) * 100

    return {
      totalSize,
      totalMB: totalMB.toFixed(2),
      limitMB,
      usagePercent: Math.min(usagePercent, 100).toFixed(1),
      items,
      isNearLimit: usagePercent > 80
    }
  } catch (error) {
    logger.error('Error getting storage info', error)
    return null
  }
}

/**
 * Clear all adiyanta-related localStorage items
 */
export const clearAllAppStorage = () => {
  try {
    const appKeys = Object.keys(localStorage).filter(key =>
      key.startsWith('adityanta_') ||
      key === 'auth_token' ||
      key === 'google_token' ||
      key === 'user_profile'
    )

    appKeys.forEach(key => localStorage.removeItem(key))
    logger.info(`Cleared ${appKeys.length} app storage items`)
    return true
  } catch (error) {
    logger.error('Error clearing app storage', error)
    return false
  }
}

export default {
  safeSetItem,
  safeGetItem,
  safeRemoveItem,
  getStorageInfo,
  clearAllAppStorage
}
