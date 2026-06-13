// Export utilities for PDF, PPT, and MP4 generation
import logger from './logger'
import { buildSlideRenderNode, SLIDE_HEIGHT, SLIDE_WIDTH } from './slideRender'

let html2canvasPromise = null
const getHtml2Canvas = async () => {
  if (!html2canvasPromise) {
    html2canvasPromise = import('html2canvas').then((module) => module.default)
  }
  return html2canvasPromise
}

const renderFrameToCanvas = async (frame, { width = SLIDE_WIDTH, height = SLIDE_HEIGHT, scale = 2 } = {}) => {
  const html2canvas = await getHtml2Canvas()
  const wrapper = document.createElement('div')
  wrapper.style.position = 'fixed'
  wrapper.style.left = '-10000px'
  wrapper.style.top = '0'
  wrapper.style.pointerEvents = 'none'
  wrapper.style.zIndex = '-1'

  const root = buildSlideRenderNode(frame, { width, height })
  wrapper.appendChild(root)
  document.body.appendChild(wrapper)

  try {
    return await html2canvas(root, {
      width,
      height,
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
      imageTimeout: 0
    })
  } finally {
    document.body.removeChild(wrapper)
  }
}

// Convert frames to PDF using html2canvas and jsPDF
export const exportToPDF = async (frames, projectTitle, header = null) => {
  try {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [SLIDE_WIDTH, SLIDE_HEIGHT] })

    for (let i = 0; i < frames.length; i++) {
      const canvas = await renderFrameToCanvas(frames[i], { width: SLIDE_WIDTH, height: SLIDE_HEIGHT, scale: 2, header })
      if (i > 0) pdf.addPage([SLIDE_WIDTH, SLIDE_HEIGHT], 'landscape')
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)
    }

    pdf.save(`${projectTitle || 'presentation'}.pdf`)
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

// Export to PPTX using rendered slide images to preserve layout fidelity
export const exportToPPTX = async (frames, projectTitle, header = null) => {
  try {
    const PptxGenJS = (await import('pptxgenjs')).default
    const pptx = new PptxGenJS()
    pptx.author = 'Adityanta'
    pptx.title = projectTitle || 'Presentation'
    pptx.subject = 'Created with Adityanta Slide Builder'
    pptx.defineLayout({ name: 'CUSTOM', width: 10, height: 5.625 })
    pptx.layout = 'CUSTOM'

    for (const frame of frames) {
      const slide = pptx.addSlide()
      const canvas = await renderFrameToCanvas(frame, { width: 1920, height: 1080, scale: 1, header })
      slide.addImage({ data: canvas.toDataURL('image/png'), x: 0, y: 0, w: 10, h: 5.625 })
      if (frame.notes) slide.addNotes(frame.notes)
    }

    await pptx.writeFile({ fileName: `${projectTitle || 'presentation'}.pptx` })
    return true
  } catch (error) {
    logger.error('PPTX export failed:', error)
    return false
  }
}
// Detect video format capabilities based on browser/device
export const detectVideoCapabilities = () => {
  const capabilities = {
    canExportMP4: false,
    canExportWebM: false,
    canExportWebM_VP8: false,
    canExportWebM_VP9: false,
    recommendedFormat: 'webm',
    mediaRecorderSupported: typeof window.MediaRecorder !== 'undefined',
    sharedArrayBufferAvailable: typeof SharedArrayBuffer !== 'undefined',
    isMobile: /iPhone|iPad|Android|Mobile/.test(navigator.userAgent),
    isSafari: /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent),
  }

  // Check WebM codecs
  if (capabilities.mediaRecorderSupported) {
    const mimeTypes = [
      { type: 'video/webm;codecs=vp8', name: 'webm_vp8' },
      { type: 'video/webm;codecs=vp9', name: 'webm_vp9' },
      { type: 'video/webm', name: 'webm' }
    ]

    mimeTypes.forEach(({ type, name }) => {
      if (window.MediaRecorder.isTypeSupported(type)) {
        capabilities.canExportWebM = true
        if (name === 'webm_vp8') capabilities.canExportWebM_VP8 = true
        if (name === 'webm_vp9') capabilities.canExportWebM_VP9 = true
      }
    })
  }

  // MP4 is possible on desktop with FFmpeg + SharedArrayBuffer
  if (!capabilities.isMobile && !capabilities.isSafari && capabilities.sharedArrayBufferAvailable) {
    capabilities.canExportMP4 = true
    capabilities.recommendedFormat = 'mp4'
  } else if (capabilities.canExportWebM) {
    capabilities.recommendedFormat = 'webm'
  }

  return capabilities
}

