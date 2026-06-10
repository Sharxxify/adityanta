import JSZip from 'jszip'

// Our canvas dimensions (must match EditorContext)
const CANVAS_W = 1280
const CANVAS_H = 720

/**
 * Resolve a relative path inside the zip.
 * E.g., basePath = "ppt/slides/slide1.xml", relativePath = "../slideLayouts/slideLayout1.xml"
 * returns "ppt/slideLayouts/slideLayout1.xml"
 */
function resolveRelativePath(basePath, relativePath) {
  if (!relativePath) return ''
  if (relativePath.includes('://') || relativePath.startsWith('mailto:')) {
    return relativePath
  }
  if (relativePath.startsWith('/')) {
    return relativePath.substring(1)
  }
  const baseParts = basePath.split('/')
  baseParts.pop() // remove filename
  const relParts = relativePath.split('/')
  for (const part of relParts) {
    if (part === '.') {
      continue
    } else if (part === '..') {
      baseParts.pop()
    } else {
      baseParts.push(part)
    }
  }
  return baseParts.join('/')
}

/** Get the relationship file path for an XML file path */
function getRelsPathForXml(xmlPath) {
  if (!xmlPath) return ''
  const parts = xmlPath.split('/')
  const filename = parts.pop()
  parts.push('_rels')
  parts.push(filename + '.rels')
  return parts.join('/')
}

/** Get relationship map from a rels XML path in zip */
async function getRelsMap(zip, relsPath) {
  const relsFile = zip.file(relsPath)
  const map = {}
  if (!relsFile) return map

  try {
    const xml = await relsFile.async('string')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const rels = doc.querySelectorAll('Relationship')
    rels.forEach(rel => {
      const id = rel.getAttribute('Id')
      const target = rel.getAttribute('Target')
      if (id && target) {
        map[id] = target
      }
    })
  } catch (error) {
    // ignore
  }
  return map
}


/**
 * Parse a .pptx file and convert it to our editor frame format
 * @param {File} file - The .pptx file to parse
 * @returns {Promise<{title: string, frames: Array}>}
 */
export async function parsePPTX(file) {
  const zip = await JSZip.loadAsync(file)

  // Debug: list all files in the zip
  const allFiles = Object.keys(zip.files)
  console.log('[PPTX DEBUG] Files in zip:', allFiles.filter(f => !f.endsWith('/')))
  console.log('[PPTX DEBUG] Media files:', allFiles.filter(f => f.includes('media/')))
  // 1. Get presentation info (slide size + slide list)
  const { slideSize, slideRefs } = await parsePresentationXml(zip)
  const title = await getPresentationTitle(zip, file.name)

  // 2. Calculate Scale Factor
  // PowerPoint uses EMUs (914400 EMUs = 1 inch). Web uses pixels (96 DPI).
  // Native pixel width = cx / 9525 (approx, since 914400 / 96 = 9525)
  // We want to fit the slide width into our CANVAS_W
  const nativeWidthPx = slideSize.cx / 9525
  const scaleFactor = CANVAS_W / nativeWidthPx



  // Convert EMU to our canvas pixels using the global scale factor
  // x_px = (emu / 9525) * scaleFactor
  const emuToX = (emu) => Math.round((emu / 9525) * scaleFactor)
  const emuToY = (emu) => Math.round((emu / 9525) * scaleFactor) // Use same scale factor for Y to maintain aspect ratio
  const emuToW = emuToX
  const emuToH = emuToY

  // 3. Parse each slide
  const frames = []
  for (let i = 0; i < slideRefs.length; i++) {
    const slideNum = slideRefs[i]
    const frame = await parseSlide(zip, slideNum, i, emuToX, emuToY, emuToW, emuToH, scaleFactor)
    if (frame) frames.push(frame)
  }

  // Fallback: if no slides found via presentation.xml, try scanning for slide files
  if (frames.length === 0) {
    const slideFiles = Object.keys(zip.files)
      .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => {
        const na = parseInt(a.match(/slide(\d+)/)[1])
        const nb = parseInt(b.match(/slide(\d+)/)[1])
        return na - nb
      })

    for (let i = 0; i < slideFiles.length; i++) {
      const num = parseInt(slideFiles[i].match(/slide(\d+)/)[1])
      const frame = await parseSlide(zip, num, i, emuToX, emuToY, emuToW, emuToH, scaleFactor)
      if (frame) frames.push(frame)
    }
  }

  if (frames.length === 0) {
    throw new Error('No slides found in this presentation')
  }

  return { title, frames }
}

/** Parse ppt/presentation.xml to get slide size and ordered slide references */
async function parsePresentationXml(zip) {
  const defaultSize = { cx: 12192000, cy: 6858000 } // 16:9 default
  let slideSize = defaultSize
  let slideRefs = []

  const presFile = zip.file('ppt/presentation.xml')
  if (!presFile) return { slideSize, slideRefs: [1] }

  const xml = await presFile.async('string')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')

  // Get slide size
  const sldSz = doc.querySelector('sldSz') || doc.getElementsByTagName('p:sldSz')[0]
  if (sldSz) {
    const cx = parseInt(sldSz.getAttribute('cx'))
    const cy = parseInt(sldSz.getAttribute('cy'))
    if (cx && cy) slideSize = { cx, cy }
  }

  // Get slide references in order from <p:sldIdLst>
  const sldIdNodes = doc.querySelectorAll('sldIdLst > sldId')
  const rIds = []
  sldIdNodes.forEach(node => {
    const rId = node.getAttribute('r:id') || node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
    if (rId) rIds.push(rId)
  })

  if (rIds.length > 0) {
    // Resolve rIds to slide numbers via presentation.xml.rels
    const relsFile = zip.file('ppt/_rels/presentation.xml.rels')
    if (relsFile) {
      const relsXml = await relsFile.async('string')
      const relsDoc = new DOMParser().parseFromString(relsXml, 'application/xml')
      const relationships = relsDoc.querySelectorAll('Relationship')
      const rIdMap = {}
      relationships.forEach(rel => {
        rIdMap[rel.getAttribute('Id')] = rel.getAttribute('Target')
      })

      rIds.forEach(rId => {
        const target = rIdMap[rId] // e.g., "slides/slide1.xml"
        if (target) {
          const match = target.match(/slide(\d+)\.xml/)
          if (match) slideRefs.push(parseInt(match[1]))
        }
      })
    }
  }

  // Fallback: scan for slide files
  if (slideRefs.length === 0) {
    const slideFiles = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    slideRefs = slideFiles.map(f => parseInt(f.match(/slide(\d+)/)[1])).sort((a, b) => a - b)
  }

  return { slideSize, slideRefs }
}

/** Get presentation title from docProps/core.xml or filename */
async function getPresentationTitle(zip, filename) {
  try {
    const coreFile = zip.file('docProps/core.xml')
    if (coreFile) {
      const xml = await coreFile.async('string')
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      const titleEl = doc.querySelector('title') || doc.getElementsByTagName('dc:title')[0]
      if (titleEl && titleEl.textContent?.trim()) {
        return titleEl.textContent.trim()
      }
    }
  } catch (e) { /* ignore */ }
  // Fallback to filename without extension
  return filename.replace(/\.[^.]+$/, '') || 'Imported Presentation'
}

