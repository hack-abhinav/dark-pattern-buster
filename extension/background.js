/*
 * Background service worker.
 *
 * - Keeps the Price Ledger for the browser session (chrome.storage.session) and site memory
 *   (chrome.storage.local).
 * - Talks to the backend, so the website never sees those requests and no secret lives in the page.
 * - Takes the evidence screenshot when the user asks for one.
 */
'use strict';

const DEFAULT_BACKEND = 'http://localhost:8000';

async function backendUrl() {
  const { settings } = await chrome.storage.local.get('settings');
  return (settings && settings.backendUrl) || DEFAULT_BACKEND;
}

async function callBackend(msg) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), msg.timeout || 6000);
  try {
    const base = (await backendUrl()).replace(/\/$/, '');
    const res = await fetch(base + msg.path, {
      method: msg.method || 'POST',
      headers: msg.body ? { 'content-type': 'application/json' } : {},
      body: msg.body ? JSON.stringify(msg.body) : undefined,
      signal: ctrl.signal
    });
    if (!res.ok) return { error: 'HTTP ' + res.status };
    if (msg.audio) {
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return { audio: btoa(bin), type: res.headers.get('content-type') || 'audio/mpeg' };
    }
    return { data: await res.json() };
  } catch (e) {
    return { error: e && e.name === 'AbortError' ? 'timeout' : String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function handle(msg, sender) {
  switch (msg && msg.type) {
    case 'store:get': {
      const area = msg.area === 'session' ? chrome.storage.session : chrome.storage.local;
      const got = await area.get(msg.key);
      return { value: got[msg.key] };
    }
    case 'store:set': {
      const area = msg.area === 'session' ? chrome.storage.session : chrome.storage.local;
      await area.set({ [msg.key]: msg.value });
      return { ok: true };
    }
    case 'backend':
      return callBackend(msg);
    case 'capture': {
      // Needs activeTab: works once the user has clicked the extension icon on this tab.
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
        return { dataUrl };
      } catch (e) {
        return { error: String((e && e.message) || e) };
      }
    }
    default:
      return { error: 'unknown message' };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg, sender).then(sendResponse, (e) => sendResponse({ error: String(e) }));
  return true; // answer asynchronously
});
