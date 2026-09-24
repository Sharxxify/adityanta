// SlideView — renders one whole slide (background + elements [+ header]).
// Used for presentation mode, thumbnails, the share page and exports.

import { memo } from 'react'
import ElementView, { getElementBoxStyle } from './ElementView'
import { fontStack } from './fonts'
import { displayBackground } from '../../utils/backgrounds'

export const SLIDE_WIDTH = 1280
export const SLIDE_HEIGHT = 720

const isCssGradient = (v) => typeof v === 'string' && /gradient\(/i.test(v)

/**
 * Background CSS for a frame.
 * mode 'export' paints the project background image into the slide itself;
 * 'canvas' leaves it transparent so the editor/presentation world shows through.
 */
export const getFrameBackgroundStyle = (frame, { editorBackground: projectBackground = null, mode = 'canvas' } = {}) => {
  const editorBackground = displayBackground(projectBackground)
  const color = frame?.backgroundColor
  const hasColor = color && color !== 'transparent'
  if (frame?.backgroundImage) {
    return {
      backgroundColor: hasColor && !isCssGradient(color) ? color : undefined,
      backgroundImage: `url("${displayBackground(frame.backgroundImage)}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }
  }
  if (hasColor) return isCssGradient(color) ? { backgroundImage: color } : { backgroundColor: color }
  if (editorBackground) {
    return mode === 'export'
      ? { backgroundImage: `url("${editorBackground}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { backgroundColor: 'transparent' }
  }
  return { backgroundColor: '#ffffff' }
}

export const HeaderOverlay = ({ header }) => {
  if (!header || !header.content || header.isPlaceholder) return null
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        padding: '20px 32px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: header.textAlign === 'right' ? 'flex-end' : header.textAlign === 'left' ? 'flex-start' : 'center',
        zIndex: 999,
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          fontSize: header.fontSize || 48,
          fontFamily: fontStack(header.fontFamily || 'Inter'),
          fontWeight: header.fontWeight || 'bold',
          fontStyle: header.fontStyle || 'normal',
          textDecoration: header.textDecoration || 'none',
          color: header.color || '#1a1a1a',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}
      >
        {header.content}
      </span>
    </div>
  )
}

/** Absolutely positioned element box + shared content renderer */
export const SlideElement = memo(function SlideElement({ element, interactive, className, style, children }) {
  return (
    <div className={className} style={{ ...getElementBoxStyle(element), ...style }} data-element-id={element.id}>
      <ElementView element={element} interactive={interactive} />
      {children}
    </div>
  )
})

/**
 * @param {object} props
 * @param {object} props.frame
 * @param {number} [props.width]  rendered width in px (default 1280)
 * @param {number} [props.height] rendered height (default keeps 16:9)
 * @param {'canvas'|'export'} [props.mode]
 * @param {boolean} [props.showPlaceholders]
 * @param {boolean} [props.interactive]
 * @param {Function} [props.getElementProps] (el, index) => { className, style }
 */
function SlideViewImpl({
  frame,
  header = null,
  editorBackground = null,
  width = SLIDE_WIDTH,
  height,
  mode = 'canvas',
  showPlaceholders = false,
  interactive = false,
  showBackground = true,
  getElementProps,
  className,
  style,
  children,
}) {
  const outerH = height ?? (width * SLIDE_HEIGHT) / SLIDE_WIDTH
  const scale = Math.min(width / SLIDE_WIDTH, outerH / SLIDE_HEIGHT)
  const offsetX = (width - SLIDE_WIDTH * scale) / 2
  const offsetY = (outerH - SLIDE_HEIGHT * scale) / 2
  const elements = frame?.elements || []

  return (
    <div
      className={className}
      style={{ position: 'relative', width, height: outerH, overflow: 'hidden', ...style }}
    >
      <div
        style={{
          position: 'absolute',
          left: offsetX,
          top: offsetY,
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top left',
          overflow: 'hidden',
          ...(showBackground ? getFrameBackgroundStyle(frame, { editorBackground, mode }) : null),
        }}
      >
        {elements.map((el, i) => {
          if (!el || (el.isPlaceholder && !showPlaceholders) || el.hidden) return null
          const extra = getElementProps ? getElementProps(el, i) : null
          return (
            <SlideElement
              key={el.id ?? i}
              element={el}
              interactive={interactive}
              className={extra?.className}
              style={extra?.style}
            />
          )
        })}
        <HeaderOverlay header={header} />
        {children}
      </div>
    </div>
  )
}

export const SlideView = memo(SlideViewImpl)
export default SlideView