// Universal MP4 Export - Works on ALL devices/browsers
// 1. Records video as WebM on client
// 2. Sends to backend for MP4 conversion (if backend available)
// 3. Falls back to client-side FFmpeg.wasm
// 4. Final fallback: WebM download
export const exportToMP4Universal = async (frames, projectTitle, options = {}, onProgress = null, header = null) => {
  try {
    // Step 1: Record WebM video with 2-minute timeout
    onProgress?.({ stage: 'recording', progress: 0, message: 'Starting video recording...' })
    const webmBlob = await Promise.race([
      recordVideoAsWebM(frames, options, onProgress),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Video recording timeout - took too long')), 120000)
      )
    ])

    // Step 2: Try backend conversion first (UNIVERSAL - works for Safari, Mobile, etc)
    onProgress?.({ stage: 'converting', progress: 50, message: 'Sending for MP4 conversion...' })
    try {
      const { templateAPI } = await import('../services/api.js')
      const mp4Blob = await Promise.race([
        templateAPI.convertToMP4(webmBlob, `${projectTitle}.webm`),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('MP4 conversion timeout - server taking too long')), 300000)
        )
      ])

      onProgress?.({ stage: 'complete', progress: 100, message: 'Download starting...' })
      downloadBlob(mp4Blob, `${projectTitle || 'presentation'}.mp4`)
      return true
    } catch (backendError) {
      console.warn('Backend MP4 conversion not available:', backendError)
    }

    // Step 3: Try client-side FFmpeg conversion with 3-minute timeout
    const capabilities = detectVideoCapabilities()
    if (!capabilities.isMobile && capabilities.sharedArrayBufferAvailable) {
      onProgress?.({ stage: 'converting', progress: 50, message: 'Converting to MP4 format...' })
      try {
        const mp4Blob = await Promise.race([
          convertWebMToMP4(webmBlob, onProgress),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('FFmpeg conversion timeout - took too long')), 180000)
          )
        ])
        onProgress?.({ stage: 'complete', progress: 100, message: 'Download starting...' })
        downloadBlob(mp4Blob, `${projectTitle || 'presentation'}.mp4`)
        return true
      } catch (ffmpegError) {
        console.warn('Client-side MP4 conversion failed:', ffmpegError)
      }
    }

    // Step 4: Fallback to WebM
    onProgress?.({ stage: 'complete', progress: 100, message: 'Download starting...' })
    downloadBlob(webmBlob, `${projectTitle || 'presentation'}.webm`)
    return true
  } catch (error) {
    logger.error('Universal MP4 export failed:', error)
    return false
  }
}

