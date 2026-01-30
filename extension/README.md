Wordle Hard Mode Helper

Installation (developer mode):
1. Open Chrome -> Extensions -> Load unpacked
2. Select the `extension/` directory from this workspace
3. Open Wordle (https://www.nytimes.com/games/wordle)
4. The helper panel appears at the bottom-right. It auto-detects your guesses and updates suggestions.

Notes:
- This extension respects the provided `words.txt` in the unpacked extension folder.
- For performance reasons, the solver runs fully client-side in JS.
- The extension attempts to detect the Wordle web component structure; if the NYTimes page changes, the selector logic may need updates.
- UI: the helper runs in Auto mode by default (aggressive detection, refresh and force-detection are automatic). The compact UI shows the top suggestion and a short meaning, mirrors your attempt tiles, and displays the top-3 candidate suggestions beneath the tiles. Manual control buttons were removed for a cleaner experience.

Publishing: see `PUBLISHING.md` for a checklist and packaging notes when preparing the extension for Chrome Web Store publishing.

Debugging / inspecting helper state from DevTools
- The content script writes diagnostic data to the page DOM attributes for easy inspection from the page console:
  - `document.documentElement.getAttribute('data-wordle-helper-scan')` contains a JSON scan summary (hasUnvalidated, unvalidatedRows, rowsFound, tilesFound).
  - `document.documentElement.getAttribute('data-wordle-helper-history')` contains the parsed validated history as JSON (array of [guess, feedback]).

Example commands from the page console:
```js
JSON.parse(document.documentElement.getAttribute('data-wordle-helper-scan') || '{}')
JSON.parse(document.documentElement.getAttribute('data-wordle-helper-history') || '[]')
```
Note: previous attempts at injecting inline scripts were blocked by the page's Content Security Policy; the approach above uses DOM attributes and works without injecting page scripts.

Security and Privacy:
- No external servers are used; everything runs locally in the browser.
- The extension reads the Wordle page DOM to detect guesses; it does not transmit data externally.
