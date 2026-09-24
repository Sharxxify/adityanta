// SlideThumbnail — a 16:9 box that draws the real slide (shared renderer)
// scaled to whatever width its container gives it.

import { memo, useEffect, useRef, useState } from 'react'
import SlideView from './SlideView'

export const useElementWidth = () => {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setWidth(Math.round(el.getBoundingClientRect().width * 100) / 100))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => { cancelAnimationFrame(raf); observer.disconnect() }
  }, [])
  return [ref, width]
}

function SlideThumbnailImpl({ frame, editorBackground = null, header = null, className = '', style }) {
  const [ref, width] = useElementWidth()
  return (
    <div
      ref={ref}
      className={`relative w-full min-w-0 aspect-[16/9] overflow-hidden pointer-events-none select-none ${className}`}
      style={style}
    >
      {width > 0 && frame && (
        <div className="absolute inset-0">
          <SlideView frame={frame} width={width} header={header} editorBackground={editorBackground} mode="export" />
        </div>
      )}
    </div>
  )
}

export const SlideThumbnail = memo(SlideThumbnailImpl)
export default SlideThumbnail
