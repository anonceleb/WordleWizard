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

# center tile
tile_w = 92
tile_h = 72
tx = (size - tile_w)//2
ty = (size - tile_h)//2 + 4
corner = 8
draw.rounded_rectangle([tx,ty,tx+tile_w,ty+tile_h], radius=corner, fill=white)

# small hat (triangle + brim) above W
hat_cx = tx + tile_w//2
hat_cy = ty + 12
hat = [ (hat_cx-18, hat_cy+4), (hat_cx, hat_cy-12), (hat_cx+18, hat_cy+4) ]
draw.polygon(hat, fill=bg1)
draw.rounded_rectangle([hat_cx-20, hat_cy+4, hat_cx+20, hat_cy+8], radius=2, fill=bg1)

# draw W letter
# prefer a bold system font; fallback to default
try:
    f = ImageFont.truetype("/System/Library/Fonts/Supplemental/Verdana.ttf", 36)
except Exception:
    f = ImageFont.load_default()

w_text = "W"
# measure using textbbox for compatibility
bbox = draw.textbbox((0,0), w_text, font=f)
w_size = (bbox[2]-bbox[0], bbox[3]-bbox[1])
wx = tx + (tile_w - w_size[0])//2
wy = ty + (tile_h - w_size[1])//2 + 4
# Draw letter in primary color
draw.text((wx, wy), w_text, font=f, fill=bg1)

outpath = os.path.join(outdir, 'icon128.png')
img.save(outpath, optimize=True)
print('Created', outpath)