/** Parse a single slide XML and return a frame object */
async function parseSlide(zip, slideNum, frameIndex, emuToX, emuToY, emuToW, emuToH, scaleFactor) {
  const slidePath = `ppt/slides/slide${slideNum}.xml`
  const slideFile = zip.file(slidePath)
  if (!slideFile) return null

  const xml = await slideFile.async('string')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')

  // Get slide relationships (for image references)
  const slideRelsPath = getRelsPathForXml(slidePath)
  const relsMap = await getRelsMap(zip, slideRelsPath)

  // Resolve slide layout path (for debugging and layout merging)
  const layoutPath = await resolveSlideLayout(zip, slidePath)
  let layoutNodeCounts = null
  let layoutDoc = null
  let layoutRelsMap = {}

  if (layoutPath) {
    try {
      const layoutFile = zip.file(layoutPath)
      if (layoutFile) {
        const layoutXml = await layoutFile.async('string')
        layoutDoc = new DOMParser().parseFromString(layoutXml, 'application/xml')

        const layoutRelsPath = getRelsPathForXml(layoutPath)
        layoutRelsMap = await getRelsMap(zip, layoutRelsPath)

        const layoutSpNodes = layoutDoc.getElementsByTagName('p:sp')
        const layoutPicNodes = layoutDoc.getElementsByTagName('p:pic')
        const layoutGrpSpNodes = layoutDoc.getElementsByTagName('p:grpSp')

        layoutNodeCounts = {
          sp: layoutSpNodes.length,
          pic: layoutPicNodes.length,
          grpSp: layoutGrpSpNodes.length,
        }
      }
    } catch (error) {
      // Silently fail if layout parsing fails
      layoutDoc = null
    }
  }

  // Resolve slide master path from layout (for inheritance chain verification)
  let masterPath = null
  let masterDoc = null
  let masterNodeCounts = null
  let masterRelsMap = {}
  let masterBg = null

  if (layoutPath) {
    try {
      masterPath = await resolveSlideMaster(zip, layoutPath)
      if (masterPath) {
        const masterFile = zip.file(masterPath)
        if (masterFile) {
          const masterXml = await masterFile.async('string')
          masterDoc = new DOMParser().parseFromString(masterXml, 'application/xml')

          const masterRelsPath = getRelsPathForXml(masterPath)
          masterRelsMap = await getRelsMap(zip, masterRelsPath)

          const masterSpNodes = masterDoc.getElementsByTagName('p:sp')
          const masterPicNodes = masterDoc.getElementsByTagName('p:pic')
          const masterGrpSpNodes = masterDoc.getElementsByTagName('p:grpSp')

          masterNodeCounts = {
            sp: masterSpNodes.length,
            pic: masterPicNodes.length,
            grpSp: masterGrpSpNodes.length,
          }

          // Check master background
          masterBg = await parseBackground(masterDoc, zip, masterRelsMap, masterPath)
        }
      }
    } catch (error) {
      // Silently fail if master parsing fails
      masterDoc = null
    }
  }

  // Parse background color (slide → layout → master). Supports solid, gradient, and image (blipFill) fills.
  const slideBg = await parseBackground(doc, zip, relsMap, slidePath)
  const layoutBg = layoutDoc ? await parseBackground(layoutDoc, zip, layoutRelsMap, layoutPath) : null

  console.log(`[PPTX DEBUG] Slide ${slideNum} backgrounds:`, {
    slideBg: slideBg ? (slideBg.startsWith('data:image/') ? `IMAGE(${slideBg.length} chars)` : slideBg) : null,
    layoutBg: layoutBg ? (layoutBg.startsWith('data:image/') ? `IMAGE(${layoutBg.length} chars)` : layoutBg) : null,
    masterBg: masterBg ? (masterBg.startsWith('data:image/') ? `IMAGE(${masterBg.length} chars)` : masterBg) : null,
    layoutPath,
    masterPath,
    slideRelsCount: Object.keys(relsMap).length,
    layoutRelsCount: Object.keys(layoutRelsMap).length,
    masterRelsCount: Object.keys(masterRelsMap).length,
  })

  // Precedence for background color and background image
  let backgroundColor = '#ffffff'
  let backgroundImage = null

  // 1. Resolve Background Image (precedence: slide -> layout -> master)
  const bgImage = [slideBg, layoutBg, masterBg].find(bg => bg && bg.startsWith('data:image/'))
  if (bgImage) {
    backgroundImage = bgImage
  }

  // 2. Resolve Background Color/Gradient (precedence: slide -> layout -> master)
  const bgColor = [slideBg, layoutBg, masterBg].find(bg => bg && !bg.startsWith('data:image/'))
  if (bgColor) {
    backgroundColor = bgColor
  }

  // Parse elements from layout (if any) and slide, merging placeholders
  let layoutElements = []
  let elementIdBase = (frameIndex + 1) * 1000

  // 1. Parse Layout Elements
  if (layoutDoc) {
    const layoutResult = await parseElementsFromDoc(
      layoutDoc,
      emuToX,
      emuToY,
      emuToW,
      emuToH,
      layoutRelsMap, // Pass layout relationships map instead of null
      zip,
      frameIndex,
      'layout',
      elementIdBase,
      scaleFactor,
      backgroundColor,
      layoutPath // Pass layoutPath
    )
    layoutElements = layoutResult.elements
    elementIdBase = layoutResult.nextElementId
  }

  // 2. Parse Slide Elements
  const slideResult = await parseElementsFromDoc(
    doc,
    emuToX,
    emuToY,
    emuToW,
    emuToH,
    relsMap,
    zip,
    frameIndex,
    'slide',
    elementIdBase,
    scaleFactor,
    backgroundColor,
    slidePath // Pass slidePath
  )
  const slideElements = slideResult.elements

  // 3. Merge Layout and Slide Elements
  // This removes layout placeholders that are filled by slide elements
  let elements = mergeElements(layoutElements, slideElements)

  console.log(`[PPTX DEBUG] Slide ${slideNum} elements:`, {
    layoutElements: layoutElements.map(e => ({ type: e.type, phType: e.placeholderType, phIdx: e.placeholderIdx, hasContent: !!e.content, hasSrc: !!e.src, source: e.source, w: e.width, h: e.height })),
    slideElements: slideElements.map(e => ({ type: e.type, phType: e.placeholderType, phIdx: e.placeholderIdx, hasContent: !!e.content, hasSrc: !!e.src, source: e.source, w: e.width, h: e.height })),
    mergedCount: elements.length,
  })

  // Collect raw shape nodes for debug metrics (slide doc only)
  const spNodes = doc.getElementsByTagName('p:sp')
  const picNodes = doc.getElementsByTagName('p:pic')
  const grpSpNodes = doc.getElementsByTagName('p:grpSp')
  const bgNodes = doc.getElementsByTagName('p:bg')
  const gfNodes = doc.getElementsByTagName('p:graphicFrame')

  // Parse notes
  const notes = await getSlideNotes(zip, slideNum)

  // Check for full-slide background images and convert them to backgroundImage
  const filteredElements = elements.filter(el => {
    if (el.type === 'image' && el.src && el.width >= CANVAS_W - 20 && el.height >= CANVAS_H - 20 && el.x <= 10 && el.y <= 10) {
      // This image covers the entire slide — use it as background instead of an element
      if (!backgroundImage) {
        backgroundImage = el.src
      }
      return false
    }
    return true
  })

  return {
    id: frameIndex + 1,
    title: frameIndex === 0 ? 'Cover' : `Slide ${frameIndex + 1}`,
    preview: frameIndex === 0 ? 'Cover' : `Slide ${frameIndex + 1}`,
    backgroundColor,
    backgroundImage,
    notes,
    transition: 'fade',
    elements: filteredElements
  }
}

/** Get the relationship map for a slide (rId -> target path) */
async function getSlideRels(zip, slideNum) {
  const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`
  const relsFile = zip.file(relsPath)
  const map = {}
  if (!relsFile) return map

  const xml = await relsFile.async('string')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const rels = doc.querySelectorAll('Relationship')
  rels.forEach(rel => {
    map[rel.getAttribute('Id')] = rel.getAttribute('Target')
  })
  return map
}

/** Resolve slide layout path from slide relationships */
async function resolveSlideLayout(zip, slidePath) {
  // Extract slide number from path (e.g., "ppt/slides/slide1.xml" -> 1)
  const slideMatch = slidePath.match(/slide(\d+)\.xml$/)
  if (!slideMatch) return null

  const slideNum = slideMatch[1]
  const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`
  const relsFile = zip.file(relsPath)
  if (!relsFile) return null

  try {
    const xml = await relsFile.async('string')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const rels = doc.querySelectorAll('Relationship')

    for (const rel of rels) {
      const type = rel.getAttribute('Type') || ''
      // Check if this relationship is for slideLayout
      if (type.includes('slideLayout')) {
        let target = rel.getAttribute('Target')
        if (!target) continue
        return resolveRelativePath(slidePath, target)
      }
    }
  } catch (error) {
    // Silently fail if parsing fails
    return null
  }

  return null
}

/** Resolve slide master path from layout relationships */
async function resolveSlideMaster(zip, layoutPath) {
  // Extract layout name from path (e.g., "ppt/slideLayouts/slideLayout1.xml" -> "slideLayout1")
  const layoutMatch = layoutPath.match(/slideLayout(\d+)\.xml$/)
  if (!layoutMatch) return null

  const layoutNum = layoutMatch[1]
  const relsPath = `ppt/slideLayouts/_rels/slideLayout${layoutNum}.xml.rels`
  const relsFile = zip.file(relsPath)
  if (!relsFile) return null

  try {
    const xml = await relsFile.async('string')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const rels = doc.querySelectorAll('Relationship')

    for (const rel of rels) {
      const type = rel.getAttribute('Type') || ''
      // Check if this relationship is for slideMaster
      if (type.includes('slideMaster')) {
        let target = rel.getAttribute('Target')
        if (!target) continue
        return resolveRelativePath(layoutPath, target)
      }
    }
  } catch (error) {
    // Silently fail if parsing fails
    return null
  }

  return null
}