// Record video as WebM
const recordVideoAsWebM = async (frames, options = {}, onProgress = null) => {
  const {
    fps = 30,
    slideDuration = 3000,
    transitionDuration = 500,
    scrollDirection = 'vertical'
  } = options

  if (!window.MediaRecorder) {
    throw new Error('MediaRecorder not supported')
  }

  const canvas = document.createElement('canvas')
  canvas.width = 1920
  canvas.height = 1080
  const ctx = canvas.getContext('2d')

  const stream = canvas.captureStream(fps)

  const mimeTypes = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9',
    'video/webm'
  ]

  let selectedMimeType = 'video/webm'
  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      selectedMimeType = mimeType
      break
    }
  }

  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: selectedMimeType,
    videoBitsPerSecond: 5000000
  })

  const chunks = []
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  return new Promise((resolve, reject) => {
    mediaRecorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'video/webm' }))
    }
    mediaRecorder.onerror = reject

    mediaRecorder.start()

    let startTime = Date.now()
    const totalDuration = frames.length * (slideDuration + transitionDuration)

    const renderFrame = async () => {
      const elapsed = Date.now() - startTime
      const totalSlideTime = slideDuration + transitionDuration
      const frameIndex = Math.floor(elapsed / totalSlideTime)
      const frameProgress = (elapsed % totalSlideTime) / totalSlideTime

      const recordingProgress = Math.min((elapsed / totalDuration) * 50, 50)
      onProgress?.({ stage: 'recording', progress: recordingProgress, message: `Recording slide ${frameIndex + 1}/${frames.length}...` })

      if (frameIndex >= frames.length) {
        mediaRecorder.stop()
        return
      }

      ctx.fillStyle = frames[frameIndex].backgroundColor || '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const inTransition = frameProgress > (slideDuration / totalSlideTime)

      if (inTransition && frameIndex < frames.length - 1) {
        const transitionProgress = (frameProgress - slideDuration / totalSlideTime) / (transitionDuration / totalSlideTime)

        ctx.save()
        if (scrollDirection === 'vertical') {
          ctx.translate(0, -transitionProgress * canvas.height)
        } else {
          ctx.translate(-transitionProgress * canvas.width, 0)
        }
        await renderSlide(ctx, frames[frameIndex], canvas.width, canvas.height)
        ctx.restore()

        ctx.save()
        if (scrollDirection === 'vertical') {
          ctx.translate(0, canvas.height - transitionProgress * canvas.height)
        } else {
          ctx.translate(canvas.width - transitionProgress * canvas.width, 0)
        }
        await renderSlide(ctx, frames[frameIndex + 1], canvas.width, canvas.height)
        ctx.restore()
      } else {
        await renderSlide(ctx, frames[frameIndex], canvas.width, canvas.height)
      }

      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fillRect(canvas.width - 80, canvas.height - 40, 70, 30)
      ctx.fillStyle = '#ffffff'
      ctx.font = '14px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(`${frameIndex + 1}/${frames.length}`, canvas.width - 45, canvas.height - 20)

      requestAnimationFrame(renderFrame)
    }

    renderFrame()
  })
}

