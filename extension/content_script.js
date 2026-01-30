(async function(){
  // Load CSS (use extension/ prefix to match actual file location)
  const cssHref = chrome.runtime.getURL('extension/ui.css');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = cssHref;
  document.head.appendChild(link);


  // Debug helpers must be available early (some fetch logs occur before UI insertion)
  let debugMode = false;
  function logDebug(...args) { try { if (debugMode) console.debug('[Wordle Helper]', ...args); } catch(e) {} }
  function logInfo(...args) { try { if (debugMode) console.info('[Wordle Helper]', ...args); } catch(e) {} }

  // Lightweight performance probing (non-invasive)
  const whPerfLogs = [];
  function perfLog(tag, ms, details) {
    try {
      const entry = { t: Date.now(), tag: tag, ms: Number(ms || 0), details: details || '' };
      whPerfLogs.push(entry);
      // Keep logs short
      while (whPerfLogs.length > 1200) whPerfLogs.shift();
      if (debugMode) appendLog('[PERF] ' + tag + ': ' + (ms ? ms.toFixed(1) + 'ms' : '') + ' ' + (details || ''), { force: true });
    } catch (e) {}
  }
  // Expose a quick dump helper on window for manual inspection in console (user can call this)
  try { window.WordleHelperPerfDump = function() { console.table(whPerfLogs.slice(-200)); return whPerfLogs.slice(-200); };
    window.WordleHelperEnableDebug = function() { debugMode = true; appendLog('Debug mode enabled', { force: true }); console.info('[Wordle Helper] debug enabled - performance logs will appear in console'); return true; };
    window.WordleHelperDisableDebug = function() { debugMode = false; appendLog('Debug mode disabled', { force: true }); console.info('[Wordle Helper] debug disabled'); return true; };
    window.WordleHelperComputeDump = function() { return window.WordleHelperLastCompute || null; };
    window.WordleHelperClearLastCompute = function() { try{ window.WordleHelperLastCompute = undefined; return true; } catch(e){ return false; } };
  } catch (e) {}

  // Pre-declare UI pointers to avoid TDZ when used during early fetches
  let wordsCountEl = null;

  // Load words with fallback and error handling
  let words = [];
  try {
    // Prefer extension/words.txt first (avoids denied fetches for chrome-extension://<id>/words.txt)
    const candidates = ['extension/words.txt', 'words.txt'];
    let resp = null;
    const tried = [];
    for (const path of candidates) {
      const url = chrome.runtime.getURL(path);
      tried.push(url);
      try {
        logDebug('attempting to fetch words from', url);
        const r = await fetch(url);
        if (r && r.ok) { resp = r; break; }
        if (r) logDebug('Fetch returned status for ' + path + ':', r.status, r.statusText);
      } catch (e) {
        if (debugMode) appendLog('Fetch attempt to ' + url + ' threw: ' + (e && e.message));
      }
    }

    if (resp && resp.ok) {
      const wordsText = await resp.text();
      words = window.WordleSolver.loadWords(wordsText);
      logInfo('word list loaded, total words:', words.length);
      if (wordsCountEl) wordsCountEl.textContent = String(words.length);
    } else {
      // If direct fetch fails, try asking the background worker to fetch the resource (works around CSP)
      logInfo('Wordle Helper: initial fetches failed for ' + tried.join(', ') + '; attempting background fetch');
      let loaded = false;
      try {
        const ok = await ensureBackgroundAlive(2);
        if (ok && chrome && chrome.runtime && chrome.runtime.sendMessage) {
          const candidatesBg = ['extension/words.txt', 'words.txt'];
          for (const path of candidatesBg) {
            try {
              const respBg = await new Promise(resolve => chrome.runtime.sendMessage({ action: 'fetch_resource', path }, (r) => {
                if (chrome && chrome.runtime && chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
                else resolve(r);
              }));
              if (respBg && respBg.ok && respBg.text) {
                words = window.WordleSolver.loadWords(respBg.text);
                loaded = true;
                if (debugMode) appendLog('Loaded words via background fetch from ' + path + ', total words=' + words.length);
                break;
              } else if (debugMode) appendLog('Background fetch for ' + path + ' failed: ' + (respBg && (respBg.error || respBg.statusText || respBg.status)));
            } catch (e) { if (debugMode) appendLog('Background fetch threw for ' + path + ': ' + (e && e.message)); }
          }
        }
      } catch (e) { if (debugMode) appendLog('Background fetch attempt failed: ' + (e && e.message)); }

      if (!loaded) {
        // If all fetch attempts failed, use a small in-memory fallback list so suggestions still work
        logInfo('Wordle Helper: failed to load words list from extension resources (all attempts)');
        words = ['salet','raise','crane','slate','adieu','roate','soare','trace','arise','stare'];
        setStatus('wordlist-fallback');
        appendLog('Using fallback word list (limited) -- enable Debug for details', {force: true});
        if (wordsCountEl) wordsCountEl.textContent = String(words.length) + ' (fallback)';
      } else {
        logInfo('word list loaded via background fetch, total words:', words.length);
        if (wordsCountEl) wordsCountEl.textContent = String(words.length);
      }
    }
  } catch (err) {
    logInfo('Wordle Helper: error loading words list', err && (err.message || err));
    // keep working with a small fallback list so suggestions are available
    words = ['salet','raise','crane','slate','adieu','roate','soare','trace','arise','stare'];
    setStatus('wordlist-fallback');
    appendLog('Error loading full word list, using fallback (limited). Enable Debug for details.', {force: true});
    if (wordsCountEl) wordsCountEl.textContent = String(words.length) + ' (error)';
  }

  // Load meanings map (if available) for showing short definitions
  let meanings = {};
  // Small embedded fallback mapping for critical/likely final words so we can always show a definition
  const embeddedFallbackMeanings = {
    chasm: { def: "a deep fissure or opening in the earth's surface; a gorge", source: 'embedded' },
    champ: { def: "a person who has defeated or surpassed all rivals in a competition; a champion", source: 'embedded' },
    chalk: { def: "a soft white limestone used for writing and marking", source: 'embedded' },
    chaff: { def: "the husks of corn or other seed separated by winnowing or threshing", source: 'embedded' },
    cairn: { def: "a mound of rough stones built as a memorial or landmark", source: 'embedded' },
    abode: { def: "a place of residence; a house or home", source: 'embedded' }
  };
  try {
    const mresp = await fetch(chrome.runtime.getURL('extension/words_meanings.json'));
    if (mresp && mresp.ok) meanings = await mresp.json();
  } catch (e) { /* no meanings available */ }

  // Insert panel
  const panel = document.createElement('div');
  panel.id = 'wordle-helper-panel';
  panel.innerHTML = `
    <div class="wh-header" style="position:relative;">
      <h3>Wordle Wizard</h3>
      <button id="wh-panel-debug" class="wh-debug-btn" title="Diagnostics">⚙</button>
      <button id="wh-panel-minimize" class="wh-min-btn" title="Minimize">−</button>
    </div>
    <div class="status">Detected attempts: <span id="wh-attempts">0</span></div>
    <div id="wh-top-suggest" class="status" style="display:none;font-size:12px;color:#555;margin-top:6px"></div>

    <!-- Diagnostics (hidden by default). Use the Debug button in header -->
    <div id="wh-diagnostics" style="display:none;margin-top:8px;font-size:12px">
      <div style="display:flex;gap:8px;justify-content:space-between;align-items:center">
        <div>
          <button id="wh-diagnostics-refresh" class="wh-btn small">Refresh</button>
          <button id="wh-diagnostics-clear" class="wh-btn small">Clear</button>
        </div>
        <div>
          <button id="wh-diagnostics-copy" class="wh-btn small">Copy</button>
        </div>
      </div>
      <div id="wh-diagnostics-body" style="margin-top:8px;max-height:220px;overflow:auto;font-family:monospace;font-size:11px"></div>
    </div>

    <div class="top-suggestion">
      <div class="suggestion" id="wh-next-word">—</div>
      <div class="meaning" id="wh-next-meaning"></div>
      <div class="winning" id="wh-winning" style="display:none;margin-top:6px"></div>
    </div>

    <div id="wh-status" class="status" style="display:none">Status: idle</div>

    <!-- History rows parsed from the page -->
    <div id="wh-history" style="margin-top:10px"></div>
    <div id="wh-noattempt-message" style="margin-top:8px;color:#444;font-size:13px"></div>

    <!-- Suggestions area (single suggestion shown above) -->
    <div id="wh-top3" class="top3-suggestions" style="margin-top:10px"></div>

    <div id="wh-log" style="font-size:11px;max-height:140px;overflow:auto;margin-top:8px;padding-top:6px;border-top:1px dashed #eee;color:#333;display:none"></div>
  `;
  document.body.appendChild(panel);

  // Minimized icon (shown when panel is collapsed)
  const miniBtn = document.createElement('div');
  miniBtn.id = 'wordle-helper-minimized';
  miniBtn.innerHTML = '✨';
  miniBtn.title = 'Wordle Wizard — click to open';
  miniBtn.setAttribute('aria-label', 'Wordle Wizard');
  miniBtn.style.display = 'flex';
  document.body.appendChild(miniBtn);

  // Start minimized by default: hide panel, show the mini button
  panel.style.display = 'none';
  miniBtn.style.display = 'flex';

  // Wire toggle behavior to the existing header minimize button and mini icon
  const headerMinBtn = panel.querySelector('#wh-panel-minimize');
  if (headerMinBtn) headerMinBtn.addEventListener('click', () => { panel.style.display = 'none'; miniBtn.style.display = 'flex'; });
  miniBtn.addEventListener('click', () => { panel.style.display = 'block'; miniBtn.style.display = 'none'; });

  // Diagnostics rendering (non-invasive)
  function renderDiagnostics() {
    try {
      const body = panel.querySelector('#wh-diagnostics-body');
      if (!body) return;
      body.innerHTML = '';
      // Show last few perf logs first
      try {
        if (typeof whPerfLogs !== 'undefined' && whPerfLogs && whPerfLogs.length) {
          const perfTitle = document.createElement('div'); perfTitle.style.fontWeight = '700'; perfTitle.textContent = 'Perf (recent)'; body.appendChild(perfTitle);

          // Show last compute summary (if available) for quick triage
          try {
            if (window.WordleHelperLastCompute) {
              const c = window.WordleHelperLastCompute;
              const sum = document.createElement('div'); sum.style.fontSize = '11px'; sum.style.marginBottom = '6px';
              sum.textContent = `Last compute: ${new Date(c.t).toLocaleTimeString()} total=${Math.round(c.totalMs)}ms filter=${Math.round(c.filterMs)}ms sort=${Math.round(c.sortMs)}ms solver=${Math.round(c.solverMs)}ms candidates=${c.candidatesCount}`;
              body.appendChild(sum);
            }
          } catch (e) {}

          const list = document.createElement('div'); list.style.fontSize = '11px'; list.style.marginBottom = '8px';
          const recentPerf = (whPerfLogs.slice(-100)).map(e => `${new Date(e.t).toLocaleTimeString()} ${e.tag} ${e.ms.toFixed(1)}ms ${e.details || ''}`);
          list.textContent = recentPerf.join('\n');
          body.appendChild(list);
        }
      } catch (e) {}
      // Show last messages
      try {
        const msgTitle = document.createElement('div'); msgTitle.style.fontWeight = '700'; msgTitle.textContent = 'Messages (recent)'; body.appendChild(msgTitle);
        const msgList = document.createElement('div'); msgList.style.fontSize = '11px';
        const recentMsgs = (whMessageLogs.slice(-200)).map(e => `${new Date(e.t).toLocaleTimeString()} ${e.text}`);
        msgList.textContent = recentMsgs.join('\n');
        body.appendChild(msgList);
      } catch (e) {}

    } catch (e) {}
  }

  const debugBtn = panel.querySelector('#wh-panel-debug');
  if (debugBtn) debugBtn.addEventListener('click', () => {
    try {
      const diag = panel.querySelector('#wh-diagnostics');
      if (!diag) return;
      const isVisible = diag.style.display !== 'none';
      diag.style.display = isVisible ? 'none' : 'block';
      // enable debug mode when diagnostics are shown
      if (!isVisible) { debugMode = true; appendLog('Diagnostics opened (debug enabled)', { force: true }); } else { appendLog('Diagnostics closed', { force: true }); }
      renderDiagnostics();
    } catch (e) {}
  });

  panel.querySelector('#wh-diagnostics-refresh') && panel.querySelector('#wh-diagnostics-refresh').addEventListener('click', () => { renderDiagnostics(); appendLog('Diagnostics refreshed', { force: true }); });
  panel.querySelector('#wh-diagnostics-clear') && panel.querySelector('#wh-diagnostics-clear').addEventListener('click', () => { try { whMessageLogs.length = 0; renderDiagnostics(); appendLog('Diagnostics cleared', { force: true }); } catch (e) {} });
  panel.querySelector('#wh-diagnostics-copy') && panel.querySelector('#wh-diagnostics-copy').addEventListener('click', () => {
    try {
      const dump = (whPerfLogs.slice(-200).map(e => `${new Date(e.t).toISOString()} ${e.tag} ${e.ms} ${e.details || ''}`).join('\n')) + '\n\n' + (whMessageLogs.slice(-500).map(e => `${new Date(e.t).toISOString()} ${e.text}`).join('\n'));
      navigator.clipboard.writeText(dump);
      appendLog('Diagnostics copied to clipboard', { force: true });
    } catch (e) { appendLog('Copy failed: ' + (e && e.message), { force: true }); }
  });

  // Remove debug toggle and toolbar from the compact UI (debugging still possible via console)
  // (No UI element created here)



  // Background-worker status banner (visible when ping fails)
  const bgStatusBanner = document.createElement('div');
  bgStatusBanner.id = 'wh-bg-status';
  bgStatusBanner.style.display = 'none';
  bgStatusBanner.style.marginTop = '8px';
  bgStatusBanner.style.padding = '8px';
  bgStatusBanner.style.background = '#fff5f5';
  bgStatusBanner.style.border = '1px solid #f1c0c0';
  bgStatusBanner.style.color = '#800';
  bgStatusBanner.style.fontSize = '13px';
  bgStatusBanner.innerHTML = `Background worker unavailable. Try <button id="wh-restart-ext" class="wh-btn small">Restart extension</button> or reload it at <code>chrome://extensions</code>`;
  panel.appendChild(bgStatusBanner);

  // Restart button in banner: guide the user and attempt to wake the background worker
  panel.querySelector('#wh-restart-ext') && panel.querySelector('#wh-restart-ext').addEventListener('click', async () => {
    appendLog('Please open chrome://extensions and click "Reload" for this extension, or toggle it Off→On. Attempting to wake background worker...', { force: true });
    bgStatusBanner.style.display = 'block';
    const ok = await ensureBackgroundAlive();
    appendLog('Background wake attempt -> ' + (ok ? 'ok' : 'failed'), { force: true });
    if (ok) {
      try { await loadMeaningsIfEmpty(); appendLog('Reloaded meanings after wake: ' + (meanings ? Object.keys(meanings).length : 0), { force: true }); bgStatusBanner.style.display = 'none'; } catch(e) { appendLog('Reload after wake failed: ' + (e && e.message), { force: true }); }
    }
  });

  const attemptsEl = panel.querySelector('#wh-attempts');




  panel.querySelector('#wh-db-reload') && panel.querySelector('#wh-db-reload').addEventListener('click', async () => {
    const n = await loadMeaningsIfEmpty();
    appendLog('Reloaded meanings: ' + (n || 0), {force: true});
  });

  panel.querySelector('#wh-db-count') && panel.querySelector('#wh-db-count').addEventListener('click', () => {
    const n = (meanings ? Object.keys(meanings).length : 0);
    appendLog('Meanings count (in-memory): ' + n, {force: true});
    // also show storage-backed count
    if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['wh_meanings'], (res) => {
        const c = (res && res.wh_meanings) ? Object.keys(res.wh_meanings).length : 0;
        appendLog('Meanings count (storage): ' + c, {force: true});
      });
    }
  });

  panel.querySelector('#wh-db-lookup-btn') && panel.querySelector('#wh-db-lookup-btn').addEventListener('click', async () => {
    const inp = panel.querySelector('#wh-db-lookup');
    const w = (inp && inp.value) ? inp.value.trim().toLowerCase() : '';
    if (!w) { appendLog('Lookup: empty word', {force: true}); return; }
    let def = findDefInMeanings(w);
    appendLog('Lookup ' + w + ' -> ' + (def || 'not found in bundle'), {force: true});
    if (!def) {
      const d = await fetchWiktionaryDef(w);
      appendLog('Wiktionary ' + w + ' -> ' + (d || 'not found'), {force: true});
      if (d && meanings) { meanings[w] = { def: d, source: 'wiktionary' }; }
    }
  });

  // Storage status button
  panel.querySelector('#wh-db-storage') && panel.querySelector('#wh-db-storage').addEventListener('click', async () => {
    if (!(chrome && chrome.storage && chrome.storage.local)) { appendLog('Storage API not available', {force: true}); return; }
    chrome.storage.local.get(['wh_meanings', 'wh_meanings_seeded_at', 'wh_bkg_started'], (res) => {
      const c = (res && res.wh_meanings) ? Object.keys(res.wh_meanings).length : 0;
      appendLog('Storage: entries=' + c + ' seededAt=' + (res && res.wh_meanings_seeded_at) + ' bgStartedAt=' + (res && res.wh_bkg_started), {force: true});
    });
  });

  // Seed meanings on demand (debug only)
  panel.querySelector('#wh-db-seed') && panel.querySelector('#wh-db-seed').addEventListener('click', async () => {
    appendLog('Attempting to seed meanings (background)...', {force: true});
    // ensure background alive first
    const ok = await ensureBackgroundAlive(2);
    if (!ok) { appendLog('Background unreachable; try reloading extension (chrome://extensions) and click Reload', {force: true}); return; }
    try {
      const resp = await new Promise(resolve => chrome.runtime.sendMessage({ action: 'seed_meanings' }, (r) => resolve(r)));
      appendLog('Seed response: ' + JSON.stringify(resp), {force: true});
      if (resp && resp.ok) { await loadMeaningsIfEmpty(); appendLog('Reloaded meanings after seed: ' + (meanings ? Object.keys(meanings).length : 0), {force: true}); }
    } catch (e) { appendLog('Seed failed: ' + (e && e.message), {force: true}); }
  });



  // Background ping button
  panel.querySelector('#wh-db-ping') && panel.querySelector('#wh-db-ping').addEventListener('click', async () => {
    if (!(chrome && chrome.runtime && chrome.runtime.sendMessage)) { appendLog('chrome.runtime.sendMessage not available', {force: true}); return; }
    try {
      const pingResp = await new Promise(resolve => chrome.runtime.sendMessage({ action: 'ping' }, (r) => {
        if (chrome && chrome.runtime && chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(r);
      }));
      appendLog('Background ping -> ' + (pingResp && (pingResp.ok ? 'ok' : (pingResp.error || JSON.stringify(pingResp)))), {force: true});
      if (!pingResp || !pingResp.ok) {
        // show banner and suggest restart
        bgStatusBanner.style.display = 'block';
      } else {
        bgStatusBanner.style.display = 'none';
      }
    } catch (e) { appendLog('Background ping threw: ' + (e && e.message), {force: true}); bgStatusBanner.style.display = 'block'; }
  });

  // Restart extension button (debug toolbar) - guide user and attempt to wake background worker
  panel.querySelector('#wh-db-restart') && panel.querySelector('#wh-db-restart').addEventListener('click', async () => {
    appendLog('Please open chrome://extensions and click "Reload" for this extension, or toggle it Off→On. Attempting to wake background worker...', { force: true });
    bgStatusBanner.style.display = 'block';
    const ok = await ensureBackgroundAlive();
    appendLog('Background wake attempt -> ' + (ok ? 'ok' : 'failed'), { force: true });
    if (ok) {
      try { await loadMeaningsIfEmpty(); appendLog('Reloaded meanings after wake: ' + (meanings ? Object.keys(meanings).length : 0), { force: true }); bgStatusBanner.style.display = 'none'; } catch(e) { appendLog('Reload after wake failed: ' + (e && e.message), { force: true }); }
    }
  });  const nextEl = panel.querySelector('#wh-next-word');
  const meaningEl = panel.querySelector('#wh-next-meaning');
  const top3El = panel.querySelector('#wh-top3');
  const historyEl = panel.querySelector('#wh-history');
  const noAttemptEl = panel.querySelector('#wh-noattempt-message');
  const statusEl = panel.querySelector('#wh-status');
  const logEl = panel.querySelector('#wh-log');
  // message buffer for UI diagnostics
  const whMessageLogs = [];
  // keep Auto active by default
  let autoAggressive = true;
  let autoAggressiveTriggered = false;
  let aggressiveMode = false; // controlled internally by heuristics
  // debugMode declared earlier near logging helpers

  // log helpers are defined earlier to ensure they are available before any early logs
  // hide logs unless debug mode is enabled
  if (logEl) logEl.style.display = 'none';

  // Simple repetition suppression to avoid flooding the diagnostics UI with identical messages
  let _lastMsgText = null; let _lastMsgCount = 0; let _lastMsgTime = 0;
  function appendLog(msg, opts = {}) {
    // Defensive: logEl may not be initialized yet (TDZ) or removed; avoid throwing
    try { } catch (e) { return; }
    const force = !!(opts.force);
    // Always record messages into whMessageLogs for diagnostics, but respect debugMode for visible panel log area
    try {
      const entry = { t: Date.now(), text: String(msg || ''), force: !!force };
      whMessageLogs.push(entry);
      while (whMessageLogs.length > 1200) whMessageLogs.shift();
    } catch (e) {}

    // If not visible and not forced, bail out early (no UI work)
    if (!debugMode && !force) return;

    try {
      if (!logEl) return;

      const now = Date.now();
      // If the same message repeated within a short window and not forced, suppress adding a new DOM line
      if (!force && msg === _lastMsgText && (now - _lastMsgTime) < 2000) {
        _lastMsgCount += 1;
        _lastMsgTime = now;
        return;
      }

      // If a different message arrives and we previously had repeats, add a summary line
      if (_lastMsgCount > 1) {
        try {
          const summary = `${_lastMsgText} (repeated ${_lastMsgCount} times)`;
          const sline = document.createElement('div');
          sline.textContent = (new Date()).toLocaleTimeString() + ' — ' + summary;
          logEl.prepend(sline);
        } catch (e) {}
        _lastMsgCount = 0;
      }

      // Add the current message
      const line = document.createElement('div');
      line.textContent = (new Date()).toLocaleTimeString() + ' — ' + msg;
      logEl.prepend(line);
      // keep log short
      while (logEl.children.length > 120) logEl.removeChild(logEl.lastChild);

      // Update last message trackers (but reset count when forced lines are added)
      _lastMsgText = msg;
      _lastMsgTime = now;
      _lastMsgCount = force ? 0 : 1;

    } catch (e) { /* log area not available */ }
    try { if (document && document.getElementById && document.getElementById('wh-diagnostics-body') && (debugMode || document.getElementById('wh-diagnostics').style.display !== 'none')) renderDiagnostics(); } catch (e) {}
  }

  // Rate-limited logging helper to avoid inner-loop flood in diagnostics
  const _rateLogState = {};
  function rateLimitedLog(key, msg, opts = {}) {
    try {
      const now = Date.now();
      const state = _rateLogState[key] || { last: 0, count: 0 };
      const minInterval = Number(opts.minInterval || 2000);
      if ((now - state.last) < minInterval) {
        state.count = (state.count || 0) + 1;
        state.last = now;
        _rateLogState[key] = state;
        return;
      }
      if (state.count && state.count > 0) {
        appendLog(msg + ' (repeated ' + state.count + ' times)', opts);
        state.count = 0;
      } else {
        appendLog(msg, opts);
      }
      state.last = now;
      _rateLogState[key] = state;
    } catch (e) {}
  }
  // setStatus may be called early before the panel elements are initialized; be defensive
  function setStatus(msg) { try { if (statusEl) statusEl.textContent = 'Status: ' + msg; } catch (e) { /* statusEl not ready yet */ } if (debugMode) appendLog(msg); }

  if (!words || words.length === 0) {
    // If no words at all (unexpected), show a clear message
    nextEl && (nextEl.textContent = 'No word list');
    setStatus('no word list');
    logInfo('Wordle Helper: words list not loaded; suggestions disabled');
  } else if (words && words.length > 0) {
    // If we're using a small fallback list, show a subtle status so user knows
    if (words.length <= 20) setStatus('using fallback word list');
  }











  // Aggressive force-detect: deep scan to find Wordle host elements and attach the observer
  async function forceDetect(aggressive = false) {
    setStatus('force-detecting');
    appendLog('forceDetect started (aggressive=' + aggressive + ')');

    // Candidate selectors to locate the app or rows/tiles
    const selectors = [
      'game-app', 'wordle-app', '[data-testid="wordle-app"]', 'nyt-wordle',
      'game-row', 'game-tile', '[data-testid*="tile"]', '[data-testid*="row"]',
      '[role="grid"]', '[role="row"]', '[role="gridcell"]', '.Row', '.row', '.game', '.gameboard'
    ];

    for (const sel of selectors) {
      try {
        const nodes = querySelectorAllDeep(sel, document, { aggressive: true });
        if (nodes && nodes.length) {
          appendLog('forceDetect: found ' + nodes.length + ' nodes for selector ' + sel);
          for (const node of nodes) {
            try {
              // If node is an app host, attach directly
              const tag = (node.tagName || '').toLowerCase();
              if (tag === 'game-app' || tag === 'wordle-app' || node.getAttribute && node.getAttribute('data-testid') === 'wordle-app') {
                attachObserverTo(node.shadowRoot || node);
                appendLog('forceDetect: attached to app host ' + sel);
                return true;
              }

              // If node contains row/tile elements, find an ancestor host to attach to
              if (node.shadowRoot && node.shadowRoot.querySelector && node.shadowRoot.querySelector('game-row')) {
                attachObserverTo(node);
                appendLog('forceDetect: attached to node with shadowRoot containing game-row');
                return true;
              }

              if (node.querySelector && (node.querySelector('game-row') || node.querySelector('game-tile') || node.querySelector('[data-testid*="tile"]'))) {
                // walk up to a likely host or take this node
                let host = node;
                let up = node.parentElement;
                while (up && up !== document.body && up !== document.documentElement && up.parentElement) {
                  if (up.tagName && (up.tagName.toLowerCase() === 'game-app' || up.tagName.toLowerCase() === 'wordle-app' || up.shadowRoot)) { host = up; break; }
                  up = up.parentElement;
                }
                attachObserverTo(host.shadowRoot || host);
                appendLog('forceDetect: attached to host from selector ' + sel);
                return true;
              }

            } catch (e) { /* ignore node errors */ }
          }
        }
      } catch (e) { appendLog('forceDetect selector error ' + sel + ': ' + (e && e.message)); }
    }

    // Final fallback: scan all elements and try to find many tiles/rows heuristically
    appendLog('forceDetect: aggressive fallback scanning document');
    const all = Array.from(document.querySelectorAll('*'));
    for (const el of all) {
      try {
        const text = (el.textContent || '').trim();
        // heuristic: row contains 5 letters/boxes or keyboard rows contain alphabet
        if (text && /[A-Za-z].*[A-Za-z].*[A-Za-z].*[A-Za-z].*[A-Za-z]/.test(text)) {
          if (el.querySelector && (el.querySelector('[data-state]') || el.querySelector('[data-testid*="tile"]') || el.querySelector('game-row') || el.querySelector('game-tile'))) {
            attachObserverTo(el.shadowRoot || el);
            appendLog('forceDetect: fallback attached to element with many letters');
            return true;
          }
        }
      } catch (e) {}
    }

    appendLog('forceDetect: nothing matched');
    return false;
  }



  // Robust DOM detection: deep shadow-root traversal and flexible selectors
  function findGameApp() {
    const selectors = ['game-app', 'wordle-app', '#wordle-app', '[data-testid="wordle-app"]', 'nyt-wordle', 'game-page'];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (e) {}
    }

    // If not found, avoid scanning the entire document (performance risk).
    // Instead, try to detect the app by checking a small set of likely hosts (children of body).
    const bodyChildren = Array.from(document.body ? document.body.children : []);
    for (const el of bodyChildren) {
      try {
        if (el.shadowRoot && el.shadowRoot.querySelector && el.shadowRoot.querySelector('game-row')) return el;
      } catch (e) {}
    }

    // Give up quickly; caller will retry later when DOM changes.
    return null;
  }

  // querySelector across shadow roots with safety limits to avoid full-page recursion
  function querySelectorAllDeep(selector, root = document, opts = {}) {
    const results = [];
    // aggressiveMode can disable limits
    const isAggressive = !!opts.aggressive || aggressiveMode;
    const maxDepth = isAggressive ? 128 : (opts.maxDepth || 6);
    const maxNodes = isAggressive ? 1000000 : (opts.maxNodes || 2000);
    const maxResults = isAggressive ? 10000 : (opts.maxResults || 200);
    let nodesVisited = 0;

    function visit(node, depth) {
      if (!node || nodesVisited > maxNodes || results.length >= maxResults || depth > maxDepth) return;
      try {
        nodesVisited++;
        if (node.nodeType === 1) {
          if (node.matches && node.matches(selector)) results.push(node);
          for (const child of node.children) visit(child, depth + 1);
          if (node.shadowRoot) visit(node.shadowRoot, depth + 1);
        } else if (node.nodeType === 9 || node instanceof ShadowRoot) {
          for (const child of node.children) visit(child, depth + 1);
        }
      } catch (e) {
        // ignore errors on cross-origin frames etc.
      }
    }

    visit(root, 0);
    if (isAggressive) logDebug('Aggressive deep search visited ' + nodesVisited + ' nodes, found ' + results.length + ' matches for ' + selector);
    return results;
  }

  // Map background color to feedback state (G/Y/B)
  function colorToState(bg) {
    if (!bg) return null;
    // normalize rgb/rgba strings to array
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    const r = +m[1], g = +m[2], b = +m[3];

    // Wordle common colors (approx): green(83,141,78), yellow(181,159,59), gray(58,58,60)
    const dist = (x1,y1,z1,x2,y2,z2) => Math.hypot(x1-x2,y1-y2,z1-z2);
    const dGreen = dist(r,g,b, 83,141,78);
    const dYellow = dist(r,g,b, 181,159,59);
    const dGray = dist(r,g,b, 58,58,60);
    const min = Math.min(dGreen, dYellow, dGray);
    if (min === dGreen) return 'G';
    if (min === dYellow) return 'Y';
    return 'B';
  }

  function getTileData(opts = {}) {
    const tStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const aggressive = !!opts.aggressive || aggressiveMode;

    const rootEl = findGameApp();
    // if aggressive, search the whole document (may include duplicates), otherwise prefer app root if available
    const searchRoot = (!aggressive && rootEl) ? (rootEl.shadowRoot || rootEl) : document;

    // try a broad set of row selectors
    const rowSel = 'game-row, [data-testid="row"], .Row, .row, [role="row"], div[class*="row"]';
    let rows = querySelectorAllDeep(rowSel, searchRoot, { aggressive });

    // Fallback: if we can't find explicit row containers, group tiles by vertical position
    if (!rows || rows.length === 0) {
      const tileSel = 'game-tile, [data-state], .tile, .Tile, [aria-label*="Letter"], [aria-label*="is "], [role="gridcell"], [data-testid*="tile"]';
      const allTiles = querySelectorAllDeep(tileSel, searchRoot, { aggressive }) || [];
      if (allTiles.length >= 5) {
        // group by rounded top coordinate to approximate rows
        const groups = new Map();
        for (const t of allTiles) {
          try {
            const r = t.getBoundingClientRect();
            // round to nearest 4 px to tolerate sub-pixel/layout differences
            const key = Math.round(r.top / 4) * 4;
            const arr = groups.get(key) || [];
            arr.push(t);
            groups.set(key, arr);
          } catch (e) {}
        }
        // build rows as arrays sorted by left coordinate
        const pseudoRows = [];
        for (const arr of groups.values()) {
          if (arr.length >= 5) {
            arr.sort((a,b)=> { const la = a.getBoundingClientRect().left; const lb = b.getBoundingClientRect().left; return la - lb; });
            pseudoRows.push({ tiles: arr });
          }
        }
        // sort rows top-to-bottom by their first tile's top
        pseudoRows.sort((a,b)=> a.tiles[0].getBoundingClientRect().top - b.tiles[0].getBoundingClientRect().top);
        if (pseudoRows.length > 0) rows = pseudoRows;
        else return [];
      } else return [];
    }

    const history = [];
    const unvalidatedRows = [];
    let tilesCount = 0;

    for (const row of rows) {
      // get tiles in the row via deep search within the row
      let tiles = null;
      if (row && row.tiles && Array.isArray(row.tiles)) {
        // pseudo-row from fallback: use prepared tiles
        tiles = row.tiles.slice(0, 5);
      } else {
        tiles = querySelectorAllDeep('game-tile, [data-state], .tile, .Tile, [aria-label*="Letter"], [aria-label*="is "], [role="gridcell"], [data-testid*="tile"]', row, { aggressive });
      }
      if (!tiles || tiles.length === 0) continue;
      tilesCount += (tiles && tiles.length) || 0;

      // Filter to elements that look like tiles (avoid keyboard keys or other stray matches)
      const tileEls = Array.from(tiles).filter(t => {
        try {
          // Exclude interactive keyboard keys or buttons to avoid keyboard rows being misinterpreted as guess rows
          const roleAttr = t.getAttribute && t.getAttribute('role');
          const tag = t.tagName && t.tagName.toLowerCase();
          if (tag === 'button' || roleAttr === 'button') return false;
          // Heuristic: exclude elements that are inside keyboard containers
          try {
            if (t.closest && (t.closest('[data-keyboard]') || t.closest('.keyboard') || t.closest('#keyboard'))) return false;
          } catch (e) {}
          // Exclude obvious keyboard key attributes
          if (t.getAttribute && t.getAttribute('data-key') && tag === 'button') return false;

          if (t.getAttribute && (t.getAttribute('data-state') || t.getAttribute('evaluation') || t.getAttribute('letter') || t.getAttribute('data-letter') || t.getAttribute('data-key'))) return true;
          const aria = t.getAttribute && t.getAttribute('aria-label');
          if (aria && /letter/i.test(aria)) return true;
          if (t.classList && (t.classList.contains('tile') || t.classList.contains('Tile') || /tile/i.test(t.className))) return true;
          if (t.getAttribute && t.getAttribute('role') === 'gridcell') return true;
        } catch (e) {}
        return false;
      });

      // Require exactly 5 tiles to be a valid guess row (avoid partial/keyboard rows)
      if (tileEls.length !== 5) {
        logDebug('Skipping row: not 5 tiles (found ' + tileEls.length + ')');
        continue;
      }

      let letters = '';
      let feedbacks = '';
      let anyFilled = false;
      let anyValidatedTile = false;
      // validation counters: number of tiles validated and number that are G or Y
      let validatedCount = 0;
      let validatedGYCount = 0;

      for (const tile of tileEls) {
        // prefer attributes and aria-labels
        let letter = '';
        let state = null;
        let tileValidated = false;

        try {
          // Try more attribute variants in aggressive mode
          letter = (tile.getAttribute && (tile.getAttribute('letter') || tile.getAttribute('data-letter') || tile.getAttribute('data-key') || tile.getAttribute('data-letter'))) || '';
          if (!letter) {
            // try find text nodes deeper inside
            const txt = tile.textContent || '';
            letter = txt.trim().slice(0,1) || '';
          }
          letter = letter.toLowerCase();

          // state via attributes
          const evalAttr = (tile.getAttribute && (tile.getAttribute('evaluation') || tile.getAttribute('data-state') || tile.getAttribute('data-state'))) || '';
          if (evalAttr) {
            if (/correct/i.test(evalAttr)) { state = 'G'; tileValidated = true; }
            else if (/present/i.test(evalAttr)) { state = 'Y'; tileValidated = true; }
            else if (/absent/i.test(evalAttr)) { state = 'B'; tileValidated = true; }
            else {
              // attribute present but not indicating validation; try fallback heuristics
              if (debugMode) rateLimitedLog('evalAttr', 'Found evalAttr but no validation info: ' + evalAttr, { minInterval: 1000 });
              // Heuristic: if evalAttr is empty/unknown, check computed background to detect a validated gray
              try {
                const styleBg = getComputedStyle(tile).backgroundColor || '';
                const mcol = styleBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
                if (mcol) {
                  const rr = +mcol[1], gg = +mcol[2], bb = +mcol[3];
                  const dist = (x1,y1,z1,x2,y2,z2) => Math.hypot(x1-x2,y1-y2,z1-z2);
                  const dValidatedGray = dist(rr,gg,bb,58,58,60);
                  const dUnflipped = dist(rr,gg,bb,18,18,19);
                  // If color is noticeably closer to validated gray than the unflipped tile, treat as validated 'B'
                  if (dValidatedGray + 8 < dUnflipped) {
                    state = 'B';
                    tileValidated = true;
                    if (debugMode) appendLog('Heuristic: treated empty evalAttr as validated B based on color distances dValidatedGray=' + Math.round(dValidatedGray) + ' dUnflipped=' + Math.round(dUnflipped));
                  }
                }
              } catch (e) {
                /* ignore heuristic failures */
              }
            }
          }

          // aria-label like "Letter A is correct"
          if (!state) {
            const aria = tile.getAttribute && tile.getAttribute('aria-label');
            if (aria) {
              const m = aria.match(/([A-Za-z])[^a-zA-Z]*(correct|present|absent|in the word|not in)/i);
              if (m) {
                tileValidated = true;
                if (/correct/i.test(m[2]) || /in the word/i.test(m[2])) state = 'G';
                else if (/present/i.test(m[2])) state = 'Y';
                else state = 'B';
                if (!letter) letter = (m[1] || '').toLowerCase();
              }
            }
          }

          // fallback: check classList for words like correct/present/absent
          if (!state && tile.classList) {
            const cls = tile.className || '';
            if (/correct/.test(cls)) { state = 'G'; tileValidated = true; }
            else if (/present/.test(cls)) { state = 'Y'; tileValidated = true; }
            else if (/absent/.test(cls)) { state = 'B'; tileValidated = true; }
          }

                // last-resort: computed background-color (only use for state, and mark validated if color differs from unflipped)
          if (!state) {
            const style = getComputedStyle(tile);
            const bg = style && (style.backgroundColor || style.background);
            const derived = colorToState(bg);
            if (derived) {
              // If derived is G/Y it's validated. For 'B' (gray), we conservatively validate
              // it if the background looks like a validated gray rather than an unflipped tile.
              if (derived === 'G' || derived === 'Y') { state = derived; tileValidated = true; }
              else if (derived === 'B') {
                // Mark state as 'B' (absent) but do NOT mark the tile as validated based on color alone.
                // Validation for 'B' requires explicit evidence (attributes, class names, or aria labels).
                state = 'B';
                const m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
                if (m && debugMode) {
                  const r = +m[1], g = +m[2], b = +m[3];
                  const dist = (x1,y1,z1,x2,y2,z2) => Math.hypot(x1-x2,y1-y2,z1-z2);
                  const dValidatedGray = dist(r,g,b,58,58,60);
                  const dUnflipped = dist(r,g,b,18,18,19);
                  rateLimitedLog('bcolor', 'B-color check distances (debug): dValidatedGray=' + Math.round(dValidatedGray) + ' dUnflipped=' + Math.round(dUnflipped), { minInterval: 1200 });
                }
              }
            }
          }

          if (letter) anyFilled = true;
          if (tileValidated) {
            anyValidatedTile = true;
            validatedCount++;
            if (state === 'G' || state === 'Y') validatedGYCount++;
          }
          letters += letter;
          feedbacks += state || 'B';
        } catch (e) {
          // ignore tile parsing errors
        }
      }

      // Only accept fully-formed 5-letter rows with at least one filled tile and either:
      // - all 5 tiles validated, or
      // - at least one G/Y tile validated (accept single G/Y validations so suggestions appear after a single yellow/green), or
      // - at least two tiles validated (conservative for gray-only validation scenarios)
      const acceptRow = (tileEls.length === 5 && anyFilled && validatedCount > 0 && (validatedCount === 5 || (validatedGYCount > 0) || (validatedCount >= 2)));
      if (acceptRow) {
        history.push([letters, feedbacks]);
        if (debugMode) appendLog('Accepted validated row: ' + letters + ' -> ' + feedbacks + ' (validatedCount=' + validatedCount + ', GY=' + validatedGYCount + ')');
      } else if (tileEls.length === 5 && anyFilled && validatedCount === 0) {
        // Found a row with letters but no validated feedback yet; record it so we can wait for validation
        unvalidatedRows.push(letters);
        if (debugMode) {
          appendLog('Unvalidated row detected: ' + letters);
          try { console.info('[Wordle Helper] Unvalidated row detected:', letters); } catch (e) {}
        }
      } else if (tileEls.length === 5 && anyFilled) {
        // partially validated row without clear enough validation; skip and log when debugging
        if (debugMode) appendLog('Partial validation row (validatedCount=' + validatedCount + ', GY=' + validatedGYCount + ') letters=' + letters);
      }
    }

    // deduplicate rows (same guess+feedback) and ensure 5-letter entries
    const uniq = [];
    const seen = new Set();
    for (const [g, fb] of history) {
      const key = (g || '') + '|' + (fb || '');
      if (!seen.has(key) && (g || '').length === 5) { uniq.push([g, fb]); seen.add(key); }
    }

    // publish scan info so callers can decide when to show suggestions
    lastScanInfo.hasUnvalidated = (typeof unvalidatedRows !== 'undefined') && unvalidatedRows.length > 0;
    lastScanInfo.unvalidatedRows = (typeof unvalidatedRows !== 'undefined') ? unvalidatedRows.slice(0,3) : [];
    lastScanInfo.rowsFound = uniq.length;
    lastScanInfo.tilesFound = tilesCount;

    // Mirror scan info and history onto the DOM so a page-context script can read it from the console
    try {
      document.documentElement.setAttribute('data-wordle-helper-scan', JSON.stringify(lastScanInfo));
      document.documentElement.setAttribute('data-wordle-helper-history', JSON.stringify(uniq));
    } catch (e) {}

    // Only publish scan summaries when debug mode is explicitly enabled
    if (debugMode && lastScanInfo.hasUnvalidated) {
      appendLog('Scan summary: hasUnvalidated=' + lastScanInfo.hasUnvalidated + ' unvalidatedRows=' + lastScanInfo.unvalidatedRows.join(',') + ' rowsFound=' + lastScanInfo.rowsFound + ' tilesFound=' + lastScanInfo.tilesFound);
      try { console.info('[Wordle Helper] scan summary', lastScanInfo); } catch (e) {}
    }

    if (debugMode) appendLog('getTileData found rows: ' + uniq.length + (aggressive ? ' (aggressive)' : ''), {force: false});
    // Prefer rows that are descendants of the detected app host when available
    try {
      const app = findGameApp();
      if (app) {
        // filter uniq by those contained under app (preserve order)
        const appRoot = app.shadowRoot || app;
        const filtered = uniq.filter(([g,fb], idx) => {
          try {
            // find the row element by searching for a row that contains this string content
            const candidates = querySelectorAllDeep('game-row, [data-testid="row"], .Row, .row, [role="row"], div[class*="row"]', appRoot, { aggressive });
            for (const c of candidates) {
              if ((c.textContent || '').toLowerCase().includes(g)) return true;
            }
          } catch (e) {}
          return false;
        });
        if (filtered.length > 0) {
          const dur = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tStart;
          perfLog('getTileData', dur, 'rows=' + filtered.length + ' tiles=' + tilesCount + ' unvalidated=' + (unvalidatedRows.length));
          return filtered;
        }
      }
    } catch (e) {}

    const dur = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tStart;
    perfLog('getTileData', dur, 'rows=' + uniq.length + ' tiles=' + tilesCount + ' unvalidated=' + (unvalidatedRows.length));
    return uniq;
  }

  function attemptsFromHistory(history) { return history.length; }

  function renderHistory(history) {
    const histEl = panel.querySelector('#wh-history');
    if (!histEl) return;
    histEl.innerHTML = '';
    // Render most recent attempts first (top = earliest)
    history.forEach(([g, fb]) => {
      const row = document.createElement('div'); row.className = 'wh-row';
      for (let i = 0; i < 5; i++) {
        const tile = document.createElement('div'); tile.className = 'wh-tile';
        const ch = (g[i] || '').toUpperCase();
        const s = (fb[i] || '').toUpperCase();
        tile.textContent = ch || '';
        if (s === 'G') tile.classList.add('wh-g');
        else if (s === 'Y') tile.classList.add('wh-y');
        else tile.classList.add('wh-b');
        row.appendChild(tile);
      }
      histEl.appendChild(row);
    });
  }

  function updateUI(next, candidates, attempts, history = [], excluded = [], opts = {}) {
    attemptsEl.textContent = attempts;

    // Top suggest line: show remaining possible words count when provided
    try {
      const topEl = panel.querySelector('#wh-top-suggest');
      if (topEl) {
        if (opts && opts.possible && Array.isArray(opts.possible)) {
          const cnt = opts.possible.length;
          topEl.textContent = `Top suggested word among ${cnt} possible words`;
          topEl.style.display = 'block';
        } else {
          topEl.style.display = 'none';
        }
      }
    } catch (e) {}

    const word = next ? String(next).toLowerCase() : null;
    const displayWord = word ? String(word).toUpperCase() : '—';
    const def = word && meanings && meanings[word] && meanings[word].def ? meanings[word].def : '';

    // top suggestion and meaning
    nextEl.textContent = displayWord;
    meaningEl.textContent = def ? def : '';
    nextEl.title = word ? 'Click to copy suggestion' : '';
    nextEl.onclick = () => {
      if (!word) return;
      navigator.clipboard.writeText(word);
      nextEl.classList.add('copied');
      setTimeout(()=> nextEl.classList.remove('copied'), 800);
    };

    // render history visually
    renderHistory(history);

    // top 3 suggestions below the tiles — now replaced by a single deterministic suggestion (Python parity)
    top3El.innerHTML = '';
    // We intentionally do not show multiple 'top3' chips to match the Python single-guess outcome.
    // If desired, we could show the remaining possible count or a compact hint.
    if (!candidates || candidates.length === 0) {
      if (attempts > 0) {
        noAttemptEl.textContent = 'No suggestions found for the current attempt — try refreshing the page or reloading the extension.';
        noAttemptEl.style.display = 'block';
        setStatus('no-suggestions');
        appendLog('No suggestions available (candidates empty)', { force: true });
      }
    } else {
      // nothing to render here — the single `next` is shown in the top-suggestion area
    }

    // display awaiting message when no attempts
    if (attempts === 0) {
      if (opts && opts.awaitingValidation) {
        const typed = (opts.unvalidatedRows && opts.unvalidatedRows[0]) ? opts.unvalidatedRows[0].toUpperCase() : '';
        noAttemptEl.textContent = typed ? `Awaiting Wordle validation for ${typed} — press Enter to confirm.` : 'Awaiting Wordle validation — press Enter to confirm.';
        noAttemptEl.style.display = 'block';
        // hide top suggestion when we're waiting for validation
        nextEl.textContent = '—'; meaningEl.textContent = '';
        top3El.innerHTML = '';
      } else {
        // Keep the UI minimal when there are no attempts: hide the bulky 'awaiting' message
        // (validation-specific message is still shown above when awaitingValidation is true)
        noAttemptEl.textContent = '';
        noAttemptEl.style.display = 'none';
        try { const topEl = panel.querySelector('#wh-top-suggest'); if (topEl) { topEl.textContent = `Top suggested word among ${words ? words.length : 0} possible words`; topEl.style.display = 'block'; } } catch(e) {}
      }
    } else {
      noAttemptEl.style.display = 'none';
    }

    // winning area is managed by show/hide functions
    const winEl = panel.querySelector('#wh-winning');
    if (winEl) { /* leave visibility to showWinning/hideWinning */ }
  }

  function computeSuggestion(history) {
    const csStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // history is array of [guess, fb]

    // Phase 1: filter/partition based on history
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    let possible = words.slice();
    for (const [g, fb] of history) {
      const parts = new Map(window.WordleSolver.partition(possible, g));
      possible = parts.get(fb) || [];
      // clear solver caches to avoid stale
      window.WordleSolver.min_depth_cache_clear && window.WordleSolver.min_depth_cache_clear();
    }
    const tFilterEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const filterMs = tFilterEnd - t0;
    const possibleAfterFilter = (possible && possible.length) ? possible.length : 0;
    perfLog('compute:filter', filterMs, 'possible=' + possibleAfterFilter);

    const attempts = history.length;

    // Phase 2: compute present/absent letters (cheap, but instrumented)
    const tPresentStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const present = new Set();
    const absent = new Set();
    for (const [g, fb] of history) {
      for (let i = 0; i < g.length; i++) {
        const ch = (g[i] || '').toLowerCase();
        const s = (fb[i] || '').toUpperCase();
        if (s === 'G' || s === 'Y') present.add(ch);
        else if (s === 'B') absent.add(ch);
      }
    }
    for (const p of present) { if (absent.has(p)) absent.delete(p); }
    const tPresentEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const presentMs = tPresentEnd - tPresentStart;
    perfLog('compute:present', presentMs, 'present=' + present.size + ' absent=' + absent.size);

    const excluded = Array.from(absent).sort();
    const presentArr = Array.from(present).sort();

    // Phase 3: build candidates list (deterministic sort)
    const tSortStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const candidatesList = (possible || []).slice().sort();
    const tSortEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const sortMs = tSortEnd - tSortStart;
    const candidatesCount = candidatesList.length;
    perfLog('compute:sort', sortMs, 'candidates=' + candidatesCount);

    // Phase 4: solver (this is often the expensive step; measure separately)
    let next = null;
    let solverMs = 0;

    // If candidate set is very large, avoid running the full (expensive) solver and use a fast heuristic
    const SOLVER_CANDIDATE_CAP = (window.WordleHelperSolverCap || 150);
    if (candidatesCount > SOLVER_CANDIDATE_CAP) {
      try {
        // Fast heuristic: score words by coverage of frequent letters within the candidate set
        const freq = Object.create(null);
        for (const w of candidatesList) {
          const uniq = new Set(w);
          for (const ch of uniq) freq[ch] = (freq[ch] || 0) + 1;
        }
        let best = null; let bestScore = -1;
        for (const w of candidatesList) {
          const uniq = new Set(w);
          let sc = 0;
          for (const ch of uniq) sc += (freq[ch] || 0);
          if (sc > bestScore) { bestScore = sc; best = w; }
        }
        next = best;
        perfLog('compute:fallback', 0, 'candidates=' + candidatesCount + ' chosen=' + (next || 'none'));
        appendLog('Fallback (fast heuristic) suggestion used due to large candidate set (' + candidatesCount + ')', { force: true });
        try { window.WordleHelperLastCompute = Object.assign(window.WordleHelperLastCompute || {}, { fallbackUsed: true, fallbackScore: Math.round(bestScore) }); } catch (e) {}
      } catch (e) {
        appendLog('computeSuggestion: fallback heuristic failed: ' + (e && e.message), { force: true });
      }
    } else {
      try {
        const tSolverStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const depth_left = Math.max(0, 6 - attempts);
        window.WordleSolver.min_depth_cache_clear && window.WordleSolver.min_depth_cache_clear();

        // If debugMode is enabled and the solver exposes a debug API, call it to collect internals
        if (debugMode && window.WordleSolver && window.WordleSolver.debug_optimal_word) {
          try {
            const db = window.WordleSolver.debug_optimal_word(possible, depth_left);
            if (db) {
              next = db.next_guess;
              solverMs = db.tookMs || 0;
              perfLog('compute:solver', solverMs, 'next=' + (next || 'none') + ' guessCnt=' + (db.guessCnt || 0) + ' best_score=' + (db.best_score || 'n/a') + ' earlyExit=' + !!db.earlyExit);
              // Emit a concise debug message (force) so it shows up in diagnostics pane
              appendLog('Solver debug: guessCnt=' + (db.guessCnt || 0) + ' best_score=' + (db.best_score || 'n/a') + ' took=' + Math.round(solverMs) + 'ms', { force: true });
            }
          } catch (e) {
            appendLog('computeSuggestion: solver debug threw: ' + (e && e.message), { force: true });
          }
        } else {
          next = window.WordleSolver && window.WordleSolver.optimal_word ? window.WordleSolver.optimal_word(possible, depth_left) : null;
          solverMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tSolverStart;
          perfLog('compute:solver', solverMs, 'next=' + (next || 'none'));
        }
      } catch (e) { appendLog('computeSuggestion: solver threw: ' + (e && e.message), { force: true }); }
    }

    // Diagnostic summary (summarize per-phase timings into perf logs and a dump helper)
    const dur = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - csStart;
    const summaryDetails = `filter=${filterMs.toFixed(1)}ms present=${presentMs.toFixed(1)}ms sort=${sortMs.toFixed(1)}ms solver=${solverMs.toFixed(1)}ms candidates=${candidatesCount}`;
    perfLog('computeSplit', dur, summaryDetails);

    // Keep last compute summary accessible for diagnostics and quick dumps
    try {
      window.WordleHelperLastCompute = {
        t: Date.now(), totalMs: dur, filterMs, presentMs, sortMs, solverMs, candidatesCount, attempts
      };
    } catch (e) {}

    // If compute is very slow, emit a clear message for easier triage
    try {
      if (dur > 2000 || solverMs > 1000) {
        appendLog('Slow computeSuggestion detected: ' + Math.round(dur) + 'ms (' + summaryDetails + ')', { force: true });
      }
    } catch (e) {}

    // Existing concise logging (best effort)
    try {
      appendLog('computeSuggestion: possible=' + (possible ? possible.length : 0) + ' next=' + (next || 'none'));
      if (next) appendLog('computeSuggestion next preview: ' + String(next).toUpperCase());
    } catch (e) { /* best-effort logging */ }

    return { next, candidates: next ? [next] : [], attempts, excluded, present: presentArr, possible };
  }

  // Debounce for rapid DOM updates
  let debounceTimer = null;
  // Periodic detection loop with backoff
  let periodicTimer = null;
  let periodicAttempts = 0;
  let periodicRunning = false;
  const PERIODIC_MAX_ATTEMPTS = 10;
  function startPeriodicCheck() {
    if (periodicRunning) return;
    periodicRunning = true;
    stopPeriodicCheck();
    periodicAttempts = 0;
    setStatus('periodic-check-start');
    appendLog('Periodic check started');
    (function tick() {
      const tickStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      periodicAttempts++;
      const tFindStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const app = findGameApp();
      perfLog('findGameApp', ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tFindStart, 'attempt=' + periodicAttempts);
      if (app) {
        const root = app.shadowRoot || app;
        attachObserverTo(root);
        setStatus('app found');
        appendLog('Periodic check: app found');
        periodicRunning = false;
        perfLog('tick', ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - tickStart, 'app-found');
        return;
      }
      // In aggressive mode, keep trying for many more attempts
      const maxAttempts = aggressiveMode ? 1000 : PERIODIC_MAX_ATTEMPTS;

      // If we've tried a couple times and still haven't found the app, and Auto-Aggressive is enabled,
      // turn on Aggressive mode and attempt a forceDetect automatically (only once per session).
      if (periodicAttempts >= 2 && !aggressiveMode && autoAggressive && !autoAggressiveTriggered) {
        autoAggressiveTriggered = true;
        appendLog('Auto-Aggressive trigger: enabling aggressive mode and attempting force detect');
        // We no longer have a visible aggressive checkbox; flip the internal flag and update status
        aggressiveMode = true;
        setStatus('auto-aggressive');
        setTimeout(() => {
          const fdStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          forceDetect(true).then(found => {
            perfLog('forceDetect', ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - fdStart, 'auto-agg=' + autoAggressive);
            appendLog('Auto forceDetect finished: ' + (found ? 'attached' : 'not found'));
            if (found) {
              setStatus('force-attached');
              try { updateFromDOM({aggressive: true}); } catch (e) {}
              periodicRunning = false;
            }
          }).catch(e => { appendLog('Auto forceDetect error: ' + (e && e.message)); perfLog('forceDetectError', 0, String(e && (e.message || e))); });
        }, 120);
      }

      if (periodicAttempts >= maxAttempts) {
        setStatus('periodic-check-stopped');
        appendLog('Periodic check: stopped after max attempts');
        periodicRunning = false;
        return;
      }
      const delay = Math.min(1200 * Math.pow(1.5, periodicAttempts), 8000);
      appendLog('Periodic check attempt ' + periodicAttempts + ', next in ' + delay + 'ms');
      periodicTimer = setTimeout(tick, delay);
    })();
  }

  function stopPeriodicCheck() {
    if (periodicTimer) { clearTimeout(periodicTimer); periodicTimer = null; }
    periodicRunning = false;
  }

  let lastHistoryKey = '';
  let noHistoryStreak = 0;
  // retry counter for typed-but-unvalidated rows (short re-checks to handle animation/attribute delays)
  let unvalidatedRetry = 0;
  // last scan summary for debugging and decision-making
  let lastScanInfo = { hasUnvalidated: false, unvalidatedRows: [], rowsFound: 0, tilesFound: 0 };
  function debugScan() {
    try {
      const rowSel = 'game-row, [data-testid="row"], .Row, .row, [role="row"], div[class*="row"]';
      const rows = querySelectorAllDeep(rowSel, document, { aggressive: true }) || [];
      appendLog('debugScan: row selector matched ' + rows.length + ' nodes (document-wide)');
      let samples = 0;
      for (const r of rows) {
        if (samples++ >= 3) break;
        try {
          const txt = (r.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
          appendLog('row sample: <' + (r.tagName || 'el') + '> text="' + txt + '"');
        } catch (e) {}
      }
      // count tile-like matches
      const tiles = querySelectorAllDeep('game-tile, [data-state], .tile, .Tile, [aria-label*="Letter"], [aria-label*="is "], [role="gridcell"], [data-testid*="tile"]', document, { aggressive: true }) || [];
      appendLog('debugScan: tile-like selector matched ' + tiles.length + ' nodes');
    } catch (e) { appendLog('debugScan failed: ' + (e && e.message)); }
  }
  function updateFromDOM(opts = {}) {
    const aggressive = !!opts.aggressive || aggressiveMode;
    // quick check: avoid doing heavy work if game app not mounted yet (unless aggressive)
    const appRoot = findGameApp();
    if (!appRoot && !aggressive) {
      // start periodic detection if not already running
      startPeriodicCheck();
      return;
    }

    stopPeriodicCheck();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(()=>{
      try {
        const history = getTileData({ aggressive });
        if (!history || history.length === 0) {
          setStatus('no history');
          // increment streak and run debug scan if we've repeatedly seen no history
          noHistoryStreak = Math.min(99, noHistoryStreak + 1);
          appendLog('No history found (streak ' + noHistoryStreak + ')');

          // If we saw a row with letters but no validated feedback, WAIT for validation instead of suggesting.
          if (lastScanInfo && lastScanInfo.hasUnvalidated) {
            setStatus('awaiting-validation');
            if (debugMode) {
              if (logEl) logEl.style.display = 'block';
              appendLog('Detected typed but unvalidated row(s): ' + (lastScanInfo.unvalidatedRows || []).join(', '));
            }
            updateUI(null, [], 0, [], [], { awaitingValidation: true, unvalidatedRows: lastScanInfo.unvalidatedRows });

          // short re-checks to handle timing where validation attrs are applied shortly after typing
          unvalidatedRetry = Math.min(99, (unvalidatedRetry || 0) + 1);
          if (unvalidatedRetry <= 3) {
            appendLog('Scheduling validation re-check #' + unvalidatedRetry + ' in 220ms', { force: true });
            setTimeout(() => { try { updateFromDOM({aggressive: aggressive}); } catch(e) {} }, 220);
          } else {
            appendLog('Validation re-checks exhausted (no validated feedback detected)', { force: true });
          }

            appendLog('Running debug scan for common selectors...');
            debugScan();
          }

          // Show an inviting message and a starter suggestion when truly no attempts are present
          const starter = words && words.includes('scrap') ? 'scrap' : (words && words[0] ? words[0] : null);
          const candidatesPreview = (words || []).slice(0, 30);
          updateUI(starter, candidatesPreview, 0, [], [], { possible: words });

          // Ensure lastHistoryKey is cleared so we update when play begins
          lastHistoryKey = '';
          return;
        } else {
          // reset no-history streak on progress
          noHistoryStreak = 0;
          // reset unvalidated retry counter when history advances
          unvalidatedRetry = 0;
        }

        // only update suggestions when the validated history changes (avoid reacting to in-progress typing)
        const key = JSON.stringify(history);
        if (key === lastHistoryKey) {
          setStatus('waiting for validation');
          return;
        }
        lastHistoryKey = key;

        if (debugMode) appendLog('Parsed history: ' + JSON.stringify(history));
        // If a typed-but-unvalidated row is present, wait for validation before suggesting
        if (lastScanInfo && lastScanInfo.hasUnvalidated) {
          setStatus('awaiting-validation');
          if (debugMode) {
            if (logEl) logEl.style.display = 'block';
            appendLog('Detected typed but unvalidated row(s): ' + (lastScanInfo.unvalidatedRows || []).join(','));
          }
          updateUI(null, [], history.length, history, [], { awaitingValidation: true, unvalidatedRows: lastScanInfo.unvalidatedRows });
          return;
        }

        // compute suggestions and possible answers
        if (!window.WordleSolver || !window.WordleSolver.partition) {
          // Solver not available (missing/failed to load). Avoid throwing and show a fallback suggestion list.
          appendLog('WordleSolver not available; skipping computeSuggestion and showing fallback list', { force: true });
          const attempts = history.length;
          const next = (words && words.length > 0) ? words[0] : null;
          const candidates = (words || []).slice(0, 30);
          const excluded = [];
          const present = [];
          const possible = (words || []).slice();
          updateUI(next, candidates, attempts, history, excluded, { possible });
          setStatus('no-solver');
          return;
        }
        const { next, candidates, attempts, excluded, present, possible } = computeSuggestion(history);

        // If the player won (a validated 'GGGGG' row), show the winning word meaning/banner
        const win = history.find(([g,fb]) => (fb || '') === 'GGGGG');
        if (win && win[0]) {
          // show banner and make it clickable to open the modal; avoid opening modal automatically
          showWinning(win[0]);
          // prefer showing the winning word as the top suggestion to avoid conflicting suggestion display
          updateUI(win[0], [win[0]], attempts, history, excluded, { possible });
          // clear the top-suggestion meaning to avoid duplicate definition text (banner contains it)
          try { if (meaningEl) meaningEl.textContent = ''; } catch (e) {}
          setStatus('won');
          return; // avoid further UI updates
        } else if (attempts === 6) {
          // possible game loss: try to determine the revealed answer
          let answer = null;
          if (possible && possible.length === 1) answer = possible[0];
          else {
            // attempt to extract from page text like "The word was XXX"
            try {
              const txt = document.body && document.body.innerText ? document.body.innerText : '';
              const m = txt.match(/The word (?:was|is)[:\s]+([A-Za-z]{5})/i);
              if (m) answer = m[1].toLowerCase();
            } catch (e) {}
          }
          if (answer) {
            showModal(answer, false);
            setStatus('lost');
          } else {
            hideModal();
          }
          hideWinning();
        } else {
          hideWinning();
          hideModal();
        }

        updateUI(next, candidates, attempts, history, excluded, { possible });
        setStatus('updated');
      } catch (e) {
        console.error('Wordle helper error', e);
        appendLog('Error: ' + (e && e.message));
        setStatus('error');
      }
    }, aggressive ? 50 : 250);
  }

  // Utility: show/hide winning word meaning
  function showWinning(word) {
    if (!word) return;
    const w = String(word).toLowerCase();
    const def = meanings && meanings[w] && meanings[w].def ? meanings[w].def : '';
    const winEl = panel.querySelector('#wh-winning');
    if (!winEl) return;
    winEl.textContent = `Winning word: ${w.toUpperCase()}${def ? ' — ' + def : ''}`;
    winEl.style.display = 'block';
    // make banner clickable to show the modal (user-initiated)
    winEl.style.cursor = 'pointer';
    winEl.onclick = () => { showModal(w, true); };
  }
  function hideWinning() { const winEl = panel.querySelector('#wh-winning'); if (winEl) { winEl.style.display = 'none'; } }

  // Modal-like card inside the extension panel (integrated, not overlay)
  async function ensureModal() {
    let modal = panel.querySelector('#wh-modal');
    if (modal) return modal;
    modal = document.createElement('div'); modal.id = 'wh-modal'; modal.className = 'wh-modal';
    modal.innerHTML = `
      <div class="wh-modal-content">
        <button class="wh-modal-close" aria-label="Close">×</button>
        <div class="wh-modal-title" id="wh-modal-title"></div>
        <div class="wh-modal-def" id="wh-modal-def"></div>
      </div>
    `;
    // insert after the top-suggestion block
    const top = panel.querySelector('.top-suggestion');
    if (top && top.parentNode) top.parentNode.insertBefore(modal, top.nextSibling);
    else panel.appendChild(modal);
    modal.querySelector('.wh-modal-close').addEventListener('click', ()=> { modal.style.display = 'none'; });
    return modal;
  }

  async function fetchWiktionaryDef(word) {
    const title = encodeURIComponent(String(word));
    const url = `https://en.wiktionary.org/w/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${title}&origin=*`;
    try {
      const r = await fetch(url, { cache: 'force-cache' });
      if (!r.ok) return null;
      const data = await r.json();
      const pages = data && data.query && data.query.pages;
      if (!pages) return null;
      const page = pages[Object.keys(pages)[0]];
      if (!page) return null;
      let extract = page.extract || '';
      if (!extract) return null;
      // take first sentence
      const s = extract.split(/(?<=[.!?])\s+/)[0].replace(/\([^)]*\)/g, '').trim();
      return s || null;
    } catch (e) { return null; }
  }

  // Attempt to ensure the background service worker is awake/available
  async function ensureBackgroundAlive(maxAttempts = 3) {
    if (!(chrome && chrome.runtime && chrome.runtime.sendMessage && chrome.runtime.connect)) return false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Opening a port can wake the service worker even if it isn't running
        try {
          const port = chrome.runtime.connect({ name: 'wh-keepalive' });
          // close quickly; this action is only to wake the service worker
          try { port.disconnect(); } catch (e) {}
        } catch (e) { /* ignore connect errors */ }

        const pingResp = await new Promise(resolve => chrome.runtime.sendMessage({ action: 'ping' }, (r) => {
          if (chrome && chrome.runtime && chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(r);
        }));
        appendLog('Background ping attempt ' + attempt + ' -> ' + (pingResp && (pingResp.ok ? 'ok' : (pingResp.error || JSON.stringify(pingResp)))), { force: true });
        if (pingResp && pingResp.ok) return true;
      } catch (e) {
        appendLog('Background ping attempt threw: ' + (e && e.message), { force: true });
      }
      // backoff before next try
      await new Promise(r => setTimeout(r, 800 * attempt));
    }
    return false;
  }

  async function loadMeaningsIfEmpty() {
    try {
      if (!meanings || Object.keys(meanings).length === 0) {
        // 0) Try embedded packed blob first (loaded as a content script)
        try {
          if (window && window.__WH_PACKED_MEANINGS && Object.keys(window.__WH_PACKED_MEANINGS).length > 0) {
            meanings = window.__WH_PACKED_MEANINGS;
            if (debugMode) appendLog('Loaded meanings from embedded blob, entries=' + Object.keys(meanings).length);
            // persist embedded blob to storage so future loads don't need it to be re-injected
            try { if (chrome && chrome.storage && chrome.storage.local) chrome.storage.local.set({ wh_meanings: meanings, wh_meanings_seeded_at: Date.now() }, () => { if (debugMode) appendLog('Persisted embedded blob to storage'); }); } catch (e) { if (debugMode) appendLog('Persisting embedded blob to storage failed: ' + (e && e.message)); }
            return Object.keys(meanings).length;
          }
        } catch (err) { if (debugMode) appendLog('Embedded blob check failed: ' + (err && err.message)); }

        // 1) Try reading from chrome.storage.local (seeded at install/update)
        try {
          if (chrome && chrome.storage && chrome.storage.local) {
            const s = await new Promise(resolve => chrome.storage.local.get(['wh_meanings', 'wh_meanings_seeded_at'], (r) => resolve(r)));
            if (s && s.wh_meanings && Object.keys(s.wh_meanings).length > 0) {
              meanings = s.wh_meanings;
              if (debugMode) appendLog('Loaded meanings from storage, entries=' + Object.keys(meanings).length);
              return Object.keys(meanings).length;
            } else {
              if (debugMode) appendLog('No meanings found in storage');
            }
          }
        } catch (err) { if (debugMode) appendLog('Storage read failed: ' + (err && err.message)); }

        // 2) Try direct fetch candidates
        const candidates = ['extension/words_meanings.json', 'words_meanings.json', '/extension/words_meanings.json'];
        let loaded = false;
        for (const path of candidates) {
          const url = chrome.runtime.getURL(path);
          try {
            const mresp = await fetch(url);
            if (mresp && mresp.ok) {
              meanings = await mresp.json();
              loaded = true;
              if (debugMode) appendLog('Reloaded meanings bundle from ' + path + ', entries=' + Object.keys(meanings).length);
              break;
            } else {
              if (debugMode) appendLog('Attempt to fetch ' + url + ' returned status ' + (mresp && mresp.status));
            }
          } catch (err) {
            if (debugMode) appendLog('Attempt to fetch ' + url + ' failed: ' + (err && err.message));
          }
        }

        // 3) fallback: ask background service worker to fetch the resource (works around some fetch restrictions)
        if (!loaded && chrome && chrome.runtime && chrome.runtime.sendMessage) {
          // Try to wake the worker and verify with a couple of pings (retries)
          const alive = await ensureBackgroundAlive(3);
          if (!alive) appendLog('Background worker unreachable after retries; will still attempt background fetchs', { force: true });

          for (const path of candidates) {
            try {
              const resp = await new Promise(resolve => chrome.runtime.sendMessage({ action: 'fetch_resource', path }, (r) => {
                // If the message failed to deliver, chrome.runtime.lastError will be set; report that explicitly
                if (chrome && chrome.runtime && chrome.runtime.lastError) {
                  resolve({ ok: false, error: chrome.runtime.lastError.message });
                } else {
                  resolve(r);
                }
              }));

              if (resp && resp.ok && resp.text) {
                try { meanings = JSON.parse(resp.text); loaded = true; if (debugMode) appendLog('Reloaded meanings via background fetch from ' + path + ', entries=' + Object.keys(meanings).length); break; } catch (e) { if (debugMode) appendLog('Background fetch returned non-JSON for ' + path); }
              } else {
                // If resp is undefined or missing fields, log that fact clearly
                if (debugMode) {
                  appendLog('Background fetch for ' + path + ' failed: ' + (resp && (resp.error || resp.statusText || resp.status)));
                  if ((!resp || Object.keys(resp).length === 0) && chrome && chrome.runtime && chrome.runtime.lastError) appendLog('chrome.runtime.lastError during sendMessage: ' + chrome.runtime.lastError.message);
                }
              }
            } catch (err) {
              if (debugMode) appendLog('Background fetch attempt for ' + path + ' threw: ' + (err && err.message));
            }
          }
        }

        // 4) If loaded now, persist to storage so future page loads don't need SW or fetch
        if (loaded) {
          try {
            if (chrome && chrome.storage && chrome.storage.local) {
              chrome.storage.local.set({ wh_meanings: meanings, wh_meanings_seeded_at: Date.now() }, () => { if (debugMode) appendLog('Persisted meanings to storage, entries=' + Object.keys(meanings).length); });
            }
          } catch (e) { if (debugMode) appendLog('Persist to storage failed: ' + (e && e.message)); }
        }

        if (!loaded) {
          if (debugMode) appendLog('Failed reloading meanings from any candidate path');
          // Merge embedded fallback meanings so we have at least a tiny set of definitions available
          if (embeddedFallbackMeanings) {
            meanings = Object.assign({}, meanings || {}, embeddedFallbackMeanings);
            loaded = true;
            appendLog('Using embedded fallback meanings (limited)', { force: true });
            if (debugMode) appendLog('Embedded fallbacks added; entries=' + Object.keys(embeddedFallbackMeanings).length);
          } else {
            throw new Error('Failed to fetch');
          }
        }
      }
    } catch (e) { if (debugMode) appendLog('Failed reloading meanings: ' + (e && e.message)); }
  }

  function findDefInMeanings(word) {
    if (!word) return null;
    const key = word.toLowerCase();
    if (meanings && meanings[key] && meanings[key].def) return meanings[key].def;
    // fallback: case-insensitive search in loaded meanings
    if (meanings) {
      const keys = Object.keys(meanings);
      for (const k of keys) {
        if (k.toLowerCase() === key) return meanings[k].def;
      }
    }
    // last-resort: embedded fallback map
    if (embeddedFallbackMeanings && embeddedFallbackMeanings[key]) return embeddedFallbackMeanings[key].def;
    return null;
  }

  async function showModal(word, isWin) {
    if (!word) return;
    const wRaw = String(word);
    const w = wRaw.toLowerCase().replace(/[^a-z]/g,'').slice(0,5);

    // ensure we have the bundle loaded
    await loadMeaningsIfEmpty();

    let def = findDefInMeanings(w) || '';

    // try wiki fallback if missing
    if (!def) {
      def = await fetchWiktionaryDef(w) || '';
      if (def && meanings) {
        // cache for session
        meanings[w] = { def, source: 'wiktionary' };
      }
    }

    if (!def && debugMode) appendLog('Definition not found in bundle or wiki for ' + w);

    // As a last resort, use a tiny embedded fallback map so users still see a useful definition
    if (!def && embeddedFallbackMeanings && embeddedFallbackMeanings[w]) {
      def = embeddedFallbackMeanings[w].def;
      if (debugMode) appendLog('Using embedded fallback definition for ' + w);
    }

    const modal = await ensureModal();
    const titleEl = modal.querySelector('#wh-modal-title');
    const defEl = modal.querySelector('#wh-modal-def');
    titleEl.textContent = isWin ? `You won — ${w.toUpperCase()}` : `Game over — the word was ${w.toUpperCase()}`;
    defEl.textContent = def ? def : 'No definition available';
    modal.style.display = 'block';
  }
  function hideModal() { const m = panel.querySelector('#wh-modal'); if (m) m.style.display = 'none'; }

  // Observe DOM changes to auto-detect, but ignore changes within our panel (prevent recursion and heavy triggers)
  let observedRoot = null; // the node currently observed
  function attachObserverTo(node) {
    try {
      if (!node) return;
      if (observedRoot === node) return;
      if (observedRoot && observer) observer.disconnect();
      observedRoot = node;
      observer.observe(observedRoot, { childList: true, subtree: true, attributes: true });
      const name = (observedRoot instanceof ShadowRoot) ? 'shadowRoot' : (observedRoot.tagName || observedRoot.nodeName);
      logInfo('Observing DOM on', name);
      appendLog('Observing: ' + name);
      setStatus('observing');
    } catch (e) {
      console.warn('Wordle Helper: failed to attach observer to node', e);
      appendLog('attachObserverTo failed: ' + (e && e.message));
    }
  }

  // Schedule updates during idle time to avoid expensive work on busy pages
  let pendingIdleHandle = null;
  function scheduleUpdate() {
    if (pendingIdleHandle) return; // already scheduled
    const cb = () => {
      pendingIdleHandle = null;
      updateFromDOM();
    };
    if (aggressiveMode) {
      // in aggressive mode, run update immediately to be thorough
      cb();
      return;
    }
    if (window.requestIdleCallback) {
      pendingIdleHandle = requestIdleCallback(cb, {timeout: 500});
    } else {
      pendingIdleHandle = setTimeout(cb, 200);
    }
  }

  function mutationHandler(mutations) {
    // If any mutation is inside our helper panel, skip to avoid recursion
    for (const m of mutations) {
      if (m.target && panel.contains && panel.contains(m.target)) return;
    }

    // If we're not yet observing the app root, try to find it and attach
    const app = findGameApp();
    if (app && (observedRoot === null || observedRoot === document.body)) {
      const rootToObserve = app.shadowRoot || app;
      if (rootToObserve !== observedRoot) attachObserverTo(rootToObserve);
      appendLog('Mutation handler: app discovered, reattached');
    }

    // Schedule an update. If aggressive, run immediately, else idle-schedule
    scheduleUpdate();
  }

  const observer = new MutationObserver(mutationHandler);
  // Observe a limited set of targets: prefer observing app root if present, otherwise body but we debounce heavily
  const initialApp = findGameApp();
  const observeOptions = { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-state', 'evaluation', 'aria-label', 'letter', 'data-letter'] };
  if (initialApp) {
    const rootToObserve = initialApp.shadowRoot || initialApp;
    // attach with filters
    try { observer.observe(rootToObserve, observeOptions); logInfo('attached observer with filters to initial app root'); } catch (e) { attachObserverTo(rootToObserve); }
  } else {
    try { observer.observe(document.body, observeOptions); logInfo('attached observer with filters to BODY'); } catch (e) { attachObserverTo(document.body); }
  }
  // Initial run (delayed to avoid heavy work during page load)
  setTimeout(() => updateFromDOM(), 600);

  // startup health log
  logInfo('initialized.');
  // Attempt to wake the background worker on page load (best-effort)
  try { ensureBackgroundAlive(2).then(ok => { if (!ok) appendLog('Background wake attempt on init -> failed', { force: true }); else appendLog('Background wake attempt on init -> ok', { force: true }); }).catch(() => {}); } catch (e) {}

  // expose debugging api
  window.WordleHelper = {
    updateFromDOM,
    getTileData,
    lastScanInfo: () => lastScanInfo,
    // debugging helpers (content-script side)
    setDebug: (v) => { try { debugMode = !!v; if (debugMode) logInfo('Debug mode enabled'); else logInfo('Debug mode disabled'); } catch(e){} },
    getMeaningsCount: () => (meanings ? Object.keys(meanings).length : 0),
    getMeaning: (w) => { try { return (meanings && meanings[w && w.toLowerCase()]) ? meanings[w.toLowerCase()] : null; } catch(e){ return null; } },
    reloadMeanings: async () => { await loadMeaningsIfEmpty(); return (meanings ? Object.keys(meanings).length : 0); },
  };

  // Page <> content-script messaging API using CustomEvents (works despite CSP)
  document.addEventListener('wordle-helper-request', async (ev) => {
    try {
      const d = ev && ev.detail ? ev.detail : {};
      const id = d.id;
      const action = d.action;
      let result = null;
      if (action === 'getMeaningsCount') result = (meanings ? Object.keys(meanings).length : 0);
      else if (action === 'getMeaning') result = (meanings && meanings[(d && d.word || '').toLowerCase()]) || null;
      else if (action === 'reloadMeanings') { await loadMeaningsIfEmpty(); result = (meanings ? Object.keys(meanings).length : 0); }
      else if (action === 'setDebug') { debugMode = !!d.value; result = debugMode; }
      else if (action === 'getScan') result = lastScanInfo;
      else if (action === 'backgroundStatus') {
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
          try {
            const resp = await new Promise(resolve => chrome.runtime.sendMessage({ action: 'status' }, (r) => {
              if (chrome && chrome.runtime && chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
              else resolve(r);
            }));
            result = resp;
          } catch (e) { result = { ok: false, error: e && e.message }; }
        } else {
          result = { ok: false, error: 'chrome.runtime not available in content script' };
        }
      }
      else result = { error: 'unknown action' };
      document.dispatchEvent(new CustomEvent('wordle-helper-response', { detail: { id, result } }));
    } catch (e) {
      const id = ev && ev.detail && ev.detail.id;
      document.dispatchEvent(new CustomEvent('wordle-helper-response', { detail: { id, result: { error: e && e.message } } }));
    }
  });

})();