/** Parse background color/image from slide XML - supports solid, gradient, image fills, and theme references */
async function parseBackground(doc, zip = null, relsMap = null, xmlPath = null) {
  const bgNodes = doc.getElementsByTagName('p:bg')
  if (bgNodes.length === 0) {
    console.log(`[PPTX BG DEBUG] No p:bg found in ${xmlPath || 'unknown'}`)
    return null
  }

  const bgNode = bgNodes[0]
  const bgPr = bgNode.getElementsByTagName('p:bgPr')[0]
  const bgRef = bgNode.getElementsByTagName('p:bgRef')[0]
  
  console.log(`[PPTX BG DEBUG] ${xmlPath}: hasBgPr=${!!bgPr}, hasBgRef=${!!bgRef}`)

  // --- Handle p:bgPr (explicit background properties) ---
  if (bgPr) {
    // Check blipFill (background image)
    const blipFill = bgPr.getElementsByTagName('a:blipFill')[0]
    if (blipFill && relsMap && zip) {
      const imgResult = await resolveBlipImage(blipFill, relsMap, zip, xmlPath)
      if (imgResult) return imgResult
    }

    // Try solidFill
    const solidFill = bgPr.getElementsByTagName('a:solidFill')[0]
    if (solidFill) {
      const color = await resolveFillColor(solidFill, zip)
      if (color) return color
    }

    // Check for gradient fill
    const gradFill = bgPr.getElementsByTagName('a:gradFill')[0]
    if (gradFill && zip) {
      const gradient = await parseGradient(gradFill, zip)
      if (gradient) return gradient
    }
  }

  // --- Handle p:bgRef (background reference from theme) ---
  // <p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef>
  // The idx references a fill style from the theme's fmtScheme.
  // idx 1-999 = fillStyleLst, idx 1000+ = bgFillStyleLst (idx - 1000)
  if (bgRef && zip) {
    const idx = parseInt(bgRef.getAttribute('idx') || '0')
    console.log(`[PPTX BG DEBUG] bgRef idx=${idx}`)
    
    // First check if bgRef directly contains a color
    const refSrgb = bgRef.getElementsByTagName('a:srgbClr')[0]
    const refScheme = bgRef.getElementsByTagName('a:schemeClr')[0]
    
    if (refSrgb) {
      return '#' + refSrgb.getAttribute('val')
    }
    
    if (idx > 0) {
      // Try to resolve from theme's background fill style list
      const themeResult = await resolveThemeBgFill(zip, idx, relsMap, xmlPath)
      if (themeResult) return themeResult
    }
    
    // Fall back to resolving the scheme color from the bgRef
    if (refScheme) {
      const schemeValue = refScheme.getAttribute('val')
      const lumModOp = refScheme.getElementsByTagName('a:lumMod')[0]
      const lumOffOp = refScheme.getElementsByTagName('a:lumOff')[0]
      const lumMod = lumModOp ? parseInt(lumModOp.getAttribute('val')) : undefined
      const lumOff = lumOffOp ? parseInt(lumOffOp.getAttribute('val')) : undefined
      const resolved = await resolveSchemeColorFromTheme(zip, schemeValue, lumMod, lumOff)
      if (resolved) return resolved
    }
  }

  // Unsupported background types are treated as absent
  return null
}

/** Resolve a blip (image) fill from an a:blipFill node */
async function resolveBlipImage(blipFill, relsMap, zip, xmlPath) {
  const blip = blipFill.getElementsByTagName('a:blip')[0]
  if (!blip) return null
  
  const rEmbed = blip.getAttribute('r:embed') || 
                 blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ||
                 blip.getAttribute('r:link') ||
                 blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'link')
  
  if (!rEmbed || !relsMap[rEmbed]) return null
  
  const target = relsMap[rEmbed]
  const mediaPath = resolveRelativePath(xmlPath, target)
  const mediaFile = zip.file(mediaPath)
  if (!mediaFile) return null
  
  try {
    const imgData = await mediaFile.async('base64')
    const ext = mediaPath.split('.').pop().toLowerCase()
    const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', webp: 'image/webp' }
    const mime = mimeMap[ext] || 'image/png'
    return `data:${mime};base64,${imgData}`
  } catch (e) {
    return null
  }
}

/** Resolve a solid fill color from an a:solidFill node */
async function resolveFillColor(solidFill, zip) {
  const srgb = solidFill.getElementsByTagName('a:srgbClr')[0]
  if (srgb && srgb.getAttribute('val')) {
    return '#' + srgb.getAttribute('val')
  }

  const schemeClr = solidFill.getElementsByTagName('a:schemeClr')[0]
  if (schemeClr && schemeClr.getAttribute('val') && zip) {
    const schemeValue = schemeClr.getAttribute('val')
    const lumModOp = schemeClr.getElementsByTagName('a:lumMod')[0]
    const lumOffOp = schemeClr.getElementsByTagName('a:lumOff')[0]
    const lumMod = lumModOp ? parseInt(lumModOp.getAttribute('val')) : undefined
    const lumOff = lumOffOp ? parseInt(lumOffOp.getAttribute('val')) : undefined
    return await resolveSchemeColorFromTheme(zip, schemeValue, lumMod, lumOff)
  }
  return null
}

/** Resolve background fill from theme's fmtScheme (bgFillStyleLst or fillStyleLst) */
async function resolveThemeBgFill(zip, idx, relsMap, xmlPath) {
  try {
    const themeXml = await zip.file('ppt/theme/theme1.xml')?.async('text')
    if (!themeXml) return null

    const doc = new DOMParser().parseFromString(themeXml, 'text/xml')
    const fmtScheme = doc.getElementsByTagName('a:fmtScheme')[0]
    if (!fmtScheme) return null

    let fillNode = null
    
    if (idx >= 1000) {
      // bgFillStyleLst: idx 1001 = first entry, 1002 = second, etc.
      const bgFillStyleLst = fmtScheme.getElementsByTagName('a:bgFillStyleLst')[0]
      if (bgFillStyleLst) {
        // Get all direct fill children (solidFill, gradFill, blipFill, etc.)
        const fillChildren = []
        for (let i = 0; i < bgFillStyleLst.childNodes.length; i++) {
          const child = bgFillStyleLst.childNodes[i]
          if (child.nodeType === 1) { // Element node
            fillChildren.push(child)
          }
        }
        const fillIdx = idx - 1001 // 0-based
        console.log(`[PPTX BG DEBUG] bgFillStyleLst: ${fillChildren.length} entries, looking for idx ${fillIdx}`)
        if (fillIdx >= 0 && fillIdx < fillChildren.length) {
          fillNode = fillChildren[fillIdx]
        }
      }
    } else {
      // fillStyleLst: idx 1 = first entry, 2 = second, etc.
      const fillStyleLst = fmtScheme.getElementsByTagName('a:fillStyleLst')[0]
      if (fillStyleLst) {
        const fillChildren = []
        for (let i = 0; i < fillStyleLst.childNodes.length; i++) {
          const child = fillStyleLst.childNodes[i]
          if (child.nodeType === 1) fillChildren.push(child)
        }
        const fillIdx = idx - 1
        if (fillIdx >= 0 && fillIdx < fillChildren.length) {
          fillNode = fillChildren[fillIdx]
        }
      }
    }

    if (!fillNode) return null

    console.log(`[PPTX BG DEBUG] Theme fill node tag: ${fillNode.tagName || fillNode.localName}`)

    // Resolve the fill based on type
    const tagName = (fillNode.tagName || fillNode.localName || '').toLowerCase()
    
    if (tagName.includes('blipfill') || tagName === 'a:blipfill') {
      // Image fill from theme - need theme rels
      const themeRelsPath = 'ppt/theme/_rels/theme1.xml.rels'
      const themeRelsMap = await getRelsMap(zip, themeRelsPath)
      const imgResult = await resolveBlipImage(fillNode, themeRelsMap, zip, 'ppt/theme/theme1.xml')
      if (imgResult) return imgResult
    }
    
    if (tagName.includes('solidfill') || tagName === 'a:solidfill') {
      return await resolveFillColor(fillNode, zip)
    }
    
    if (tagName.includes('gradfill') || tagName === 'a:gradfill') {
      return await parseGradient(fillNode, zip)
    }

    // Check children for fills (some themes wrap fills differently)
    const blipFill = fillNode.getElementsByTagName('a:blipFill')[0]
    if (blipFill) {
      const themeRelsPath = 'ppt/theme/_rels/theme1.xml.rels'
      const themeRelsMap = await getRelsMap(zip, themeRelsPath)
      const imgResult = await resolveBlipImage(blipFill, themeRelsMap, zip, 'ppt/theme/theme1.xml')
      if (imgResult) return imgResult
    }

    const solidFill = fillNode.getElementsByTagName('a:solidFill')[0]
    if (solidFill) {
      return await resolveFillColor(solidFill, zip)
    }

    const gradFill = fillNode.getElementsByTagName('a:gradFill')[0]
    if (gradFill) {
      return await parseGradient(gradFill, zip)
    }

    return null
  } catch (e) {
    console.log(`[PPTX BG DEBUG] Error resolving theme bg fill:`, e.message)
    return null
  }
}

