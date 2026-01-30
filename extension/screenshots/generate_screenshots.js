const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

(async () => {
  const outDir = path.resolve(__dirname);
  const fileUrl = 'file://' + path.resolve(__dirname, 'mock_panel.html');
  const states = [
    { name: 'panel-open', state: 'default', width: 1280, height: 800 },
    { name: 'top-suggestion', state: 'meaning', width: 1280, height: 800 },
    { name: 'validated-row', state: 'validated', width: 1280, height: 800 },
    { name: 'winning', state: 'win', width: 1280, height: 800 }
  ];

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    for (const s of states) {
      const page = await browser.newPage();
      await page.setViewport({ width: s.width, height: s.height, deviceScaleFactor: 1 });
      const url = fileUrl + '?state=' + s.state;
      await page.goto(url, { waitUntil: 'networkidle0' });
      // small delay to ensure fonts and layout are stable
      await page.waitForTimeout(200);

      // compute bounding box of the panel to crop tightly
      const clip = await page.evaluate(() => {
        const el = document.querySelector('#wordle-helper-panel');
        const r = el.getBoundingClientRect();
        return { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 16), width: Math.min(window.innerWidth, r.width + 32), height: Math.min(window.innerHeight, r.height + 32) };
      });

      const outPath = path.join(outDir, `screenshot-${s.name}.png`);
      await page.screenshot({ path: outPath, clip });
      console.log('Wrote', outPath);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})();