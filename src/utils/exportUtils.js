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

      case 'shape': {
        const fill = element.fill || 'transparent'
        const stroke = element.strokeColor || '#333333'
        const strokeWidth = element.strokeWidth || 0
        const isDashed = element.borderStyle === 'dashed'

        ctx.save()
        ctx.fillStyle = fill
        ctx.strokeStyle = stroke
        ctx.lineWidth = strokeWidth
        if (isDashed) {
          ctx.setLineDash([5, 5])
        }

        const type = element.shapeType || 'rectangle'
        if (type === 'circle') {
          ctx.beginPath()
          ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'rectangle') {
          ctx.beginPath()
          const radius = element.borderRadius || 0
          if (radius > 0) {
            ctx.roundRect(x, y, w, h, radius)
          } else {
            ctx.rect(x, y, w, h)
          }
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'line') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.04, y + h / 2)
          ctx.lineTo(x + w * 0.96, y + h / 2)
          ctx.strokeStyle = element.fill || stroke
          ctx.lineWidth = strokeWidth || 2
          ctx.stroke()
        } else if (type === 'arrow') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.04, y + h / 2)
          ctx.lineTo(x + w * 0.78, y + h / 2)
          ctx.strokeStyle = element.fill || stroke
          ctx.lineWidth = strokeWidth || 2
          ctx.stroke()
          // Arrow head
          ctx.beginPath()
          ctx.moveTo(x + w * 0.78, y + h * 0.2)
          ctx.lineTo(x + w * 0.96, y + h / 2)
          ctx.lineTo(x + w * 0.78, y + h * 0.8)
          ctx.closePath()
          ctx.fillStyle = element.fill || stroke
          ctx.fill()
        } else if (type === 'doubleArrow') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.12, y + h / 2)
          ctx.lineTo(x + w * 0.88, y + h / 2)
          ctx.strokeStyle = element.strokeColor || element.fill || stroke
          ctx.lineWidth = strokeWidth || 2
          ctx.stroke()
          // Left head
          ctx.beginPath()
          ctx.moveTo(x + w * 0.28, y + h * 0.2)
          ctx.lineTo(x + w * 0.08, y + h / 2)
          ctx.lineTo(x + w * 0.28, y + h * 0.8)
          ctx.closePath()
          ctx.fillStyle = element.strokeColor || element.fill || stroke
          ctx.fill()
          // Right head
          ctx.beginPath()
          ctx.moveTo(x + w * 0.72, y + h * 0.2)
          ctx.lineTo(x + w * 0.92, y + h / 2)
          ctx.lineTo(x + w * 0.72, y + h * 0.8)
          ctx.closePath()
          ctx.fillStyle = element.strokeColor || element.fill || stroke
          ctx.fill()
        } else if (type === 'heart') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.5, y + h * 0.3)
          ctx.bezierCurveTo(x + w * 0.5, y + h * 0.1, x + w * 0.1, y + h * 0.1, x + w * 0.1, y + h * 0.4)
          ctx.bezierCurveTo(x + w * 0.1, y + h * 0.65, x + w * 0.5, y + h * 0.9, x + w * 0.5, y + h * 0.95)
          ctx.bezierCurveTo(x + w * 0.5, y + h * 0.9, x + w * 0.9, y + h * 0.65, x + w * 0.9, y + h * 0.4)
          ctx.bezierCurveTo(x + w * 0.9, y + h * 0.1, x + w * 0.5, y + h * 0.1, x + w * 0.5, y + h * 0.3)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'cloud') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.25, y + h * 0.6)
          ctx.bezierCurveTo(x + w * 0.1, y + h * 0.45, x + w * 0.2, y + h * 0.2, x + w * 0.35, y + h * 0.35)
          ctx.bezierCurveTo(x + w * 0.45, y + h * 0.15, x + w * 0.65, y + h * 0.15, x + w * 0.7, y + h * 0.35)
          ctx.bezierCurveTo(x + w * 0.85, y + h * 0.35, x + w * 0.9, y + h * 0.55, x + w * 0.8, y + h * 0.6)
          ctx.bezierCurveTo(x + w * 0.85, y + h * 0.75, x + w * 0.7, y + h * 0.8, x + w * 0.65, y + h * 0.8)
          ctx.lineTo(x + w * 0.25, y + h * 0.8)
          ctx.bezierCurveTo(x + w * 0.15, y + h * 0.8, x + w * 0.15, y + h * 0.65, x + w * 0.25, y + h * 0.6)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'semicircle') {
          ctx.beginPath()
          ctx.ellipse(x + w / 2, y + h, w / 2, h, 0, Math.PI, 0, false)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'cylinder') {
          ctx.beginPath()
          ctx.ellipse(x + w / 2, y + h * 0.2, w * 0.4, h * 0.1, 0, 0, Math.PI * 2)
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(x + w * 0.1, y + h * 0.2)
          ctx.lineTo(x + w * 0.1, y + h * 0.8)
          ctx.ellipse(x + w / 2, y + h * 0.8, w * 0.4, h * 0.1, 0, Math.PI, 0, true)
          ctx.lineTo(x + w * 0.9, y + h * 0.2)
          ctx.ellipse(x + w / 2, y + h * 0.2, w * 0.4, h * 0.1, 0, 0, Math.PI, true)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'shield') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.1, y + h * 0.1)
          ctx.lineTo(x + w * 0.9, y + h * 0.1)
          ctx.lineTo(x + w * 0.9, y + h * 0.5)
          ctx.quadraticCurveTo(x + w * 0.9, y + h * 0.85, x + w * 0.5, y + h * 0.95)
          ctx.quadraticCurveTo(x + w * 0.1, y + h * 0.85, x + w * 0.1, y + h * 0.5)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'waveFlag') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.1, y + h * 0.2)
          ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.1, x + w * 0.5, y + h * 0.2)
          ctx.quadraticCurveTo(x + w * 0.7, y + h * 0.3, x + w * 0.9, y + h * 0.2)
          ctx.lineTo(x + w * 0.9, y + h * 0.8)
          ctx.quadraticCurveTo(x + w * 0.7, y + h * 0.7, x + w * 0.5, y + h * 0.8)
          ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.9, x + w * 0.1, y + h * 0.8)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'folder') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.1, y + h * 0.2)
          ctx.lineTo(x + w * 0.4, y + h * 0.2)
          ctx.lineTo(x + w * 0.5, y + h * 0.3)
          ctx.lineTo(x + w * 0.9, y + h * 0.3)
          ctx.lineTo(x + w * 0.9, y + h * 0.8)
          ctx.lineTo(x + w * 0.1, y + h * 0.8)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'stickyNote') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.1, y + h * 0.1)
          ctx.lineTo(x + w * 0.9, y + h * 0.1)
          ctx.lineTo(x + w * 0.9, y + h * 0.7)
          ctx.lineTo(x + w * 0.7, y + h * 0.9)
          ctx.lineTo(x + w * 0.1, y + h * 0.9)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(x + w * 0.9, y + h * 0.7)
          ctx.lineTo(x + w * 0.7, y + h * 0.7)
          ctx.lineTo(x + w * 0.7, y + h * 0.9)
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'document') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.15, y + h * 0.1)
          ctx.lineTo(x + w * 0.7, y + h * 0.1)
          ctx.lineTo(x + w * 0.85, y + h * 0.25)
          ctx.lineTo(x + w * 0.85, y + h * 0.9)
          ctx.lineTo(x + w * 0.15, y + h * 0.9)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(x + w * 0.7, y + h * 0.1)
          ctx.lineTo(x + w * 0.7, y + h * 0.25)
          ctx.lineTo(x + w * 0.85, y + h * 0.25)
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'puzzle') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.2, y + h * 0.2)
          ctx.lineTo(x + w * 0.4, y + h * 0.2)
          ctx.bezierCurveTo(x + w * 0.4, y + h * 0.1, x + w * 0.6, y + h * 0.1, x + w * 0.6, y + h * 0.2)
          ctx.lineTo(x + w * 0.8, y + h * 0.2)
          ctx.lineTo(x + w * 0.8, y + h * 0.4)
          ctx.bezierCurveTo(x + w * 0.9, y + h * 0.4, x + w * 0.9, y + h * 0.6, x + w * 0.8, y + h * 0.6)
          ctx.lineTo(x + w * 0.8, y + h * 0.8)
          ctx.lineTo(x + w * 0.6, y + h * 0.8)
          ctx.bezierCurveTo(x + w * 0.6, y + h * 0.9, x + w * 0.4, y + h * 0.9, x + w * 0.4, y + h * 0.8)
          ctx.lineTo(x + w * 0.2, y + h * 0.8)
          ctx.lineTo(x + w * 0.2, y + h * 0.6)
          ctx.bezierCurveTo(x + w * 0.1, y + h * 0.6, x + w * 0.1, y + h * 0.4, x + w * 0.2, y + h * 0.4)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'crescent') {
          ctx.beginPath()
          ctx.ellipse(x + w * 0.45, y + h / 2, w * 0.35, h * 0.35, 0, -Math.PI * 0.4, Math.PI * 1.4, false)
          ctx.ellipse(x + w * 0.5, y + h / 2, w * 0.3, h * 0.3, 0, Math.PI * 1.4, -Math.PI * 0.4, true)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'teardrop') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.5, y + h * 0.1)
          ctx.bezierCurveTo(x + w * 0.9, y + h * 0.55, x + w * 0.9, y + h * 0.7, x + w * 0.5, y + h * 0.9)
          ctx.bezierCurveTo(x + w * 0.1, y + h * 0.7, x + w * 0.1, y + h * 0.55, x + w * 0.5, y + h * 0.1)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'ovalSpeech') {
          ctx.beginPath()
          ctx.ellipse(x + w / 2, y + h * 0.45, w * 0.45, h * 0.35, 0, 0, Math.PI * 2)
          ctx.moveTo(x + w * 0.35, y + h * 0.77)
          ctx.lineTo(x + w * 0.25, y + h * 0.95)
          ctx.lineTo(x + w * 0.48, y + h * 0.8)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'rectSpeech') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.1, y + h * 0.1)
          ctx.lineTo(x + w * 0.9, y + h * 0.1)
          ctx.lineTo(x + w * 0.9, y + h * 0.7)
          ctx.lineTo(x + w * 0.45, y + h * 0.7)
          ctx.lineTo(x + w * 0.25, y + h * 0.9)
          ctx.lineTo(x + w * 0.25, y + h * 0.7)
          ctx.lineTo(x + w * 0.1, y + h * 0.7)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'thoughtBubble') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.3, y + h * 0.6)
          ctx.bezierCurveTo(x + w * 0.1, y + h * 0.45, x + w * 0.2, y + h * 0.2, x + w * 0.35, y + h * 0.35)
          ctx.bezierCurveTo(x + w * 0.45, y + h * 0.15, x + w * 0.65, y + h * 0.15, x + w * 0.7, y + h * 0.35)
          ctx.bezierCurveTo(x + w * 0.85, y + h * 0.35, x + w * 0.9, y + h * 0.55, x + w * 0.8, y + h * 0.6)
          ctx.bezierCurveTo(x + w * 0.85, y + h * 0.75, x + w * 0.7, y + h * 0.8, x + w * 0.65, y + h * 0.8)
          ctx.lineTo(x + w * 0.35, y + h * 0.8)
          ctx.bezierCurveTo(x + w * 0.25, y + h * 0.8, x + w * 0.25, y + h * 0.65, x + w * 0.3, y + h * 0.6)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
          ctx.beginPath()
          ctx.arc(x + w * 0.22, y + h * 0.83, w * 0.05, 0, Math.PI * 2)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
          ctx.beginPath()
          ctx.arc(x + w * 0.13, y + h * 0.91, w * 0.03, 0, Math.PI * 2)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'flower') {
          ctx.beginPath()
          ctx.moveTo(x + w * 0.5, y + h * 0.4)
          ctx.bezierCurveTo(x + w * 0.53, y + h * 0.3, x + w * 0.63, y + h * 0.3, x + w * 0.66, y + h * 0.4)
          ctx.bezierCurveTo(x + w * 0.76, y + h * 0.37, x + w * 0.79, y + h * 0.47, x + w * 0.7, y + h * 0.53)
          ctx.bezierCurveTo(x + w * 0.79, y + h * 0.59, x + w * 0.71, y + h * 0.69, x + w * 0.61, y + h * 0.66)
          ctx.bezierCurveTo(x + w * 0.6, y + h * 0.76, x + w * 0.5, y + h * 0.76, x + w * 0.47, y + h * 0.66)
          ctx.bezierCurveTo(x + w * 0.37, y + h * 0.69, x + w * 0.29, y + h * 0.59, x + w * 0.38, y + h * 0.53)
          ctx.bezierCurveTo(x + w * 0.29, y + h * 0.47, x + w * 0.32, y + h * 0.37, x + w * 0.42, y + h * 0.4)
          ctx.bezierCurveTo(x + w * 0.4, y + h * 0.3, x + w * 0.5, y + h * 0.3, x + w * 0.5, y + h * 0.4)
          ctx.closePath()
          if (fill !== 'transparent') ctx.fill()
          if (strokeWidth > 0) ctx.stroke()
        } else if (type === 'roundedFlower') {
          ctx.beginPath()
          const gearPts = [
            [50,20], [53,20], [55,10], [61,12], [59,21], [64,23], [69,16], [74,20], [69,27], [73,31], [80,27], [83,32], [76,37], [78,42], [86,42], [86,48], [77,50], [77,55], [85,58], [83,63], [75,61], [72,66], [77,73], [73,77], [66,72], [62,75], [63,84], [57,85], [55,76], [50,77], [48,86], [42,85], [44,76], [39,74], [33,80], [29,75], [34,69], [31,64], [23,67], [21,62], [28,57], [27,52], [18,50], [18,44], [27,42], [28,37], [20,34], [22,29], [30,32], [33,27], [28,20], [33,16], [38,23], [43,21], [43,12], [49,11]
          ]
          ctx.moveTo(x + w * (gearPts[0][0]/100), y + h * (gearPts[0][1]/100))
          for(let i=1; i<gearPts.length; i++) {
            ctx.lineTo(x + w * (gearPts[i][0]/100), y + h * (gearPts[i][1]/100))
          }
          ctx.closePath()
          ctx.moveTo(x + w * 0.65, y + h * 0.5)
          ctx.arc(x + w * 0.5, y + h * 0.5, w * 0.15, 0, Math.PI * 2, true)
          if (fill !== 'transparent') ctx.fill('evenodd')
          if (strokeWidth > 0) ctx.stroke()
        } else {
          // Polygon shapes: triangle, star, hexagon, diamond, pentagon, octagon, etc.
          let pts = []
          if (type === 'triangle') {
            pts = [[0.5, 0.04], [0.04, 0.96], [0.96, 0.96]]
          } else if (type === 'rightTriangle') {
            pts = [[0, 0], [0, 1], [1, 1]]
          } else if (type === 'parallelogram') {
            pts = [[0.25, 0], [1, 0], [0.75, 1], [0, 1]]
          } else if (type === 'star') {
            pts = [[0.5, 0.04], [0.61, 0.37], [0.96, 0.37], [0.67, 0.58], [0.78, 0.94], [0.5, 0.72], [0.22, 0.94], [0.33, 0.58], [0.04, 0.37], [0.39, 0.37]]
          } else if (type === 'star4') {
            pts = [[0.5, 0.1], [0.6, 0.4], [0.9, 0.5], [0.6, 0.6], [0.5, 0.9], [0.4, 0.6], [0.1, 0.5], [0.4, 0.4]]
          } else if (type === 'star6') {
            pts = [[0.5, 0.05], [0.63, 0.28], [0.9, 0.28], [0.72, 0.5], [0.9, 0.72], [0.63, 0.72], [0.5, 0.95], [0.37, 0.72], [0.1, 0.72], [0.28, 0.5], [0.1, 0.28], [0.37, 0.28]]
          } else if (type === 'star8') {
            pts = [[0.5, 0.05], [0.58, 0.35], [0.82, 0.18], [0.65, 0.42], [0.95, 0.5], [0.65, 0.58], [0.82, 0.82], [0.58, 0.65], [0.5, 0.95], [0.42, 0.65], [0.18, 0.82], [0.35, 0.58], [0.05, 0.5], [0.35, 0.42], [0.18, 0.18], [0.42, 0.35]]
          } else if (type === 'sun') {
            pts = [[0.5, 0.05], [0.53, 0.23], [0.68, 0.14], [0.64, 0.31], [0.81, 0.19], [0.72, 0.36], [0.89, 0.3], [0.76, 0.46], [0.95, 0.5], [0.76, 0.54], [0.89, 0.7], [0.72, 0.64], [0.81, 0.81], [0.64, 0.69], [0.68, 0.86], [0.53, 0.77], [0.5, 0.95], [0.47, 0.77], [0.32, 0.86], [0.36, 0.69], [0.19, 0.81], [0.28, 0.64], [0.11, 0.7], [0.24, 0.54], [0.05, 0.5], [0.24, 0.46], [0.11, 0.3], [0.28, 0.36], [0.19, 0.19], [0.36, 0.31], [0.32, 0.14], [0.47, 0.23]]
          } else if (type === 'decagram') {
            pts = [[0.5, 0.05], [0.57, 0.2], [0.72, 0.12], [0.70, 0.28], [0.85, 0.25], [0.78, 0.39], [0.92, 0.45], [0.81, 0.54], [0.88, 0.7], [0.75, 0.72], [0.77, 0.88], [0.63, 0.83], [0.59, 0.95], [0.48, 0.87], [0.37, 0.95], [0.33, 0.83], [0.19, 0.88], [0.21, 0.72], [0.08, 0.7], [0.15, 0.54], [0.04, 0.45], [0.18, 0.39], [0.11, 0.25], [0.26, 0.28], [0.24, 0.12], [0.39, 0.2]]
          } else if (type === 'hexagon') {
            pts = [[0.30, 0], [0.90, 0], [1.20, 0.50], [0.90, 1.00], [0.30, 1.00], [0, 0.50]]
          } else if (type === 'diamond') {
            pts = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]
          } else if (type === 'pentagon') {
            pts = [[0.5, 0.05], [0.95, 0.38], [0.78, 0.92], [0.22, 0.92], [0.05, 0.38]]
          } else if (type === 'octagon') {
            pts = [[0.30, 0.05], [0.70, 0.05], [0.95, 0.30], [0.95, 0.70], [0.70, 0.95], [0.30, 0.95], [0.05, 0.70], [0.05, 0.30]]
          } else if (type === 'leftArrowBlock') {
            pts = [[0,0.5], [0.4,0.15], [0.4,0.35], [1,0.35], [1,0.65], [0.4,0.65], [0.4,0.85]]
          } else if (type === 'rightArrowBlock') {
            pts = [[1,0.5], [0.6,0.15], [0.6,0.35], [0,0.35], [0,0.65], [0.6,0.65], [0.6,0.85]]
          } else if (type === 'leftRightArrowBlock') {
            pts = [[0,0.5], [0.25,0.25], [0.25,0.4], [0.75,0.4], [0.75,0.25], [1,0.5], [0.75,0.75], [0.75,0.6], [0.25,0.6], [0.25,0.75]]
          } else if (type === 'chevronArrowBlock') {
            pts = [[0,0.25], [0.5,0.25], [0.5,0.1], [0.9,0.5], [0.5,0.9], [0.5,0.75], [0,0.75], [0.4,0.5]]
          } else if (type === 'pentagonArrowBlock') {
            pts = [[0,0.35], [0.6,0.35], [0.6,0.15], [1,0.5], [0.6,0.85], [0.6,0.65], [0,0.65]]
          }

          if (pts.length > 0) {
            ctx.beginPath()
            ctx.moveTo(x + w * pts[0][0], y + h * pts[0][1])
            for (let i = 1; i < pts.length; i++) {
              ctx.lineTo(x + w * pts[i][0], y + h * pts[i][1])
            }
            ctx.closePath()
            if (fill !== 'transparent') ctx.fill()
            if (strokeWidth > 0) ctx.stroke()
          } else {
            // Default fallback
            ctx.beginPath()
            ctx.rect(x, y, w, h)
            if (fill !== 'transparent') ctx.fill()
            if (strokeWidth > 0) ctx.stroke()
          }
        }
        ctx.restore()
        break
      }

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