/** Parse <a:gradFill> to CSS linear-gradient */
async function parseGradient(gradFillNode, zip) {
  try {
    const gsLst = gradFillNode.getElementsByTagName('a:gsLst')[0]
    if (!gradFillNode || !gsLst) return null

    // 1. Parse stops
    const stops = []
    const gsNodes = gsLst.getElementsByTagName('a:gs')

    for (let i = 0; i < gsNodes.length; i++) {
      const gs = gsNodes[i]
      const pos = parseInt(gs.getAttribute('pos')) / 1000 // 0 to 100000 -> 0 to 100%

      let color = '#ffffff'

      // Resolve color for this stop
      const srgb = gs.getElementsByTagName('a:srgbClr')[0]
      const schemeClr = gs.getElementsByTagName('a:schemeClr')[0]

      if (srgb) {
        color = '#' + srgb.getAttribute('val')
        // Check for alpha/modifiers on srgb if needed (future)
      } else if (schemeClr) {
        const val = schemeClr.getAttribute('val')
        const lumModOp = schemeClr.getElementsByTagName('a:lumMod')[0]
        const lumOffOp = schemeClr.getElementsByTagName('a:lumOff')[0]
        const lumMod = lumModOp ? parseInt(lumModOp.getAttribute('val')) : undefined
        const lumOff = lumOffOp ? parseInt(lumOffOp.getAttribute('val')) : undefined
        const resolved = await resolveSchemeColorFromTheme(zip, val, lumMod, lumOff)
        if (resolved) color = resolved
      }

      stops.push({ pos, color })
    }

    // Sort by position
    stops.sort((a, b) => a.pos - b.pos)

    if (stops.length === 0) return null

    // 2. Parse type (linear vs path/radial) - currently support linear
    // <a:lin ang="5400000" scaled="1"/>
    // angle is in 60000ths of a degree. 0 = 3 o'clock (right), 90 = 6 o'clock (down) ??
    // PPTX angle: 0 starts at 3 o'clock (right) and goes CLOCKWISE.
    // CSS angle: 0deg is top (12 o'clock) and goes CLOCKWISE (or 90deg is right).
    // Actually CSS `linear-gradient(Ndeg, ...)`: 0deg = bottom-to-top, 90deg = left-to-right.

    // Let's rely on standard conversion:
    // PPTX 0 = left-to-right (CSS 90deg)
    // PPTX 90 (5400000) = top-to-bottom (CSS 180deg)

    let angleDeg = 90 // Default to top-to-bottom (180deg) or left-to-right (90deg)? 
    // Usually PPT default is top-to-bottom if linear tag missing? 

    const lin = gradFillNode.getElementsByTagName('a:lin')[0]
    const path = gradFillNode.getElementsByTagName('a:path')[0]

    if (lin) {
      const ang = parseInt(lin.getAttribute('ang') || '0')
      // convert to degrees
      // PPTX 0 = 3 o'clock. positive = clockwise.
      // CSS 0deg = 12 o'clock. positive = clockwise.
      // So CSS = PPTX + 90
      let pptDeg = ang / 60000
      angleDeg = (pptDeg + 90) % 360
    } else if (path) {
      // Radial/Path gradient - Fallback to linear top-to-bottom for now, or just use the first/last color
      // Radial gradient not fully implemented yet - fallback to linear or solid
      angleDeg = 180
    }

    // Constuct CSS string
    // linear-gradient(180deg, color1 0%, color2 100%)
    const stopsStr = stops.map(s => `${s.color} ${Math.round(s.pos)}%`).join(', ')
    return `linear-gradient(${Math.round(angleDeg)}deg, ${stopsStr})`

  } catch (e) {

    return null
  }
}

/**
 * Parse elements (shapes, images, tables) from a slide-like XML document.
 * Reuses existing element parsing helpers and EMU → pixel conversion.
 *
 * @param {Document} doc - XML document for a slide or layout
 * @param {Function} emuToX
 * @param {Function} emuToY
 * @param {Function} emuToW
 * @param {Function} emuToH
 * @param {Object|null} relsMap - relationship map for resolving images (can be null)
 * @param {JSZip} zip - zip archive (for images)
 * @param {number} frameIndex - index of the frame (for ID grouping)
 * @param {'slide'|'layout'} source - origin of elements
 * @param {number} startingElementId - starting ID counter
 * @returns {Promise<{ elements: Array, nextElementId: number }>}
 */
async function parseElementsFromDoc(
  doc,
  emuToX,
  emuToY,
  emuToW,
  emuToH,
  relsMap,
  zip,
  frameIndex,
  source,
  startingElementId,
  scaleFactor,
  slideBackgroundColor,
  xmlPath = null
) {
  const elements = []
  let elementId = startingElementId

  const traverseSpTree = async (node, transform) => {
    const { offsetX, offsetY, scaleX, scaleY } = transform

    // Helper functions that apply the current coordinate transform
    const localEmuToX = (emu) => emuToX(offsetX + emu * scaleX)
    const localEmuToY = (emu) => emuToY(offsetY + emu * scaleY)
    const localEmuToW = (emu) => emuToW(emu * scaleX)
    const localEmuToH = (emu) => emuToH(emu * scaleY)

    const childNodes = node.childNodes
    if (!childNodes) return

    for (let i = 0; i < childNodes.length; i++) {
      const child = childNodes[i]
      if (child.nodeType !== 1) continue // Process elements only

      const tagName = child.localName || child.tagName || ''

      if (tagName === 'sp') {
        // Check if this shape actually has an image fill (a:blipFill)
        const spPr = child.getElementsByTagName('p:spPr')[0] || child.getElementsByTagName('a:spPr')[0]
        const blipFill = spPr ? spPr.getElementsByTagName('a:blipFill')[0] : null
        
        if (blipFill && relsMap && zip) {
          // Parse as image element
          const el = await parseImageElement(child, ++elementId, localEmuToX, localEmuToY, localEmuToW, localEmuToH, relsMap, zip, xmlPath)
          if (el) {
            el.source = source
            elements.push(el)
          }
        } else {
          // Parse as standard shape/text element
          const el = await parseShapeElement(child, ++elementId, localEmuToX, localEmuToY, localEmuToW, localEmuToH, zip, scaleFactor, slideBackgroundColor)
          if (el) {
            el.source = source
            elements.push(el)
          }
        }
      } else if (tagName === 'pic') {
        // Parse image element
        const el = await parseImageElement(child, ++elementId, localEmuToX, localEmuToY, localEmuToW, localEmuToH, relsMap, zip, xmlPath)
        if (el) {
          el.source = source
          elements.push(el)
        }
      } else if (tagName === 'graphicFrame') {
        // Parse table element
        const tableEl = parseTableElement(child, ++elementId, localEmuToX, localEmuToY, localEmuToW, localEmuToH)
        if (tableEl) {
          tableEl.source = source
          elements.push(tableEl)
          continue
        }

        // SmartArt placeholder fallback
        let xfrm = child.getElementsByTagName('a:xfrm')[0] || child.getElementsByTagName('p:xfrm')[0]
        if (!xfrm) continue

        const off = xfrm.getElementsByTagName('a:off')[0]
        const ext = xfrm.getElementsByTagName('a:ext')[0]
        if (!off || !ext) continue

        const x = localEmuToX(parseInt(off.getAttribute('x')) || 0)
        const y = localEmuToY(parseInt(off.getAttribute('y')) || 0)
        const width = localEmuToW(parseInt(ext.getAttribute('cx')) || 0)
        const height = localEmuToH(parseInt(ext.getAttribute('cy')) || 0)

        const textNodes = child.getElementsByTagName('a:t')
        let smartArtText = ''
        for (let t = 0; t < textNodes.length; t++) {
          const txt = textNodes[t].textContent || ''
          if (txt.trim()) {
            smartArtText += (smartArtText ? ' | ' : '') + txt.trim()
          }
        }

        elements.push({
          id: ++elementId,
          type: 'smartart-placeholder',
          x,
          y,
          width,
          height,
          text: smartArtText || 'SmartArt (not supported)',
          source,
        })
      } else if (tagName === 'grpSp') {
        // Parse group shape transformation
        const grpSpPr = child.getElementsByTagName('p:grpSpPr')[0] || child.getElementsByTagName('a:grpSpPr')[0]
        let nextTransform = { offsetX, offsetY, scaleX, scaleY }

        if (grpSpPr) {
          const xfrm = grpSpPr.getElementsByTagName('a:xfrm')[0]
          if (xfrm) {
            const off = xfrm.getElementsByTagName('a:off')[0]
            const ext = xfrm.getElementsByTagName('a:ext')[0]
            const chOff = xfrm.getElementsByTagName('a:chOff')[0]
            const chExt = xfrm.getElementsByTagName('a:chExt')[0]

            if (off && ext && chOff && chExt) {
              const group_off_x = parseInt(off.getAttribute('x')) || 0
              const group_off_y = parseInt(off.getAttribute('y')) || 0
              const group_ext_cx = parseInt(ext.getAttribute('cx')) || 0
              const group_ext_cy = parseInt(ext.getAttribute('cy')) || 0
              const group_chOff_x = parseInt(chOff.getAttribute('x')) || 0
              const group_chOff_y = parseInt(chOff.getAttribute('y')) || 0
              const group_chExt_cx = parseInt(chExt.getAttribute('cx')) || 0
              const group_chExt_cy = parseInt(chExt.getAttribute('cy')) || 0

              const local_scale_x = group_chExt_cx > 0 ? (group_ext_cx / group_chExt_cx) : 1
              const local_scale_y = group_chExt_cy > 0 ? (group_ext_cy / group_chExt_cy) : 1

              const group_off_x_slide = offsetX + group_off_x * scaleX
              const group_off_y_slide = offsetY + group_off_y * scaleY
              const group_scale_x_slide = scaleX * local_scale_x
              const group_scale_y_slide = scaleY * local_scale_y

              nextTransform = {
                scaleX: group_scale_x_slide,
                scaleY: group_scale_y_slide,
                offsetX: group_off_x_slide - group_chOff_x * group_scale_x_slide,
                offsetY: group_off_y_slide - group_chOff_y * group_scale_y_slide
              }
            }
          }
        }

        // Recursively traverse children of the group shape
        await traverseSpTree(child, nextTransform)
      }
    }
  }

  const spTreeNodes = doc.getElementsByTagName('p:spTree')
  if (spTreeNodes.length > 0) {
    await traverseSpTree(spTreeNodes[0], { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 })
  } else {
    await traverseSpTree(doc.documentElement, { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 })
  }

  return { elements, nextElementId: elementId }
}

