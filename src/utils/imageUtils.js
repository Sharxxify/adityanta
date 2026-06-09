// Image compression and processing utilities for production
import logger from './logger'

/**
 * Compress an image to reduce storage size
 * @param {string} base64String - The base64 encoded image
 * @param {object} options - Compression options
 * @returns {Promise<string>} - Compressed base64 image
 */
export const compressImage = async (base64String, options = {}) => {
  const {
    maxWidth = 800,
    maxHeight = 800,
    quality = 0.7,
    type = 'image/jpeg'
  } = options

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img

        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }

        if (height > maxHeight) {
          width = (width * maxHeight) / height
          height = maxHeight
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        // Convert to compressed format
        const compressedBase64 = canvas.toDataURL(type, quality)
        resolve(compressedBase64)
      } catch (error) {
        reject(error)
      }
    }

    img.onerror = () => {
      reject(new Error('Failed to load image for compression'))
    }

    img.src = base64String
  })
}

/**
 * Compress profile image (smaller size for avatars)
 */
export const compressProfileImage = (base64String) => {
  return compressImage(base64String, {
    maxWidth: 400,
    maxHeight: 400,
    quality: 0.8,
    type: 'image/jpeg'
  })
}

/**
 * Compress cover image (wider aspect ratio)
 */
export const compressCoverImage = (base64String) => {
  return compressImage(base64String, {
    maxWidth: 1200,
    maxHeight: 400,
    quality: 0.7,
    type: 'image/jpeg'
  })
}

/**
 * Check if a base64 string exceeds a size limit
 * @param {string} base64String
 * @param {number} maxSizeKB - Maximum size in KB
 * @returns {boolean}
 */
export const isImageTooLarge = (base64String, maxSizeKB = 500) => {
  if (!base64String) return false
  // Base64 is roughly 4/3 the size of original binary
  const sizeInBytes = (base64String.length * 3) / 4
  const sizeInKB = sizeInBytes / 1024
  return sizeInKB > maxSizeKB
}

/**
 * Safe JSON parse with fallback
 * @param {string} jsonString - JSON string to parse
 * @param {any} fallback - Fallback value if parsing fails
 * @returns {any}
 */
export const safeJSONParse = (jsonString, fallback = null) => {
  if (!jsonString) return fallback
  try {
    return JSON.parse(jsonString)
  } catch (error) {
    logger.error('JSON parse error:', error)
    return fallback
  }
}

/**
 * Safe localStorage get with JSON parse
 * @param {string} key - localStorage key
 * @param {any} fallback - Fallback value
 * @returns {any}
 */
export const getFromStorage = (key, fallback = null) => {
  try {
    const item = localStorage.getItem(key)
    if (!item) return fallback
    return JSON.parse(item)
  } catch (error) {
    logger.error(`Error reading ${key} from localStorage:`, error)
    return fallback
  }
}

/**
 * Safe localStorage set with error handling
 * @param {string} key - localStorage key
 * @param {any} value - Value to store
 * @returns {boolean} - Success status
 */
export const setToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (error) {
    logger.error(`Error saving ${key} to localStorage:`, error)
    // Handle quota exceeded
    if (error.name === 'QuotaExceededError' || error.code === 22) {
      logger.error('localStorage quota exceeded')
    }
    return false
  }
}

/**
 * Get string value from localStorage (for tokens, etc.)
 * @param {string} key - Storage key
 * @param {string} fallback - Default value if key doesn't exist
 * @returns {string} - Stored value or fallback
 */
export const getStorageString = (key, fallback = null) => {
  try {
    return localStorage.getItem(key) || fallback
  } catch (error) {
    logger.error(`Error reading ${key} from localStorage:`, error)
    return fallback
  }
}

/**
 * Set string value to localStorage
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @returns {boolean} - Success status
 */
export const setStorageString = (key, value) => {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (error) {
    logger.error(`Error saving ${key} to localStorage:`, error)
    return false
  }
}

/**
 * Remove item from localStorage
 * @param {string} key - Storage key
 * @returns {boolean} - Success status
 */
export const removeFromStorage = (key) => {
  try {
    localStorage.removeItem(key)
    return true
  } catch (error) {
    logger.error(`Error removing ${key} from localStorage:`, error)
    return false
  }
}

/**
 * Escape special regex characters in a string
 * @param {string} string - String to escape
 * @returns {string} - Escaped string
 */
export const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
