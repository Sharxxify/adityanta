import { useState } from 'react'
import { useEditor } from '../../context/EditorContext'
import { exportToVideo } from '../../utils/videoExport'
import { useToast } from '../../context/ToastContext'
import logger from '../../utils/logger'

const VideoExportModal = ({ isOpen, onClose }) => {
  const { frames, projectTitle, editorBackground } = useEditor()
  const toast = useToast()

  const [slideDuration, setSlideDuration] = useState(3)
  const [exportFormat, setExportFormat] = useState('mp4')
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(null) // { current, total, message }

  if (!isOpen) return null

  const handleExport = async () => {
    // Preflight checks
    if (!frames || frames.length === 0) {
      toast.error('No slides to export')
      return
    }

    if (typeof MediaRecorder === 'undefined') {
      toast.error("Your browser doesn't support video export. Try Chrome or Edge.")
      return
    }

    setIsExporting(true)
    setProgress({ current: 0, total: frames.length, message: 'Preparing...' })

    try {
      await exportToVideo(
        frames,
        { slideDuration, projectTitle, editorBackground, exportFormat },
        (current, total, message) => setProgress({ current, total, message })
      )
      toast.success('Video exported successfully!')
      onClose()
    } catch (error) {
      logger.error('Video export modal error:', error)
      toast.error(error.message || 'Failed to export video')
    } finally {
      setIsExporting(false)
      setProgress(null)
    }
  }

  const estimatedTime = Math.ceil(
    (frames.length * slideDuration) + (frames.length * 1.6) + 2
  )

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center gap-3">
          <div className="flex flex-shrink-0 items-center justify-center w-10 h-10 rounded-full bg-purple-50 text-purple-600">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7"></polygon>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Export Video</h2>
            <p className="text-sm text-gray-500">Records and exports the full presentation</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
          {!isExporting ? (
            <div className="space-y-6">
              {/* Duration control */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-semibold text-gray-700">Time per slide</label>
                  <span className="text-sm font-medium text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded-full">
                    {slideDuration}s
                  </span>
                </div>
                <input
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

              {/* Format selection */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 block">Export Format</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExportFormat('mp4')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all text-center ${
                      exportFormat === 'mp4'
                        ? 'border-purple-600 bg-purple-50/50 text-purple-700 font-semibold'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white'
                    }`}
                  >
                    <span className="text-sm font-bold">MP4 Video</span>
                    <span className="text-[10px] text-gray-400 mt-0.5 font-normal leading-tight">High compatibility, slower export</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('webm')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all text-center ${
                      exportFormat === 'webm'
                        ? 'border-purple-600 bg-purple-50/50 text-purple-700 font-semibold'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600 bg-white'
                    }`}
                  >
                    <span className="text-sm font-bold">WebM Video</span>
                    <span className="text-[10px] text-gray-400 mt-0.5 font-normal leading-tight">Super fast export, instant download</span>
                  </button>
                </div>
              </div>

              {/* Info cards */}
              <div className="space-y-3">
                <div className="rounded-lg bg-purple-50 p-3.5 border border-purple-100">
                  <div className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <p className="text-sm text-purple-800">
                      Mirrors the <strong>Present</strong> mode — overview first, then zooming into each slide with smooth transitions.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 p-3.5 border border-gray-100 flex items-center justify-between">
                  <span className="text-sm text-gray-600">Estimated duration</span>
                  <span className="text-sm font-semibold text-gray-900">
                    ~{estimatedTime}s {exportFormat === 'mp4' ? '(plus MP4 conversion)' : '(instant download)'}
                  </span>
                </div>

                <div className="rounded-lg bg-gray-50 p-3.5 border border-gray-100 flex items-center justify-between">
                  <span className="text-sm text-gray-600">Output format</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {exportFormat === 'mp4' ? '.mp4 (1920×1080)' : '.webm (1920×1080)'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Progress view */
            <div className="py-8 space-y-6 flex flex-col items-center">
              <div className="relative w-16 h-16">
                <svg className="animate-spin text-purple-600 w-full h-full" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>

              <div className="text-center space-y-2 w-full">
                <h3 className="text-lg font-semibold text-gray-900">Recording Presentation...</h3>
                <p className="text-sm text-gray-500">
                  {progress?.message || `Slide ${progress?.current || 0} of ${progress?.total || 0}`}
                </p>
              </div>

              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${Math.max(5, ((progress?.current || 0) / (progress?.total || 1)) * 100)}%` }}
                />
              </div>

              <p className="text-xs text-gray-400">
                Please keep this tab open. Recording plays in real-time.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? 'Please wait...' : 'Cancel'}
          </button>

          {!isExporting && (
            <button
              onClick={handleExport}
              className="px-5 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-lg shadow-sm hover:bg-purple-700 transition-colors flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Record & Export
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default VideoExportModal
