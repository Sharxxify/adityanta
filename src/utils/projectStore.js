// Project storage — everything lives in this browser (IndexedDB).
//
// Database "adityanta-store":
//   projects  full project records, one per project        (key: id)
//   meta      light project summaries for "Your Files"       (key: id, index: owner)
//   assets    images / video / audio as Blobs, stored once   (key: content hash)
//   versions  named + automatic snapshots of a project       (key: id, index: projectId)
//   kv        small bookkeeping values (migration flags)     (key: key)
//
// Why: the previous design stored *every* project (with base64 images) in a
// single IndexedDB value that was rewritten on every save, and kept the trash
// and version history in localStorage (5 MB). Large decks hit quota errors,
// saves were slow, and a failed write could lose everything at once.
//
// Media is pulled out of the project JSON into the `assets` store (deduplicated
// by content hash) and referenced as "asset:<id>". When a project is opened the
// references are turned back into blob: URLs, which every renderer, export and
// the presentation understand.

import logger from './logger'
import { loadItem as legacyLoadItem, removeItem as legacyRemoveItem } from './indexedDBHelper'

const DB_NAME = 'adityanta-store'
const DB_VERSION = 1
const ASSET_PREFIX = 'asset:'
const INLINE_LIMIT = 2048 // data: URLs smaller than this stay inline
const TRASH_DAYS = 15
const MAX_AUTO_VERSIONS = 10
const MAX_NAMED_VERSIONS = 30

// ---------------------------------------------------------------------------
// Database plumbing
// ---------------------------------------------------------------------------

let dbPromise = null

const openDB = () => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser does not support offline storage (IndexedDB).'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('meta')) {
        const meta = db.createObjectStore('meta', { keyPath: 'id' })
        meta.createIndex('owner', 'owner', { unique: false })
      }
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('versions')) {
        const versions = db.createObjectStore('versions', { keyPath: 'id' })
        versions.createIndex('projectId', 'projectId', { unique: false })
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' })
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => { db.close(); dbPromise = null }
      db.onclose = () => { dbPromise = null }
      resolve(db)
    }
    req.onerror = () => { dbPromise = null; reject(req.error) }
    req.onblocked = () => logger.warn('projectStore: database upgrade blocked by another tab')
  })
  return dbPromise
}

/** Friendly message for storage errors (quota etc.) */
export const describeStorageError = (err) => {
  const name = err?.name || ''
  if (name === 'QuotaExceededError' || /quota/i.test(err?.message || '')) {
    return 'Browser storage is full. Delete old projects or empty the Trash, then try again.'
  }
  if (name === 'InvalidStateError') return 'The browser closed its storage connection. Please try again.'
  return err?.message || 'Could not save to browser storage.'
}

/** Run `fn(stores)` in one transaction; resolves with fn's result once committed */
const withTx = async (names, mode, fn) => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    let result
    let tx
    try {
      tx = db.transaction(names, mode)
    } catch (e) {
      dbPromise = null
      reject(e)
      return
    }
    const stores = Object.fromEntries(names.map((n) => [n, tx.objectStore(n)]))
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'))
    try {
      Promise.resolve(fn(stores)).then((r) => { result = r }, (e) => { try { tx.abort() } catch (_) { /* noop */ } reject(e) })
    } catch (e) {
      try { tx.abort() } catch (_) { /* noop */ }
      reject(e)
    }
  })
}

const reqP = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

const urlToAsset = new Map() // data:/blob: URL -> asset id
const assetToUrl = new Map() // asset id -> blob: URL

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

const hashBlob = async (blob) => {
  try {
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
      return toHex(digest).slice(0, 40)
    }
  } catch (_e) { /* fall through */ }
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

const dataUrlToBlob = (dataUrl) => {
  const comma = dataUrl.indexOf(',')
  const head = dataUrl.slice(5, comma)
  const body = dataUrl.slice(comma + 1)
  const mime = head.split(';')[0] || 'application/octet-stream'
  if (/;base64/i.test(head)) {
    const bin = atob(body.replace(/\s/g, ''))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }
  return new Blob([decodeURIComponent(body)], { type: mime })
}

const needsExtraction = (s) => typeof s === 'string'
  && ((s.startsWith('data:') && s.length > INLINE_LIMIT) || s.startsWith('blob:'))

const assetExists = (id) => withTx(['assets'], 'readonly', ({ assets }) => reqP(assets.getKey(id))).then((k) => k !== undefined)

