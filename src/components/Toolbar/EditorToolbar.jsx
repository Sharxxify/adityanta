import { useState } from 'react'

const EditorToolbar = ({
  showMediaDropdown,
  setShowMediaDropdown,
  onSave,
  onAddText,
  onAddShape,
  onAddImage,
  onAddWebImage,
  onAddVideo,
  onAddAudio,
  onAddIcon,
  onAddTable,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) => {
  const [activeDropdown, setActiveDropdown] = useState(null)

  const toolbarItems = [
    { id: 'undo', label: 'Undo', icon: 'undo', action: onUndo, disabled: !canUndo, isIconOnly: true, title: 'Undo (Ctrl+Z)' },
    { id: 'redo', label: 'Redo', icon: 'redo', action: onRedo, disabled: !canRedo, isIconOnly: true, title: 'Redo (Ctrl+Y)' },
    { id: 'saveCloud', label: 'Save', icon: 'saveCloud', action: onSave, isIconOnly: true, title: 'Save (Ctrl+S)' },
    { id: 'divider', isDivider: true },
    { id: 'text', label: 'Text', icon: 'text', action: onAddText },
    { id: 'media', label: 'Media', icon: 'media', hasDropdown: true },
    { id: 'shape', label: 'Shape', icon: 'shape', action: onAddShape },
    { id: 'storyBlock', label: 'Table', icon: 'storyBlock', action: onAddTable },
    { id: 'icons', label: 'Icons', icon: 'icons', action: onAddIcon },
  ]

  const mediaOptions = [
    { id: 'image', label: 'Upload Image', icon: 'image', action: onAddImage },
    { id: 'webImage', label: 'Search Web Images', icon: 'webImage', action: onAddWebImage },
    { id: 'video', label: 'Video', icon: 'video', action: onAddVideo },
    { id: 'audio', label: 'Audio', icon: 'audio', action: onAddAudio },
  ]

  const getIcon = (type) => {
    switch (type) {
      case 'undo':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
          </svg>
        )
      case 'redo':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7" />
          </svg>
        )
      case 'text':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 4h12M12 4v16"/>
          </svg>
        )
      case 'style':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 4 4 14l6 6 10-10" />
            <path d="M13 5l6 6" />
          </svg>
        )
      case 'media':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        )
      case 'shape':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <circle cx="17" cy="17" r="4"/>
          </svg>
        )
      case 'table':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        )
      case 'icons':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24"/>
          </svg>
        )
      case 'storyBlock':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        )
      case 'arrow':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        )
      case 'draw':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        )
      case 'animation':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l4 2" />
          </svg>
        )
      case 'more':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        )
      case 'saveCloud':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 16.5a4.5 4.5 0 0 0-1.2-8.84A6 6 0 0 0 7 9.5" />
            <path d="M12 12v8" />
            <path d="m8.5 16 3.5-4 3.5 4" />
          </svg>
        )
      case 'image':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        )
      case 'video':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="16" height="16" rx="2"/>
            <polygon points="22 8 22 16 16 12"/>
          </svg>
        )
      case 'audio':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        )
      case 'webImage':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1 border border-gray-200 rounded-lg bg-white shadow-sm">
      {toolbarItems.map((item) => (
        <div key={item.id} className="relative">
          {item.isDivider ? (
            <div className="w-px h-10 bg-gray-200 mx-1" />
          ) : (
            <button
              onClick={() => {
                if (item.disabled) return
                if (item.hasDropdown) {
                  setActiveDropdown(activeDropdown === item.id ? null : item.id)
                  setShowMediaDropdown(!showMediaDropdown)
                } else if (item.action) {
                  item.action()
                  setActiveDropdown(null)
                }
              }}
              disabled={item.disabled}
              title={item.title}
              className={`flex flex-col items-center justify-center min-w-[54px] h-12 rounded-md text-[11px] font-medium transition-all ${
                item.disabled
                  ? 'text-gray-300 cursor-not-allowed'
                  : activeDropdown === item.id
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className={item.disabled ? 'text-gray-300' : 'text-gray-500'}>{getIcon(item.icon)}</span>
              {!item.isIconOnly && <span className="leading-none mt-0.5">{item.label}</span>}
            </button>
          )}

          {/* Media Dropdown */}
          {item.hasDropdown && activeDropdown === item.id && (
            <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg py-2 min-w-[150px] z-20">
              {mediaOptions.map((media) => (
                <button
                  key={media.id}
                  onClick={() => {
                    if (media.action) {
                      media.action()
                    }
                    setShowMediaDropdown(false)
                    setActiveDropdown(null)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-all"
                >
                  <span className="text-gray-500">{getIcon(media.icon)}</span>
                  {media.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default EditorToolbar
