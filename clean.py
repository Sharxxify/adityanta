with open("src/pages/Editor/EditorPage.jsx", "r", encoding="utf8") as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if "border: selected ?" in line:
        continue
    if "borderRadius: '16px'" in line:
        continue
    if "background: frameData?.backgroundImage" in line:
        skip = True
        new_lines.append("                        border: selected ? '2px solid #1a73e8' : '1px solid #e5e7eb',\n")
        new_lines.append("                        borderRadius: '16px',\n")
        new_lines.append("                        background: frameData?.backgroundImage\n")
        new_lines.append("                          ? `url(\"${frameData.backgroundImage}\") center/cover no-repeat`\n")
        new_lines.append("                          : (frameData?.backgroundColor || '#ffffff'),\n")
        continue
    if skip and "boxShadow: selected ?" in line:
        skip = False
        new_lines.append("                        boxShadow: selectedVisual ? '0 14px 40px rgba(15, 23, 42, 0.18)' : '0 8px 24px rgba(15, 23, 42, 0.12)',\n")
        continue

    if not skip:
        new_lines.append(line)

with open("src/pages/Editor/EditorPage.jsx", "w", encoding="utf8") as f:
    f.writelines(new_lines)