/** Store the media behind a data:/blob: URL, returning its asset id (or null) */
export const storeAsset = async (url) => {
  const known = urlToAsset.get(url)
  // Re-check: the asset may have been cleaned up since (e.g. its project was deleted)
  if (known && await assetExists(known).catch(() => false)) return known
  let blob
  try {
    blob = url.startsWith('data:') ? dataUrlToBlob(url) : await (await fetch(url)).blob()
  } catch (e) {
    logger.warn('projectStore: could not read media for saving', e)
    return null
  }
  const id = await hashBlob(blob)
  await withTx(['assets'], 'readwrite', async ({ assets }) => {
    const existing = await reqP(assets.getKey(id))
    if (existing === undefined) assets.put({ id, blob, type: blob.type, size: blob.size, createdAt: Date.now() })
  })
  urlToAsset.set(url, id)
  if (url.startsWith('blob:') && !assetToUrl.has(id)) assetToUrl.set(id, url)
  return id
}

/** blob: URL for an asset id (null when the asset is missing) */
export const assetUrl = async (id) => {
  const cached = assetToUrl.get(id)
  if (cached) return cached
  const rec = await withTx(['assets'], 'readonly', ({ assets }) => reqP(assets.get(id)))
  if (!rec?.blob) return null
  const url = URL.createObjectURL(rec.blob)
  assetToUrl.set(id, url)
  urlToAsset.set(url, id)
  return url
}

const collectStrings = (value, test, out) => {
  if (typeof value === 'string') { if (test(value)) out.add(value); return }
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) { for (const v of value) collectStrings(v, test, out); return }
  for (const k in value) collectStrings(value[k], test, out)
}

const replaceStrings = (value, map) => {
  if (typeof value === 'string') return map.has(value) ? map.get(value) : value
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((v) => replaceStrings(v, map))
  const out = {}
  for (const k in value) out[k] = replaceStrings(value[k], map)
  return out
}

const mapLimit = async (items, limit, fn) => {
  const results = new Array(items.length)
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Move embedded media out of `value` into the asset store */
const dehydrate = async (value) => {
  const found = new Set()
  collectStrings(value, needsExtraction, found)
  if (found.size === 0) return value
  const urls = [...found]
  const ids = await mapLimit(urls, 4, storeAsset)
  const map = new Map()
  urls.forEach((u, i) => {
    if (ids[i]) map.set(u, ASSET_PREFIX + ids[i])
    else if (u.startsWith('blob:')) map.set(u, '') // dead blob URL: nothing to keep
  })
  return replaceStrings(value, map)
}

/** Turn "asset:<id>" references back into blob: URLs */
const hydrate = async (value) => {
  const found = new Set()
  collectStrings(value, (s) => s.startsWith(ASSET_PREFIX), found)
  if (found.size === 0) return value
  const refs = [...found]
  const urls = await mapLimit(refs, 6, (ref) => assetUrl(ref.slice(ASSET_PREFIX.length)).catch(() => null))
  const map = new Map()
  refs.forEach((r, i) => {
    if (!urls[i]) logger.warn('projectStore: missing media', r)
    map.set(r, urls[i] || '')
  })
  return replaceStrings(value, map)
}

/** Resolve every blob: URL in `value` to an inline data: URL (for export/backup) */
export const inlineMedia = async (value) => {
  const found = new Set()
  collectStrings(value, (s) => s.startsWith('blob:') || s.startsWith(ASSET_PREFIX), found)
  if (found.size === 0) return value
  const list = [...found]
  const data = await mapLimit(list, 4, async (u) => {
    try {
      let blob
      if (u.startsWith(ASSET_PREFIX)) {
        const rec = await withTx(['assets'], 'readonly', ({ assets }) => reqP(assets.get(u.slice(ASSET_PREFIX.length))))
        blob = rec?.blob
      } else {
        blob = await (await fetch(u)).blob()
      }
      if (!blob) return ''
      return await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = () => reject(r.error)
        r.readAsDataURL(blob)
      })
    } catch (_e) {
      return ''
    }
  })
  const map = new Map(list.map((u, i) => [u, data[i]]))
  return replaceStrings(value, map)
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const newProjectId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

const displayDate = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

const summaryOf = (p) => ({
  id: p.id,
  owner: p.owner,
  title: p.title || 'Untitled Presentation',
  frameCount: Array.isArray(p.frames) ? p.frames.length : (p.frameCount || 0),
  thumbnail: p.thumbnail || 'from-blue-400 to-purple-600',
  cover: p.cover || null,
  templateId: p.templateId || null,
  topic: p.topic || null,
  isUserUpload: !!p.isUserUpload,
  created: p.created,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  deletedAt: p.deletedAt || null,
  rev: p.rev || 0,
})