/** Parse a <p:sp> node into a text or shape element */
async function parseShapeElement(spNode, elementId, emuToX, emuToY, emuToW, emuToH, zip, scaleFactor, slideBackgroundColor) {
  // Extract placeholder type from p:sp → p:nvSpPr → p:nvPr → p:ph
  let placeholderType = null
  let placeholderIdx = null
  let userDrawn = true

  const nvSpPr = spNode.getElementsByTagName('p:nvSpPr')[0]
  if (nvSpPr) {
    const nvPr = nvSpPr.getElementsByTagName('p:nvPr')[0]
    if (nvPr) {
      // Check userDrawn
      const ud = nvPr.getAttribute('userDrawn')
      if (ud === '0' || ud === 'false') userDrawn = false

      // Check placeholder
      const ph = nvPr.getElementsByTagName('p:ph')[0]
      if (ph) {
        placeholderType = ph.getAttribute('type') || null
        placeholderIdx = ph.getAttribute('idx') || null
      }
    }
  }

  // Get transform (position & size)
  const xfrm = spNode.getElementsByTagName('a:xfrm')[0]
  if (!xfrm && !placeholderType) return null

  let x = 0, y = 0, width = 0, height = 0, rotation = 0
  if (xfrm) {
    const off = xfrm.getElementsByTagName('a:off')[0]
    const ext = xfrm.getElementsByTagName('a:ext')[0]
    if (off && ext) {
      x = emuToX(parseInt(off.getAttribute('x')) || 0)
      y = emuToY(parseInt(off.getAttribute('y')) || 0)
      width = emuToW(parseInt(ext.getAttribute('cx')) || 0)
      height = emuToH(parseInt(ext.getAttribute('cy')) || 0)
    }
    const rot = parseInt(xfrm.getAttribute('rot') || '0')
    rotation = Math.round(rot / 60000)
  }

  // Check if it has text
  const txBody = spNode.getElementsByTagName('p:txBody')[0]
  const hasText = txBody && txBody.getElementsByTagName('a:t').length > 0

  // Get shape geometry
  const prstGeom = spNode.getElementsByTagName('a:prstGeom')[0]
  const shapePreset = prstGeom ? prstGeom.getAttribute('prst') : 'rect'

  // Get fill color
  const fillColor = await getElementFill(spNode, zip)

  let textInfo = null
  if (hasText) {
    const effectiveBgColor = fillColor || slideBackgroundColor
    textInfo = await parseTextBody(txBody, zip, scaleFactor, effectiveBgColor)
  }

  const isRect = shapePreset === 'rect' || shapePreset === 'roundRect'

  if (hasText && isRect) {
    // Parse as text element
    // Use shape fill if available, otherwise slide background
    const effectiveBgColor = fillColor || slideBackgroundColor

    // Extract vertical alignment from <a:bodyPr anchor="...">
    const bodyPr = txBody.getElementsByTagName('a:bodyPr')[0]
    let verticalAlign = 'top'
    let padding = { left: 0, right: 0, top: 0, bottom: 0 }

    if (bodyPr) {
      // Vertical alignment
      const anchor = bodyPr.getAttribute('anchor')
      if (anchor === 'ctr') verticalAlign = 'middle'
      else if (anchor === 'b') verticalAlign = 'bottom'
      else verticalAlign = 'top'

      // Text box insets (padding) - convert EMU to px: 1px = 9525 EMU
      const emuToPx = (emu) => Math.round((emu / 9525) * (scaleFactor || 1))
      const lIns = bodyPr.hasAttribute('lIns') ? parseInt(bodyPr.getAttribute('lIns')) : 91440
      const rIns = bodyPr.hasAttribute('rIns') ? parseInt(bodyPr.getAttribute('rIns')) : 91440
      const tIns = bodyPr.hasAttribute('tIns') ? parseInt(bodyPr.getAttribute('tIns')) : 45720
      const bIns = bodyPr.hasAttribute('bIns') ? parseInt(bodyPr.getAttribute('bIns')) : 45720

      padding = {
        left: emuToPx(lIns),
        right: emuToPx(rIns),
        top: emuToPx(tIns),
        bottom: emuToPx(bIns),
      }
    }

    return {
      id: elementId,
      type: 'text',
      content: textInfo.text, // derived from runs concatenation
      runs: textInfo.runs,
      x, y, width, height, rotation,
      // Fallback: use first run styles or defaults if runs are empty
      fontSize: textInfo.runs?.[0]?.fontSize || 16,
      fontWeight: textInfo.runs?.[0]?.fontWeight || 400,
      fontFamily: textInfo.runs?.[0]?.fontFamily || 'Inter',
      fontStyle: textInfo.runs?.[0]?.fontStyle || 'normal',
      textDecoration: textInfo.runs?.[0]?.textDecoration || 'none',
      textAlign: textInfo.runs?.[0]?.textAlign || 'left', // This was actually p-level, need to check
      verticalAlign: verticalAlign,
      padding: padding,
      placeholderType: placeholderType,
      placeholderIdx: placeholderIdx,
      color: textInfo.runs?.[0]?.color || '#333333',
      opacity: 100,
      borderWidth: 0,
      borderColor: '#333333',
      borderRadius: 0,
      backgroundColor: fillColor || 'transparent',
    }
  }

  // Parse as shape element (only if it has a visible fill, has text, or it's a recognized shape)
  if (!fillColor && isRect && !hasText) return null // Skip invisible textless rects
  // Skip shapes that span the entire slide (usually background frames)
  if (width >= CANVAS_W - 10 && height >= CANVAS_H - 10 && !fillColor && !hasText) return null

  return {
    id: elementId,
    type: 'shape',
    userDrawn,
    x, y, width, height, rotation,
    shapeType: mapShapeType(shapePreset),
    placeholderType: placeholderType,
    placeholderIdx: placeholderIdx,
    fill: fillColor || (hasText ? 'transparent' : '#4CAF50'),
    content: textInfo ? textInfo.text : '',
    fontSize: textInfo?.runs?.[0]?.fontSize || 16,
    fontWeight: textInfo?.runs?.[0]?.fontWeight || 400,
    fontFamily: textInfo?.runs?.[0]?.fontFamily || 'Inter',
    fontStyle: textInfo?.runs?.[0]?.fontStyle || 'normal',
    textDecoration: textInfo?.runs?.[0]?.textDecoration || 'none',
    textAlign: textInfo?.runs?.[0]?.textAlign || 'center',
    color: textInfo?.runs?.[0]?.color || '#333333',
    opacity: 100,
    borderWidth: 0,
    borderColor: '#333333',
    borderRadius: 0,
    backgroundColor: 'transparent',
  }
}

const EMU = 914400 // EMUs per inch
const PT_TO_PX = 96 / 72 // Points to Pixels

const FONT_MAP = {
  'Raleway': 'Raleway',
  'Calibri': 'Raleway', // Override to Raleway
  'Aptos': 'Raleway',   // Override to Raleway
  'Cambria': 'Merriweather',
  'Times New Roman': 'Merriweather'
}