// Download blob helper
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Export to MP4 video with vertical scroll transitions
export const exportToMP4 = async (frames, projectTitle, options = {}, onProgress = null, header = null) => {
  const {
    fps = 30,
    slideDuration = 3000, // 3 seconds per slide
    transitionDuration = 500, // 0.5 second transition
    scrollDirection = 'vertical' // vertical or horizontal
  } = options

  try {
    // Check for MediaRecorder support
    if (!window.MediaRecorder) {
      throw new Error('MediaRecorder not supported')
    }

    onProgress?.({ stage: 'recording', progress: 0, message: 'Starting video recording...' })

    // Create a canvas for rendering
    const canvas = document.createElement('canvas')
    canvas.width = 1920
    canvas.height = 1080
    const ctx = canvas.getContext('2d')

    // Create video stream - use VP8 for better compatibility
    const stream = canvas.captureStream(fps)

    // Try different mimeTypes for better compatibility
    const mimeTypes = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm;codecs=vp9',
      'video/webm'
    ]

    let selectedMimeType = 'video/webm'
    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        selectedMimeType = mimeType
        break
      }
    }

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: selectedMimeType,
      videoBitsPerSecond: 5000000
    })

    const chunks = []
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data)
      }
    }

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = async () => {
        const webmBlob = new Blob(chunks, { type: 'video/webm' })

        // Check if SharedArrayBuffer is available (required for FFmpeg.wasm)
        const canUseFFmpeg = typeof SharedArrayBuffer !== 'undefined'

        if (canUseFFmpeg) {
          onProgress?.({ stage: 'converting', progress: 50, message: 'Converting to MP4 format...' })

          try {
            // Convert WebM to MP4 using FFmpeg.wasm
            const mp4Blob = await convertWebMToMP4(webmBlob, onProgress)

            onProgress?.({ stage: 'complete', progress: 100, message: 'Download starting...' })

            const url = URL.createObjectURL(mp4Blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${projectTitle || 'presentation'}.mp4`
            a.click()
            URL.revokeObjectURL(url)
            resolve(true)
            return
          } catch (conversionError) {
            console.warn('MP4 conversion failed, falling back to WebM:', conversionError)
          }
        }

        // Fallback: download as WebM directly
        onProgress?.({ stage: 'complete', progress: 100, message: 'Download starting...' })
        const url = URL.createObjectURL(webmBlob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${projectTitle || 'presentation'}.webm`
        a.click()
        URL.revokeObjectURL(url)
        resolve(true)
      }

      mediaRecorder.onerror = (e) => {
        reject(e)
      }

      mediaRecorder.start()

      // Render frames with transitions
      let startTime = Date.now()
      const totalDuration = frames.length * (slideDuration + transitionDuration)

      const renderFrame = async () => {
        const elapsed = Date.now() - startTime
        const totalSlideTime = slideDuration + transitionDuration
        const frameIndex = Math.floor(elapsed / totalSlideTime)
        const frameProgress = (elapsed % totalSlideTime) / totalSlideTime

        // Update progress
        const recordingProgress = Math.min((elapsed / totalDuration) * 50, 50)
        onProgress?.({ stage: 'recording', progress: recordingProgress, message: `Recording slide ${frameIndex + 1}/${frames.length}...` })

        if (frameIndex >= frames.length) {
          mediaRecorder.stop()
          return
        }

        // Clear canvas
        ctx.fillStyle = frames[frameIndex].backgroundColor || '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // Calculate transition
        const inTransition = frameProgress > (slideDuration / totalSlideTime)

        if (inTransition && frameIndex < frames.length - 1) {
          const transitionProgress = (frameProgress - slideDuration / totalSlideTime) / (transitionDuration / totalSlideTime)

          // Render current frame scrolling out
          ctx.save()
          if (scrollDirection === 'vertical') {
            ctx.translate(0, -transitionProgress * canvas.height)
          } else {
            ctx.translate(-transitionProgress * canvas.width, 0)
          }
          await renderSlide(ctx, frames[frameIndex], canvas.width, canvas.height)
          ctx.restore()

          // Render next frame scrolling in
          ctx.save()
          if (scrollDirection === 'vertical') {
            ctx.translate(0, canvas.height - transitionProgress * canvas.height)
          } else {
            ctx.translate(canvas.width - transitionProgress * canvas.width, 0)
          }
          await renderSlide(ctx, frames[frameIndex + 1], canvas.width, canvas.height)
          ctx.restore()
        } else {
          await renderSlide(ctx, frames[frameIndex], canvas.width, canvas.height)
        }

        // Add slide indicator
        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.fillRect(canvas.width - 80, canvas.height - 40, 70, 30)
        ctx.fillStyle = '#ffffff'
        ctx.font = '14px Arial'
        ctx.textAlign = 'center'
        ctx.fillText(`${frameIndex + 1}/${frames.length}`, canvas.width - 45, canvas.height - 20)

        requestAnimationFrame(renderFrame)
      }

      renderFrame()
    })
  } catch (error) {
    logger.error('MP4 export failed:', error)
    return false
  }
}

// Convert WebM to MP4 using FFmpeg.wasm
const convertWebMToMP4 = async (webmBlob, onProgress = null) => {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg')
  const { fetchFile } = await import('@ffmpeg/util')

  const ffmpeg = new FFmpeg()

  // Set up progress logging
  ffmpeg.on('progress', ({ progress }) => {
    const conversionProgress = 50 + (progress * 50)
    onProgress?.({ stage: 'converting', progress: conversionProgress, message: `Converting: ${Math.round(progress * 100)}%` })
  })

  // Load FFmpeg
  onProgress?.({ stage: 'converting', progress: 50, message: 'Loading video converter...' })
  await ffmpeg.load({
    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
    wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
  })

  // Write input file
  const webmData = await fetchFile(webmBlob)
  await ffmpeg.writeFile('input.webm', webmData)

  // Convert to MP4 with H.264 codec (universal compatibility)
  onProgress?.({ stage: 'converting', progress: 60, message: 'Converting to MP4...' })
  await ffmpeg.exec([
    '-i', 'input.webm',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    'output.mp4'
  ])

  // Read output file
  const mp4Data = await ffmpeg.readFile('output.mp4')

  // Cleanup
  await ffmpeg.deleteFile('input.webm')
  await ffmpeg.deleteFile('output.mp4')

  return new Blob([mp4Data], { type: 'video/mp4' })
}

