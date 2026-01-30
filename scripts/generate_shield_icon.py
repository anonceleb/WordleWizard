#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import os

outdir = os.path.join(os.path.dirname(__file__), '..', 'extension', 'icons')
os.makedirs(outdir, exist_ok=True)
size = 128

# Colors
bg1 = (11,102,178)
bg2 = (74,163,224)
crown = (242,201,76)
crown_stroke = (184,137,25)
shield_blue = (47,139,214)
shield_blue_stroke = (27,95,144)
shield_red = (233,87,63)
white = (255,255,255)

img = Image.new('RGBA', (size, size), (0,0,0,0))
draw = ImageDraw.Draw(img)

# diagonal gradient background
for y in range(size):
    t = y/(size-1)
    r = int(bg1[0]*(1-t) + bg2[0]*t)
    g = int(bg1[1]*(1-t) + bg2[1]*t)
    b = int(bg1[2]*(1-t) + bg2[2]*t)
    draw.line([(0,y),(size,y)], fill=(r,g,b))

# rounded mask
mask = Image.new('L', (size,size), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([0,0,size,size], radius=18, fill=255)
img.putalpha(mask)

# draw crown (simple polygon)
crown_points = [(40,22),(46,10),(60,22),(72,10),(80,22),(84,22),(84,32),(40,32)]
draw.polygon(crown_points, fill=crown, outline=crown_stroke)

# draw shield outer path via polygon approximating the svg path
# coordinates are tuned for the 128 canvas
shield = [(52,36),(88,48),(88,88),(68,106),(52,116),(36,106),(16,88),(16,48)]
draw.polygon(shield, fill=shield_blue, outline=shield_blue_stroke)

# draw right-side red overlay shape (mask-like)
# We'll draw a smaller polygon to simulate the split
right_shape = [(52,36),(68,44),(68,84),(58,96),(52,104),(52,36)]
draw.polygon(right_shape, fill=shield_red)

# inner small shapes for segmentation (subtle)
draw.rectangle([30,56,48,72], fill=(255,255,255,30))
draw.rectangle([56,56,66,66], fill=(255,255,255,20))
draw.rectangle([40,72,74,82], fill=(255,255,255,20))

# circular W badge bottom-right
badge_center = (96,96)
badge_r = 18
draw.ellipse([badge_center[0]-badge_r,badge_center[1]-badge_r,badge_center[0]+badge_r,badge_center[1]+badge_r], fill=white)

# draw bold W
try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Verdana.ttf', 18)
except Exception:
    font = ImageFont.load_default()
text = 'W'
# center text
bbox = draw.textbbox((0,0), text, font=font)
w = bbox[2]-bbox[0]
h = bbox[3]-bbox[1]
text_pos = (badge_center[0]-w//2, badge_center[1]-h//2)
draw.text(text_pos, text, font=font, fill=(11,102,178))

outpath = os.path.join(outdir, 'icon128.png')
img.save(outpath, optimize=True)
print('Created', outpath)