/** Parse <p:txBody> to extract text content and formatting */
async function parseTextBody(txBody, zip, scaleFactor, slideBackgroundColor) {
  const paragraphs = txBody.getElementsByTagName('a:p')
  const runs = []
  let fullText = ''

  for (let pi = 0; pi < paragraphs.length; pi++) {
    const p = paragraphs[pi]
    // Add newline if not the first paragraph
    if (pi > 0) {
      fullText += '\n'
      runs.push({ text: '\n' })
    }

    // A. Paragraph Properties (pPr) 
    let textAlign = 'left'
    let lineHeight = 1.15
    let marginTop = 0
    let marginBottom = 0
    let defRPr = null

    const pPr = p.getElementsByTagName('a:pPr')[0]
    if (pPr) {
      const algn = pPr.getAttribute('algn')
      if (algn === 'ctr') textAlign = 'center'
      else if (algn === 'r') textAlign = 'right'
      else if (algn === 'just') textAlign = 'justify'

      // Line spacing (lnSpc)
      const lnSpc = pPr.getElementsByTagName('a:lnSpc')[0]
      if (lnSpc) {
        const spcPct = lnSpc.getElementsByTagName('a:spcPct')[0]
        if (spcPct) {
          // 100000 = 100%
          lineHeight = parseInt(spcPct.getAttribute('val')) / 100000
        }
      }

      // Spacing Before (spcBef)
      const spcBef = pPr.getElementsByTagName('a:spcBef')[0]
      if (spcBef) {
        const spcPts = spcBef.getElementsByTagName('a:spcPts')[0]
        if (spcPts) {
          // val is in hundredths of a point. Convert to px: (val/100) * (96/72)
          marginTop = Math.round((parseInt(spcPts.getAttribute('val')) / 100) * (96 / 72))
        }
      }

      // Spacing After (spcAft)
      const spcAft = pPr.getElementsByTagName('a:spcAft')[0]
      if (spcAft) {
        const ptsNode = spcAft.getElementsByTagName('a:spcPts')[0]
        // Handle potential nesting or direct child
        const nestedPts = spcAft.getElementsByTagName('a:spcPts')[0]
        if (nestedPts) {
          marginBottom = Math.round((parseInt(nestedPts.getAttribute('val')) / 100) * (96 / 72))
        } else if (ptsNode) {
          marginBottom = Math.round((parseInt(ptsNode.getAttribute('val')) / 100) * (96 / 72))
        }
      }

      // Default Run Properties for this paragraph
      // Check for direct child or nested? Usually direct child of pPr
      defRPr = pPr.getElementsByTagName('a:defRPr')[0]
    }

    const runNodes = p.getElementsByTagName('a:r')

    // If no runs (empty paragraph), might be a blank line
    if (runNodes.length === 0) {
      continue
    }

    for (let ri = 0; ri < runNodes.length; ri++) {
      const r = runNodes[ri]
      const tNode = r.getElementsByTagName('a:t')[0]
      if (!tNode) continue

      const text = tNode.textContent || ''
      fullText += text

      const rPr = r.getElementsByTagName('a:rPr')[0]

      // --- STYLE EXTRACTION STRATEGY ---
      // 1. Try rPr (Run Properties)
      // 2. Try defRPr (Paragraph Default Run Properties)
      // 3. Fallback to System Defaults

      // Helper to check attribute presence
      const getAttr = (name) => {
        if (rPr && rPr.hasAttribute(name)) return rPr.getAttribute(name)
        if (defRPr && defRPr.hasAttribute(name)) return defRPr.getAttribute(name)
        return null
      }

      // Helper to find child tag
      // Priority: rPr child -> defRPr child
      // Note: getElementsByTagName searches subtree. Use childNodes or specificity if needed.
      // For a:latin, it is a direct child of rPr/defRPr.
      const getTag = (tagName) => {
        if (rPr) {
          const node = rPr.getElementsByTagName(tagName)[0]
          if (node) return node
        }
        if (defRPr) {
          const node = defRPr.getElementsByTagName(tagName)[0]
          if (node) return node
        }
        return null
      }

      // 1. Font Size
      // sz is in hundredths of a point (e.g. 1600 = 16pt)
      // New Formula: (xmlVal / 100) * 1.333 * scaleFactor
      let fontSize = 16 // System default
      const rawSz = getAttr('sz')
      if (rawSz) {
        // Apply scaling provided by the caller
        const ptSize = parseInt(rawSz) / 100
        // 1pt = 1.333px physically, but strictly applying this often yields text that feels too large on web.
        // Tuning to 1.0 provides a better "visual match" to PowerPoint's editor view.
        fontSize = Math.round(ptSize * 1.0 * (scaleFactor || 1))
      }

      // 2. Bold / Italic / Underline / Strike
      let fontWeight = 400
      let fontStyle = 'normal'
      let textDecoration = 'none'

      const boldAttr = getAttr('b')
      const italicAttr = getAttr('i')
      const underlineAttr = getAttr('u')
      const strikeAttr = getAttr('strike')
      const baselineAttr = getAttr('baseline') // Percentage

      if (boldAttr === '1') fontWeight = 700
      if (italicAttr === '1') fontStyle = 'italic'

      const decorations = []
      if (underlineAttr === 'sng') decorations.push('underline')
      if (strikeAttr === 'sng') decorations.push('line-through')
      textDecoration = decorations.length > 0 ? decorations.join(' ') : 'none'

      // 3. Typeface
      let fontFamily = 'Raleway, sans-serif' // Default changed to Raleway
      let typeface = null

      const latinNode = getTag('a:latin')
      if (latinNode) {
        const rawTypeface = latinNode.getAttribute('typeface')
        if (rawTypeface) {
          typeface = rawTypeface

          let resolvedFont = rawTypeface
          if (rawTypeface.startsWith('+')) {
            if (zip) {
              resolvedFont = await resolveThemeFont(zip, rawTypeface)
            }
          }

          if (FONT_MAP[resolvedFont]) {
            fontFamily = FONT_MAP[resolvedFont] + ', sans-serif'
          } else {
            if (resolvedFont === 'Raleway') {
              fontFamily = 'Raleway, sans-serif'
            } else {
              fontFamily = 'sans-serif'
              // Originally: resolvedFont + ', sans-serif'
            }
          }


        }
      }

      // 4. Color
      let color = '#000000'

      let val = null
      let lumMod = undefined
      let lumOff = undefined
      let type = 'none'

      // Priority search for solidFill
      let solidFill = null
      if (rPr) solidFill = rPr.getElementsByTagName('a:solidFill')[0]
      if (!solidFill && defRPr) solidFill = defRPr.getElementsByTagName('a:solidFill')[0]

      if (solidFill) {
        const srgb = solidFill.getElementsByTagName('a:srgbClr')[0]
        const schemeClr = solidFill.getElementsByTagName('a:schemeClr')[0]

        if (srgb) {
          val = srgb.getAttribute('val')
          type = 'srgb'
          color = '#' + val
        } else if (schemeClr) {
          type = 'scheme'
          val = schemeClr.getAttribute('val')
          const lumModOp = schemeClr.getElementsByTagName('a:lumMod')[0]
          const lumOffOp = schemeClr.getElementsByTagName('a:lumOff')[0]
          lumMod = lumModOp ? parseInt(lumModOp.getAttribute('val')) : undefined
          lumOff = lumOffOp ? parseInt(lumOffOp.getAttribute('val')) : undefined

          if (zip) {
            const resolved = await resolveSchemeColorFromTheme(zip, val, lumMod, lumOff)
            if (resolved) color = resolved
          }
        }
      }

      // Auto-Contrast Fallback:
      // If color is black/default and background is dark (luminance < 128), default to white.
      if ((color === '#000000' || color === '#333333') && slideBackgroundColor) {
        // Calculate background luminance
        const bgHex = slideBackgroundColor.replace('#', '')
        const r = parseInt(bgHex.substr(0, 2), 16)
        const g = parseInt(bgHex.substr(2, 2), 16)
        const b = parseInt(bgHex.substr(4, 2), 16)
        // Rec. 601 luminance
        const lum = 0.299 * r + 0.587 * g + 0.114 * b

        if (lum < 128) {
          color = '#ffffff'
        }
      }



      runs.push({
        text,
        fontSize,
        fontWeight,
        fontStyle,
        textDecoration,
        fontFamily,
        color,
        textAlign,
        strike: strikeAttr === 'sng' ? 'line-through' : 'none',
        baseline: parseInt(baselineAttr || '0'),
        lineHeight,
        marginTop,
        marginBottom
      })
    }
  }

  return { runs, text: fullText.trim() }
}

/** Get fill color from an element */
async function getElementFill(node, zip) {
  // Direct solidFill under spPr
  const spPr = node.getElementsByTagName('p:spPr')[0] || node.getElementsByTagName('a:spPr')[0]
  if (spPr) {
    const solidFill = spPr.getElementsByTagName('a:solidFill')[0]
    if (solidFill) {
      const srgb = solidFill.getElementsByTagName('a:srgbClr')[0]
      if (srgb) return '#' + srgb.getAttribute('val')
      // Check for scheme color
      const schemeClr = solidFill.getElementsByTagName('a:schemeClr')[0]
      if (schemeClr && zip) {
        const val = schemeClr.getAttribute('val')
        const lumModOp = schemeClr.getElementsByTagName('a:lumMod')[0]
        const lumOffOp = schemeClr.getElementsByTagName('a:lumOff')[0]
        const lumMod = lumModOp ? parseInt(lumModOp.getAttribute('val')) : undefined
        const lumOff = lumOffOp ? parseInt(lumOffOp.getAttribute('val')) : undefined
        return await resolveSchemeColorFromTheme(zip, val, lumMod, lumOff)
      }
    }
  }

  // Theme style fillRef
  const styleNode = node.getElementsByTagName('p:style')[0] || node.getElementsByTagName('a:style')[0]
  if (styleNode) {
    const fillRef = styleNode.getElementsByTagName('a:fillRef')[0]
    if (fillRef) {
      const srgb = fillRef.getElementsByTagName('a:srgbClr')[0]
      if (srgb) return '#' + srgb.getAttribute('val')
      const schemeClr = fillRef.getElementsByTagName('a:schemeClr')[0]
      if (schemeClr && zip) {
        const val = schemeClr.getAttribute('val')
        const lumModOp = schemeClr.getElementsByTagName('a:lumMod')[0]
        const lumOffOp = schemeClr.getElementsByTagName('a:lumOff')[0]
        const lumMod = lumModOp ? parseInt(lumModOp.getAttribute('val')) : undefined
        const lumOff = lumOffOp ? parseInt(lumOffOp.getAttribute('val')) : undefined
        return await resolveSchemeColorFromTheme(zip, val, lumMod, lumOff)
      }
    }
  }

  return null
}

/** Map PPTX shape presets to our shape types */
function mapShapeType(preset) {
  const map = {
    rect: 'rectangle',
    roundRect: 'rectangle',
    ellipse: 'circle',
    triangle: 'triangle',
    rtTriangle: 'triangle',
    star5: 'star',
    star4: 'star',
    star6: 'star',
    hexagon: 'hexagon',
    diamond: 'diamond',
    pentagon: 'pentagon',
    octagon: 'octagon',
    heart: 'heart',
    cloud: 'cloud',
    arrow: 'arrow',
    rightArrow: 'arrow',
    leftArrow: 'arrow',
  }
  return map[preset] || 'rectangle'
}

