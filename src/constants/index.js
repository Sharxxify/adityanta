// Application-wide constants

// Color Palettes
export const COLORS = {
  text: {
    primary: '#1a1a1a',
    secondary: '#666666',
    tertiary: '#999999',
    white: '#ffffff',
  },
  palette: [
    '#1a1a1a', '#666666', '#999999', '#ffffff',
    '#ef4444', '#f97316', '#f59e0b', '#eab308',
    '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
    '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#fb923c', '#fbbf24', '#facc15',
  ],
}

// Font Options
export const FONTS = [
  // Sans-Serif
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
  'Source Sans Pro', 'Raleway', 'PT Sans', 'Ubuntu', 'Nunito',
  'Poppins', 'Mukta', 'Work Sans', 'Quicksand', 'Karla',
  // Serif
  'Merriweather', 'Playfair Display', 'Lora', 'PT Serif', 'Crimson Text',
  'Libre Baskerville', 'Bitter', 'Arvo', 'Cardo', 'Neuton',
  // Monospace
  'Roboto Mono', 'Source Code Pro', 'Fira Code', 'IBM Plex Mono', 'JetBrains Mono',
  'Courier Prime', 'Space Mono', 'Inconsolata', 'PT Mono', 'Ubuntu Mono',
  // Display/Handwriting
  'Pacifico', 'Dancing Script', 'Lobster', 'Shadows Into Light', 'Satisfy',
  'Indie Flower', 'Permanent Marker', 'Amatic SC', 'Caveat', 'Kalam',
  // Condensed
  'Roboto Condensed', 'Oswald', 'Fjalla One', 'Abel', 'Pathway Gothic One',
  'Francois One', 'Asap Condensed', 'Yanone Kaffeesatz', 'Archivo Narrow', 'Saira Condensed',
  // Rounded/Friendly
  'Nunito Sans', 'Comfortaa', 'Varela Round', 'Rounded', 'M PLUS Rounded 1c',
  'Baloo 2', 'Quicksand', 'Fredoka One', 'Righteous', 'Signika',
  // Professional
  'Noto Sans', 'IBM Plex Sans', 'Red Hat Display', 'DM Sans', 'Manrope',
  'Plus Jakarta Sans', 'Outfit', 'Space Grotesk', 'Urbanist', 'Sora',
  // Stylish
  'Bebas Neue', 'Anton', 'Alfa Slab One', 'Abril Fatface', 'Cinzel',
  'Playfair Display SC', 'Righteous', 'Bungee', 'Press Start 2P', 'Orbitron',
]

// Font Sizes
export const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 56, 64, 72, 96]

// Border Widths
export const BORDER_WIDTHS = [0, 1, 2, 3, 4, 5, 6, 8, 10]

// Border Radius Options
export const BORDER_RADIUS = [0, 2, 4, 8, 12, 16, 24, 32, 9999]

// Opacity Options
export const OPACITY_OPTIONS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]

// Keyboard Shortcuts
export const KEYBOARD_SHORTCUTS = [
  {
    category: 'General',
    shortcuts: [
      { description: 'Show shortcuts', keys: ['?'] },
      { description: 'Show shortcuts', keys: ['F1'] },
      { description: 'Save presentation', keys: ['Ctrl', 'S'] },
      { description: 'Start presentation', keys: ['F5'] },
      { description: 'Exit presentation', keys: ['Esc'] },
    ]
  },
  {
    category: 'Edit',
    shortcuts: [
      { description: 'Undo', keys: ['Ctrl', 'Z'] },
      { description: 'Redo', keys: ['Ctrl', 'Y'] },
      { description: 'Copy element', keys: ['Ctrl', 'C'] },
      { description: 'Paste element', keys: ['Ctrl', 'V'] },
      { description: 'Delete element', keys: ['Delete'] },
      { description: 'Duplicate element', keys: ['Ctrl', 'D'] },
    ]
  },
  {
    category: 'Navigation',
    shortcuts: [
      { description: 'Next slide', keys: ['→'] },
      { description: 'Previous slide', keys: ['←'] },
      { description: 'First slide', keys: ['Home'] },
      { description: 'Last slide', keys: ['End'] },
    ]
  },
  {
    category: 'Zoom',
    shortcuts: [
      { description: 'Zoom in', keys: ['Ctrl', '+'] },
      { description: 'Zoom out', keys: ['Ctrl', '-'] },
      { description: 'Reset zoom', keys: ['Ctrl', '0'] },
    ]
  },
]

// Animation Presets
export const ANIMATION_PRESETS = {
  none: { name: 'None', duration: 0 },
  // Entrance animations
  fadeIn: { name: 'Fade In', duration: 500, keyframes: 'fadeIn' },
  slideInLeft: { name: 'Slide In Left', duration: 500, keyframes: 'slideInLeft' },
  slideInRight: { name: 'Slide In Right', duration: 500, keyframes: 'slideInRight' },
  slideInUp: { name: 'Slide In Up', duration: 500, keyframes: 'slideInUp' },
  slideInDown: { name: 'Slide In Down', duration: 500, keyframes: 'slideInDown' },
  zoomIn: { name: 'Zoom In', duration: 500, keyframes: 'zoomIn' },
  bounceIn: { name: 'Bounce In', duration: 700, keyframes: 'bounceIn' },
  rotateIn: { name: 'Rotate In', duration: 500, keyframes: 'rotateIn' },
  flipInX: { name: 'Flip In Horizontal', duration: 600, keyframes: 'flipInX' },
  flipInY: { name: 'Flip In Vertical', duration: 600, keyframes: 'flipInY' },
  lightSpeedIn: { name: 'Light Speed In', duration: 500, keyframes: 'lightSpeedIn' },
  rollIn: { name: 'Roll In', duration: 600, keyframes: 'rollIn' },
  // Exit animations
  fadeOut: { name: 'Fade Out', duration: 500, keyframes: 'fadeOut' },
  zoomOut: { name: 'Zoom Out', duration: 500, keyframes: 'zoomOut' },
  slideOutLeft: { name: 'Slide Out Left', duration: 500, keyframes: 'slideOutLeft' },
  slideOutRight: { name: 'Slide Out Right', duration: 500, keyframes: 'slideOutRight' },
  // Emphasis animations
  pulse: { name: 'Pulse', duration: 500, keyframes: 'pulse' },
  shake: { name: 'Shake', duration: 500, keyframes: 'shake' },
  swing: { name: 'Swing', duration: 600, keyframes: 'swing' },
  tada: { name: 'Tada', duration: 700, keyframes: 'tada' },
  wobble: { name: 'Wobble', duration: 700, keyframes: 'wobble' },
  heartBeat: { name: 'Heart Beat', duration: 800, keyframes: 'heartBeat' },
  rubberBand: { name: 'Rubber Band', duration: 600, keyframes: 'rubberBand' },
}

// Transition Presets for Slides
export const SLIDE_TRANSITIONS = {
  none: 'None',
  fade: 'Fade',
  slide: 'Slide',
  zoom: 'Zoom',
  flip: 'Flip',
  cube: 'Cube',
}

// Template Topics
export const TOPICS = ['All', 'Science', 'Math', 'History', 'Geography', 'Art', 'Music']

// License Types
export const LICENSES = ['All', 'FREE', 'PAID']

// Sort Options
export const SORT_OPTIONS = ['New → Old', 'Old → New', 'Most Popular', 'Alphabetical']
