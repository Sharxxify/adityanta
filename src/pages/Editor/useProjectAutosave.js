// Editor autosave.
//
// - Saves about a second after the last change (and at least every 5 s while
//   the user keeps editing), so closing the tab loses at most a moment of work.
// - Also saves when the tab is hidden or closed and when leaving the editor.
// - A project gets its id — and appears in Your Files — on the first real edit,
//   so opening a template or a blank project without changing it creates
//   nothing, and every later save updates that same project (no duplicates).
// - Before the first change of an editing session an automatic snapshot of
//   the previous state is kept in the project's version history.

import { useCallback, useEffect, useRef, useState } from 'react'
import { newProjectId, saveVersion as storeVersion } from '../../utils/projectStore'
import logger from '../../utils/logger'

const DEBOUNCE_MS = 1000
const MAX_WAIT_MS = 5000
const KEYS = ['frames', 'title', 'header', 'editorBgImage', 'visibility']

const sameState = (a, b) => !!a && !!b && KEYS.every((k) => a[k] === b[k])

export default function useProjectAutosave({ ready, state, getSession, updateSession, saveProject, onFirstSave, onSaved }) {
  const [status, setStatus] = useState('saved') // saved | dirty | saving | error
  const [error, setError] = useState(null)
  const [lastSavedAt, setLastSavedAt] = useState(null)

  const stateRef = useRef(state)
  stateRef.current = state
  const cbRef = useRef({ saveProject, onFirstSave, onSaved })
  cbRef.current = { saveProject, onFirstSave, onSaved }

  const timerRef = useRef(null)
  const firstDirtyAtRef = useRef(0)
  const inFlightRef = useRef(null) // { promise, snap, key }
  const mountedRef = useRef(true)

  const capture = useCallback(() => ({ snap: { ...stateRef.current }, session: getSession() }), [getSession])

  const isDirty = useCallback(() => {
    const { snap, session } = capture()
    return !!session.baseline && !sameState(session.baseline, snap)
  }, [capture])

  // Only touch the session if it still belongs to the captured editing
  // session (`key` is set whenever a project is loaded into the editor)
  const sessionStill = (key) => getSession().key === key

  const save = useCallback(async (cap) => {
    const { snap, session } = cap
    if (!session.baseline || sameState(session.baseline, snap)) return true
    const key = session.key
    let id = session.projectId
    const isFirst = !id
    if (isFirst) {
      id = newProjectId()
      if (sessionStill(key)) updateSession({ projectId: id })
    }
    if (mountedRef.current) setStatus('saving')
    try {
      // Keep the state the user opened as an automatic version (once per session)
      if (!isFirst && !session.autoSnapshotTaken) {
        if (sessionStill(key)) updateSession({ autoSnapshotTaken: true })
        const b = session.baseline
        await storeVersion(id, {
          auto: true,
          name: `Before changes · ${new Date().toLocaleString()}`,
          title: b.title,
          header: b.header,
          frames: b.frames,
          editorBgImage: b.editorBgImage,
        }).catch((e) => logger.warn('Automatic snapshot failed', e))
      }
      const summary = await cbRef.current.saveProject({
        id,
        title: snap.title || 'Untitled Presentation',
        frames: snap.frames,
        header: snap.header,
        editorBgImage: snap.editorBgImage,
        visibility: snap.visibility,
        templateId: session.sourceTemplateId || null,
        topic: session.topic || null,
        thumbnail: session.thumbnail || undefined,
      })
      if (sessionStill(key)) updateSession({ baseline: snap, autoSnapshotTaken: true })
      if (mountedRef.current) {
        setLastSavedAt(new Date())
        setError(null)
      }
      if (isFirst && sessionStill(key)) cbRef.current.onFirstSave?.(id)
      cbRef.current.onSaved?.(summary, snap)
      return true
    } catch (e) {
      logger.error('Autosave failed', e)
      if (mountedRef.current) {
        setError(e?.message || 'Could not save')
        setStatus('error')
      }
      return false
    }
  }, [updateSession]) // eslint-disable-line react-hooks/exhaustive-deps

  const schedule = useCallback(() => {
    clearTimeout(timerRef.current)
    const now = Date.now()
    if (!firstDirtyAtRef.current) firstDirtyAtRef.current = now
    const wait = Math.max(0, Math.min(DEBOUNCE_MS, firstDirtyAtRef.current + MAX_WAIT_MS - now))
    timerRef.current = setTimeout(() => {
      firstDirtyAtRef.current = 0
      runRef.current?.(capture())
    }, wait)
  }, [capture])

  /** Save a captured state, serialised behind any save already running */
  const run = useCallback((cap) => {
    const prev = inFlightRef.current
    if (prev && sameState(prev.snap, cap.snap) && prev.key === cap.session.key) return prev.promise
    const start = async () => {
      if (prev) await prev.promise.catch(() => {})
      // the session may have moved on (baseline updated by the previous save)
      const fresh = sessionStill(cap.session.key) ? { snap: cap.snap, session: getSession() } : cap
      return save(fresh)
    }
    const promise = start().finally(() => {
      if (inFlightRef.current?.promise === promise) inFlightRef.current = null
      if (!mountedRef.current) return
      if (isDirty()) {
        setStatus((st) => (st === 'error' ? st : 'dirty'))
        schedule()
      } else setStatus((st) => (st === 'error' ? st : 'saved'))
    })
    inFlightRef.current = { promise, snap: cap.snap, key: cap.session.key }
    return promise
  }, [save, getSession, isDirty, schedule]) // eslint-disable-line react-hooks/exhaustive-deps
  const runRef = useRef(run)
  runRef.current = run

  /** Save right now (captures the current state synchronously) */
  const flush = useCallback(() => {
    clearTimeout(timerRef.current)
    firstDirtyAtRef.current = 0
    const cap = capture()
    if (!cap.session.baseline || sameState(cap.session.baseline, cap.snap)) {
      return inFlightRef.current ? inFlightRef.current.promise : Promise.resolve(true)
    }
    return runRef.current(cap)
  }, [capture])
  const flushRef = useRef(flush)
  flushRef.current = flush

  // Watch for changes
  useEffect(() => {
    if (!ready) return
    const s = getSession()
    if (!s.baseline) {
      updateSession({ baseline: { ...stateRef.current } })
      setStatus('saved')
      return
    }
    if (isDirty()) {
      setStatus((st) => (st === 'saving' ? st : 'dirty'))
      schedule()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, state.frames, state.title, state.header, state.editorBgImage, state.visibility])

  // Save when the tab is hidden / closed, and when the editor unmounts
  useEffect(() => {
    mountedRef.current = true
    const onVisibility = () => { if (document.visibilityState === 'hidden') flushRef.current() }
    const onPageHide = () => { flushRef.current() }
    const onBeforeUnload = (e) => {
      if (isDirty() || inFlightRef.current) {
        flushRef.current()
        e.preventDefault()
        e.returnValue = ''
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
      clearTimeout(timerRef.current)
      flushRef.current()
      mountedRef.current = false
    }
  }, [isDirty])

  return { status, error, lastSavedAt, flush, isDirty }
}