/** Parse an image element (<p:pic>) */
async function parseImageElement(picNode, elementId, emuToX, emuToY, emuToW, emuToH, relsMap, zip, xmlPath = null) {
  // Extract userDrawn from nvPr (support both p:nvPicPr and p:nvSpPr)
  let placeholderType = null
  let placeholderIdx = null
  let userDrawn = true

  const nvPicPr = picNode.getElementsByTagName('p:nvPicPr')[0] || picNode.getElementsByTagName('p:nvSpPr')[0]
  if (nvPicPr) {
    const nvPr = nvPicPr.getElementsByTagName('p:nvPr')[0]
    if (nvPr) {
      const ud = nvPr.getAttribute('userDrawn')
      if (ud === '0' || ud === 'false') userDrawn = false

      const ph = nvPr.getElementsByTagName('p:ph')[0]
      if (ph) {
        placeholderType = ph.getAttribute('type') || null
        placeholderIdx = ph.getAttribute('idx') || null
      }
    }
  }

  const xfrm = picNode.getElementsByTagName('a:xfrm')[0]
  if (!xfrm && !placeholderType) return null

  let x = 0, y = 0, width = 0, height = 0, rotation = 0
  if (xfrm) {
    const off = xfrm.getElementsByTagName('a:off')[0]
    const ext = xfrm.getElementsByTagName('a:ext')[0]
    if (off && ext) {
      x = emuToX(parseInt(off.getAttribute('x')) || 0)
      y = emuToY(parseInt(off.getAttribute('y')) || 0)
      width = emuToW(parseInt(ext.getAttribute('cx')) || 0)
      height = emuToH(parseInt(ext.getAttribute('cy')) || 0)
    }
    const rot = xfrm.getAttribute('rot')
    if (rot) {
      rotation = Math.round(parseInt(rot) / 60000)
    }
  }

  // Get image reference
  const blip = picNode.getElementsByTagName('a:blip')[0]
  const rEmbed = blip ? (blip.getAttribute('r:embed') || 
                        blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') ||
                        blip.getAttribute('r:link') ||
                        blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'link')) : null

  let src = ''
  if (rEmbed && relsMap && relsMap[rEmbed]) {
    let mediaPath = relsMap[rEmbed]
    if (xmlPath) {
      mediaPath = resolveRelativePath(xmlPath, mediaPath)
    } else {
      if (mediaPath.startsWith('../')) {
        mediaPath = 'ppt/' + mediaPath.replace('../', '')
      } else if (!mediaPath.startsWith('ppt/')) {
        mediaPath = 'ppt/slides/' + mediaPath
      }
    }

    const mediaFile = zip.file(mediaPath)
    console.log(`[PPTX IMG DEBUG] Image element: rEmbed=${rEmbed}, mediaPath=${mediaPath}, fileFound=${!!mediaFile}`)
    if (mediaFile) {
      try {
        const imgData = await mediaFile.async('base64')
        const ext = mediaPath.split('.').pop().toLowerCase()
        const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', webp: 'image/webp' }
        const mime = mimeMap[ext] || 'image/png'
        src = `data:${mime};base64,${imgData}`
      } catch (e) {
        console.log(`[PPTX IMG DEBUG] Error reading image: ${e.message}`)
      }
    }
  } else {
    console.log(`[PPTX IMG DEBUG] Image skipped: rEmbed=${rEmbed}, hasRelsMap=${!!relsMap}, inMap=${rEmbed ? !!relsMap?.[rEmbed] : false}`)
  }

  // If we couldn't resolve the source, but it's a placeholder, return it with empty src
  if (!src && !placeholderType) return null

  // Check for crop shape preset or custom geometry curve to apply circular border radius
  const spPr = picNode.getElementsByTagName('p:spPr')[0] || picNode.getElementsByTagName('a:spPr')[0] || picNode
  const prstGeom = spPr.getElementsByTagName('a:prstGeom')[0]
  const shapePreset = prstGeom ? prstGeom.getAttribute('prst') : 'rect'
  
  const custGeom = spPr.getElementsByTagName('a:custGeom')[0]
  let borderRadius = shapePreset === 'ellipse' ? '50%' : 0
  
  if (custGeom && !borderRadius) {
    const path = custGeom.getElementsByTagName('a:path')[0]
    if (path) {
      const w = parseFloat(path.getAttribute('w') || '0')
      const h = parseFloat(path.getAttribute('h') || '0')
      const hasCurves = custGeom.getElementsByTagName('a:cubicBezTo').length > 0
      // If the path contains curve instructions and is square-ish (aspect ratio near 1:1), treat as circular
      if (hasCurves && w > 0 && h > 0 && Math.abs(w - h) / w < 0.05) {
        borderRadius = '50%'
      }
    }
  }

  return {
    id: elementId,
    type: 'image',
    userDrawn,
    src,
    x, y, width, height,
    rotation,
    opacity: 100,
    borderWidth: 0,
    borderColor: '#333333',
    borderRadius,
    backgroundColor: 'transparent',
    content: '',
    placeholderType,
    placeholderIdx
  }
}

/** Parse a table element from <p:graphicFrame> */
function parseTableElement(gfNode, elementId, emuToX, emuToY, emuToW, emuToH) {
  const tbl = gfNode.getElementsByTagName('a:tbl')[0]
  if (!tbl) return null // Not a table

  const xfrm = gfNode.getElementsByTagName('a:xfrm')[0]
  if (!xfrm) return null

  const off = xfrm.getElementsByTagName('a:off')[0]
  const ext = xfrm.getElementsByTagName('a:ext')[0]
  if (!off || !ext) return null

  const x = emuToX(parseInt(off.getAttribute('x')) || 0)
  const y = emuToY(parseInt(off.getAttribute('y')) || 0)
  const width = emuToW(parseInt(ext.getAttribute('cx')) || 0)
  const height = emuToH(parseInt(ext.getAttribute('cy')) || 0)

  // Parse table data
  const rows = tbl.getElementsByTagName('a:tr')
  const data = []
  let colCount = 0

  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r].getElementsByTagName('a:tc')
    const rowData = []
    colCount = Math.max(colCount, cells.length)
    for (let c = 0; c < cells.length; c++) {
      const textNodes = cells[c].getElementsByTagName('a:t')
      let cellText = ''
      for (let t = 0; t < textNodes.length; t++) {
        cellText += textNodes[t].textContent || ''
      }
      rowData.push(cellText)
    }
    data.push(rowData)
  }

  if (data.length === 0) return null

  return {
    id: elementId,
    type: 'table',
    x, y, width, height,
    rows: data.length,
    cols: colCount,
    data,
    rotation: 0,
    opacity: 100,
    borderWidth: 0,
    borderColor: '#333333',
    borderRadius: 0,
    backgroundColor: 'transparent',
    content: '',
  }
}

