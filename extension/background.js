// Background service worker for extension - handles resource fetch requests from content scripts
// Runs in MV3 service worker context

console.info('[Wordle Helper] background service worker started');

// record startup time for diagnostics so content scripts can check persisted state
try {
  chrome.storage && chrome.storage.local && chrome.storage.local.set && chrome.storage.local.set({ wh_bkg_started: Date.now() });
} catch (e) { console.warn('[Wordle Helper] failed to write startup timestamp', e && e.message); }

// Keep service worker alive longer using port connection and alarms
chrome.runtime.onConnect.addListener(function(port) {
  console.info('[Wordle Helper] Port connected:', port.name);
  port.onDisconnect.addListener(function() {
    console.info('[Wordle Helper] Port disconnected:', port.name);
  });
});
chrome.alarms.onAlarm.addListener(function(alarm) {
  console.info('[Wordle Helper] Alarm fired:', alarm.name);
});
chrome.alarms.create('keepAlive', { periodInMinutes: 4 });

// Helper: attempt to load packaged meanings and persist them to storage (returns a Promise)
function seedMeaningsInternal() {
  return new Promise((resolve, reject) => {
    try {
      fetch(chrome.runtime.getURL('extension/words_meanings.json')).then(r => {
        if (!r.ok) throw new Error('fetch failed: ' + r.status);
        return r.json();
      }).then(obj => {
        chrome.storage.local.set({ wh_meanings: obj, wh_meanings_seeded_at: Date.now() }, () => {
          console.info('[Wordle Helper] seeded meanings into storage, entries=' + Object.keys(obj).length);
          resolve(obj);
        });
      }).catch(err => {
        // Fallback fetch using XMLHttpRequest if fetch fails
        console.warn('[Wordle Helper] seeding failed, trying fallback:', err && err.message);
        var xhr = new XMLHttpRequest();
        xhr.open('GET', chrome.runtime.getURL('extension/words_meanings.json'));
        xhr.onload = function() {
          try {
            var obj = JSON.parse(xhr.responseText);
            chrome.storage.local.set({ wh_meanings: obj, wh_meanings_seeded_at: Date.now() }, () => {
              console.info('[Wordle Helper] seeded meanings via fallback, entries=' + Object.keys(obj).length);
              resolve(obj);
            });
          } catch (e) {
            console.warn('[Wordle Helper] fallback seeding failed:', e && e.message);
            reject(e);
          }
        };
        xhr.onerror = function() {
          console.warn('[Wordle Helper] fallback fetch failed');
          reject(new Error('fallback fetch failed'));
        };
        xhr.send();
      });
    } catch (e) {
      console.warn('[Wordle Helper] seeding threw:', e && e.message);
      reject(e);
    }
  });
}

// On install/update, seed meanings into chrome.storage.local so content scripts can read without contacting SW later
chrome.runtime.onInstalled && chrome.runtime.onInstalled.addListener && chrome.runtime.onInstalled.addListener((details) => {
  seedMeaningsInternal().catch(() => {});
});

// Attempt seeding on startup as well if storage is empty
chrome.runtime.onStartup && chrome.runtime.onStartup.addListener && chrome.runtime.onStartup.addListener(() => {
  console.info('[Wordle Helper] onStartup - checking for seeded meanings');
  try {
    chrome.storage.local.get(['wh_meanings'], (res) => {
      if (!res || !res.wh_meanings || Object.keys(res.wh_meanings).length === 0) {
        seedMeaningsInternal().catch(() => {});
      }
    });
  } catch (e) { console.warn('[Wordle Helper] onStartup check failed:', e && e.message); }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.action) return;
  if (msg.action === 'ping') {
    sendResponse({ ok: true, msg: 'pong' });
    return;
  }
  if (msg.action === 'status') {
    // return last stored startup timestamp if present
    try {
      chrome.storage.local.get(['wh_bkg_started'], (res) => {
        sendResponse({ ok: true, startedAt: res && res.wh_bkg_started });
      });
      return true;
    } catch (e) {
      sendResponse({ ok: false, error: e && e.message });
      return;
    }
  }
  if (msg.action === 'seed_meanings') {
    // on-demand seeding via message; use helper so we try both fetch and fallback
    try {
      seedMeaningsInternal().then(obj => {
        sendResponse({ ok: true, entries: Object.keys(obj).length });
      }).catch(err => {
        sendResponse({ ok: false, error: err && err.message });
      });
      return true;
    } catch (e) { sendResponse({ ok: false, error: e && e.message }); return; }
  }
  if (msg.action === 'storage_status') {
    try {
      chrome.storage.local.get(['wh_meanings', 'wh_meanings_seeded_at', 'wh_bkg_started'], (res) => {
        const count = res && res.wh_meanings ? Object.keys(res.wh_meanings).length : 0;
        sendResponse({ ok: true, count, seededAt: res && res.wh_meanings_seeded_at, bkgStartedAt: res && res.wh_bkg_started });
      });
      return true;
    } catch (e) { sendResponse({ ok: false, error: e && e.message }); return; }
  }
  if (msg.action === 'fetch_resource') {
    const path = msg.path || '';
    const url = chrome.runtime.getURL(path);
    fetch(url).then(resp => {
      if (!resp.ok) {
        sendResponse({ ok: false, status: resp.status, statusText: resp.statusText });
        return;
      }
      return resp.text();
    }).then(text => {
      if (typeof text === 'string') sendResponse({ ok: true, text });
    }).catch(err => {
      // Fallback fetch using XMLHttpRequest if fetch fails
      console.warn('[Wordle Helper] fetch_resource failed, trying fallback:', err && err.message);
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.onload = function() {
        if (xhr.status === 200) {
          sendResponse({ ok: true, text: xhr.responseText });
        } else {
          sendResponse({ ok: false, status: xhr.status, statusText: xhr.statusText });
        }
      };
      xhr.onerror = function() {
        sendResponse({ ok: false, error: 'fallback fetch failed' });
      };
      xhr.send();
    });
    // keep the message channel open for async response
    return true;
  }
});