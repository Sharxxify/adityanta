import { useState, useEffect, useRef } from 'react'

const BASIC_ANIMATIONS = [
  { key: 'none', name: 'None' },
  { key: 'fadeIn', name: 'Fade In' },
  { key: 'slideInUp', name: 'Slide Up' },
  { key: 'slideInLeft', name: 'Slide Left' },
  { key: 'zoomIn', name: 'Zoom In' },
  { key: 'bounceIn', name: 'Bounce' },
  { key: 'pulse', name: 'Pulse' },
]

const SPEED_OPTIONS = [
  { key: 'slow', label: 'Slow', duration: 800 },
  { key: 'normal', label: 'Normal', duration: 500 },
  { key: 'fast', label: 'Fast', duration: 300 },
]

const TextToolbar = ({ element, onUpdate, onAnimationChange }) => {
  const [showFontDropdown, setShowFontDropdown] = useState(false)
  const [fontSearch, setFontSearch] = useState('')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showSizeDropdown, setShowSizeDropdown] = useState(false)
  const [showBorderOptions, setShowBorderOptions] = useState(false)
  const [showListDropdown, setShowListDropdown] = useState(false)
  const [showAnimationDropdown, setShowAnimationDropdown] = useState(false)
  const [tempColor, setTempColor] = useState(element?.color || '#1a1a1a')
  const [hexInput, setHexInput] = useState(element?.color || '#1a1a1a')

  const fontDropdownRef = useRef(null)
  const colorPickerRef = useRef(null)
  const sizeDropdownRef = useRef(null)
  const borderOptionsRef = useRef(null)
  const listDropdownRef = useRef(null)
  const animationDropdownRef = useRef(null)

  const fonts = [
    // System & Sans-Serif (Universal)
    'Arial', 'Arial Black', 'Arial Narrow', 'Arial Rounded MT Bold',
    'Helvetica', 'Helvetica Neue', 'Verdana', 'Tahoma', 'Geneva',
    'Trebuchet MS', 'Lucida Grande', 'Lucida Sans Unicode', 'Lucida Sans',
    'Segoe UI', 'Segoe UI Light', 'Segoe UI Semibold', 'Century Gothic',
    'Franklin Gothic Medium', 'Gill Sans', 'Optima', 'Candara', 'Calibri',
    'Microsoft Sans Serif', 'MS Sans Serif', 'DejaVu Sans', 'Liberation Sans',
    'Noto Sans', 'Droid Sans', 'Ubuntu', 'Fira Sans', 'Source Sans Pro',
    // Serif (Universal)
    'Times New Roman', 'Times', 'Georgia', 'Garamond', 'Palatino', 'Palatino Linotype',
    'Book Antiqua', 'Bookman Old Style', 'Cambria', 'Constantia', 'Didot',
    'Century', 'Century Schoolbook', 'Baskerville', 'Hoefler Text', 'Cochin',
    'Big Caslon', 'Bodoni MT', 'Calisto MT', 'High Tower Text', 'Lucida Bright',
    'DejaVu Serif', 'Liberation Serif', 'Noto Serif', 'Droid Serif',
    'PT Serif', 'Merriweather', 'Playfair Display', 'Lora', 'Libre Baskerville',
    // Monospace (Universal)
    'Courier New', 'Courier', 'Monaco', 'Consolas', 'Lucida Console',
    'Lucida Typewriter', 'Menlo', 'Andale Mono', 'DejaVu Sans Mono',
    'Liberation Mono', 'Source Code Pro', 'Fira Code', 'JetBrains Mono',
    'Ubuntu Mono', 'Inconsolata', 'PT Mono', 'Droid Sans Mono', 'IBM Plex Mono',
    // Display & Decorative
    'Impact', 'Haettenschweiler', 'Copperplate', 'Papyrus', 'Brush Script MT',
    'Comic Sans MS', 'Marker Felt', 'Chalkboard', 'Noteworthy', 'Snell Roundhand',
    'Zapfino', 'Apple Chancery', 'Curlz MT', 'Harrington', 'Magneto',
    'Juice ITC', 'Ravie', 'Stencil', 'Wide Latin', 'Showcard Gothic',
    // Google Fonts (Popular)
    'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Oswald', 'Raleway',
    'PT Sans', 'Nunito', 'Poppins', 'Quicksand', 'Rubik', 'Work Sans', 'Mulish',
    'Barlow', 'IBM Plex Sans', 'Manrope', 'DM Sans', 'Space Grotesk', 'Outfit',
    'Sora', 'Plus Jakarta Sans', 'Red Hat Display', 'Exo 2', 'Karla',
    'Titillium Web', 'Josefin Sans', 'Archivo', 'Lexend', 'Figtree',
    // Google Fonts (Decorative)
    'Bebas Neue', 'Cabin', 'Bitter', 'Dancing Script', 'Pacifico', 'Lobster',
    'Righteous', 'Satisfy', 'Indie Flower', 'Rock Salt', 'Amatic SC',
    'Permanent Marker', 'Shadows Into Light', 'Great Vibes', 'Caveat',
    'Sacramento', 'Courgette', 'Kaushan Script', 'Cookie', 'Yellowtail',
    'Tangerine', 'Allura', 'Alex Brush', 'Pinyon Script', 'Berkshire Swash',
    // More Google Fonts (Modern)
    'Nunito Sans', 'Hind', 'Fira Sans Condensed', 'Asap', 'Dosis',
    'Varela Round', 'Comfortaa', 'Questrial', 'ABeeZee', 'Yantramanav',
    'Maven Pro', 'Signika', 'Prompt', 'Overpass', 'Sarabun',
    'Kanit', 'Arimo', 'Jost', 'Libre Franklin', 'Assistant',
    'Heebo', 'Catamaran', 'Oxygen', 'Cabin Condensed', 'Encode Sans',
    // Specialty & Unique
    'Anton', 'Bungee', 'Bangers', 'Fredoka One', 'Baloo 2',
    'Alfa Slab One', 'Archivo Black', 'Fjalla One', 'Russo One', 'Teko',
    'Staatliches', 'Black Ops One', 'Orbitron', 'Press Start 2P', 'VT323',
    'Share Tech Mono', 'Nova Mono', 'Cutive Mono', 'Anonymous Pro', 'Overpass Mono'
  ]
  const fontSizes = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64, 72, 96]
  const colors = [
    '#1a1a1a', '#666666', '#999999', '#ffffff',
    '#2E7D32', '#1976D2', '#D32F2F', '#7B1FA2',
    '#F57C00', '#00796B', '#C2185B', '#512DA8'
  ]

  // Get current values from element
  const currentFont = element?.fontFamily || 'Inter'
  const fontSize = element?.fontSize || 16
  const isBold = element?.fontWeight === 'bold'
  const isItalic = element?.fontStyle === 'italic'
  const isUnderline = element?.textDecoration === 'underline'
  const textColor = element?.color || '#1a1a1a'
  const alignment = element?.textAlign || 'left'
  const borderWidth = element?.type === 'shape'
    ? (element?.strokeWidth !== undefined ? element.strokeWidth : 0)
    : (element?.borderWidth || 0)
  const borderColor = element?.type === 'shape'
    ? (element?.strokeColor || '#333333')
    : (element?.borderColor || '#333333')
  const listType = element?.listType || 'none'
  const currentAnimation = element?.animation?.type || 'none'
  const currentDuration = element?.animation?.duration || 500

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (fontDropdownRef.current && !fontDropdownRef.current.contains(e.target)) {
        setShowFontDropdown(false)
      }
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) {
        setShowColorPicker(false)
      }
      if (sizeDropdownRef.current && !sizeDropdownRef.current.contains(e.target)) {
        setShowSizeDropdown(false)
      }
      if (borderOptionsRef.current && !borderOptionsRef.current.contains(e.target)) {
        setShowBorderOptions(false)
      }
      if (listDropdownRef.current && !listDropdownRef.current.contains(e.target)) {
        setShowListDropdown(false)
      }
      if (animationDropdownRef.current && !animationDropdownRef.current.contains(e.target)) {
        setShowAnimationDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Sync color picker state with active element
  useEffect(() => {
    if (element) {
      setTempColor(element.color || '#1a1a1a')
      setHexInput(element.color || '#1a1a1a')
    }
  }, [element])

  const handleFontSizeChange = (delta) => {
    if (delta > 0) {
      const next = fontSizes.find(s => s > fontSize)
      onUpdate({ fontSize: next ?? Math.min(200, fontSize + 1) })
    } else {
      const prev = [...fontSizes].reverse().find(s => s < fontSize)
      onUpdate({ fontSize: prev ?? Math.max(8, fontSize - 1) })
    }
  }

  const handleFontSizeSelect = (size) => {
    onUpdate({ fontSize: size })
    setShowSizeDropdown(false)
  }

  const handleFontChange = (font) => {
    onUpdate({ fontFamily: font })
    setShowFontDropdown(false)
    setFontSearch('')
  }

  const filteredFonts = fontSearch.trim()
    ? fonts.filter(f => f.toLowerCase().includes(fontSearch.toLowerCase()))
    : fonts

  const toggleBold = () => {
    onUpdate({ fontWeight: isBold ? 'normal' : 'bold' })
  }

  const toggleItalic = () => {
    onUpdate({ fontStyle: isItalic ? 'normal' : 'italic' })
  }

  const toggleUnderline = () => {
    onUpdate({ textDecoration: isUnderline ? 'none' : 'underline' })
  }

  const handleColorChange = (color) => {
    setTempColor(color)
    setHexInput(color)
    onUpdate({ color })
  }

  const applyColor = () => {
    setShowColorPicker(false)
  }

  const handleAlignmentChange = (align) => {
    onUpdate({ textAlign: align })
  }

  const handleListTypeChange = (type) => {
    onUpdate({ listType: type })
    setShowListDropdown(false)
  }

  return (
    <div
      data-text-toolbar="true"
      onMouseDown={(e) => {
        // Prevent toolbar clicks from stealing focus / deselecting active text selection
        const tag = e.target?.tagName?.toLowerCase()
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault()
        }
      }}
      className="h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-2 relative z-40"
    >
      {/* Font Family */}
      <div className="relative" ref={fontDropdownRef}>
        <button
          onClick={() => setShowFontDropdown(!showFontDropdown)}
          className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:border-gray-300 min-w-[120px]"
        >
          <span className="truncate" style={{ fontFamily: currentFont }}>{currentFont}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {showFontDropdown && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[200px]">
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                value={fontSearch}
                onChange={(e) => setFontSearch(e.target.value)}
                placeholder="Search fonts…"
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:border-primary"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {filteredFonts.length === 0 && (
                <div className="px-3 py-4 text-sm text-gray-400 text-center">No fonts found</div>
              )}
              {filteredFonts.map((font) => (
                <button
                  key={font}
                  onClick={() => handleFontChange(font)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${currentFont === font ? 'text-primary font-medium bg-primary/5' : 'text-gray-700'}`}
                  style={{ fontFamily: font }}
                >
                  {font}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Font Size */}
      <div className="flex items-center gap-1" ref={sizeDropdownRef}>
        <button
          onClick={() => handleFontSizeChange(-2)}
          className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded"
          title="Decrease font size"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <div className="relative">
          <button
            onClick={() => setShowSizeDropdown(!showSizeDropdown)}
            className="w-12 h-7 text-center text-sm border border-gray-200 rounded hover:border-gray-300"
          >
            {fontSize}
          </button>
          {showSizeDropdown && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 w-16 max-h-48 overflow-y-auto">
              {fontSizes.map((size) => (
                <button
                  key={size}
                  onClick={() => handleFontSizeSelect(size)}
                  className={`w-full px-2 py-1 text-center text-sm hover:bg-gray-50 ${fontSize === size ? 'text-primary font-medium bg-primary/5' : 'text-gray-700'
                    }`}
                >
                  {size}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => handleFontSizeChange(2)}
          className="w-7 h-7 flex items-center justify-center hover:bg-gray-100 rounded"
          title="Increase font size"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Bold, Italic, Underline */}
      <button
        onClick={toggleBold}
        className={`w-8 h-8 flex items-center justify-center rounded transition-all ${isBold ? 'bg-primary/10 text-primary ring-1 ring-primary' : 'hover:bg-gray-100'
          }`}
        title="Bold (Ctrl+B)"
      >
        <span className="font-bold text-sm">B</span>
      </button>
      <button
        onClick={toggleItalic}
        className={`w-8 h-8 flex items-center justify-center rounded transition-all ${isItalic ? 'bg-primary/10 text-primary ring-1 ring-primary' : 'hover:bg-gray-100'
          }`}
        title="Italic (Ctrl+I)"
      >
        <span className="italic text-sm font-serif">I</span>
      </button>
      <button
        onClick={toggleUnderline}
        className={`w-8 h-8 flex items-center justify-center rounded transition-all ${isUnderline ? 'bg-primary/10 text-primary ring-1 ring-primary' : 'hover:bg-gray-100'
          }`}
        title="Underline (Ctrl+U)"
      >
        <span className="underline text-sm">U</span>
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Text Color */}
      <div className="relative" ref={colorPickerRef}>
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          className={`w-8 h-8 flex items-center justify-center hover:bg-gray-100 rounded ${showColorPicker ? 'bg-gray-100' : ''}`}
          title="Text color"
        >
          <div className="flex flex-col items-center">
            <span className="text-sm font-medium text-gray-700">A</span>
            <div className="w-5 h-1 rounded-sm mt-0.5" style={{ backgroundColor: textColor }} />
          </div>
        </button>
        {showColorPicker && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-20 w-64">
            {/* RGB Color Picker */}
            <div className="mb-3">
              <label className="text-xs text-gray-500 block mb-2">RGB Color Grid</label>
              <input
                type="color"
                value={tempColor}
                onChange={(e) => handleColorChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full h-32 cursor-pointer border border-gray-200 rounded"
              />
            </div>

            {/* Preset Colors */}
            <div className="mb-3">
              <label className="text-xs text-gray-500 block mb-2">Preset Colors</label>
              <div className="grid grid-cols-6 gap-2">
                {colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleColorChange(color);
                    }}
                    className={`w-7 h-7 rounded-lg transition-all ${tempColor === color ? 'ring-2 ring-primary ring-offset-2' : 'hover:scale-110'
                      }`}
                    style={{ backgroundColor: color, border: color === '#ffffff' ? '1px solid #e5e5e5' : 'none' }}
                    title={color}
                  />
                ))}
              </div>
            </div>

            {/* Hex Input */}
            <div className="mb-3">
              <label className="text-xs text-gray-500 block mb-1">Hex Color Code</label>
              <input
                type="text"
                value={hexInput}
                onChange={(e) => {
                  setHexInput(e.target.value)
                  if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
                    handleColorChange(e.target.value)
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded font-mono"
                placeholder="#000000"
              />
            </div>

            {/* Close Button */}
            <button
              onClick={applyColor}
              className="w-full px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark transition-all flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Done
            </button>
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Alignment */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => handleAlignmentChange('left')}
          className={`w-8 h-8 flex items-center justify-center rounded transition-all ${alignment === 'left' ? 'bg-primary/10 text-primary ring-1 ring-primary' : 'hover:bg-gray-100'
            }`}
          title="Align left"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="17" y1="10" x2="3" y2="10" />
            <line x1="21" y1="6" x2="3" y2="6" />
            <line x1="21" y1="14" x2="3" y2="14" />
            <line x1="17" y1="18" x2="3" y2="18" />
          </svg>
        </button>
        <button
          onClick={() => handleAlignmentChange('center')}
          className={`w-8 h-8 flex items-center justify-center rounded transition-all ${alignment === 'center' ? 'bg-primary/10 text-primary ring-1 ring-primary' : 'hover:bg-gray-100'
            }`}
          title="Align center"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="10" x2="6" y2="10" />
            <line x1="21" y1="6" x2="3" y2="6" />
            <line x1="21" y1="14" x2="3" y2="14" />
            <line x1="18" y1="18" x2="6" y2="18" />
          </svg>
        </button>
        <button
          onClick={() => handleAlignmentChange('right')}
          className={`w-8 h-8 flex items-center justify-center rounded transition-all ${alignment === 'right' ? 'bg-primary/10 text-primary ring-1 ring-primary' : 'hover:bg-gray-100'
            }`}
          title="Align right"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="21" y1="10" x2="7" y2="10" />
            <line x1="21" y1="6" x2="3" y2="6" />
            <line x1="21" y1="14" x2="3" y2="14" />
            <line x1="21" y1="18" x2="7" y2="18" />
          </svg>
        </button>
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* List Options - Combined Dropdown */}
      <div className="relative" ref={listDropdownRef}>
        <button
          onClick={() => setShowListDropdown(!showListDropdown)}
          className={`w-8 h-8 flex items-center justify-center rounded transition-all ${listType !== 'none' ? 'bg-primary/10 text-primary ring-1 ring-primary' : 'hover:bg-gray-100'
            }`}
          title="List options"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <circle cx="3" cy="6" r="1.5" fill="currentColor" />
            <circle cx="3" cy="12" r="1.5" fill="currentColor" />
            <circle cx="3" cy="18" r="1.5" fill="currentColor" />
          </svg>
        </button>
        {showListDropdown && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-[180px] max-h-[300px] overflow-y-auto">
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">List Style</div>
            <button
              onClick={() => handleListTypeChange('none')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 ${listType === 'none' ? 'text-primary bg-primary/5' : 'text-gray-700'
                }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="4" x2="20" y2="20" />
              </svg>
              <span>None</span>
            </button>

            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide border-t border-b border-gray-100 mt-1">Bullets</div>
            <button
              onClick={() => handleListTypeChange('bullet')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 ${listType === 'bullet' ? 'text-primary bg-primary/5' : 'text-gray-700'
                }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="4" cy="6" r="2" fill="currentColor" />
                <circle cx="4" cy="12" r="2" fill="currentColor" />
                <circle cx="4" cy="18" r="2" fill="currentColor" />
                <line x1="10" y1="6" x2="20" y2="6" />
                <line x1="10" y1="12" x2="20" y2="12" />
                <line x1="10" y1="18" x2="20" y2="18" />
              </svg>
              <span>● Solid Circle</span>
            </button>
            <button
              onClick={() => handleListTypeChange('bullet-hollow')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 ${listType === 'bullet-hollow' ? 'text-primary bg-primary/5' : 'text-gray-700'
                }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="4" cy="6" r="2" />
                <circle cx="4" cy="12" r="2" />
                <circle cx="4" cy="18" r="2" />
                <line x1="10" y1="6" x2="20" y2="6" />
                <line x1="10" y1="12" x2="20" y2="12" />
                <line x1="10" y1="18" x2="20" y2="18" />
              </svg>
              <span>○ Hollow Circle</span>
            </button>
            <button
              onClick={() => handleListTypeChange('bullet-square')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 ${listType === 'bullet-square' ? 'text-primary bg-primary/5' : 'text-gray-700'
                }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="4" height="4" fill="currentColor" />
                <rect x="2" y="10" width="4" height="4" fill="currentColor" />
                <rect x="2" y="16" width="4" height="4" fill="currentColor" />
                <line x1="10" y1="6" x2="20" y2="6" />
                <line x1="10" y1="12" x2="20" y2="12" />
                <line x1="10" y1="18" x2="20" y2="18" />
              </svg>
              <span>■ Square</span>
            </button>
            <button
              onClick={() => handleListTypeChange('bullet-dash')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 ${listType === 'bullet-dash' ? 'text-primary bg-primary/5' : 'text-gray-700'
                }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="2" y1="6" x2="6" y2="6" strokeWidth="3" />
                <line x1="2" y1="12" x2="6" y2="12" strokeWidth="3" />
                <line x1="2" y1="18" x2="6" y2="18" strokeWidth="3" />
                <line x1="10" y1="6" x2="20" y2="6" />
                <line x1="10" y1="12" x2="20" y2="12" />
                <line x1="10" y1="18" x2="20" y2="18" />
              </svg>
              <span>— Dash</span>
            </button>
            <button
              onClick={() => handleListTypeChange('bullet-arrow')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 ${listType === 'bullet-arrow' ? 'text-primary bg-primary/5' : 'text-gray-700'
                }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="2,4 6,6 2,8" fill="currentColor" />
                <polyline points="2,10 6,12 2,14" fill="currentColor" />
                <polyline points="2,16 6,18 2,20" fill="currentColor" />
                <line x1="10" y1="6" x2="20" y2="6" />
                <line x1="10" y1="12" x2="20" y2="12" />
                <line x1="10" y1="18" x2="20" y2="18" />
              </svg>
              <span>▸ Arrow</span>
            </button>
            <button
              onClick={() => handleListTypeChange('bullet-check')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 ${listType === 'bullet-check' ? 'text-primary bg-primary/5' : 'text-gray-700'
                }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1,6 3,8 7,4" />
                <polyline points="1,12 3,14 7,10" />
                <polyline points="1,18 3,20 7,16" />
                <line x1="10" y1="6" x2="20" y2="6" />
                <line x1="10" y1="12" x2="20" y2="12" />
                <line x1="10" y1="18" x2="20" y2="18" />
              </svg>
              <span>✓ Checkmark</span>
            </button>
            <button
              onClick={() => handleListTypeChange('bullet-star')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 ${listType === 'bullet-star' ? 'text-primary bg-primary/5' : 'text-gray-700'
                }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="4,1 5,4 8,4 5.5,6 6.5,9 4,7 1.5,9 2.5,6 0,4 3,4" transform="translate(0,2)" />
                <polygon points="4,1 5,4 8,4 5.5,6 6.5,9 4,7 1.5,9 2.5,6 0,4 3,4" transform="translate(0,8)" />
                <polygon points="4,1 5,4 8,4 5.5,6 6.5,9 4,7 1.5,9 2.5,6 0,4 3,4" transform="translate(0,14)" />
                <line x1="10" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="2" fill="none" />
                <line x1="10" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" fill="none" />
                <line x1="10" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
              <span>★ Star</span>
            </button>

            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide border-t border-b border-gray-100 mt-1">Numbered</div>
            <button
              onClick={() => handleListTypeChange('numbered')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 ${listType === 'numbered' ? 'text-primary bg-primary/5' : 'text-gray-700'
                }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <text x="2" y="8" fontSize="8" fill="currentColor" fontWeight="bold">1.</text>
                <text x="2" y="14" fontSize="8" fill="currentColor" fontWeight="bold">2.</text>
                <text x="2" y="20" fontSize="8" fill="currentColor" fontWeight="bold">3.</text>
                <line x1="12" y1="6" x2="20" y2="6" />
                <line x1="12" y1="12" x2="20" y2="12" />
                <line x1="12" y1="18" x2="20" y2="18" />
              </svg>
              <span>1. 2. 3. Numbers</span>
            </button>
            <button
              onClick={() => handleListTypeChange('numbered-paren')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 ${listType === 'numbered-paren' ? 'text-primary bg-primary/5' : 'text-gray-700'
                }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <text x="1" y="8" fontSize="7" fill="currentColor" fontWeight="bold">1)</text>
                <text x="1" y="14" fontSize="7" fill="currentColor" fontWeight="bold">2)</text>
                <text x="1" y="20" fontSize="7" fill="currentColor" fontWeight="bold">3)</text>
                <line x1="12" y1="6" x2="20" y2="6" />
                <line x1="12" y1="12" x2="20" y2="12" />
                <line x1="12" y1="18" x2="20" y2="18" />
              </svg>
              <span>1) 2) 3) Parenthesis</span>
            </button>
            <button
              onClick={() => handleListTypeChange('alpha')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 ${listType === 'alpha' ? 'text-primary bg-primary/5' : 'text-gray-700'
                }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <text x="2" y="8" fontSize="8" fill="currentColor" fontWeight="bold">A.</text>
                <text x="2" y="14" fontSize="8" fill="currentColor" fontWeight="bold">B.</text>
                <text x="2" y="20" fontSize="8" fill="currentColor" fontWeight="bold">C.</text>
                <line x1="12" y1="6" x2="20" y2="6" />
                <line x1="12" y1="12" x2="20" y2="12" />
                <line x1="12" y1="18" x2="20" y2="18" />
              </svg>
              <span>A. B. C. Uppercase</span>
            </button>
            <button
              onClick={() => handleListTypeChange('alpha-lower')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 ${listType === 'alpha-lower' ? 'text-primary bg-primary/5' : 'text-gray-700'
                }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <text x="2" y="8" fontSize="8" fill="currentColor" fontWeight="bold">a.</text>
                <text x="2" y="14" fontSize="8" fill="currentColor" fontWeight="bold">b.</text>
                <text x="2" y="20" fontSize="8" fill="currentColor" fontWeight="bold">c.</text>
                <line x1="12" y1="6" x2="20" y2="6" />
                <line x1="12" y1="12" x2="20" y2="12" />
                <line x1="12" y1="18" x2="20" y2="18" />
              </svg>
              <span>a. b. c. Lowercase</span>
            </button>
            <button
              onClick={() => handleListTypeChange('roman')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-gray-50 ${listType === 'roman' ? 'text-primary bg-primary/5' : 'text-gray-700'
                }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <text x="2" y="8" fontSize="7" fill="currentColor" fontWeight="bold">I.</text>
                <text x="2" y="14" fontSize="7" fill="currentColor" fontWeight="bold">II.</text>
                <text x="2" y="20" fontSize="7" fill="currentColor" fontWeight="bold">III.</text>
                <line x1="12" y1="6" x2="20" y2="6" />
                <line x1="12" y1="12" x2="20" y2="12" />
                <line x1="12" y1="18" x2="20" y2="18" />
              </svg>
              <span>I. II. III. Roman</span>
            </button>
          </div>
        )}
      </div>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Border Options */}
      <div className="relative" ref={borderOptionsRef}>
        <button
          onClick={() => setShowBorderOptions(!showBorderOptions)}
          className={`w-8 h-8 flex items-center justify-center rounded transition-all ${borderWidth > 0 ? 'bg-primary/10 text-primary ring-1 ring-primary' : 'hover:bg-gray-100'
            }`}
          title="Border"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
        </button>
        {showBorderOptions && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-20 w-48">
            <div className="mb-3">
              <label className="text-xs text-gray-500 block mb-1">Border Width</label>
              <div className="flex items-center gap-2">
                {[0, 1, 2, 3, 4].map((width) => (
                  <button
                    key={width}
                    onClick={() => {
                      if (element?.type === 'shape') {
                        onUpdate({ strokeWidth: width, borderWidth: width })
                      } else {
                        onUpdate({ borderWidth: width })
                      }
                    }}
                    className={`w-8 h-8 flex items-center justify-center rounded border ${borderWidth === width ? 'border-primary bg-primary/10' : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    {width === 0 ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="4" y1="4" x2="20" y2="20" />
                      </svg>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-4 border-t border-gray-800" style={{ borderWidth: width }} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-3">
              <label className="text-xs text-gray-500 block mb-1">Border Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={borderColor}
                  onChange={(e) => {
                    const val = e.target.value
                    if (element?.type === 'shape') {
                      onUpdate({ strokeColor: val, borderColor: val })
                    } else {
                      onUpdate({ borderColor: val })
                    }
                  }}
                  className="w-8 h-8 cursor-pointer border border-gray-200 rounded"
                />
                <span className="text-xs text-gray-600">{borderColor}</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Border Radius</label>
              <input
                type="range"
                min="0"
                max="20"
                value={element?.borderRadius || 0}
                onChange={(e) => onUpdate({ borderRadius: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* Background Color */}
      <button
        onClick={() => {
          const current = element?.backgroundColor || 'transparent'
          const newBg = current === 'transparent' ? '#f5f5f5' : 'transparent'
          onUpdate({ backgroundColor: newBg })
        }}
        className={`w-8 h-8 flex items-center justify-center rounded transition-all ${element?.backgroundColor && element.backgroundColor !== 'transparent' ? 'bg-primary/10 text-primary ring-1 ring-primary' : 'hover:bg-gray-100'
          }`}
        title="Background fill"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10" />
        </svg>
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {/* Animation Button */}
      <div className="relative" ref={animationDropdownRef}>
        <button
          onClick={() => setShowAnimationDropdown(!showAnimationDropdown)}
          className={`h-8 px-2 flex items-center gap-1.5 rounded transition-all text-sm ${currentAnimation !== 'none' ? 'bg-primary/10 text-primary ring-1 ring-primary' : 'hover:bg-gray-100 text-gray-600'
            }`}
          title="Animation"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span className="text-xs">{currentAnimation !== 'none' ? BASIC_ANIMATIONS.find(a => a.key === currentAnimation)?.name || 'Anim' : 'Animate'}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {showAnimationDropdown && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20 min-w-[130px]">
            {BASIC_ANIMATIONS.map((anim) => (
              <button
                key={anim.key}
                onClick={() => {
                  if (onAnimationChange) {
                    onAnimationChange({ type: anim.key, duration: anim.key === 'none' ? 0 : 500 })
                  }
                  setShowAnimationDropdown(false)
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${currentAnimation === anim.key ? 'text-primary bg-primary/5' : 'text-gray-700'
                  }`}
              >
                {currentAnimation === anim.key && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                <span className={currentAnimation === anim.key ? '' : 'ml-5'}>{anim.name}</span>
              </button>
            ))}

            <div className="h-px bg-gray-100 my-1" />

            <div className="px-3 py-2">
              <p className="text-[11px] text-gray-500 mb-2">Speed</p>
              <div className="flex items-center gap-1">
                {SPEED_OPTIONS.map((speed) => (
                  <button
                    key={speed.key}
                    onClick={() => {
                      if (onAnimationChange && currentAnimation !== 'none') {
                        onAnimationChange({ type: currentAnimation, duration: speed.duration })
                      }
                    }}
                    className={`flex-1 px-2 py-1 text-[11px] rounded border transition-all ${currentDuration === speed.duration && currentAnimation !== 'none'
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    {speed.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TextToolbar
