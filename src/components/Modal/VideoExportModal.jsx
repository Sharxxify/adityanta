import { useRef, useState } from 'react'
import { useEditor } from '../../context/EditorContext'
import { exportToVideo, videoLengthSeconds, supportsFastVideo } from '../../utils/videoExport'
import { readNavSpeedMs } from '../../utils/presentationCamera'
import { useToast } from '../../context/ToastContext'
import logger from '../../utils/logger'

const formatLength = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${s} s`)

const VideoExportModal = ({ isOpen, onClose }) => {
  const { frames, projectTitle, editorBackground, header } = useEditor()
  const toast = useToast()

  const [slideDuration, setSlideDuration] = useState(3)
  const [endOnOverview, setEndOnOverview] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(null) // { current, total, message }
  const abortRef = useRef(null)

  if (!isOpen) return null

  const fast = supportsFastVideo()
  const navMs = readNavSpeedMs()
  const length = videoLengthSeconds(frames?.length || 0, slideDuration, { endOnOverview, navMs })

  const handleExport = async () => {
    if (!frames || frames.length === 0) {
      toast.error('No slides to export')
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setIsExporting(true)
    setProgress({ current: 0, total: 1000, message: 'Preparing…' })
    try {
      const file = await exportToVideo(
        frames,
        { slideDuration, projectTitle, editorBackground, header, endOnOverview, signal: controller.signal },
        (current, total, message) => setProgress({ current, total, message }),
      )
      toast.success(`Video ready: ${file}`)
      onClose()
    } catch (error) {
      if (error?.name === 'AbortError') {
        toast.info('Video export cancelled')
      } else {
        logger.error('Video export failed:', error)
        toast.error(error.message || 'Failed to export video')
      }
    } finally {
      abortRef.current = null
      setIsExporting(false)
      setProgress(null)
    }
  }

  const percent = progress ? Math.round(((progress.current || 0) / (progress.total || 1)) * 100) : 0

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex items-center gap-3">
          <div className="flex flex-shrink-0 items-center justify-center w-10 h-10 rounded-full bg-purple-50 text-purple-600">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Export Video</h2>
            <p className="text-sm text-gray-500">Plays your presentation like the slideshow</p>
          </div>
        </div>

        <div className="p-6 overflow-y-auto">
          {!isExporting ? (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label htmlFor="video-slide-time" className="text-sm font-semibold text-gray-700">Time on each slide</label>
                  <span className="text-sm font-medium text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full">{slideDuration}s</span>
                </div>
                <input
                  id="video-slide-time"
                  type="range"
                  min="1"
                  max="10"
                  value={slideDuration}
                  onChange={(e) => setSlideDuration(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>1s</span>
                  <span>5s</span>
                  <span>10s</span>
                </div>
              </div>

              <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={endOnOverview} onChange={(e) => setEndOnOverview(e.target.checked)} className="w-4 h-4 accent-purple-600" />
                Finish by zooming out to the overview
              </label>

              <div className="space-y-3">
                <div className="rounded-lg bg-purple-50 p-3.5 border border-purple-100">
                  <p className="text-sm text-purple-800">
                    Starts on the overview, then zooms into each slide with the same moves and
                    transition speed ({(navMs / 1000).toFixed(1)} s) as <strong>Present</strong>.
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3.5 border border-gray-100 flex items-center justify-between">
                  <span className="text-sm text-gray-600">Video length</span>
                  <span className="text-sm font-semibold text-gray-900">{formatLength(length)}</span>
                </div>
                <div className="rounded-lg bg-gray-50 p-3.5 border border-gray-100 flex items-center justify-between">
                  <span className="text-sm text-gray-600">Output</span>
                  <span className="text-sm font-semibold text-gray-900">{fast ? 'MP4 · 1920×1080 · 30 fps' : 'Video · 1920×1080 (recorded live)'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 space-y-6 flex flex-col items-center">
              <div className="relative w-16 h-16">
                <svg className="animate-spin text-purple-600 w-full h-full" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <div className="text-center space-y-2 w-full">
                <h3 className="text-lg font-semibold text-gray-900">Creating your video… {percent}%</h3>
                <p className="text-sm text-gray-500">{progress?.message}</p>
              </div>
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300 ease-out rounded-full" style={{ width: `${Math.max(3, percent)}%` }} />
              </div>
              {!fast && <p className="text-xs text-gray-400">Please keep this tab open — this browser records the video in real time.</p>}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={() => (isExporting ? abortRef.current?.abort() : onClose())}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          {!isExporting && (
            <button
              onClick={handleExport}
              className="px-5 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-lg shadow-sm hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Export video
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default VideoExportModal
