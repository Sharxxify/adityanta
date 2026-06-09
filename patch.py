import re
import os

with open('src/pages/Editor/EditorPage.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

with open('19th march updated/src/pages/Editor/EditorPage.jsx', 'r', encoding='utf-8') as f:
    old_text = f.read()

# 1. Remove the entire constants clump from BG_L to buildPolishedTemplateFrames function
consts_re = r'// Background bounds \(from PREZI_LAYOUT_PRESETS.*?const buildPolishedTemplateFrames = \(title, topic\) => \{.*?return slides\.map\(\(slide, index\) => \{.*?\}\)\s*\}'
text = re.sub(consts_re, 'const PREZI_FLOW_ORDER = [1, 2, 0, 3, 4]', text, flags=re.DOTALL)
print('Removed constants:', text != old_text)

# We need to just nuke the prezi stuff. Or rather find the EXACT regexes it needs.
