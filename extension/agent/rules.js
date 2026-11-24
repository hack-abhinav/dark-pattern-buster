/*
 * The rule engine: fast, free, offline checks for the common traps.
 *
 * Each rule reads the page snapshot (and the Price Ledger) and returns findings. A finding names
 * one of the CCPA's 13 dark patterns, says what it costs, and carries the fix "Fix it" would apply.
 * Subtle cases (guilt-trip wording, double negatives) become candidates for the AI check in ai.js.
 */
(function () {
  'use strict';

  const DPB = window.DPB;
  const U = DPB.util;
  const R = (DPB.rules = {});

  const SKIP_RE = /\b(skip|no,? thanks|not now|continue without|decline|maybe later|i'?ll pass)\b/i;
  const DECLINE_START_RE = /^\s*(no|nah|nope|i don'?t|i do not|i'?d rather|i'?ll (?:risk|pass|take)|i (?:prefer|like) (?:paying|to pay)|continue without)\b/i;
  const NEUTRAL_RE = /^\s*(no,?\s*thanks?|no thank you|not now|decline|cancel|skip(?: add-?ons| this| extras)?|continue without (?:adding|add-?ons|extras))\s*\.?$/i;
  const NEGATION_RE = /\b(?:not|don'?t|do not|never|no|without|un(?:check|tick|select|subscribe))\b|\bopt(?:-|\s)?out\b/gi;
  const PAY_RE = /\b(pay|place order|book now|confirm (?:booking|order|payment)|complete (?:booking|purchase))\b/i;
  const FARE_RE = /\b(fare|ticket|base|price|subtotal)\b/i;

  // Per-page-load memory for rules that need to watch something over time.
  const ctx = { clockReadings: {}, timerChecked: {}, claimSeen: {} };

  function finding(f) {
    return Object.assign({ status: 'open', confidence: 'high', source: 'rule', cost: 0, saving: 0, fix: null }, f);
  }

  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // 1. False urgency: a countdown that starts again when the page reloads.
  R.timer = function (snap, s) {
    return snap.clocks.map((c) => {
      const key = U.key(c.context) || 'timer';
      const prev = ctx.clockReadings[key];
      const stored = s.timers[key];
      if (!ctx.timerChecked[key]) {
        ctx.timerChecked[key] = true;
        if (stored) {
          const expected = stored.seconds - (Date.now() - stored.at) / 1000;
          if (c.seconds > expected + 5) s.timerResets[key] = c.seconds;
        }
      }
      const counting = !!(prev && c.seconds < prev.seconds);
      ctx.clockReadings[key] = { seconds: c.seconds, at: Date.now() };
      s.timers[key] = { seconds: c.seconds, at: Date.now() };
      const reset = s.timerResets[key];
      return finding({
        id: 'false_urgency:timer:' + key,
        pattern: 'false_urgency',
        anchor: c.el,
        confidence: reset ? 'high' : 'medium',
        title: reset ? 'Fake timer: it restarts when you reload' : 'Countdown timer: possibly fake',
        explain: reset
          ? `This countdown jumped back up to ${mmss(reset)} after a reload, so there is no real deadline. Take your time.`
          : `${counting ? 'This countdown is ticking down to rush you' : 'Countdowns are often used to rush you'}. Reload the page: if it starts again, it's fake.`,
        fix: { kind: 'chip', el: c.el, text: reset ? 'Fake timer: resets on reload' : 'Possibly fake timer', label: 'Label the timer' }
      });
    });
  };

  // 1. False urgency: "Only 2 seats left!" that can't be checked.
  R.scarcity = function (snap, s) {
    return snap.claims.map((c) => {
      const key = U.key(c.text) || 'claim';
      if (!ctx.claimSeen[key]) {
        ctx.claimSeen[key] = true;
        s.claims[key] = (s.claims[key] || 0) + 1;
      }
      const repeated = s.claims[key] > 1;
      return finding({
        id: 'false_urgency:claim:' + key,
        pattern: 'false_urgency',
        anchor: c.el,
        title: 'Unverified scarcity claim',
        explain: `"${U.short(c.text, 60)}" can't be checked${repeated ? ', and it says exactly the same on every visit' : ''}. Don't let it rush you.`,
        fix: { kind: 'chip', el: c.el, text: 'Unverified claim', label: 'Label the claim' }
      });
    });
  };

  // 2. Basket sneaking: a paid checkbox ticked, or a paid option picked, before the user touched it.
  R.preselected = function (snap) {
    const out = [];
    const groups = {};
    for (const c of snap.choices) {
      if (c.kind === 'checkbox' && c.checked && c.price > 0 && !DPB.ledger.touched(c.el)) {
        const label = U.stripMoney(c.text) || 'This add-on';
        const key = U.key(label);
        out.push(finding({
          id: 'basket_sneaking:' + key,
          pattern: 'basket_sneaking',
          anchor: c.anchor,
          cost: c.price,
          saving: c.price,
          itemLabel: label,
          title: `${U.short(label)} was ticked for you`,
          explain: `${U.short(label)} (${U.rupee(c.price)}) was already ticked when the page loaded. You never chose it.`,
          fix: { kind: 'click', el: c.el, label: `Untick ${U.short(label, 30)}`, itemKey: key }
        }));
      } else if (c.kind === 'radio' && c.name) {
        (groups[c.name] = groups[c.name] || []).push(c);
      }
    }
    for (const [name, radios] of Object.entries(groups)) {
      if (radios.some((r) => DPB.ledger.touched(r.el))) continue;
      const chosen = radios.find((r) => r.checked);
      if (!chosen || !(chosen.price > 0)) continue;
      const free = radios.filter((r) => !r.disabled && r.price === 0);
      if (!free.length) continue;
      const kind = ((chosen.text.match(/\b(window|aisle|middle)\b/i) || [])[1] || '').toLowerCase();
      const pick = (kind && free.find((r) => r.text.toLowerCase().includes(kind))) || free[0];
      const key = U.key(name) || 'option';
      const what = U.stripMoney(chosen.text);
      out.push(finding({
        id: 'basket_sneaking:' + key,
        pattern: 'basket_sneaking',
        anchor: chosen.anchor,
        cost: chosen.price,
        saving: chosen.price,
        itemLabel: `${cap(key)} ${what}`,
        title: `A paid ${key} was picked for you`,
        explain: `${cap(key)} ${what} (${U.rupee(chosen.price)}) was selected before you clicked anything, though free ones exist.`,
        fix: { kind: 'radio', el: pick.el, prev: chosen.el, label: `Pick ${U.stripMoney(pick.text)} (free)`, itemKey: key }
      }));
    }
    return out;
  };

  // 2. Basket sneaking, on a later step: a price line the site picked earlier, with a control to change it.
  R.sneakedLines = function (snap) {
    if (!snap.summary) return [];
    const out = [];
    for (const line of snap.summary.lines) {
      const item = line.item;
      if (!item || !(line.amount > 0) || line.linked || !line.controls.length || item.origin !== 'site') continue;
      let fix = null;
      const select = line.controls.find((c) => c.tagName === 'SELECT');
      const remove = line.controls.find((c) => c.tagName !== 'SELECT' &&
        /^(remove|delete|drop|[×✕x])$/i.test((c.innerText || c.getAttribute('aria-label') || '').trim()));
      const box = line.controls.find((c) => c.type === 'checkbox' && c.checked);
      if (select) {
        const currentText = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : '';
        const kind = ((currentText.match(/\b(window|aisle|middle)\b/i) || [])[1] || '').toLowerCase();
        const free = Array.from(select.options).filter((o) => !o.disabled && o.value !== select.value && U.priceOf(o.text) === 0);
        const opt = (kind && free.find((o) => o.text.toLowerCase().includes(kind))) || free[0];
        if (opt) fix = { kind: 'select', el: select, value: opt.value, prev: select.value, label: `Switch to ${opt.text.split('·')[0].trim()} (free)`, itemKey: item.key };
      } else if (remove) {
        fix = { kind: 'click', el: remove, label: `Remove ${U.short(line.label, 30)}`, itemKey: item.key };
      } else if (box) {
        fix = { kind: 'click', el: box, label: `Untick ${U.short(line.label, 30)}`, itemKey: item.key };
      }
      out.push(finding({
        id: 'basket_sneaking:' + item.key,
        pattern: 'basket_sneaking',
        anchor: line.el,
        cost: line.amount,
        saving: fix ? line.amount : 0,
        itemLabel: line.label,
        title: `${U.short(line.label)} was added for you`,
        explain: `${U.short(line.label)} (${U.rupee(line.amount)}) was picked by the site on an earlier step. You never chose it.`,
        fix
      }));
    }
    return out;
  };

  // 8. Drip pricing: a compulsory charge that appears for the first time on a later step.
  R.drip = function (snap, s) {
    if (!snap.summary) return [];
    const idx = DPB.ledger.stepIndex(snap.step);
    if (idx < 1) return [];
    const out = [];
    for (const line of snap.summary.lines) {
      const item = line.item;
      if (!item || !(line.amount > 0) || !item.compulsory || FARE_RE.test(line.label)) continue;
      if (s.advertised && Math.abs(line.amount - s.advertised.amount) < 1) continue;
      if (item.firstStep < idx) continue; // it was already shown on an earlier step
      if (s.disclosed.some((d) => d.key === item.key || (Math.abs(d.amount - line.amount) < 1 && U.shareToken(d.label, line.label)))) continue;
      out.push(finding({
        id: 'drip_pricing:' + item.key,
        pattern: 'drip_pricing',
        anchor: line.el,
        cost: line.amount,
        itemLabel: line.label,
        title: `${U.short(line.label)} shown only now`,
        explain: `This ${U.rupee(line.amount)} charge appears for the first time at the ${snap.step.toLowerCase()} step. It can't be removed, so the honest price includes it.`,
        fix: { kind: 'chip', el: line.el, text: 'Hidden until this step', label: 'Flag the late fee' }
      }));
    }
    return out;
  };

  // 6. Interface interference: the "skip" option is tiny or faint next to a big "Add" button.
  R.hiddenSkip = function (snap) {
    const usable = snap.controls.filter((c) => !c.inPayment);
    const candidates = usable.filter((c) => c.text && c.text.length <= 40 && SKIP_RE.test(c.text));
    if (!candidates.length) return [];
    const others = usable.filter((c) => !candidates.includes(c) && !PAY_RE.test(c.text));
    if (!others.length) return [];
    const primary = others.reduce((a, b) => (b.area > a.area ? b : a));
    return candidates
      .filter((c) => (c.area / primary.area < 0.25 && (c.contrast < 3 || c.fontSize < 12.5)) || c.contrast < 2)
      .map((c) => finding({
        id: 'interface_interference:' + (U.key(c.text) || 'skip'),
        pattern: 'interface_interference',
        anchor: c.el,
        title: `The "${U.short(c.text, 24)}" option is hidden`,
        explain: `It is about ${Math.max(2, Math.round(primary.area / c.area))}× smaller than "${U.short(primary.text, 24)}", ` +
          `in ${c.fontSize}px text with ${c.contrast.toFixed(1)}:1 contrast. You're allowed to skip.`,
        fix: { kind: 'proxy', el: c.el, text: cap(c.text.trim()), width: primary.rect.width, height: primary.rect.height, label: 'Show it as a clear button' }
      }));
  };

  // 3. Confirm shaming: guilt or fear on the "No" option. The AI makes the call (see ai.js).
  R.confirmShaming = function (snap) {
    const seen = new Set();
    const items = snap.controls.filter((c) => !c.inPayment).map((c) => ({ el: c.el, text: c.text }));
    snap.choices.filter((c) => c.kind === 'radio' || c.kind === 'checkbox')
      .forEach((c) => items.push({ el: c.anchor, text: U.stripMoney(c.text) }));
    const out = [];
    for (const it of items) {
      const text = (it.text || '').trim();
      if (text.length < 12 || text.length > 140 || seen.has(text)) continue;
      if (!DECLINE_START_RE.test(text) || NEUTRAL_RE.test(text)) continue;
      seen.add(text);
      out.push(finding({
        id: 'confirm_shaming:' + U.hash(text),
        pattern: 'confirm_shaming',
        anchor: it.el,
        status: 'checking',
        confidence: 'medium',
        title: 'Guilt-trip wording on the "No" option',
        explain: `"${U.short(text, 70)}"`,
        quote: text,
        needsAI: { kind: 'confirm_shaming', text, element_type: it.el.tagName.toLowerCase() },
        fix: { kind: 'proxy', el: it.el, text: 'No thanks', label: 'Show a neutral "No thanks"' }
      }));
    }
    return out;
  };

  // 11. Trick question: a checkbox sentence with two or more negatives. The AI works out what it means.
  R.trickQuestion = function (snap) {
    return snap.choices
      .filter((c) => c.kind === 'checkbox')
      .map((c) => ({ c, n: (c.text.match(NEGATION_RE) || []).length }))
      .filter((x) => x.n >= 2)
      .map(({ c, n }) => finding({
        id: 'trick_question:' + U.hash(c.text),
        pattern: 'trick_question',
        anchor: c.anchor,
        el: c.el,
        status: 'checking',
        confidence: 'medium',
        title: 'Confusing double-negative checkbox',
        explain: `"${U.short(c.text, 90)}" packs ${n} negatives into one sentence.`,
        quote: c.text,
        needsAI: { kind: 'trick_question', text: c.text, element_type: 'checkbox' }
      }));
  };

  const ALL = ['timer', 'scarcity', 'preselected', 'sneakedLines', 'drip', 'hiddenSkip', 'confirmShaming', 'trickQuestion'];

  R.run = function (snap, session) {
    const byId = new Map();
    for (const name of ALL) {
      let found = [];
      try {
        found = R[name](snap, session);
      } catch (e) {
        console.warn('[Dark Pattern Buster] rule failed:', name, e);
      }
      for (const f of found) {
        f.step = snap.step;
        if (!byId.has(f.id)) byId.set(f.id, f);
      }
    }
    return Array.from(byId.values());
  };
})();
