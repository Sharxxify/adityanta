import re

def fix():
    with open('src/pages/Editor/EditorPage.jsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Apply rotation wrapper
    old1 = """      case 'image':
          return (
            <div className={`w-full h-full flex flex-col ${element.caption && element.showCaption ? 'gap-1' : ''}`}>"""
            
    new1 = """      case 'image':
          return (
            <div className={`w-full h-full flex flex-col ${element.caption && element.showCaption ? 'gap-1' : ''}`} style={{ transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined }}>"""

    # Apply flip and object-contain
    old2 = """              <img
                src={element.src}
                alt={element.caption || "canvas"}
                className={`${element.caption && element.showCaption ? 'flex-1' : 'w-full h-full'} object-fill rounded`}"""
                
    new2 = """              <img
                src={element.src}
                alt={element.caption || "canvas"}
                className={`${element.caption && element.showCaption ? 'flex-1' : 'w-full h-full'} object-contain rounded`}
                style={{ transform: (`${element.flipH ? 'scaleX(-1)' : ''} ${element.flipV ? 'scaleY(-1)' : ''}`).trim() || undefined }}"""

    content = content.replace(old1, new1)
    content = content.replace(old2, new2)

    with open('src/pages/Editor/EditorPage.jsx', 'w', encoding='utf-8') as f:
        f.write(content)

fix()