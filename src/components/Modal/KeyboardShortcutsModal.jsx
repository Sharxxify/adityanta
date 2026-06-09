import { useEffect } from 'react'

const KeyboardShortcutsModal = ({ isOpen, onClose, mode = 'editor' }) => {
  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const editorShortcuts = [
    { category: 'General', shortcuts: [
      { keys: ['Ctrl', 'Z'], description: 'Undo' },
      { keys: ['Ctrl', 'Y'], description: 'Redo' },
      { keys: ['Ctrl', 'C'], description: 'Copy element' },
      { keys: ['Ctrl', 'V'], description: 'Paste element' },
      { keys: ['Ctrl', 'D'], description: 'Duplicate element' },
      { keys: ['Ctrl', 'X'], description: 'Cut element' },
      { keys: ['Delete'], description: 'Delete selected element' },
      { keys: ['Esc'], description: 'Deselect / stop editing' },
      { keys: ['Ctrl', 'M'], description: 'Add new slide' },
      { keys: ['F5'], description: 'Present' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
    ]},
    { category: 'Text Formatting', shortcuts: [
      { keys: ['Ctrl', 'B'], description: 'Bold (text selected)' },
      { keys: ['Ctrl', 'I'], description: 'Italic (text selected)' },
      { keys: ['Ctrl', 'U'], description: 'Underline (text selected)' },
      { keys: ['Enter'], description: 'Start editing text' },
    ]},
    { category: 'Element', shortcuts: [
      { keys: ['↑↓←→'], description: 'Nudge element (1px)' },
      { keys: ['Shift', '↑↓←→'], description: 'Nudge element (10px)' },
      { keys: ['Ctrl', 'Shift', ']'], description: 'Bring to front' },
      { keys: ['Ctrl', 'Shift', '['], description: 'Send to back' },
    ]},
    { category: 'Navigation', shortcuts: [
      { keys: ['↑', '↓'], description: 'Navigate between frames' },
      { keys: ['Home'], description: 'Go to first frame' },
      { keys: ['End'], description: 'Go to last frame' },
    ]},
    { category: 'Zoom & Pan', shortcuts: [
      { keys: ['Ctrl', '+'], description: 'Zoom in' },
      { keys: ['Ctrl', '-'], description: 'Zoom out' },
      { keys: ['Ctrl', '0'], description: 'Reset zoom to 100%' },
      { keys: ['Space', 'Drag'], description: 'Pan canvas' },
    ]},
  ]

  const presentationShortcuts = [
    { category: 'Navigation', shortcuts: [
      { keys: ['→', '↓', 'Space'], description: 'Next slide' },
      { keys: ['←', '↑', 'Backspace'], description: 'Previous slide' },
      { keys: ['PageDown', 'N'], description: 'Next slide (remote)' },
      { keys: ['PageUp', 'P'], description: 'Previous slide (remote)' },
      { keys: ['Home'], description: 'First slide' },
      { keys: ['End'], description: 'Last slide' },
      { keys: ['1-9'], description: 'Jump to slide 1-9' },
    ]},
    { category: 'Display', shortcuts: [
      { keys: ['F', 'F5', 'F11'], description: 'Toggle fullscreen' },
    ]},
    { category: 'General', shortcuts: [
      { keys: ['Esc'], description: 'Exit presentation' },
    ]},
  ]

  const shortcuts = mode === 'presentation' ? presentationShortcuts : editorShortcuts

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M10 16h4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Keyboard Shortcuts</h2>
              <p className="text-xs text-gray-500">
                {mode === 'presentation' ? 'Presentation Mode' : 'Editor Mode'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {shortcuts.map((section, sectionIdx) => (
            <div key={section.category} className={sectionIdx > 0 ? 'mt-6' : ''}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {section.category}
              </h3>
              <div className="space-y-2">
                {section.shortcuts.map((shortcut, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-all"
                  >
                    <span className="text-sm text-gray-700">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIdx) => (
                        <span key={keyIdx} className="flex items-center">
                          <kbd className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded shadow-sm min-w-[28px] text-center">
                            {key}
                          </kbd>
                          {keyIdx < shortcut.keys.length - 1 && (
                            <span className="mx-1 text-gray-400 text-xs">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500 text-center">
            Press <kbd className="px-1.5 py-0.5 text-xs bg-white border border-gray-200 rounded shadow-sm">?</kbd> or <kbd className="px-1.5 py-0.5 text-xs bg-white border border-gray-200 rounded shadow-sm">F1</kbd> anytime to show this panel
          </p>
        </div>
      </div>
    </div>
  )
}

export default KeyboardShortcutsModal
