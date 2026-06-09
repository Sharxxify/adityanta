import re

with open('src/pages/Editor/EditorPage.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

pattern = r"""\bcase 'image':\s+return \(\s*<div.*?className=\{`w-full h-full flex flex-col \$\{element\.caption && element\.showCaption \? 'gap-1' : ''\}`\}>\s*<img\s+src=\{element\.src\}\s+alt=\{element\.caption \|\| "canvas"\}\s+className=\{`\$\{element\.caption && element\.showCaption \? 'flex-1' : 'w-full h-full'\}` object-fill rounded\}\s+draggable=\{false\}"""

replacement = """        case 'image':
          return (
            <div className={`w-full h-full flex flex-col ${element.caption && element.showCaption ? 'gap-1' : ''}`} style={{ transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined }}>
              <img
                src={element.src}
                alt={element.caption || "canvas"}
                className={`${element.caption && element.showCaption ? 'flex-1' : 'w-full h-full'} object-contain rounded`}
                style={{ transform: (`${element.flipH ? 'scaleX(-1)' : ''} ${element.flipV ? 'scaleY(-1)' : ''}`).trim() || undefined }}
                draggable={false}"""

text2 = re.sub(pattern, replacement, text, count=1, flags=re.DOTALL)
if text2 != text:
    print("Patched successfully!")
else:
    print("Match failed. Using string replacing:")
    p = "className={`w-full h-full flex flex-col ${element.caption && element.showCaption ? 'gap-1' : ''}`}>"
    r = "className={`w-full h-full flex flex-col ${element.caption && element.showCaption ? 'gap-1' : ''}`} style={{ transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined }}>"
    
    p2 = "className={`${element.caption && element.showCaption ? 'flex-1' : 'w-full h-full'} object-fill rounded`}"
    r2 = "className={`${element.caption && element.showCaption ? 'flex-1' : 'w-full h-full'} object-contain rounded`} style={{ transform: (`${element.flipH ? 'scaleX(-1)' : ''} ${element.flipV ? 'scaleY(-1)' : ''}`).trim() || undefined }}"
    
    text = text.replace(p, r)
    text = text.replace(p2, r2)
    print("Fallbacks applied if possible.")
    text2 = text


with open('src/pages/Editor/EditorPage.jsx', 'w', encoding='utf-8') as f:
    f.write(text2)