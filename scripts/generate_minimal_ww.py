#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import os

outdir = os.path.join(os.path.dirname(__file__), '..', 'extension', 'icons')
os.makedirs(outdir, exist_ok=True)
size = 128
bg1 = (11,102,178)
bg2 = (74,163,224)
white = (255,255,255)

img = Image.new('RGBA', (size, size), (0,0,0,0))
draw = ImageDraw.Draw(img)

# diagonal gradient
for i in range(size):
    t = i/(size-1)
    r = int(bg1[0]*(1-t) + bg2[0]*t)
    g = int(bg1[1]*(1-t) + bg2[1]*t)
    b = int(bg1[2]*(1-t) + bg2[2]*t)
    draw.line([(0,i),(size,i)], fill=(r,g,b))

# rounded mask
mask = Image.new('L', (size,size), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([0,0,size,size], radius=20, fill=255)
img.putalpha(mask)

# draw centered WW
try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Verdana.ttf', 62)
except Exception:
    font = ImageFont.load_default()

text = 'WW'
bbox = draw.textbbox((0,0), text, font=font)
w, h = bbox[2]-bbox[0], bbox[3]-bbox[1]
x = (size - w)//2
y = (size - h)//2

# Slightly reduce stroke/weight by drawing white text then overlaying a smaller colored inset if desired; keep minimal style
# Draw white text shadow to ensure contrast
shadow_offset = 0
draw.text((x+shadow_offset, y+shadow_offset), text, font=font, fill=white)
# draw main text (same color as background accent for a clean, minimal look)
draw.text((x, y), text, font=font, fill=white)

outpath = os.path.join(outdir, 'icon128.png')
img.save(outpath, optimize=True)
print('Created', outpath)