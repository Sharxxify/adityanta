import { useState, useEffect, useRef } from 'react'

const RightClickMenu = ({ x, y, onClose, onAction, hasSelection = false, currentBackground = '#ffffff', currentColor = '#2E7D32' }) => {
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [selectedColor, setSelectedColor] = useState(currentBackground)
  const [hexInput, setHexInput] = useState(currentBackground)
  const [elementColor, setElementColor] = useState(currentColor)
  const [elementHexInput, setElementHexInput] = useState(currentColor)
  const colorInputRef = useRef(null)

  useEffect(() => {
    setSelectedColor(currentBackground)
    setHexInput(currentBackground)
  }, [currentBackground])

  useEffect(() => {
    setElementColor(currentColor)
    setElementHexInput(currentColor)
  }, [currentColor])

  const handleBackgroundSelect = (color) => {
    setSelectedColor(color)
    setHexInput(color)
    onAction('previewBackground', color) // Instantly preview the color
  }

  // Basic background themes
  const backgroundThemes = [
    { name: 'White', color: '#ffffff' },
    { name: 'Light Gray', color: '#f5f5f5' },
    { name: 'Cream', color: '#fef9f3' },
    { name: 'Light Blue', color: '#e3f2fd' },
    { name: 'Light Green', color: '#e8f5e9' },
    { name: 'Light Orange', color: '#fff3e0' },
    { name: 'Light Purple', color: '#f3e5f5' },
    { name: 'Dark Gray', color: '#424242' },
    { name: 'Navy', color: '#1a237e' },
    { name: 'Teal', color: '#004d40' },
  ]

  const menuItems = [
    ...(hasSelection ? [
      { id: 'copy', label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C' },
      { id: 'duplicate', label: 'Duplicate', icon: 'duplicate' },
      { id: 'delete', label: 'Delete', icon: 'trash', shortcut: 'Del' },
      { type: 'divider' },
      { id: 'bringToFront', label: 'Bring to Front', icon: 'layerUp' },
      { id: 'sendToBack', label: 'Send to Back', icon: 'layerDown' },
      { type: 'divider' },
    ] : []),
    { id: 'paste', label: 'Paste', icon: 'clipboard' },
    { type: 'divider' },
    { id: 'background', label: 'Change Background', icon: 'image', hasSubmenu: true },
    { type: 'divider' },
    { id: 'text', label: 'Insert Text', icon: 'text' },
    { id: 'image', label: 'Insert Image', icon: 'photo' },
    { id: 'shape', label: 'Insert Shape', icon: 'shape' },
    { id: 'table', label: 'Insert Table', icon: 'table' },
    { id: 'icon', label: 'Insert Icon', icon: 'sparkle' },
  ]

  // Handle Enter key for color selection
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && showBackgroundPicker) {
        onAction('setBackground', selectedColor)
        onClose()
      }
      if (e.key === 'Enter' && showColorPicker) {
        onAction('setElementColor', elementColor)
        onClose()
      }
      if (e.key === 'Escape') {
        if (showBackgroundPicker) {
          onAction('previewBackground', currentBackground) // Revert
          setShowBackgroundPicker(false)
        } else if (showColorPicker) {
          onAction('previewElementColor', currentColor) // Revert
          setShowColorPicker(false)
        } else {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showBackgroundPicker, showColorPicker, selectedColor, elementColor, onAction, onClose])

  const getIcon = (type) => {
    switch (type) {
      case 'clipboard':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
        )
      case 'copy':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )
      case 'duplicate':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
            <path d="M14 11v6M11 14h6" />
          </svg>
        )
      case 'trash':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        )
      case 'layerUp':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M12 2v4M9 3l3-2 3 2" />
          </svg>
        )
      case 'layerDown':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M12 22v-4M9 21l3 2 3-2" />
          </svg>
        )
      case 'image':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        )
      case 'palette':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="13.5" cy="6.5" r=".5" />
            <circle cx="17.5" cy="10.5" r=".5" />
            <circle cx="8.5" cy="7.5" r=".5" />
            <circle cx="6.5" cy="12.5" r=".5" />
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
          </svg>
        )
      case 'text':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 7 4 4 20 4 20 7" />
            <line x1="9" y1="20" x2="15" y2="20" />
            <line x1="12" y1="4" x2="12" y2="20" />
          </svg>
        )
      case 'photo':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        )
      case 'video':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        )
      case 'shape':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
          </svg>
        )
      case 'table':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        )
      case 'sparkle':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
            <path d="M5 19l1 3 1-3 3-1-3-1-1-3-1 3-3 1 3 1z" />
          </svg>
        )
      default:
        return null
    }
  }

  const menuStyle = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - 400),
  }

  return (
    <div
      style={menuStyle}
      className="bg-white border border-gray-200 rounded-xl shadow-xl py-2 min-w-[180px] z-50"
      onClick={(e) => e.stopPropagation()}
    >
      {showBackgroundPicker ? (
        <div className="p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Background</span>
            <button
              onClick={() => setShowBackgroundPicker(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {/* Preset Colors */}
          <p className="text-xs text-gray-500 mb-2">Preset Colors</p>
          <div className="grid grid-cols-5 gap-1.5 mb-3">
            {backgroundThemes.map((theme) => (
              <button
                key={theme.color}
                onClick={() => handleBackgroundSelect(theme.color)}
                className={`w-7 h-7 rounded-lg border-2 transition-all hover:scale-110 ${selectedColor === theme.color ? 'border-primary ring-2 ring-primary/30' : 'border-gray-200'
                  }`}
                style={{ backgroundColor: theme.color }}
                title={theme.name}
              />
            ))}
          </div>

          {/* RGB Color Picker Grid */}
          <p className="text-xs text-gray-500 mb-2">RGB Color Picker</p>
          <input
            ref={colorInputRef}
            type="color"
            value={selectedColor}
            onChange={(e) => handleBackgroundSelect(e.target.value)}
            className="w-full h-24 rounded cursor-pointer border border-gray-200 mb-2"
          />

          {/* Hex Input */}
          <div className="mb-3">
            <label className="text-xs text-gray-400 block mb-1">Hex Code</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={hexInput}
                onChange={(e) => {
                  setHexInput(e.target.value)
                  if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                    handleBackgroundSelect(e.target.value)
                  }
                }}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded font-mono"
                placeholder="#ffffff"
              />
            </div>
          </div>

          <button
            onClick={() => {
              onAction('setBackground', selectedColor)
              setShowBackgroundPicker(false)
            }}
            className="w-full px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark transition-all flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Apply
          </button>
        </div>
      ) : showColorPicker ? (
        <div className="p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700">Element Color</span>
            <button
              onClick={() => setShowColorPicker(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          <p className="text-xs text-gray-500 mb-2">Pick a color</p>
          <input
            type="color"
            value={elementColor}
            onChange={(e) => {
              setElementColor(e.target.value)
              setElementHexInput(e.target.value)
            }}
            className="w-full h-24 rounded cursor-pointer border border-gray-200 mb-2"
          />

          <div className="mb-3">
            <label className="text-xs text-gray-400 block mb-1">Hex Code</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={elementHexInput}
                onChange={(e) => {
                  setElementHexInput(e.target.value)
                  if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                    setElementColor(e.target.value)
                  }
                }}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded font-mono"
                placeholder="#2E7D32"
              />
            </div>
          </div>

          <button
            onClick={() => {
              onAction('setElementColor', elementColor)
              setShowColorPicker(false)
            }}
            className="w-full px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark transition-all flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Apply
          </button>
        </div>
      ) : (
        menuItems.map((item, index) => {
          if (item.type === 'divider') {
            return <div key={index} className="h-px bg-gray-100 my-1.5" />
          }

          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'background') {
                  setShowBackgroundPicker(true)
                } else if (item.id === 'color') {
                  setShowColorPicker(true)
                } else {
                  onAction(item.id)
                }
              }}
              className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-all"
            >
              <span className="text-gray-500">{getIcon(item.icon)}</span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.shortcut && (
                <span className="text-xs text-gray-400">{item.shortcut}</span>
              )}
              {item.hasSubmenu && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              )}
            </button>
          )
        })
      )}
    </div>
  )
}

export default RightClickMenu
