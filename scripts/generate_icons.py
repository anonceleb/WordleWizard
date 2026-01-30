#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont
import os

# Colors
bg1 = (11,102,178)
bg2 = (74,163,224)
white = (255,255,255)

outdir = os.path.join(os.path.dirname(__file__), '..', 'extension', 'icons')
os.makedirs(outdir, exist_ok=True)

sizes = [512, 128, 48, 16]

for size in sizes:
    img = Image.new('RGBA', (size, size), (0,0,0,0))
    draw = ImageDraw.Draw(img)

    # Draw rounded outer background (gradient approximation: simple blend)
    # We'll simulate a diagonal gradient by drawing a few blended rectangles
    for i in range(size):
        t = i / (size-1)
        r = int(bg1[0] * (1-t) + bg2[0] * t)
        g = int(bg1[1] * (1-t) + bg2[1] * t)
        b = int(bg1[2] * (1-t) + bg2[2] * t)
        draw.line([(0,i),(size,i)], fill=(r,g,b))

    # mask rounded corners by drawing white rounded rect on alpha
    mask = Image.new('L', (size,size), 0)
    md = ImageDraw.Draw(mask)
    corner = size // 10
    md.rounded_rectangle([0,0,size,size], radius=corner, fill=255)
    img.putalpha(mask)

    # grid tile parameters (scaled)
    tile_w = int(size * 0.12)
    tile_h = tile_w
    gap = int(tile_w * 0.4)
    start_x = (size - (tile_w*5 + gap*4)) // 2
    start_y = size // 3

    # Draw five tiles
    for i in range(5):
        x = start_x + i*(tile_w+gap)
        y = start_y
        draw.rounded_rectangle([x,y,x+tile_w,y+tile_h], radius=int(tile_w*0.15), fill=white)

    # entropy bars over center tile
    center_x = start_x + 2*(tile_w+gap) + tile_w//2
    bar_w = max(1, tile_w // 5)
    heights = [int(tile_h*0.85), int(tile_h*0.6), int(tile_h*0.4), int(tile_h*0.7)]
    colors = [(11,102,178),(55,160,224),(109,208,255),(255,255,255,60)]
    for idx,h in enumerate(heights):
        bx = center_x - (len(heights)*bar_w + (len(heights)-1)*2)//2 + idx*(bar_w+2)
        by = start_y + tile_h - h - 4
        rgba = colors[idx]
        if len(rgba)==4:
            # semi-transparent
            overlay = Image.new('RGBA', (bar_w,h), rgba)
            img.paste(overlay, (bx,by), overlay)
        else:
            draw.rounded_rectangle([bx,by,bx+bar_w, by+h], radius=bar_w//2, fill=rgba)

    # Save scaled image
    outname = os.path.join(outdir, f"icon{size}.png")
    img.save(outname, optimize=True)
    print('Created', outname)

# Also save a 128 icon as the main file names expected by extension
import shutil
shutil.copyfile(os.path.join(outdir,'icon128.png'), os.path.join(outdir,'icon128.png'))
shutil.copyfile(os.path.join(outdir,'icon48.png'), os.path.join(outdir,'icon48.png'))
shutil.copyfile(os.path.join(outdir,'icon16.png'), os.path.join(outdir,'icon16.png'))
print('Icons generation complete')