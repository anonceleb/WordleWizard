Add screenshots here for the Chrome Web Store listing:
- Recommended sizes: 1280×800 or similar landscape PNGs.
- Name example: `screenshot1.png`, `screenshot2.png`.

Example steps to capture screenshots on macOS:
1. Open the Wordle page and open the extension panel.
2. Use macOS screenshot tool (Cmd+Shift+4) to capture the panel region.
3. Save the PNGs into this folder.

Placeholders are recommended while preparing the listing; real screenshots are required during submission.

Automated generation (optional) — deprecated

A Puppeteer-based generator was added to create consistent mock screenshots, but it is optional and may not be desirable in all environments. If you don't need the generator and want to remove the files, run the cleanup script from the repo root:

    ./scripts/cleanup_extra.sh

You can still produce screenshots from the vector `screenshot-*.svg` files using ImageMagick (see below). If you want the generator back later, re-add `generate_screenshots.js` and `package.json` from your VCS history.

Converting SVG mocks to PNG (no Node/Puppeteer)

If you cannot or prefer not to run the Puppeteer generator, the `screenshot-*.svg` files in this folder are high-quality vector mockups. Convert them to PNG using ImageMagick:

1. Install ImageMagick (macOS):
   brew install imagemagick

2. Run (from repo root):
   ./scripts/convert_svgs_to_png.sh

This script will create `screenshot-*.png` files alongside the SVGs. Alternatively, open an SVG in Chrome or Safari and right-click → Save image as... to export a PNG.