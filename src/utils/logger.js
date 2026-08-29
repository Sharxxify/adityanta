// Logger utility - only logs in development mode
import { ENV } from '../config'

const isDevelopment = ENV.isDevelopment

export const logger = {
  log: (...args) => {
    if (isDevelopment) {
      console.log(...args)
    }
  },
  
  info: (...args) => {
    if (isDevelopment) {
      console.info(...args)
    }
  },
  
  warn: (...args) => {
    if (isDevelopment) {
      console.warn(...args)
    }
  },

  error: (...args) => {
    if (isDevelopment) {
      console.error(...args)
    }
  },
  
  debug: (...args) => {
    if (isDevelopment) {
      console.debug(...args)
    }
  },
  
  table: (data) => {
    if (isDevelopment) {
      console.table(data)
    }
  },
  
  group: (label) => {
    if (isDevelopment) {
      console.group(label)
    }
  },
  
  groupEnd: () => {
    if (isDevelopment) {
      console.groupEnd()
    }
  },
}

export default logger
