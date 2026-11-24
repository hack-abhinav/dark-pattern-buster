/*
 * Dark Pattern Buster agent: shared helpers.
 *
 * The agent is plain JavaScript split into small files. Each file adds to one namespace, window.DPB.
 * Chrome loads them as content scripts in the order listed in manifest.json:
 *   core → snapshot → ledger → rules → ai → fixer → overlay → main
 */
(function () {
  'use strict';

  const DPB = (window.DPB = window.DPB || {});

  // The 13 dark patterns named in the CCPA's Guidelines for Prevention and Regulation of Dark Patterns, 2023.
  DPB.PATTERNS = {
    false_urgency: { no: 1, name: 'False urgency' },
    basket_sneaking: { no: 2, name: 'Basket sneaking' },
    confirm_shaming: { no: 3, name: 'Confirm shaming' },
    forced_action: { no: 4, name: 'Forced action' },
    subscription_trap: { no: 5, name: 'Subscription trap' },
    interface_interference: { no: 6, name: 'Interface interference' },
    bait_and_switch: { no: 7, name: 'Bait and switch' },
    drip_pricing: { no: 8, name: 'Drip pricing' },
    disguised_advertisement: { no: 9, name: 'Disguised advertisement' },
    nagging: { no: 10, name: 'Nagging' },
    trick_question: { no: 11, name: 'Trick question' },
    saas_billing: { no: 12, name: 'SaaS billing' },
    rogue_malware: { no: 13, name: 'Rogue malware' }
  };

  // Shared, in-memory state for this page load.
  DPB.state = {
    session: null, // the checkout's Price Ledger (persisted, see ledger.js)
    snapshot: null, // the latest page snapshot
    findings: [], // findings for the current page
    enabled: {}, // finding id → is its fix switched on?
    readOnly: false,
    lastFix: null, // result of the last "Fix it"
    lang: 'en'
  };

  const U = (DPB.util = {});

  // ---------------------------------------------------------------------------
  // Money
  // ---------------------------------------------------------------------------

  const MONEY_RE = /(?:₹|\bRs\.?\s?|\bINR\s?)\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g;
  U.MONEY_TEST = /₹\s?\d|\bRs\.?\s?\d|\bINR\s?\d/;

  U.amounts = function (text) {
    const out = [];
    const re = new RegExp(MONEY_RE.source, 'g');
    let m;
    while ((m = re.exec(String(text || '')))) out.push(parseFloat(m[1].replace(/,/g, '')));
    return out;
  };

  // Price of an option: its first rupee amount, or 0 if it says "free".
  U.priceOf = function (text) {
    const a = U.amounts(text);
    if (a.length) return a[0];
    return /\bfree\b/i.test(text || '') ? 0 : null;
  };

  U.stripMoney = function (text) {
    return String(text || '')
      .replace(new RegExp(MONEY_RE.source, 'g'), ' ')
      .replace(/\bfree\b/gi, ' ')
      .replace(/(^|\s)[+−–·|:]+(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  U.rupee = (n) => (n < 0 ? '−' : '') + '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');

  // ---------------------------------------------------------------------------
  // Text and visibility
  // ---------------------------------------------------------------------------

  const SKIP_SELECTOR = 'script,style,noscript,template,select,option,textarea,[data-dpb-ui],[aria-hidden="true"]';

  U.isOurs = function (node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    return !!(el && el.closest && el.closest('[data-dpb-ui]'));
  };

  U.visible = function (el) {
    if (!el || !el.isConnected) return false;
    if (el.checkVisibility) return el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true });
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  };

  // Visible text nodes under root. `skipControls` leaves out button and link text (used for labels).
  U.textNodes = function (root, test, skipControls) {
    const out = [];
    if (!root) return out;
    const skip = skipControls ? SKIP_SELECTOR + ',button,[role="button"]' : SKIP_SELECTOR;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (p.closest(skip)) return NodeFilter.FILTER_REJECT;
        if (test && !test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) {
      if (U.visible(n.parentElement)) out.push(n);
    }
    return out;
  };

  U.text = function (el, skipControls) {
    if (!el) return '';
    return U.textNodes(el, null, skipControls).map((n) => n.nodeValue).join(' ').replace(/\s+/g, ' ').trim();
  };

  // The words a shopper sees for a checkbox, radio button or select.
  U.inputText = function (input) {
    const aria = input.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const label = (input.labels && input.labels[0]) || input.closest('label');
    if (label) return U.text(label);
    const by = input.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map((el) => U.text(el)).join(' ');
      if (t) return t;
    }
    return input.parentElement ? U.text(input.parentElement).slice(0, 200) : '';
  };

  // A stable key for a price line, so "Seat 12A (Window)" on one page matches "Seat" on another.
  U.key = function (label) {
    return String(label || '')
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .replace(new RegExp(MONEY_RE.source, 'g'), ' ')
      .split(/\s+/)
      .filter((w) => w && !/\d/.test(w))
      .join(' ')
      .replace(/[^a-zऀ-ॿ ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
  };

  const STOP = new Set(['the', 'and', 'for', 'with', 'your', 'you', 'to', 'of', 'in', 'on', 'at', 'per']);
  U.tokens = function (s) {
    return new Set(
      String(s || '').toLowerCase().split(/[^a-z0-9ऀ-ॿ]+/)
        .filter((w) => w.length >= 2 && !/^\d+$/.test(w) && !STOP.has(w))
    );
  };
  U.shareToken = function (a, b) {
    const tb = U.tokens(b);
    for (const t of U.tokens(a)) if (tb.has(t)) return true;
    return false;
  };

  U.short = (s, n) => {
    const t = String(s || '').trim();
    const max = n || 40;
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  };

  U.hash = function (s) {
    let h = 0;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };

  U.id = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Run fn at most once every `ms`, and once more if it was asked for while running.
  U.schedule = function (fn, ms) {
    let timer = null;
    let running = false;
    let again = false;
    const trigger = () => {
      if (!timer) timer = setTimeout(run, ms);
    };
    async function run() {
      timer = null;
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        await fn();
      } catch (e) {
        console.warn('[Dark Pattern Buster]', e);
      } finally {
        running = false;
        if (again) {
          again = false;
          trigger();
        }
      }
    }
    return trigger;
  };

  // ---------------------------------------------------------------------------
  // Colour contrast (WCAG)
  // ---------------------------------------------------------------------------

  function parseColor(c) {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function luminance(c) {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  U.contrast = function (el) {
    const fg = parseColor(getComputedStyle(el).color) || { r: 0, g: 0, b: 0 };
    let bg = { r: 255, g: 255, b: 255 };
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.5) {
        bg = c;
        break;
      }
    }
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  // ---------------------------------------------------------------------------
  // Privacy: payment and personal fields are never read, stored, sent or touched.
  // ---------------------------------------------------------------------------

  const SENSITIVE_RE = /card|cc-|cvv|cvc|csc|expir|upi|vpa|otp|one-time|\bpin\b|passw|aadhaa?r|\bpan\b|passport|e-?mail|phone|mobile|\bname\b|address/i;
  const paymentForms = new WeakMap();

  U.isSensitive = function (el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type !== 'checkbox' && type !== 'radio' && type !== 'button' && type !== 'submit') return true; // free-text fields are never read
    }
    if (tag === 'INPUT' || tag === 'SELECT') {
      const attrs = [el.name, el.id, el.getAttribute('autocomplete'), el.getAttribute('aria-label')].join(' ');
      if (SENSITIVE_RE.test(attrs)) return true;
    }
    return false;
  };

  // Is this element inside a payment form (a form with card, UPI, OTP or password fields)?
  U.inPaymentArea = function (el) {
    const form = el && el.closest && el.closest('form');
    if (!form) return false;
    if (!paymentForms.has(form)) {
      paymentForms.set(form, !!form.querySelector(
        'input[autocomplete^="cc-"], input[type="password"], input[autocomplete="one-time-code"], ' +
        'input[name*="card" i], input[name*="cvv" i], input[name*="upi" i], input[name*="otp" i]'
      ));
    }
    return paymentForms.get(form);
  };

  // ---------------------------------------------------------------------------
  // Platform: the same agent runs as a Chrome extension or, for judges without
  // the extension, as an in-page preview on the FlyCheapo demo site.
  // ---------------------------------------------------------------------------

  const isExtension = !window.DPB_PREVIEW &&
    typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);

  const P = (DPB.platform = { isExtension });

  P.send = function (msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          const err = chrome.runtime.lastError;
          resolve(err ? { error: err.message } : res || {});
        });
      } catch (e) {
        resolve({ error: String((e && e.message) || e) });
      }
    });
  };

  // area "session" lasts for this browser session; "local" persists.
  P.get = async function (area, key) {
    if (isExtension) {
      const res = await P.send({ type: 'store:get', area, key });
      return res && res.value !== undefined ? res.value : null;
    }
    try {
      const raw = (area === 'session' ? sessionStorage : localStorage).getItem('dpb:' + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };

  P.set = async function (area, key, value) {
    if (isExtension) return P.send({ type: 'store:set', area, key, value });
    try {
      (area === 'session' ? sessionStorage : localStorage).setItem('dpb:' + key, JSON.stringify(value));
    } catch (e) { /* storage blocked: keep going without it */ }
    return { ok: true };
  };

  P.settings = async function () {
    const saved = (await P.get('local', 'settings')) || {};
    if (!isExtension) {
      const param = new URLSearchParams(location.search).get('backend');
      if (param) {
        saved.backendUrl = param;
        await P.set('local', 'settings', saved);
      }
    }
    return { backendUrl: saved.backendUrl || 'http://localhost:8000', lang: saved.lang || 'en' };
  };

  U.fetchBackend = async function (base, path, opts) {
    const o = opts || {};
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), o.timeout || 6000);
    try {
      const res = await fetch(String(base).replace(/\/$/, '') + path, {
        method: o.method || 'POST',
        headers: o.body ? { 'content-type': 'application/json' } : {},
        body: o.body ? JSON.stringify(o.body) : undefined,
        signal: ctrl.signal
      });
      if (!res.ok) return { error: 'HTTP ' + res.status };
      if (o.audio) {
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
  };

  // Calls the AWS backend (API Gateway → Lambda). In the extension, the background
  // service worker makes the call, so the website never sees it.
  P.backend = async function (path, opts) {
    const o = Object.assign({ method: 'POST' }, opts || {});
    if (isExtension) return P.send(Object.assign({ type: 'backend', path }, o));
    const { backendUrl } = await P.settings();
    return U.fetchBackend(backendUrl, path, o);
  };
})();
