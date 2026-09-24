// Export utilities: PDF, PowerPoint (utils/pptxExport), PNG and JSON.
// Video export lives in utils/videoExport.js.
import logger from './logger'
import { renderSlideToCanvas, SLIDE_HEIGHT, SLIDE_WIDTH } from '../components/Slide/rasterize'
import { framesForExport } from './exportFrames'

export const safeFileName = (name, fallback) => (String(name || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || fallback)

// Every export draws slides with the shared renderer (same as the editor)
const renderFrameToCanvas = (frame, opts = {}) => renderSlideToCanvas(frame, opts)

// Convert frames to PDF. Each slide is rendered by the shared renderer at 2x
// and embedded as a high-quality JPEG (a PNG page was ~15 MB; JPEG ~0.4 MB).
// The project header becomes an opening title slide (see exportFrames.js).
export const exportToPDF = async (deckFrames, projectTitle, header = null, editorBackground = null) => {
  const frames = framesForExport(deckFrames, header)
  try {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [SLIDE_WIDTH, SLIDE_HEIGHT], compress: true })

    for (let i = 0; i < frames.length; i++) {
      const canvas = await renderFrameToCanvas(frames[i], { width: SLIDE_WIDTH, height: SLIDE_HEIGHT, scale: 2, editorBackground })
      if (i > 0) pdf.addPage([SLIDE_WIDTH, SLIDE_HEIGHT], 'landscape')
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT, undefined, 'FAST')
    }

    pdf.save(`${safeFileName(projectTitle, 'presentation')}.pdf`)
    return true
  } catch (error) {
    logger.error('PDF export failed:', error)
    return exportSimplePDF(frames, projectTitle)
  }
}

const exportSimplePDF = async (frames, projectTitle) => {
  try {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()

    frames.forEach((frame, index) => {
      if (index > 0) pdf.addPage()
      pdf.setFillColor(frame.backgroundColor || '#ffffff')
      pdf.rect(0, 0, pageWidth, pageHeight, 'F')
      pdf.setFontSize(10)
      pdf.setTextColor('#999999')
      pdf.text(`Slide ${index + 1}`, 20, pageHeight - 20)

      frame.elements?.forEach((element) => {
        if (element.type !== 'text') return
        pdf.setFontSize(element.fontSize * 0.75 || 18)
        pdf.setTextColor(element.color || '#000000')
        const x = ((element.x || 0) / SLIDE_WIDTH) * pageWidth
        const y = ((element.y || 0) / SLIDE_HEIGHT) * pageHeight + 30
        const cleanContent = String(element.content || '').replace(/<[^>]*>/g, '')
        cleanContent.split('\n').forEach((line, lineIndex) => {
          pdf.text(line, x, y + (lineIndex * (element.fontSize || 18) * 0.75))
        })
      })
    })

    pdf.save(`${projectTitle || 'presentation'}.pdf`)
    return true
  } catch (error) {
    logger.error('Simple PDF export failed:', error)
    return false
  }
}

/**
 * Editable PowerPoint export: text, shapes, tables, charts, pictures and media
 * become native PowerPoint objects (see utils/pptxExport).
 * @returns {Promise<{ ok: boolean, warnings: string[] }>}
 */
export const exportToPPTX = async (frames, projectTitle, header = null, editorBackground = null, { onProgress } = {}) => {
  try {
    const { buildPptx, downloadBlob: save } = await import('./pptxExport')
    const { blob, warnings } = await buildPptx(framesForExport(frames, header), projectTitle, { editorBackground, onProgress })
    save(blob, `${safeFileName(projectTitle, 'presentation')}.pptx`)
    warnings.forEach((w) => logger.warn('PPTX export:', w))
    return { ok: true, warnings }
  } catch (error) {
    logger.error('PPTX export failed:', error)
    return { ok: false, warnings: [] }
  }
}
// Download blob helper
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

// Export all slides as PNG images (downloads as ZIP)
export const exportToPNG = async (deckFrames, projectTitle, header = null, editorBackground = null) => {
  const frames = framesForExport(deckFrames, header)
  try {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const folder = zip.folder(projectTitle || 'slides')

    for (let i = 0; i < frames.length; i++) {
      const canvas = await renderFrameToCanvas(frames[i], { width: 1920, height: 1080, scale: 1, editorBackground })
      folder.file(`slide_${String(i + 1).padStart(2, '0')}.png`, canvas.toDataURL('image/png').split(',')[1], { base64: true })
    }

    const content = await zip.generateAsync({ type: 'blob' })
    downloadBlob(content, `${projectTitle || 'slides'}_images.zip`)
    return true
  } catch (error) {
    logger.error('PNG export failed:', error)
    return exportSinglePNG(frames, projectTitle)
  }
}

const exportSinglePNG = async (frames, projectTitle) => {
  try {
    const canvas = await renderFrameToCanvas(frames[0], { width: 1920, height: 1080, scale: 1 })
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `${projectTitle || 'slide'}.png`
    link.click()
    return true
  } catch (error) {
    logger.error('Single PNG export failed:', error)
    return false
  }
}
// Export as JSON (for backup/sharing)
export const exportToJSON = (frames, projectTitle) => {
  const data = {
    title: projectTitle,
    frames,
    exportedAt: new Date().toISOString(),
    version: '1.0'
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${projectTitle || 'presentation'}.json`
  a.click()
  URL.revokeObjectURL(url)
  return true
}

// Import from JSON
export const importFromJSON = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        resolve(data)
      } catch (error) {
        reject(new Error('Invalid JSON file'))
      }
    }
    reader.onerror = reject
    reader.readAsText(file)
  })
}