/** All project summaries for an owner (including trashed ones) */
export const listProjects = async (owner) => {
  const all = await withTx(['meta'], 'readonly', ({ meta }) => reqP(meta.index('owner').getAll(owner)))
  return (all || []).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

/** Full project with media resolved to blob: URLs (null if missing) */
export const loadProject = async (id) => {
  if (id == null) return null
  const rec = await withTx(['projects'], 'readonly', ({ projects }) => reqP(projects.get(String(id))))
  if (!rec) return null
  const [frames, header, editorBgImage] = await Promise.all([
    hydrate(rec.frames || []),
    hydrate(rec.header || null),
    rec.editorBgImage === undefined ? undefined : hydrate(rec.editorBgImage),
  ])
  return { ...rec, frames, header, editorBgImage }
}

/**
 * Create or update a project. Returns its summary.
 * `project.id` is kept when given; a new id is generated otherwise.
 * `cover` (small JPEG data URL) is optional and only updates the summary.
 */
export const saveProjectRecord = async (owner, project) => {
  const now = new Date()
  const id = String(project.id || newProjectId())
  // editorBgImage: undefined = "use the topic's default", null = none
  const [frames, header, editorBgImage] = await Promise.all([
    dehydrate(project.frames || []),
    dehydrate(project.header ?? null),
    project.editorBgImage === undefined ? undefined : dehydrate(project.editorBgImage),
  ])
  return withTx(['projects', 'meta'], 'readwrite', async ({ projects, meta }) => {
    const prev = await reqP(projects.get(id))
    const prevMeta = await reqP(meta.get(id))
    const record = {
      ...(prev || {}),
      ...project,
      id,
      owner: prev?.owner || owner,
      frames,
      header,
      editorBgImage,
      createdAt: prev?.createdAt || project.createdAt || now.toISOString(),
      created: prev?.created || project.created || displayDate(now),
      updatedAt: now.toISOString(),
      deletedAt: project.deletedAt !== undefined ? project.deletedAt : (prev?.deletedAt || null),
      rev: (prev?.rev || 0) + 1,
      schema: 2,
    }
    delete record.cover
    projects.put(record)
    const summary = summaryOf({ ...record, cover: project.cover !== undefined ? project.cover : prevMeta?.cover })
    meta.put(summary)
    return summary
  })
}

/** Update summary-only fields (cover thumbnail, title...) without rewriting frames */
export const updateProjectSummary = async (id, patch) => withTx(['meta', 'projects'], 'readwrite', async ({ meta, projects }) => {
  const m = await reqP(meta.get(String(id)))
  if (!m) return null
  const next = { ...m, ...patch }
  meta.put(next)
  if (patch.title !== undefined || patch.deletedAt !== undefined) {
    const p = await reqP(projects.get(String(id)))
    if (p) projects.put({ ...p, ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.deletedAt !== undefined ? { deletedAt: patch.deletedAt } : {}) })
  }
  return next
})

export const trashProject = (id) => updateProjectSummary(id, { deletedAt: new Date().toISOString() })
export const restoreProject = (id) => updateProjectSummary(id, { deletedAt: null })

/** Remove a project, its versions, and media no other project uses */
export const deleteProjectForever = async (id) => {
  const key = String(id)
  await withTx(['projects', 'meta', 'versions'], 'readwrite', async ({ projects, meta, versions }) => {
    projects.delete(key)
    meta.delete(key)
    const vkeys = await reqP(versions.index('projectId').getAllKeys(key))
    vkeys.forEach((k) => versions.delete(k))
  })
  collectGarbage().catch((e) => logger.warn('projectStore: asset cleanup failed', e))
}

export const duplicateProject = async (owner, id) => {
  const rec = await withTx(['projects', 'meta'], 'readonly', async ({ projects, meta }) => ({
    p: await reqP(projects.get(String(id))),
    m: await reqP(meta.get(String(id))),
  }))
  if (!rec.p) return null
  const now = new Date()
  const copy = {
    ...rec.p,
    id: newProjectId(),
    title: `${rec.p.title || 'Untitled'} (Copy)`,
    createdAt: now.toISOString(),
    created: displayDate(now),
    deletedAt: null,
    rev: 0,
    cover: rec.m?.cover || null,
  }
  // frames already hold asset references, which are shared (content-addressed)
  return saveProjectRecord(owner, copy)
}