/** Get speaker notes for a slide */
async function getSlideNotes(zip, slideNum) {
  // Notes are in ppt/notesSlides/notesSlideN.xml
  // But the mapping is via slide rels
  const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`
  const relsFile = zip.file(relsPath)
  if (!relsFile) return ''

  const relsXml = await relsFile.async('string')
  const relsDoc = new DOMParser().parseFromString(relsXml, 'application/xml')
  const rels = relsDoc.querySelectorAll('Relationship')

  let notesTarget = null
  rels.forEach(rel => {
    const type = rel.getAttribute('Type') || ''
    if (type.includes('notesSlide')) {
      notesTarget = rel.getAttribute('Target')
    }
  })

  if (!notesTarget) return ''

  // Resolve path
  let notesPath = notesTarget
  if (notesPath.startsWith('../')) {
    notesPath = 'ppt/' + notesPath.replace('../', '')
  } else if (!notesPath.startsWith('ppt/')) {
    notesPath = 'ppt/slides/' + notesPath
  }

  const notesFile = zip.file(notesPath)
  if (!notesFile) return ''

  try {
    const xml = await notesFile.async('string')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const textNodes = doc.getElementsByTagName('a:t')
    let notes = ''
    for (let i = 0; i < textNodes.length; i++) {
      const t = textNodes[i].textContent || ''
      // Skip slide number placeholder text
      if (t !== '‹#›' && t.trim()) {
        notes += t
      }
    }
    return notes.trim()
  } catch (e) {
    return ''
  }
}
/**
 * Merge layout elements with slide elements, resolving placeholders.
 * If a slide element matches a layout placeholder (by type/idx), the layout placeholder is removed.
 */
function mergeElements(layoutElements, slideElements) {
  // Map layout placeholders for easy lookup
  const layoutPlaceholders = new Map()
  const layoutContent = []

  for (const el of layoutElements) {
    // Check if it's a placeholder
    // Note: Text elements and Shapes can be placeholders. Images usually aren't but can be.
    if (el.placeholderType) {
      // Key: type + idx. If idx is missing, it's a generic type match (less specific).
      const key = `${el.placeholderType}_${el.placeholderIdx || '0'}`
      layoutPlaceholders.set(key, el)
    } else {
      layoutContent.push(el)
    }
  }

  const mergedEvents = []

  // Process slide elements
  for (const el of slideElements) {
    if (el.placeholderType) {
      const key = `${el.placeholderType}_${el.placeholderIdx || '0'}`
      // If we find a match in layout, we "consume" it (don't add it to final list)
      if (layoutPlaceholders.has(key)) {
        const layoutEl = layoutPlaceholders.get(key)
        layoutPlaceholders.delete(key) // Mark consumed

        // Inherit geometry if slide element is missing it (or if it's default 0,0,0,0)
        if (el.x === 0 && el.y === 0 && (el.width === 0 || el.width < 5)) {
          el.x = layoutEl.x
          el.y = layoutEl.y
          el.width = layoutEl.width
          el.height = layoutEl.height
          el.rotation = layoutEl.rotation
          if (layoutEl.borderRadius) {
            el.borderRadius = layoutEl.borderRadius
          }
        }

        // Inherit Styling (Font, Color, Alignment)
        // If the slide element seems to use defaults (e.g. fontSize 16), try to inherit from layout
        // 1. Font Size (if slide is 16 default or very small, and layout is different)
        if ((el.fontSize === 16 || el.fontSize < 10) && layoutEl.fontSize) {
          el.fontSize = layoutEl.fontSize
        }

        // 2. Font Family
        if ((!el.fontFamily || el.fontFamily.startsWith('Raleway')) && layoutEl.fontFamily) {
          el.fontFamily = layoutEl.fontFamily
        }

        // 3. Color (if slide is default black/dark and layout has color)
        const isGenericColor = el.color === '#000000' || el.color === '#333333'
        if (isGenericColor && layoutEl.color && layoutEl.color !== '#000000') {
          el.color = layoutEl.color
        }

        // 4. Alignment
        if (layoutEl.textAlign && el.textAlign === 'left') {
          el.textAlign = layoutEl.textAlign
        }
        if (layoutEl.verticalAlign && el.verticalAlign === 'top') {
          el.verticalAlign = layoutEl.verticalAlign
        }

        // 5. Update runs if they exist to match container inheritance (crucial for visual rendering)
        if (el.runs && el.runs.length > 0) {
          el.runs.forEach(run => {
            // Inherit properties if run matches element's previous (default) state
            if (run.fontSize === 16 && layoutEl.fontSize) run.fontSize = layoutEl.fontSize
            if ((!run.fontFamily || run.fontFamily.startsWith('Raleway')) && layoutEl.fontFamily) run.fontFamily = layoutEl.fontFamily
            if ((run.color === '#000000' || run.color === '#333333') && layoutEl.color) run.color = layoutEl.color
          })
        }

        // Inherit style if missing
        if (!el.fill && layoutEl.fill) el.fill = layoutEl.fill
        
        // If the slide placeholder was matched but has no text content and no source image, mark it as isPlaceholder
        el.isPlaceholder = !el.content && !el.src
      } else {
        el.isPlaceholder = !el.content && !el.src
      }
    } else {
      el.isPlaceholder = false
    }
    mergedEvents.push(el)
  }

  // Add remaining (unfilled) layout placeholders (only keep text placeholders to avoid raw shape placeholders)
  const remainingLayoutPlaceholders = Array.from(layoutPlaceholders.values())
    .filter(el => el.type === 'text')
  remainingLayoutPlaceholders.forEach(el => {
    el.isPlaceholder = true
  })

  // Combine Layout Content (e.g. backgrounds) + Unfilled Layout Placeholders + Slide Elements
  const combined = [...layoutContent, ...remainingLayoutPlaceholders, ...mergedEvents]

  // Filter out any placeholders that are empty and have zero/near-zero size to avoid clutter
  return combined.filter(el => {
    if (el.isPlaceholder && (el.width <= 5 || el.height <= 5)) {
      return false
    }
    return true
  })
}

/** Apply luminance modulation and offset to a hex color */
function applyLumModOff(hex, lumMod, lumOff) {
  if (!hex) return hex
  if (lumMod === undefined && lumOff === undefined) return hex

  // Convert hex to HSL
  let { h, s, l } = hexToHsl(hex)

  // Apply changes (values are in 1000th of percent, e.g. 60000 = 60%)
  if (lumMod !== undefined) {
    l = l * (lumMod / 100000)
  }
  if (lumOff !== undefined) {
    l = l + (lumOff / 100000)
  }

  // Clamp l between 0 and 1
  l = Math.max(0, Math.min(1, l))

  return hslToHex(h, s, l)
}

/** Helper: Hex to HSL */
function hexToHsl(hex) {
  let r = 0, g = 0, b = 0
  if (hex.length === 4) {
    r = parseInt('0x' + hex[1] + hex[1])
    g = parseInt('0x' + hex[2] + hex[2])
    b = parseInt('0x' + hex[3] + hex[3])
  } else if (hex.length === 7) {
    r = parseInt('0x' + hex[1] + hex[2])
    g = parseInt('0x' + hex[3] + hex[4])
    b = parseInt('0x' + hex[5] + hex[6])
  }

  r /= 255
  g /= 255
  b /= 255

  const cmin = Math.min(r, g, b)
  const cmax = Math.max(r, g, b)
  const delta = cmax - cmin

  let h = 0
  let s = 0
  let l = 0

  if (delta === 0) h = 0
  else if (cmax === r) h = ((g - b) / delta) % 6
  else if (cmax === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4

  h = Math.round(h * 60)
  if (h < 0) h += 360

  l = (cmax + cmin) / 2
  s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))

  return { h, s, l }
}

/** Helper: HSL to Hex */
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let r = 0, g = 0, b = 0

  if (0 <= h && h < 60) { r = c; g = x; b = 0 }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0 }
  else if (120 <= h && h < 180) { r = 0; g = c; b = x }
  else if (180 <= h && h < 240) { r = 0; g = x; b = c }
  else if (240 <= h && h < 300) { r = x; g = 0; b = c }
  else if (300 <= h && h < 360) { r = c; g = 0; b = x }

  r = Math.round((r + m) * 255).toString(16).padStart(2, '0')
  g = Math.round((g + m) * 255).toString(16).padStart(2, '0')
  b = Math.round((b + m) * 255).toString(16).padStart(2, '0')

  return '#' + r + g + b
}

/** Resolve a scheme color specific to a slide's theme */
async function resolveSchemeColorFromTheme(zip, schemeName, lumMod, lumOff) {
  try {
    // 1. Find theme file
    // Simplified: check ppt/theme/theme1.xml
    const themeXml = await zip.file('ppt/theme/theme1.xml')?.async('text')
    if (!themeXml) return null

    const parser = new DOMParser()
    const doc = parser.parseFromString(themeXml, 'text/xml')

    const clrScheme = doc.getElementsByTagName('a:clrScheme')[0]
    if (!clrScheme) return null

    // Map schemeName (e.g. accent1) to tag
    const map = {
      'bg1': 'a:dk1',
      'tx1': 'a:lt1',
      'bg2': 'a:dk2',
      'tx2': 'a:lt2',
      'accent1': 'a:accent1',
      'accent2': 'a:accent2',
      'accent3': 'a:accent3',
      'accent4': 'a:accent4',
      'accent5': 'a:accent5',
      'accent6': 'a:accent6',
      'hlink': 'a:hlink',
      'folHlink': 'a:folHlink'
    }

    const tagName = map[schemeName] || ('a:' + schemeName)
    const colorNode = clrScheme.getElementsByTagName(tagName)[0]
    if (!colorNode) return null

    // Check for srgbClr or sysClr
    const srgb = colorNode.getElementsByTagName('a:srgbClr')[0]
    const sysClr = colorNode.getElementsByTagName('a:sysClr')[0]

    let baseHex = null
    if (srgb) {
      baseHex = '#' + srgb.getAttribute('val')
    } else if (sysClr) {
      baseHex = '#' + sysClr.getAttribute('lastClr')
    }

    if (baseHex) {
      return applyLumModOff(baseHex, lumMod, lumOff)
    }

    return null
  } catch (e) {
    return null
  }
}

/** Resolve theme font (major/minor) from theme1.xml */
async function resolveThemeFont(zip, typefaceToken) {
  try {
    if (!typefaceToken || !typefaceToken.startsWith('+')) return typefaceToken

    const themeXml = await zip.file('ppt/theme/theme1.xml')?.async('text')
    if (!themeXml) return typefaceToken // Fallback to raw token if no theme

    const parser = new DOMParser()
    const doc = parser.parseFromString(themeXml, 'text/xml')

    const fontScheme = doc.getElementsByTagName('a:fontScheme')[0]
    if (!fontScheme) return typefaceToken

    let fontNode = null
    if (typefaceToken === '+mj-lt') {
      // Major Font (Latin)
      const majorFont = fontScheme.getElementsByTagName('a:majorFont')[0]
      if (majorFont) fontNode = majorFont.getElementsByTagName('a:latin')[0]
    } else if (typefaceToken === '+mn-lt') {
      // Minor Font (Latin)
      const minorFont = fontScheme.getElementsByTagName('a:minorFont')[0]
      if (minorFont) fontNode = minorFont.getElementsByTagName('a:latin')[0]
    }

    if (fontNode) {
      return fontNode.getAttribute('typeface') || typefaceToken
    }

    return typefaceToken
  } catch (e) {
    return typefaceToken
  }
}
