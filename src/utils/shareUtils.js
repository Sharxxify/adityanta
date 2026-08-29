const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const bytesToBase64Url = (bytes) => {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const base64UrlToBytes = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const gzipBytes = async (bytes) => {
  if (typeof CompressionStream === 'undefined') return null
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

const gunzipBytes = async (bytes) => {
  if (typeof DecompressionStream === 'undefined') return null
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export const encodeSharePayload = async (payload) => {
  const rawBytes = textEncoder.encode(JSON.stringify(payload))

  try {
    const compressed = await gzipBytes(rawBytes)
    if (compressed && compressed.length < rawBytes.length) {
      return `gz:${bytesToBase64Url(compressed)}`
    }
  } catch {
    // Compression is optional.
  }

  return `raw:${bytesToBase64Url(rawBytes)}`
}

export const decodeSharePayload = async (encoded) => {
  if (!encoded || typeof encoded !== 'string') throw new Error('Missing share payload')

  const [mode, rawValue] = encoded.includes(':') ? encoded.split(/:(.+)/) : ['raw', encoded]
  const bytes = base64UrlToBytes(rawValue)

  if (mode === 'gz') {
    const inflated = await gunzipBytes(bytes)
    if (!inflated) {
      throw new Error('This browser cannot open compressed share links')
    }
    return JSON.parse(textDecoder.decode(inflated))
  }

  return JSON.parse(textDecoder.decode(bytes))
}