/** Delete assets no project or version refers to any more */
export const collectGarbage = async () => {
  const used = new Set()
  await withTx(['projects', 'versions'], 'readonly', async ({ projects, versions }) => {
    const [ps, vs] = await Promise.all([reqP(projects.getAll()), reqP(versions.getAll())])
    const grab = (v) => {
      const s = new Set()
      collectStrings(v, (x) => x.startsWith(ASSET_PREFIX), s)
      s.forEach((x) => used.add(x.slice(ASSET_PREFIX.length)))
    }
    ps.forEach((p) => grab([p.frames, p.header, p.editorBgImage]))
    vs.forEach((v) => grab(v.snapshot))
  })
  // Never touch media this tab is using, or anything stored in the last hour
  // (another tab may be about to save a project that refers to it).
  const graceCutoff = Date.now() - 3600 * 1000
  await withTx(['assets'], 'readwrite', async ({ assets }) => {
    const all = await reqP(assets.getAll())
    all.forEach((a) => {
      if (used.has(a.id) || assetToUrl.has(a.id) || (a.createdAt || 0) > graceCutoff) return
      assets.delete(a.id)
    })
  })
}

/** Permanently delete projects that have been in the Trash too long */
export const purgeExpiredTrash = async (owner) => {
  const list = await listProjects(owner)
  const cutoff = Date.now() - TRASH_DAYS * 24 * 3600 * 1000
  const expired = list.filter((m) => m.deletedAt && new Date(m.deletedAt).getTime() < cutoff)
  for (const m of expired) await deleteProjectForever(m.id)
  return expired.length
}

// ---------------------------------------------------------------------------
// Versions (per project)
// ---------------------------------------------------------------------------