// Helper to render a slide to canvas
const renderSlide = async (ctx, frame, width, height) => {
  // Background
  ctx.fillStyle = frame.backgroundColor || '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // Scale factors
  const scaleX = width / 1280
  const scaleY = height / 720

  // Render elements
  for (const element of frame.elements || []) {
    const x = element.x * scaleX
    const y = element.y * scaleY
    const w = element.width * scaleX
    const h = element.height * scaleY

    switch (element.type) {
      case 'text':
        ctx.fillStyle = element.color || '#000000'
        ctx.font = `${element.fontStyle || 'normal'} ${element.fontWeight || 'normal'} ${Math.round(element.fontSize * scaleY)}px ${element.fontFamily || 'Arial'}`
        ctx.textAlign = element.textAlign || 'center'
        ctx.textBaseline = 'middle'

        const cleanContent = (element.content || '').replace(/<[^>]*>/g, '')
        const lines = cleanContent.split('\n')
        const lineHeight = element.fontSize * scaleY * 1.2
        lines.forEach((line, index) => {
          const textX = element.textAlign === 'left' ? x : element.textAlign === 'right' ? x + w : x + w / 2
          const textY = y + h / 2 + (index - (lines.length - 1) / 2) * lineHeight
          ctx.fillText(line, textX, textY)
        })
        break

      case 'shape':
        ctx.fillStyle = element.fill || '#4CAF50'
        if (element.shapeType === 'circle') {
          ctx.beginPath()
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
          ctx.fill()
        } else if (element.shapeType === 'triangle') {
          ctx.beginPath()
          ctx.moveTo(x + w / 2, y)
          ctx.lineTo(x, y + h)
          ctx.lineTo(x + w, y + h)
          ctx.closePath()
          ctx.fill()
        } else {
          ctx.fillRect(x, y, w, h)
        }
        break

      case 'image':
        try {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          await new Promise((resolve, reject) => {
            img.onload = resolve
            img.onerror = reject
            img.src = element.src
          })
          ctx.drawImage(img, x, y, w, h)
        } catch (e) {
          // Draw placeholder
          ctx.fillStyle = '#e0e0e0'
          ctx.fillRect(x, y, w, h)
        }
        break

      case 'icon': {
        const iconColor = element.iconColor || element.fill || '#333333'
        ctx.fillStyle = iconColor
        const iconR = Math.min(w, h * 0.6) / 2
        ctx.beginPath()
        ctx.ellipse(x + w / 2, y + h * 0.35, iconR, iconR, 0, 0, Math.PI * 2)
        ctx.fill()
        if (element.content && element.showLabel) {
          ctx.fillStyle = element.textColor || '#333333'
          ctx.font = `${Math.round((element.fontSize || 14) * scaleY)}px ${element.fontFamily || 'Arial'}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillText(element.content, x + w / 2, y + h * 0.72)
        }
        break
      }

      case 'table': {
        const rows = element.rows || 2
        const cols = element.cols || 2
        const cellW = w / cols
        const cellH = h / rows
        ctx.strokeStyle = '#9CA3AF'
        ctx.lineWidth = 1
        ctx.strokeRect(x, y, w, h)
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cx = x + c * cellW
            const cy = y + r * cellH
            ctx.strokeRect(cx, cy, cellW, cellH)
            const cellText = element.data?.[r]?.[c] || ''
            if (cellText) {
              ctx.fillStyle = '#000000'
              ctx.font = `${Math.round(12 * scaleY)}px Arial`
              ctx.textAlign = 'left'
              ctx.textBaseline = 'middle'
              ctx.fillText(cellText, cx + 4 * scaleX, cy + cellH / 2, cellW - 8 * scaleX)
            }
          }
        }
        break
      }
    }
  }
}

// Export all slides as PNG images (downloads as ZIP)
export const exportToPNG = async (frames, projectTitle, header = null) => {
  try {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const folder = zip.folder(projectTitle || 'slides')

    for (let i = 0; i < frames.length; i++) {
      const canvas = await renderFrameToCanvas(frames[i], { width: 1920, height: 1080, scale: 1 })
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
