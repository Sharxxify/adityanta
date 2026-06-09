import re
import traceback

def safe_replace(pattern, repl, text, name=''):
    count = len(re.findall(pattern, text))
    if count == 1:
        print(f"[OK] {name} matched exactly once.")
        return re.sub(pattern, repl, text)
    else:
        print(f"[FAIL] {name} matched {count} times.")
        return text

def patch_editor():
    with open('src/pages/Editor/EditorPage.jsx', 'r', encoding='utf-8') as f:
        new_ed = f.read()

    with open('19th march updated/src/pages/Editor/EditorPage.jsx', 'r', encoding='utf-8') as f:
        old_ed = f.read()

    # Step 1: Remove consts
    pat_consts = re.compile(r'  // Background bounds \(from PREZI_LAYOUT_PRESETS with 40px padding each side\).*?\n  const buildPolishedTemplateFrames = \(title, topic\) => \{.*?    \} \? \{ \.\.\.PREZI_LAYOUT_PRESETS\[index\] \} : undefined,\n        notes: \'\',\n        transition: \'fade\',\n        elements: \[\n          \{\n            id: baseId \+ 1,\n            type: \'shape\',\n            shapeType: \'rectangle\',\n            x: 64,\n            y: 56,\n            width: 170,\n            height: 44,\n            fill: \'#111827\',\n            strokeColor: \'#111827\',\n            strokeWidth: 0,\n            rotation: 0,\n            opacity: 1,\n            radius: 8,\n            shadowY: 2,\n            shadowBlur: 4,\n            shadowColor: \'rgba\(0,0,0,0.1\)\',\n            locked: false,\n          \},\n        \]\n      \}\n    \}\)\n  \}\n', re.DOTALL)
    # The regex above is huge. Let's just use string search and slice.
    
    # Better approach:
    # Find start: "const PREZI_LAYOUT_PRESETS = ["
    idx_start = new_ed.find("const PREZI_LAYOUT_PRESETS = [")
    idx_end = new_ed.find("const frameMapLayout = useMemo(() => {")
    if idx_start != -1 and idx_end != -1:
        # Actually PREZI is earlier, let's find BG_L
        idx_start = new_ed.find("// Background bounds (from PREZI_LAYOUT_PRESETS")
        new_ed = new_ed[:idx_start] + "\n" + new_ed[idx_end:]
        print("[OK] Removed Prezi blocks")
    else:
        print("[FAIL] Prezi blocks not found")

    # Remove frameMapLayout etc.
    idx_start = new_ed.find("  const frameMapLayout = useMemo(() => {")
    idx_end = new_ed.find("  // Ensure frames are always initialized - safety fallback")
    if idx_start != -1 and idx_end != -1:
        new_ed = new_ed[:idx_start] + "  const activeFrame = frames.find(f => f.id === activeFrameId) || frames[0]\n\n" + new_ed[idx_end:]
        print("[OK] Removed frameMapLayout vars")
    else:
        print("[FAIL] frameMapLayout not found")

    # Replace useEffect for Template
    idx_old_start = old_ed.find("  // Load template or user file on mount if templateId exists")
    idx_old_end = old_ed.find("  // Save project to Your Files")
    if idx_old_start != -1 and idx_old_end != -1:
        old_effect_str = old_ed[idx_old_start:idx_old_end - 4] # subtract till last bracket
        
    idx_new_start = new_ed.find("  // Load template or user file on mount if templateId exists")
    idx_new_end = new_ed.find("  // Save project to Your Files")
    
    # Actually wait. The old `EditorPage.jsx` has `// Handle right click` right after the effect. So old_end should be `// Handle right click`.
    idx_old_end = old_ed.find("  // Handle right click")
    old_effect_str = old_ed[idx_old_start:idx_old_end]
    
    idx_new_end = new_ed.find("  // Handle right click")
    if idx_new_start != -1 and idx_new_end != -1:
        new_ed = new_ed[:idx_new_start] + old_effect_str + new_ed[idx_new_end:]
        print("[OK] Replaced Template Load Effect")
    else:
        print("[FAIL] Replaced Template Load Effect not found")

    # Replace Canvas Area
    idx_old_canvas_start = old_ed.find("          {/* Canvas Area - keep slide fully visible, centered horizontally, toolbar separated below */}")
    idx_old_canvas_end = old_ed.find("          {/* Editor Toolbar (Fixed At Bottom) */}")
    old_canvas_str = old_ed[idx_old_canvas_start:idx_old_canvas_end]
    
    idx_new_canvas_start = new_ed.find("          {/* Canvas Area - infinite Prezi-style world */}")
    idx_new_canvas_end = new_ed.find("          {/* Editor Toolbar (Fixed At Bottom) */}")
    
    if idx_new_canvas_start != -1 and idx_new_canvas_end != -1:
        new_ed = new_ed[:idx_new_canvas_start] + old_canvas_str + new_ed[idx_new_canvas_end:]
        print("[OK] Replaced Canvas")
    else:
        print("[FAIL] Replaced Canvas not found")

    with open('src/pages/Editor/EditorPage.patched.jsx', 'w', encoding='utf-8') as f:
        f.write(new_ed)

patch_editor()
