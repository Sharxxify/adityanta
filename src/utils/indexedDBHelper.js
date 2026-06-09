import logger from './logger'

/**
 * Simple IndexedDB helper for storing large project data
 * Avoids localStorage QuotaExceededError for large PPTX imports
 *
 * Database: 'adiyanta'
 * Stores:
 *   - autosave: project autosave data (title, frames, savedAt)
 */

const DB_NAME = 'adiyanta'
const STORE_NAME = 'projects'
const AUTOSAVE_KEY = 'autosave'
export const TEMPLATES_CACHE_KEY = 'templates_cache'

let dbInstance = null

/**
 * Initialize IndexedDB connection (lazy load)
 * @returns {Promise<IDBDatabase>}
 */
const getDB = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance)
      return
    }

    const request = indexedDB.open(DB_NAME, 1)

    request.onerror = () => {
      logger.error('IndexedDB open error:', request.error)
      reject(request.error)
    }

    request.onsuccess = () => {
      dbInstance = request.result
      // If the browser closes the connection (tab suspended, version change
      // from another tab, or fatal error), null out the cached handle so the
      // next call re-opens cleanly instead of throwing InvalidStateError.
      dbInstance.onclose = () => { dbInstance = null }
      dbInstance.onversionchange = () => {
        try { dbInstance && dbInstance.close() } catch (_e) { /* noop */ }
        dbInstance = null
      }
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

/**
 * Save data to IndexedDB
 * @param {any} data - Data to store
 * @param {string} key - Storage key
 * @returns {Promise<boolean>} - Success status
 */
export const saveItem = async (key, data) => {
  try {
    const db = await getDB()
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(data, key)

      request.onsuccess = () => resolve(true)
      request.onerror = (e) => {
        logger.error(`IndexedDB put error for ${key}:`, e)
        resolve(false)
      }
    })
  } catch (error) {
    logger.error(`IndexedDB saveItem error for ${key}:`, error)
    return false
  }
}

/**
 * Load data from IndexedDB
 * @param {string} key - Storage key
 * @returns {Promise<any|null>} - Data or null if not found
 */
export const loadItem = async (key) => {
  try {
    const db = await getDB()
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(key)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = (e) => {
        logger.error(`IndexedDB get error for ${key}:`, e)
        resolve(null)
      }
    })
  } catch (error) {
    logger.error(`IndexedDB loadItem error for ${key}:`, error)
    return null
  }
}

/**
 * Remove item from IndexedDB
 * @param {string} key - Storage key
 * @returns {Promise<boolean>} - Success status
 */
export const removeItem = async (key) => {
  try {
    const db = await getDB()
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(key)

      request.onsuccess = () => resolve(true)
      request.onerror = (e) => {
        logger.error(`IndexedDB delete error for ${key}:`, e)
        resolve(false)
      }
    })
  } catch (error) {
    logger.error(`IndexedDB removeItem error for ${key}:`, error)
    return false
  }
}

/**
 * Save autosave data to IndexedDB with conflict resolution
 * @param {Object} data - Project data
 * @returns {Promise<boolean>} - Success status
 */
export const saveAutosave = async (data) => {
  try {
    const db = await getDB()
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      const getRequest = store.get(AUTOSAVE_KEY)
      getRequest.onsuccess = () => {
        const currentData = getRequest.result
        if (currentData && currentData.savedAt && data.savedAt && new Date(currentData.savedAt) > new Date(data.savedAt)) {
          resolve(false)
          return
        }

        const request = store.put(data, AUTOSAVE_KEY)
        request.onsuccess = () => resolve(true)
        request.onerror = () => resolve(false)
      }
      getRequest.onerror = () => {
        const request = store.put(data, AUTOSAVE_KEY)
        request.onsuccess = () => resolve(true)
        request.onerror = () => resolve(false)
      }
    })
  } catch (error) {
    logger.error('IndexedDB saveAutosave error:', error)
    return false
  }
}

/**
 * Load autosave data from IndexedDB
 */
export const loadAutosave = () => loadItem(AUTOSAVE_KEY)

/**
 * Clear autosave data from IndexedDB
 */
export const clearAutosave = () => removeItem(AUTOSAVE_KEY)

/**
 * Check if IndexedDB is available in the browser
 * @returns {boolean}
 */
export const isIndexedDBAvailable = () => {
  try {
    return !!indexedDB
  } catch (e) {
    return false
  }
}
