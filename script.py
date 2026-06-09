import os
import json
import shutil
src = r'./Adityaant Background Images'
dst = r'./public/backgrounds'
data = {}
for root, dirs, files in os.walk(src):
    topic = os.path.basename(root)
    if topic == 'Adityaant Background Images': continue
    topic_data = []
    topic_dst = os.path.join(dst, topic)
    os.makedirs(topic_dst, exist_ok=True)
    for f in files:
        if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
            src_f = os.path.join(root, f)
            dst_f = os.path.join(topic_dst, f)
            shutil.copy2(src_f, dst_f)
            topic_data.append(f'/backgrounds/{topic}/{f}')
    if topic_data:
        data[topic] = topic_data

with open(r'./src/utils/backgroundData.json', 'w') as f:
    json.dump(data, f, indent=2)
