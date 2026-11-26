/*
 * The Price Ledger: the agent's running receipt for one checkout.
 *
 * For every step it records each price line: the item, the amount, the step where it first
 * appeared, and whether the user chose it or the site picked it. That is what lets the rules
 * catch drip pricing (a fee that appears late) and basket sneaking (an extra nobody chose)
 * even when they happen on different pages.
 */
(function () {
  'use strict';

  const DPB = window.DPB;
  const U = DPB.util;
  const P = DPB.platform;
  const L = (DPB.ledger = {});

  const SESSION_TTL = 45 * 60 * 1000;
  const touched = new WeakSet(); // inputs the user really clicked (event.isTrusted)
  const storeKey = () => 'checkout:' + location.host;
  let session = null;

  function fresh() {
    return {
      id: U.id(),
      site: location.host,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      steps: [], // [{ name, at }]
      advertised: null, // { amount, text } from the product the user picked
      disclosed: [], // fees the site showed upfront, next to the advertised price
      items: {}, // key → { label, amount, firstStep, origin: 'site' | 'user' | 'unknown', compulsory }
      findings: {}, // id → finding summary, for every step of this checkout
      fixed: {}, // id → true once "Fix it" handled it
      timers: {}, // countdown key → { seconds, at }
      timerResets: {},
      claims: {}, // scarcity claim key → number of page loads it appeared on
      aiCache: {}, // text hash → AI verdict
      maxTotal: null,
      saved: 0, // rupees saved by fixes, confirmed against the site's own total
      done: false
    };
  }

  L.init = async function () {
    const stored = await P.get('session', storeKey());
    const step = DPB.snapshot.step();
    const live = stored && Date.now() - stored.updatedAt < SESSION_TTL;
    if (live && (!stored.done || step === 'Done')) session = stored;
    else session = fresh();
    DPB.state.session = session;
    L.enterStep(step);
    L.siteProfile = await loadSiteProfile();
    return session;
  };

  L.enterStep = function (name) {
    const last = session.steps[session.steps.length - 1];
    if (!last || last.name !== name) session.steps.push({ name, at: Date.now() });
    L.save();
  };

  // Index of the first time this step was visited in this checkout.
  L.stepIndex = function (name) {
    const i = session.steps.findIndex((s) => s.name === name);
    return i === -1 ? session.steps.length : i;
  };

  const persist = async () => {
    session.updatedAt = Date.now();
    await P.set('session', storeKey(), session);
  };
  L.save = U.schedule(persist, 300);
  L.saveNow = persist;

  // ---------------------------------------------------------------------------
  // What the user really did
  // ---------------------------------------------------------------------------

  L.touched = (el) => touched.has(el);

  function markTouched(e) {
    if (!e.isTrusted || !e.target || U.isOurs(e.target)) return;
    const t = e.target;
    let input = null;
    if (t.matches && t.matches('input, select')) input = t;
    else if (t.closest && t.closest('label')) input = t.closest('label').querySelector('input, select');
    if (!input) return;
    touched.add(input);
    if (input.type === 'radio' && input.name) {
      document.querySelectorAll(`input[type="radio"][name="${CSS.escape(input.name)}"]`).forEach((r) => touched.add(r));
    }
  }

  // When the user picks a product on a listing page, remember its advertised price and any fees shown with it.
  function capturePick(e) {
    if (!e.isTrusted) return;
    const btn = e.target.closest && e.target.closest('button, a[href], [role="button"], input[type="submit"]');
    if (!btn || U.isOurs(btn) || U.inPaymentArea(btn)) return;
    const snap = DPB.state.snapshot;
    if (snap && snap.summary) return; // already in the checkout itself
    const card = DPB.snapshot.cardAround(btn);
    if (!card) return;
    session.advertised = { amount: card.advertised, text: card.text, at: Date.now() };
    session.disclosed = card.fees;
    session.items = {};
    persist();
  }

  L.listen = function () {
    document.addEventListener('click', markTouched, true);
    document.addEventListener('change', markTouched, true);
    document.addEventListener('click', capturePick, true);
  };

  // ---------------------------------------------------------------------------
  // Update the ledger from a page snapshot
  // ---------------------------------------------------------------------------

  // A checked checkbox / radio button on this page that matches a price line.
  function linkedInput(line, snap) {
    return snap.choices.find((c) =>
      (c.kind === 'checkbox' || c.kind === 'radio') && c.checked && c.price === line.amount && U.shareToken(line.label, c.text)
    ) || null;
  }

  L.update = function (snap) {
    if (snap.total != null) session.maxTotal = Math.max(session.maxTotal || 0, snap.total);
    if (!snap.summary) return;
    if (!session.advertised) {
      const fare = snap.summary.lines.find((l) => /\b(fare|ticket|base|price)\b/i.test(l.label));
      if (fare) session.advertised = { amount: fare.amount, text: fare.label, guessed: true };
    }
    const idx = L.stepIndex(snap.step);
    for (const line of snap.summary.lines) {
      if (!(line.amount > 0) || !line.key) continue;
      const linked = linkedInput(line, snap);
      let item = session.items[line.key];
      if (!item) item = session.items[line.key] = { key: line.key, firstStep: idx, origin: 'unknown' };
      item.label = line.label;
      item.amount = line.amount;
      item.compulsory = !linked && line.controls.length === 0;
      if (item.origin !== 'user') {
        if (linked) item.origin = L.touched(linked.el) ? 'user' : 'site';
        else if (line.controls.some((c) => L.touched(c))) item.origin = 'user';
      }
      line.item = item;
      line.linked = linked;
    }
    L.save();
  };

  L.recordFindings = function (findings) {
    for (const f of findings) {
      if (f.status === 'checking') continue;
      session.findings[f.id] = {
        id: f.id, pattern: f.pattern, title: f.title, explain: f.explain, cost: f.cost, saving: f.saving,
        confidence: f.confidence, source: f.source, step: f.step, status: session.fixed[f.id] ? 'fixed' : f.status,
        itemLabel: f.itemLabel || null, quote: f.quote || null
      };
    }
    L.save();
  };

  // ---------------------------------------------------------------------------
  // Site profiles and Fairness Score
  // ---------------------------------------------------------------------------

  DPB.fairness = function (findings) {
    let score = 100;
    for (const f of findings) {
      if (f.confidence === 'high') score -= f.cost > 0 ? 15 : 10;
      else score -= 4;
    }
    return Math.max(5, Math.min(100, Math.round(score)));
  };

  async function loadSiteProfile() {
    const local = await P.get('local', 'site:' + location.host);
    const res = await P.backend('/site-info?site=' + encodeURIComponent(location.host), { method: 'GET', timeout: 2500 });
    const remote = res && res.data ? res.data : null;
    const merge = (field) => {
      const out = {};
      [local, remote].forEach((p) => (p && p[field] ? p[field] : []).forEach((f) => { out[U.key(f.label)] = f; }));
      return Object.values(out);
    };
    if (!local && !remote) return null;
    return {
      fairness: remote && remote.checkouts ? remote.fairness_score : local ? local.fairness_score : null,
      checkouts: Math.max((remote && remote.checkouts) || 0, (local && local.checkouts) || 0),
      lateFees: merge('late_fees'), // compulsory fees shown only at a later step
      sneaked: merge('sneaked_extras'), // paid extras the site pre-selects (removable)
      source: remote && remote.checkouts ? 'backend' : 'this browser'
    };
  }

  // On a listing page, before anything is picked: what each product will really cost at checkout,
  // using what earlier checkouts on this site taught us (this browser, or every user via the backend).
  const PICK_RE = /^(select|book|book now|choose|choose fare|view deal|continue)$/i;
  L.forecast = function () {
    const p = L.siteProfile;
    if (!p || (!p.lateFees.length && !p.sneaked.length)) return { cards: [], profile: p };
    const buttons = Array.from(document.querySelectorAll('button, a[href], [role="button"], input[type="submit"]'))
      .filter((b) => !U.isOurs(b) && !U.inPaymentArea(b) && U.visible(b) && PICK_RE.test((b.innerText || b.value || '').trim()));
    const seen = new Set();
    const cards = [];
    for (const b of buttons) {
      const c = DPB.snapshot.cardAround(b);
      if (!c || seen.has(c.el)) continue;
      seen.add(c.el);
      const shown = new Set(c.fees.map((f) => f.key));
      const late = p.lateFees.filter((f) => !shown.has(U.key(f.label))).reduce((sum, f) => sum + f.amount, 0);
      const extras = p.sneaked.reduce((sum, f) => sum + f.amount, 0);
      cards.push({ el: c.el, priceEl: c.priceEl, advertised: c.advertised, honest: c.advertised + late, checkout: c.advertised + late + extras });
    }
    return { cards, profile: p };
  };

  // The checkout ended: keep what we learned about this site, and send an anonymised summary.
  L.finish = async function () {
    if (session.done) return;
    session.done = true;
    const findings = Object.values(session.findings);
    const lateFees = findings.filter((f) => f.pattern === 'drip_pricing' && f.itemLabel)
      .map((f) => ({ label: f.itemLabel, amount: f.cost }));
    const sneaked = findings.filter((f) => f.pattern === 'basket_sneaking' && f.cost > 0)
      .map((f) => ({ label: f.itemLabel || f.title, amount: f.cost }));
    const fairness = DPB.fairness(findings);
    const prev = (await P.get('local', 'site:' + location.host)) || { checkouts: 0 };
    await P.set('local', 'site:' + location.host, {
      site: location.host,
      checkouts: (prev.checkouts || 0) + 1,
      fairness_score: fairness,
      late_fees: lateFees.length ? lateFees : prev.late_fees || [],
      sneaked_extras: sneaked.length ? sneaked : prev.sneaked_extras || []
    });
    // Anonymised: no names, no booking IDs, no payment details. Just price lines and findings.
    P.backend('/ledger-summary', {
      body: {
        session: session.id,
        site: location.host,
        advertised: session.advertised ? session.advertised.amount : null,
        max_total: session.maxTotal,
        saved: session.saved,
        lines: Object.values(session.items).map((i) => ({
          item: i.label, amount: i.amount, step: (session.steps[i.firstStep] || {}).name || null, origin: i.origin,
          outcome: i.removed ? 'removed' : 'kept'
        })),
        findings: findings.map((f) => ({ pattern: f.pattern, cost: f.cost, confidence: f.confidence, item: f.itemLabel })),
        late_fees: lateFees
      },
      timeout: 4000
    });
    await persist();
  };
})();
