import re

with open('src/pages/Editor/EditorPage.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

start = text.find("case 'text':")
end = text.find("case 'image':", start)

old_block = text[start:end]

new_block = old_block.replace('whitespace-pre-wrap p-2 text-editable', 'whitespace-pre-wrap text-editable')
new_block = new_block.replace('whitespace-pre-wrap p-2 overflow-hidden', 'whitespace-pre-wrap overflow-hidden')

new_textarea_styles = '''caretColor: '#0078d7',
                paddingTop: element.padding?.top ?? 8,
                paddingBottom: element.padding?.bottom ?? 8,
                paddingLeft: element.padding?.left ?? 8,
                paddingRight: element.padding?.right ?? 8,'''

new_block = new_block.replace("caretColor: '#0078d7',", new_textarea_styles)

new_div_styles = '''backgroundColor: element.backgroundColor || 'transparent',
              display: 'flex',
              alignItems: element.verticalAlign === 'middle' ? 'center' : element.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
              justifyContent: element.textAlign === 'center' ? 'center' : element.textAlign === 'right' ? 'flex-end' : 'flex-start',
              paddingTop: element.padding?.top ?? 8,
              paddingBottom: element.padding?.bottom ?? 8,
              paddingLeft: element.padding?.left ?? 8,
              paddingRight: element.padding?.right ?? 8,'''

new_block = new_block.replace("backgroundColor: element.backgroundColor || 'transparent',", new_div_styles)

text = text[:start] + new_block + text[end:]

with open('src/pages/Editor/EditorPage.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Patch applied successfully')