export const listVersions = async (projectId) => {
  const all = await withTx(['versions'], 'readonly', ({ versions }) => reqP(versions.index('projectId').getAll(String(projectId))))
  return (all || [])
    .map(({ snapshot, ...rest }) => ({ ...rest, frameCount: snapshot?.frames?.length || 0 }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export const saveVersion = async (projectId, { name, auto = false, title, header, frames, editorBgImage }) => {
  const snapshot = {
    title,
    header: await dehydrate(header ?? null),
    frames: await dehydrate(frames || []),
    editorBgImage: await dehydrate(editorBgImage ?? null),
  }
  const version = {
    id: `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    projectId: String(projectId),
    name: name || (auto ? 'Automatic snapshot' : 'Saved version'),
    auto,
    createdAt: Date.now(),
    snapshot,
  }
  await withTx(['versions'], 'readwrite', async ({ versions }) => {
    versions.put(version)
    const all = await reqP(versions.index('projectId').getAll(String(projectId)))
    const group = all.filter((v) => !!v.auto === auto).sort((a, b) => b.createdAt - a.createdAt)
    group.slice(auto ? MAX_AUTO_VERSIONS : MAX_NAMED_VERSIONS).forEach((v) => versions.delete(v.id))
  })
  const { snapshot: _s, ...info } = version
  return { ...info, frameCount: snapshot.frames.length }
}

export const loadVersion = async (versionId) => {
  const v = await withTx(['versions'], 'readonly', ({ versions }) => reqP(versions.get(versionId)))
  if (!v) return null
  const s = v.snapshot || {}
  return {
    ...v,
    snapshot: {
      title: s.title,
      header: await hydrate(s.header ?? null),
      frames: await hydrate(s.frames || []),
      editorBgImage: await hydrate(s.editorBgImage ?? null),
    },
  }
}

export const deleteVersion = async (versionId) => {
  await withTx(['versions'], 'readwrite', ({ versions }) => { versions.delete(versionId) })
  collectGarbage().catch(() => {})
}

// ---------------------------------------------------------------------------
// Storage health
// ---------------------------------------------------------------------------

export const getStorageInfo = async () => {
  const info = { usage: null, quota: null, persisted: null }
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate()
      info.usage = e.usage ?? null
      info.quota = e.quota ?? null
    }
    if (navigator.storage?.persisted) info.persisted = await navigator.storage.persisted()
  } catch (_e) { /* noop */ }
  return info
}

export const requestPersistence = async () => {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch (_e) {
    return false
  }
}

// ---------------------------------------------------------------------------
// One-time migration from the old single-array storage
// ---------------------------------------------------------------------------

const kvGet = (key) => withTx(['kv'], 'readonly', ({ kv }) => reqP(kv.get(key))).then((r) => r?.value)
const kvSet = (key, value) => withTx(['kv'], 'readwrite', ({ kv }) => { kv.put({ key, value }) })

const readLocalJSON = (key) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch (_e) {
    return null
  }
}

/**
 * Move projects saved by older versions of the app (one big IndexedDB array
 * plus a localStorage trash) into per-project records. Runs once per owner;
 * the old copies are removed only after every project was written.
 */
export const migrateLegacyProjects = async (owner) => {
  const flag = `migrated:${owner}`
  if (await kvGet(flag)) return 0
  const legacyKey = `adityanta_user_files_${owner}`
  const trashKey = `adityanta_trash_${owner}`
  let files = null
  try { files = await legacyLoadItem(legacyKey) } catch (_e) { files = null }
  if (!Array.isArray(files)) files = readLocalJSON(legacyKey)
  if (!Array.isArray(files)) {
    const globalLegacy = readLocalJSON('adityanta_user_files')
    files = Array.isArray(globalLegacy) ? globalLegacy : []
  }
  const trash = readLocalJSON(trashKey)
  const byId = new Map()
  for (const f of Array.isArray(trash) ? trash : []) {
    if (f?.id != null) byId.set(String(f.id), { ...f, deletedAt: f.deletedAt ? new Date(f.deletedAt).toISOString() : new Date().toISOString() })
  }
  for (const f of files) {
    if (f?.id != null) byId.set(String(f.id), { ...f, deletedAt: null })
  }
  let count = 0
  for (const [id, f] of byId) {
    if (!Array.isArray(f.frames) || f.frames.length === 0) continue
    const { frameCount: _fc, ...rest } = f
    await saveProjectRecord(owner, {
      ...rest,
      id,
      updatedAt: undefined,
      createdAt: f.uploadedAt || undefined,
    })
    // keep the original modification time for sorting
    if (f.updatedAt) await updateProjectSummary(id, { updatedAt: f.updatedAt })
    count++
  }
  await kvSet(flag, { at: Date.now(), count })
  // Old copies are no longer needed; removing them frees quota
  try { await legacyRemoveItem(legacyKey) } catch (_e) { /* noop */ }
  try { localStorage.removeItem(legacyKey) } catch (_e) { /* noop */ }
  try { localStorage.removeItem(trashKey) } catch (_e) { /* noop */ }
  if (count) logger.info(`projectStore: migrated ${count} project(s) for ${owner}`)
  return count
}

// ---------------------------------------------------------------------------
// Cross-tab notifications
// ---------------------------------------------------------------------------

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('adityanta-projects') : null
const TAB_ID = Math.random().toString(36).slice(2)

export const notifyProjectsChanged = (detail = {}) => {
  try { channel?.postMessage({ ...detail, tab: TAB_ID }) } catch (_e) { /* noop */ }
}

export const onProjectsChanged = (fn) => {
  if (!channel) return () => {}
  const handler = (e) => { if (e.data?.tab !== TAB_ID) fn(e.data) }
  channel.addEventListener('message', handler)
  return () => channel.removeEventListener('message', handler)
}

// ---------------------------------------------------------------------------
// Backups — a portable file with all media embedded
// ---------------------------------------------------------------------------

export const BACKUP_FORMAT = 'adityanta-backup'

const PORTABLE_KEYS = ['title', 'header', 'frames', 'editorBgImage', 'visibility', 'templateId', 'topic', 'thumbnail', 'createdAt', 'isUserUpload']

/** Backup file (Blob) for the given project ids */
export const exportBackup = async (ids) => {
  const projects = []
  for (const id of ids) {
    const rec = await withTx(['projects'], 'readonly', ({ projects: ps }) => reqP(ps.get(String(id))))
    if (!rec) continue
    const portable = {}
    PORTABLE_KEYS.forEach((k) => { if (rec[k] !== undefined) portable[k] = rec[k] })
    projects.push(await inlineMedia(portable))
  }
  const payload = { format: BACKUP_FORMAT, version: 2, exportedAt: new Date().toISOString(), projects }
  return new Blob([JSON.stringify(payload)], { type: 'application/json' })
}

/**
 * Projects contained in an imported JSON file: an Adityanta backup
 * ({ format, projects: [...] }) or a single exported deck ({ title, frames }).
 */
export const projectsFromImport = (data) => {
  if (data?.format === BACKUP_FORMAT && Array.isArray(data.projects)) return data.projects.filter((p) => Array.isArray(p?.frames) && p.frames.length)
  if (Array.isArray(data?.frames) && data.frames.length) return [data]
  if (Array.isArray(data?.project?.frames)) return [data.project]
  return []
}
