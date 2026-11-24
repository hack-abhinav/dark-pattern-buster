'use strict';

const AGENT_FILES = ['core', 'snapshot', 'ledger', 'rules', 'ai', 'fixer', 'overlay', 'main'].map((f) => `agent/${f}.js`);
const $ = (id) => document.getElementById(id);

function show(el, text, cls) {
  el.textContent = text;
  el.className = cls || '';
}

async function load() {
  const { settings } = await chrome.storage.local.get('settings');
  const s = settings || {};
  $('backend').value = s.backendUrl || 'http://localhost:8000';
  $('lang').value = s.lang || 'en';
  checkHealth();
}

async function checkHealth() {
  const base = ($('backend').value || 'http://localhost:8000').replace(/\/$/, '');
  try {
    const res = await fetch(base + '/health', { signal: AbortSignal.timeout(3000) });
    const h = await res.json();
    show($('health'), `Backend connected. AI: ${h.ai === 'bedrock' ? 'Amazon Bedrock' : 'local fallback'} · Voice: ${h.voice ? 'ElevenLabs' : "browser's voice"}`, 'ok');
  } catch (e) {
    show($('health'), 'Backend not reachable: rules still work, AI checks show as "couldn\'t check".', 'warn');
  }
}

$('save').addEventListener('click', async () => {
  const { settings } = await chrome.storage.local.get('settings');
  const next = Object.assign({}, settings, { backendUrl: $('backend').value.trim(), lang: $('lang').value });
  await chrome.storage.local.set({ settings: next });
  show($('status'), 'Saved.', 'ok');
  checkHealth();
});

// Read-only check on any page. activeTab gives access to this tab only, and only because the user clicked.
$('check').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/.test(tab.url || '')) {
    show($('status'), 'Open a checkout page first.', 'warn');
    return;
  }
  try {
    const [{ result: running }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.hasAttribute('data-dpb')
    });
    if (running) {
      show($('status'), 'Already running on this page.', 'ok');
      return;
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.DPB_READ_ONLY = true; } });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: AGENT_FILES });
    show($('status'), 'Checking this page (read-only). See the panel on the right.', 'ok');
  } catch (e) {
    show($('status'), "Chrome doesn't allow extensions on this page.", 'warn');
  }
});

load();
