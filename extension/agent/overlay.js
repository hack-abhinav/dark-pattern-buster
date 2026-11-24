/*
 * The overlay: the agent's panel on the right of the checkout, plus small highlights next to each trick.
 *
 * Everything lives in a shadow root, so the website's CSS can't restyle it and the agent's own UI is
 * never confused with the page. Labels, clear buttons and plain-language rewrites are drawn here,
 * on top of the page, instead of being written into the page.
 */
(function () {
  'use strict';

  const DPB = window.DPB;
  const U = DPB.util;
  const P = DPB.platform;
  const O = (DPB.overlay = {});

  let root = null; // shadow root
  let host = null;
  let layer = null; // highlights
  let panel = null;
  const markers = new Map(); // finding id → marker elements
  const ui = { collapsed: false, complaint: false, busy: false, message: null };
  let onFix = null;
  let onUndo = null;
  let lastHtml = '';

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
    .box { position: fixed; border: 2px dashed #e11d48; border-radius: 6px; pointer-events: none; }
    .box.medium { border-color: #d97706; }
    .box.fixed { border: 2px solid #16a34a; }
    .badge { position: fixed; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: #e11d48; color: #fff;
      font: 700 12px/20px system-ui, sans-serif; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,.25); }
    .badge.medium { background: #d97706; }
    .badge.fixed { background: #16a34a; }
    .tag { position: fixed; padding: 3px 8px; border-radius: 6px; background: #16a34a; color: #fff; font: 700 12px/1.4 system-ui, sans-serif;
      white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
    .proxy { position: fixed; pointer-events: auto; cursor: pointer; border: 2px solid #14213d; background: #fff; color: #14213d;
      border-radius: 10px; font: 700 16px/1 system-ui, sans-serif; padding: 0 18px; box-shadow: 0 4px 14px rgba(0,0,0,.18); }
    .proxy small { display: block; font-size: 10px; font-weight: 600; color: #16a34a; margin-top: 3px; }
    .proxy:hover { background: #f1f5ff; }

    .panel { position: fixed; top: 16px; right: 16px; bottom: 16px; width: 344px; z-index: 2147483647; display: flex; flex-direction: column;
      background: #fff; color: #14213d; border-radius: 16px; box-shadow: 0 18px 50px rgba(20,33,61,.28); overflow: hidden;
      font: 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .panel[hidden] { display: none; }
    header { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: #14213d; color: #fff; }
    .logo { width: 34px; height: 34px; border-radius: 10px; background: #f26b1d; display: grid; place-items: center; font-weight: 900; font-size: 13px; }
    .title { flex: 1; min-width: 0; }
    .title b { display: block; font-size: 15px; }
    .title small { opacity: .75; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .score { text-align: center; line-height: 1.1; }
    .score b { font-size: 18px; }
    .score small { display: block; font-size: 10px; opacity: .75; }
    .icon { background: rgba(255,255,255,.12); color: #fff; border: 0; width: 28px; height: 28px; border-radius: 8px; cursor: pointer; font-size: 16px; }
    .body { flex: 1; overflow: auto; padding: 12px 14px 4px; }
    .banner { background: #eef4ff; color: #1e3a8a; border-radius: 10px; padding: 8px 10px; font-size: 13px; margin-bottom: 10px; }
    .card { border: 1px solid #e3e6ec; border-radius: 12px; padding: 10px 12px; margin-bottom: 12px; background: #fbfcfe; }
    .card h3 { margin: 0 0 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .grid div small { display: block; color: #5b6475; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
    .grid div b { font-size: 18px; font-variant-numeric: tabular-nums; }
    .grid .bad b { color: #e11d48; }
    .grid .good b { color: #16a34a; }
    .note { margin: 8px 0 0; font-size: 12px; color: #5b6475; }
    .note.ok { color: #15803d; font-weight: 600; }
    .note.warn { color: #b45309; font-weight: 600; }
    h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: #5b6475; margin: 12px 0 6px; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    li { border: 1px solid #e3e6ec; border-left: 4px solid #e11d48; border-radius: 10px; padding: 8px 10px; display: flex; gap: 8px; cursor: pointer; }
    li.medium { border-left-color: #d97706; }
    li.fixed { border-left-color: #16a34a; background: #f3fbf6; }
    li.checking { border-left-color: #94a3b8; }
    li .main { flex: 1; min-width: 0; }
    .top { display: flex; gap: 6px; align-items: baseline; }
    .num { flex: none; display: inline-grid; place-items: center; min-width: 18px; height: 18px; border-radius: 9px; background: #e11d48; color: #fff; font-size: 11px; font-weight: 700; }
    li.medium .num { background: #d97706; }
    li.fixed .num { background: #16a34a; }
    li.checking .num { background: #94a3b8; }
    .top b { flex: 1; font-size: 13.5px; }
    .cost { font-weight: 800; color: #e11d48; white-space: nowrap; }
    li.fixed .cost { color: #16a34a; text-decoration: line-through; }
    li p { margin: 3px 0 5px; color: #374151; font-size: 12.5px; }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .t { font-size: 11px; padding: 1px 6px; border-radius: 6px; background: #eef0f5; color: #374151; }
    .t.ccpa { background: #14213d; color: #fff; }
    .t.fixlabel { background: #e8f5ee; color: #166534; }
    .switch { flex: none; display: flex; align-items: flex-start; padding-top: 2px; }
    .switch input { width: 16px; height: 16px; accent-color: #16a34a; cursor: pointer; }
    .empty { color: #5b6475; font-size: 13px; padding: 6px 0; }
    .actions { display: flex; gap: 8px; margin: 12px 0 8px; }
    button.primary, button.secondary, button.ghost { border: 0; border-radius: 10px; padding: 10px 12px; font: inherit; font-weight: 700; cursor: pointer; }
    button.primary { flex: 1; background: #16a34a; color: #fff; font-size: 15px; }
    button.primary:disabled { background: #a7c4b2; cursor: not-allowed; }
    button.secondary { background: #eef0f5; color: #14213d; }
    button.secondary:disabled { opacity: .5; cursor: not-allowed; }
    .tools { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
    button.ghost { background: #fff; border: 1px solid #d6dae3; color: #14213d; padding: 7px 10px; font-size: 13px; }
    button.ghost[aria-pressed="true"] { background: #14213d; color: #fff; border-color: #14213d; }
    .complaint textarea { width: 100%; height: 190px; font: 12px/1.45 ui-monospace, Menlo, monospace; border: 1px solid #d6dae3; border-radius: 8px; padding: 8px; resize: vertical; }
    .complaint .tools { margin-top: 6px; }
    .complaint a { color: #2563eb; font-size: 13px; align-self: center; }
    footer { padding: 8px 14px 10px; border-top: 1px solid #eef0f5; font-size: 11.5px; color: #5b6475; }
    footer b { color: #14213d; }
    .msg { font-size: 12px; color: #15803d; margin: 0 0 8px; }
    .bubble { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; border: 0; border-radius: 999px; padding: 10px 14px; cursor: pointer;
      background: #14213d; color: #fff; font: 700 14px/1 system-ui, sans-serif; box-shadow: 0 10px 30px rgba(20,33,61,.35); }
    .bubble span { background: #e11d48; border-radius: 999px; padding: 2px 7px; margin-left: 6px; }
    .bubble[hidden] { display: none; }
  `;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => (n == null ? '—' : U.rupee(n));

  O.mount = function (opts) {
    onFix = opts.onFix;
    onUndo = opts.onUndo;
    host = document.createElement('div');
    host.setAttribute('data-dpb-ui', '');
    host.id = 'dark-pattern-buster';
    document.documentElement.appendChild(host);
    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${CSS}</style><div class="layer"></div><aside class="panel" role="complementary" aria-label="Dark Pattern Buster"></aside><button class="bubble" hidden></button>`;
    layer = root.querySelector('.layer');
    panel = root.querySelector('.panel');
    root.querySelector('.bubble').addEventListener('click', () => toggle(false));
    panel.addEventListener('click', onPanelClick);
    panel.addEventListener('change', onPanelChange);
    const reposition = () => requestAnimationFrame(positionMarkers);
    window.addEventListener('scroll', reposition, { passive: true, capture: true });
    window.addEventListener('resize', () => { dock(); reposition(); }, { passive: true });
    dock();
  };

  // Give the panel its own space on wide screens instead of covering the page.
  function dock() {
    const wide = window.innerWidth >= 1180 && !ui.collapsed;
    document.documentElement.style.setProperty('margin-right', wide ? '376px' : '', wide ? 'important' : '');
  }

  function toggle(collapse) {
    ui.collapsed = collapse;
    panel.hidden = collapse;
    root.querySelector('.bubble').hidden = !collapse;
    dock();
    O.render();
  }

  // ---------------------------------------------------------------------------
  // Data for the panel
  // ---------------------------------------------------------------------------

  function current() {
    const order = { high: 0, medium: 1 };
    return DPB.state.findings.slice().sort((a, b) =>
      (a.status === 'checking') - (b.status === 'checking') || order[a.confidence] - order[b.confidence] || (b.cost || 0) - (a.cost || 0));
  }

  function earlier() {
    const s = DPB.state.session;
    const here = new Set(DPB.state.findings.map((f) => f.id));
    const step = (DPB.state.snapshot || {}).step;
    // Earlier steps, plus anything on this step that "Fix it" already resolved.
    return Object.values(s.findings).filter((f) => !here.has(f.id) && (f.step !== step || s.fixed[f.id]));
  }

  const isFixed = (f) => !!DPB.state.session.fixed[f.id];
  const fixable = (f) => !!f.fix && !isFixed(f) && f.status !== 'checking';
  const enabled = (f) => (f.id in DPB.state.enabled ? DPB.state.enabled[f.id] : f.confidence === 'high');

  O.selectedFixes = () => current().filter((f) => fixable(f) && enabled(f));

  function prices() {
    const s = DPB.state.session;
    const snap = DPB.state.snapshot || {};
    const advertised = s.advertised ? s.advertised.amount : null;
    const siteTotal = snap.total != null ? snap.total : null;
    const pending = O.selectedFixes().reduce((sum, f) => sum + (f.saving || 0), 0);
    const profile = DPB.ledger.siteProfile;
    const shownKeys = new Set(((snap.summary && snap.summary.lines) || []).map((l) => l.key));
    const disclosedKeys = new Set((s.disclosed || []).map((d) => d.key));
    const lateFees = ((profile && profile.lateFees) || []).filter((f) => !shownKeys.has(U.key(f.label)) && !disclosedKeys.has(U.key(f.label)));
    const late = lateFees.reduce((sum, f) => sum + f.amount, 0);
    const base = siteTotal != null ? siteTotal : advertised;
    const honest = base != null ? base - pending + late : null;
    // More than the advertised price plus any fee shown upfront means something was added.
    const disclosed = (s.disclosed || []).reduce((sum, d) => sum + d.amount, 0);
    const inflated = siteTotal != null && advertised != null && siteTotal > advertised + disclosed;
    return { advertised, siteTotal, pending, late, lateFees, honest, inflated, saved: s.saved || 0 };
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function findingHTML(f, n, live) {
    const pat = DPB.PATTERNS[f.pattern];
    const fixed = isFixed(f) || f.status === 'fixed';
    const cls = [fixed ? 'fixed' : f.status === 'checking' ? 'checking' : f.confidence].join(' ');
    const conf = f.status === 'checking' ? 'AI checking…'
      : f.status === 'unchecked' ? "Couldn't check: AI offline"
      : `${f.source === 'ai' ? 'AI (Bedrock)' : f.source === 'ai-fallback' ? 'AI fallback' : 'Rule'} · ${f.confidence === 'high' ? 'sure' : 'possible trick'}`;
    const cost = f.cost > 0 ? `<span class="cost">+${money(f.cost)}</span>` : '';
    const sw = live && !DPB.state.readOnly && fixable(f)
      ? `<label class="switch" title="Include in Fix it"><input type="checkbox" data-toggle="${esc(f.id)}" ${enabled(f) ? 'checked' : ''}></label>`
      : '';
    const fixLabel = fixed ? 'Fixed' : live && f.fix && f.status !== 'checking' ? `Fix: ${f.fix.label}` : '';
    return `
      <li class="${cls}" data-focus="${live ? esc(f.id) : ''}">
        ${sw}
        <div class="main">
          <div class="top"><span class="num">${n}</span><b>${esc(f.title)}</b>${cost}</div>
          <p>${esc(f.explain)}</p>
          <div class="tags">
            <span class="t ccpa">CCPA #${pat.no} ${esc(pat.name)}</span>
            <span class="t">${esc(conf)}</span>
            ${fixLabel ? `<span class="t fixlabel">${esc(fixLabel)}</span>` : ''}
          </div>
        </div>
      </li>`;
  }

  O.render = function () {
    if (!panel) return;
    const s = DPB.state.session;
    const snap = DPB.state.snapshot || {};
    const cur = current();
    const old = earlier();
    const all = cur.concat(old).filter((f) => f.status !== 'checking');
    const fairness = DPB.fairness(all);
    const p = prices();
    const sel = O.selectedFixes();
    const lf = DPB.state.lastFix;
    const scroll = panel.querySelector('.body') ? panel.querySelector('.body').scrollTop : 0;

    root.querySelector('.bubble').innerHTML = `Dark Pattern Buster <span>${all.filter((f) => !isFixed(f) && f.status !== 'fixed').length}</span>`;

    let note = '';
    if (lf && lf.expected > 0) {
      note = lf.ok
        ? `<p class="note ok">✓ Confirmed: the site's own total went from ${money(lf.before)} to ${money(lf.after)}.</p>`
        : `<p class="note warn">The site's total didn't drop as expected (expected −${money(lf.expected)}, got −${money(lf.saved)}). Check the page before you pay.</p>`;
    } else if (p.lateFees.length) {
      note = `<p class="note">Includes ${p.lateFees.map((f) => `${money(f.amount)} ${esc(f.label.toLowerCase())}`).join(', ')} this site usually adds at payment (learned from a previous checkout).</p>`;
    }
    const savingLabel = p.pending > 0 ? 'You save' : p.saved > 0 ? 'Saved' : 'You save';
    const savingValue = p.pending > 0 ? p.pending + p.saved : p.saved;

    const engine = DPB.ai.engine === 'bedrock' ? 'Amazon Bedrock' : DPB.ai.engine === 'local-fallback' ? 'backend (local fallback)' : DPB.ai.engine === 'offline' ? 'offline: rules only' : 'not needed yet';

    const html = `
      <header>
        <div class="logo">DPB</div>
        <div class="title"><b>Dark Pattern Buster</b><small>${esc(s.site)} · ${esc(snap.step || '')}</small></div>
        <div class="score" title="Fairness Score for this checkout: fewer and cheaper tricks score higher"><b>${fairness}</b><small>Fairness</small></div>
        <button class="icon" data-collapse title="Minimise">–</button>
      </header>
      <div class="body">
        ${DPB.state.readOnly ? '<div class="banner"><b>Read-only check.</b> Nothing on this page will be changed.</div>' : ''}
        ${!P.isExtension ? '<div class="banner"><b>Preview mode:</b> the agent is running inside this demo page. Install the Chrome extension to use it on any site.</div>' : ''}
        ${ui.message ? `<p class="msg">${esc(ui.message)}</p>` : ''}
        <section class="card" aria-label="Honest Price">
          <h3>Honest Price</h3>
          <div class="grid">
            <div><small>Advertised</small><b>${money(p.advertised)}</b></div>
            <div class="${p.inflated ? 'bad' : ''}"><small>About to pay</small><b>${money(p.siteTotal)}</b></div>
            <div><small>${lf && lf.ok && lf.expected > 0 && !p.pending ? 'Now' : 'After fix'}</small><b>${money(p.honest)}</b></div>
            <div class="good"><small>${savingLabel}</small><b>${money(savingValue)}</b></div>
          </div>
          ${note}
        </section>

        <h3>On this page (${cur.length})</h3>
        ${cur.length ? `<ul>${cur.map((f, i) => findingHTML(f, i + 1, true)).join('')}</ul>` : '<p class="empty">No tricks found on this step.</p>'}

        ${DPB.state.readOnly ? '' : `
        <div class="actions">
          <button class="primary" data-fix ${sel.length && !ui.busy ? '' : 'disabled'}>${ui.busy ? 'Fixing…' : `Fix it${sel.length ? ` (${sel.length})` : ''}`}</button>
          <button class="secondary" data-undo ${DPB.fixer.canUndo() && !ui.busy ? '' : 'disabled'}>Undo</button>
        </div>`}

        <div class="tools">
          <button class="ghost" data-speak>🔊 Read aloud</button>
          <button class="ghost" data-lang="en" aria-pressed="${DPB.state.lang === 'en'}">EN</button>
          <button class="ghost" data-lang="hi" aria-pressed="${DPB.state.lang === 'hi'}">हिंदी</button>
          <button class="ghost" data-complaint aria-pressed="${ui.complaint}">Draft complaint</button>
        </div>
        ${ui.complaint ? complaintHTML() : ''}

        ${old.length ? `<h3>Fixed or earlier in this checkout (${old.length})</h3><ul>${old.map((f, i) => findingHTML(f, cur.length + i + 1, false)).join('')}</ul>` : ''}
        <div style="height:8px"></div>
      </div>
      <footer><b>Dark Pattern Buster never pays for you.</b> Payment fields are never read. AI check: ${esc(engine)}.</footer>`;

    if (html !== lastHtml) {
      lastHtml = html;
      panel.innerHTML = html;
      const body = panel.querySelector('.body');
      if (body) body.scrollTop = scroll;
    }
    renderMarkers(cur);
  };

  // ---------------------------------------------------------------------------
  // Highlights next to each trick
  // ---------------------------------------------------------------------------

  function renderMarkers(cur) {
    const keep = new Set();
    cur.forEach((f, i) => {
      const anchor = f.anchor;
      if (!anchor || !anchor.isConnected) return;
      keep.add(f.id);
      let m = markers.get(f.id);
      if (!m) {
        m = { box: document.createElement('div'), badge: document.createElement('div'), tag: null, proxy: null, f };
        m.box.className = 'box';
        m.badge.className = 'badge';
        layer.append(m.box, m.badge);
        markers.set(f.id, m);
      }
      m.f = f;
      const fixed = isFixed(f);
      const state = fixed ? 'fixed' : f.confidence === 'high' ? 'high' : 'medium';
      m.box.className = 'box ' + state;
      m.badge.className = 'badge ' + state;
      m.badge.textContent = fixed ? '✓' : String(i + 1);
      m.box.style.display = f.status === 'checking' ? 'none' : '';
      m.badge.style.display = f.status === 'checking' ? 'none' : '';

      const tagText = fixed && f.fix ? (f.fix.kind === 'chip' ? f.fix.text : f.fix.kind === 'setCheckbox' ? f.fix.chip : null) : null;
      if (tagText && !m.tag) {
        m.tag = document.createElement('div');
        m.tag.className = 'tag';
        layer.append(m.tag);
      }
      if (m.tag) {
        m.tag.textContent = tagText || '';
        m.tag.style.display = tagText ? '' : 'none';
      }

      const wantProxy = fixed && f.fix && f.fix.kind === 'proxy';
      if (wantProxy && !m.proxy) {
        m.proxy = document.createElement('button');
        m.proxy.className = 'proxy';
        m.proxy.innerHTML = `${esc(f.fix.text)}<small>made clear by Dark Pattern Buster</small>`;
        m.proxy.addEventListener('click', () => { if (m.f.fix.el && m.f.fix.el.isConnected) m.f.fix.el.click(); });
        layer.append(m.proxy);
      }
      if (m.proxy && !wantProxy) {
        m.proxy.remove();
        m.proxy = null;
      }
    });
    for (const [id, m] of markers) {
      if (keep.has(id)) continue;
      [m.box, m.badge, m.tag, m.proxy].forEach((el) => el && el.remove());
      markers.delete(id);
    }
    positionMarkers();
  }

  function positionMarkers() {
    for (const m of markers.values()) {
      const a = m.f.anchor;
      if (!a || !a.isConnected) continue;
      const r = a.getBoundingClientRect();
      const pad = 3;
      Object.assign(m.box.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      Object.assign(m.badge.style, { left: r.left - pad - 10 + 'px', top: r.top - pad - 10 + 'px' });
      if (m.tag) Object.assign(m.tag.style, { left: r.right + 8 + 'px', top: r.top + r.height / 2 - 11 + 'px' });
      if (m.proxy) {
        const fx = m.f.fix;
        const h = Math.max(36, Math.min(fx.height || 40, 60));
        const w = fx.width ? Math.max(120, Math.min(fx.width, 260)) : null;
        Object.assign(m.proxy.style, { left: r.right + 10 + 'px', top: r.top + r.height / 2 - h / 2 + 'px', height: h + 'px', width: w ? w + 'px' : 'auto' });
      }
    }
  }

  function focusFinding(id) {
    const f = DPB.state.findings.find((x) => x.id === id);
    if (!f || !f.anchor || !f.anchor.isConnected) return;
    f.anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const m = markers.get(id);
    if (m) {
      m.box.animate([{ boxShadow: '0 0 0 0 rgba(225,29,72,.6)' }, { boxShadow: '0 0 0 12px rgba(225,29,72,0)' }], { duration: 900, iterations: 2 });
    }
  }

  // ---------------------------------------------------------------------------
  // Voice (ElevenLabs through the backend; the browser's own voice as a fallback)
  // ---------------------------------------------------------------------------

  function voiceText(lang) {
    const s = DPB.state.session;
    const snap = DPB.state.snapshot || {};
    const cur = current().filter((f) => f.status !== 'checking' && !isFixed(f));
    const extra = cur.reduce((sum, f) => sum + (f.confidence === 'high' ? f.cost || 0 : 0), 0);
    const lf = DPB.state.lastFix;
    const n = cur.length;
    if (lang === 'hi') {
      if (lf && lf.ok && lf.expected > 0) return `ठीक कर दिया। आपने ${s.saved} रुपये बचाए। अब कुल ${snap.total} रुपये है।`;
      if (!n) return 'इस पेज पर कोई चाल नहीं मिली।';
      return `सावधान! इस पेज पर ${n === 1 ? 'एक चाल मिली' : `${n} चालें मिलीं`}${extra ? `, जिनसे आपसे ${extra} रुपये ज़्यादा लिए जा रहे हैं` : ''}। इन्हें हटाने के लिए "Fix it" दबाएँ।`;
    }
    if (lf && lf.ok && lf.expected > 0) return `Fixed. You saved ${s.saved} rupees. Your total is now ${snap.total} rupees.`;
    if (!n) return 'No tricks found on this page.';
    return `Careful. I found ${n} ${n === 1 ? 'trick' : 'tricks'} on this page${extra ? `, adding ${extra} rupees you didn't choose` : ''}. ${cur[0].title}. Tap Fix it to undo them.`;
  }

  function browserVoice(text, lang) {
    if (!('speechSynthesis' in window)) return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    const voice = speechSynthesis.getVoices().find((v) => v.lang === u.lang) || speechSynthesis.getVoices().find((v) => v.lang.startsWith(lang));
    if (voice) u.voice = voice;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return true;
  }

  async function speak() {
    const lang = DPB.state.lang;
    const text = voiceText(lang);
    flash('Speaking…');
    const res = await P.backend('/speak', { body: { text, lang }, audio: true, timeout: 15000 });
    if (res && res.audio) {
      try {
        await new Audio(`data:${res.type};base64,${res.audio}`).play();
        flash('Voice: ElevenLabs');
        return;
      } catch (e) { /* the page blocks audio: fall back below */ }
    }
    flash(browserVoice(text, lang) ? "Voice: your browser's voice (ElevenLabs not set up)" : 'Voice is not available here');
  }

  // ---------------------------------------------------------------------------
  // Complaint draft for the National Consumer Helpline (1915)
  // ---------------------------------------------------------------------------

  function allFindings() {
    const s = DPB.state.session;
    const byId = {};
    Object.values(s.findings).forEach((f) => { byId[f.id] = f; });
    DPB.state.findings.filter((f) => f.status !== 'checking').forEach((f) => { byId[f.id] = f; });
    return Object.values(byId).filter((f) => f.confidence === 'high');
  }

  function complaintLine(f) {
    const pat = DPB.PATTERNS[f.pattern];
    const head = `${pat.name} (CCPA dark pattern #${pat.no}): `;
    const label = f.itemLabel || '';
    switch (f.pattern) {
      case 'basket_sneaking': return head + `${label || 'An add-on'} (${U.rupee(f.cost)}) was added to my order without my consent.`;
      case 'drip_pricing': return head + `a ${U.rupee(f.cost)} ${label.toLowerCase() || 'charge'} appeared for the first time at the payment step.`;
      case 'confirm_shaming': return head + `the option to decline was worded to shame me: "${f.quote || ''}".`;
      case 'trick_question': return head + `a checkbox used confusing double-negative wording: "${f.quote || ''}".`;
      case 'interface_interference': return head + 'the option to skip extras was made tiny and hard to see.';
      case 'false_urgency': return head + f.title.replace(/:.*/, '') + '. ' + f.explain;
      default: return head + f.title + '.';
    }
  }

  function complaintText() {
    const s = DPB.state.session;
    const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const found = allFindings();
    const intro = `On ${date} I was buying on ${s.site}.` +
      (s.advertised ? ` The advertised price was ${U.rupee(s.advertised.amount)}` : '') +
      (s.advertised && s.maxTotal ? `, but the checkout asked for ${U.rupee(s.maxTotal)} before payment.` : '.');
    return [
      'To: National Consumer Helpline (1915), consumerhelpline.gov.in',
      `Subject: Dark patterns on the ${s.site} checkout, ${date}`,
      '',
      intro,
      '',
      'What I found, matched to the Guidelines for Prevention and Regulation of Dark Patterns, 2023:',
      ...(found.length ? found.map((f, i) => `${i + 1}. ${complaintLine(f)}`) : ['(no confirmed findings yet)']),
      '',
      s.saved ? `After I removed the extras I never chose, the site's own total dropped by ${U.rupee(s.saved)}.` : null,
      'Evidence: the attached price ledger lists every price line, the step it first appeared on, and whether I chose it.',
      '',
      'I request that the CCPA look into these practices.',
      '',
      '(Drafted with Dark Pattern Buster. Please check every detail before you submit.)'
    ].filter((l) => l !== null).join('\n');
  }

  function complaintHTML() {
    return `
      <section class="complaint">
        <h3>Complaint draft</h3>
        <textarea readonly>${esc(complaintText())}</textarea>
        <div class="tools">
          <button class="ghost" data-copy>Copy text</button>
          <button class="ghost" data-evidence>Save evidence</button>
          <a href="https://consumerhelpline.gov.in" target="_blank" rel="noopener">Open helpline ↗</a>
        </div>
      </section>`;
  }

  function download(name, href) {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    root.appendChild(a);
    a.click();
    a.remove();
  }

  async function saveEvidence() {
    const s = DPB.state.session;
    const ledger = {
      note: 'Anonymised price ledger from Dark Pattern Buster. No payment or personal details.',
      site: s.site,
      started_at: new Date(s.startedAt).toISOString(),
      advertised: s.advertised ? s.advertised.amount : null,
      highest_total_seen: s.maxTotal,
      saved_after_fixes: s.saved,
      steps: s.steps.map((x) => x.name),
      price_lines: Object.values(s.items).map((i) => ({
        item: i.label, amount: i.amount, first_seen_on: (s.steps[i.firstStep] || {}).name, added_by: i.origin, removed_by_fix: !!i.removed
      })),
      findings: allFindings().map((f) => ({ pattern: DPB.PATTERNS[f.pattern].name, what: f.title, cost: f.cost, detail: f.explain }))
    };
    const day = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(ledger, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    download(`dark-pattern-evidence-${s.site.replace(/[^a-z0-9.-]/gi, '_')}-${day}.json`, url);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    if (P.isExtension) {
      host.style.visibility = 'hidden';
      await U.sleep(80);
      const shot = await P.send({ type: 'capture' });
      host.style.visibility = '';
      if (shot && shot.dataUrl) download(`dark-pattern-screenshot-${day}.png`, shot.dataUrl);
      else flash('Ledger saved. For a screenshot too, click the extension icon once, then try again.');
      return;
    }
    flash('Ledger saved.');
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  function flash(message) {
    ui.message = message;
    O.render();
    clearTimeout(flash.t);
    flash.t = setTimeout(() => { ui.message = null; O.render(); }, 5000);
  }

  async function onPanelClick(e) {
    const t = e.target.closest('[data-collapse],[data-fix],[data-undo],[data-speak],[data-lang],[data-complaint],[data-copy],[data-evidence],[data-focus]');
    if (!t) return;
    if (t.hasAttribute('data-collapse')) return toggle(true);
    if (t.hasAttribute('data-fix')) {
      ui.busy = true;
      O.render();
      await onFix();
      ui.busy = false;
      return O.render();
    }
    if (t.hasAttribute('data-undo')) {
      ui.busy = true;
      O.render();
      await onUndo();
      ui.busy = false;
      return O.render();
    }
    if (t.hasAttribute('data-speak')) return speak();
    if (t.hasAttribute('data-lang')) {
      DPB.state.lang = t.getAttribute('data-lang');
      const saved = (await P.get('local', 'settings')) || {};
      saved.lang = DPB.state.lang;
      await P.set('local', 'settings', saved);
      return O.render();
    }
    if (t.hasAttribute('data-complaint')) {
      ui.complaint = !ui.complaint;
      return O.render();
    }
    if (t.hasAttribute('data-copy')) {
      try {
        await navigator.clipboard.writeText(complaintText());
        flash('Complaint text copied.');
      } catch (err) {
        panel.querySelector('textarea').select();
        flash('Select all and copy the text.');
      }
      return;
    }
    if (t.hasAttribute('data-evidence')) return saveEvidence();
    if (t.hasAttribute('data-focus') && !e.target.closest('.switch')) focusFinding(t.getAttribute('data-focus'));
  }

  function onPanelChange(e) {
    const id = e.target.getAttribute('data-toggle');
    if (!id) return;
    DPB.state.enabled[id] = e.target.checked;
    O.render();
  }
})();
