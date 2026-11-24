/*
 * "Fix it": undo the tricks the user approved, then verify against the site's own total.
 *
 * Safety rules:
 *  - Acts only on findings the user left switched on.
 *  - Uses the page's own controls (untick the box, pick the free seat, click "Remove"). It never
 *    rewrites prices on the page.
 *  - Never touches a payment form, never presses Pay, never types anything.
 *  - Every fix can be undone with one tap.
 *  - "Saved ₹X" is only claimed when the site's own total really dropped by X.
 */
(function () {
  'use strict';

  const DPB = window.DPB;
  const U = DPB.util;
  const F = (DPB.fixer = {});

  const PAY_RE = /\b(pay|place order|book now|confirm (?:booking|order|payment)|complete (?:booking|purchase))\b/i;
  let lastBatch = null; // { undos: [fn], result }

  function safe(el) {
    if (!el || !el.isConnected) return false;
    if (U.inPaymentArea(el) || U.isSensitive(el)) return false;
    const isButtonish = el.tagName === 'BUTTON' || el.tagName === 'A' || el.type === 'submit';
    if (isButtonish && PAY_RE.test((el.innerText || el.value || '').trim())) return false;
    return true;
  }

  function setSelect(el, value) {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Apply one fix. Returns a function that undoes it, or null if nothing was done.
  function applyOne(f) {
    const fx = f.fix;
    const s = DPB.state.session;
    if (!fx) return null;
    // Labels, clear buttons and plain-language rewrites are drawn by the overlay, not written into the page.
    if (fx.kind === 'chip' || fx.kind === 'proxy') {
      s.fixed[f.id] = true;
      return () => { delete s.fixed[f.id]; };
    }
    const target = fx.el;
    if (!safe(target)) return null;
    let undo = null;
    if (fx.kind === 'click') {
      target.click();
      undo = () => { if (target.isConnected) target.click(); };
    } else if (fx.kind === 'radio') {
      target.click();
      undo = () => { if (fx.prev && fx.prev.isConnected) fx.prev.click(); };
    } else if (fx.kind === 'select') {
      setSelect(target, fx.value);
      undo = () => { if (target.isConnected) setSelect(target, fx.prev); };
    } else if (fx.kind === 'setCheckbox') {
      const changed = target.checked !== fx.checked;
      if (changed) target.click();
      undo = () => { if (changed && target.isConnected) target.click(); };
    }
    if (!undo) return null;
    s.fixed[f.id] = true;
    if (fx.itemKey && s.items[fx.itemKey]) s.items[fx.itemKey].removed = true;
    return () => {
      undo();
      delete s.fixed[f.id];
      if (fx.itemKey && s.items[fx.itemKey]) s.items[fx.itemKey].removed = false;
    };
  }

  // Wait until the site's total changes and settles (or give up after a couple of seconds).
  async function settledTotal(before) {
    let last = before;
    let stable = 0;
    for (let i = 0; i < 20; i++) {
      await U.sleep(150);
      const now = DPB.snapshot().total;
      if (now !== last) {
        last = now;
        stable = 0;
      } else if (now !== before) {
        stable++;
        if (stable >= 2) break;
      }
    }
    return last;
  }

  F.apply = async function (findings) {
    const before = DPB.snapshot().total;
    const undos = [];
    let expected = 0;
    for (const f of findings) {
      const undo = applyOne(f);
      if (!undo) continue;
      undos.push(undo);
      expected += f.saving || 0;
      await U.sleep(120);
    }
    let after = before;
    if (expected > 0 && before != null) after = await settledTotal(before);
    const saved = before != null && after != null ? before - after : 0;
    const ok = expected === 0 || Math.abs(saved - expected) < 1;
    const result = { before, after, expected, saved, ok, count: undos.length, at: Date.now() };
    if (expected > 0 && ok) DPB.state.session.saved = (DPB.state.session.saved || 0) + saved;
    lastBatch = { undos, result };
    DPB.state.lastFix = result;
    DPB.ledger.save();
    return result;
  };

  F.canUndo = () => !!(lastBatch && lastBatch.undos.length);

  F.undo = async function () {
    if (!lastBatch) return;
    const { undos, result } = lastBatch;
    for (const undo of undos.slice().reverse()) {
      undo();
      await U.sleep(120);
    }
    if (result.expected > 0 && result.ok) DPB.state.session.saved = Math.max(0, (DPB.state.session.saved || 0) - result.saved);
    lastBatch = null;
    DPB.state.lastFix = null;
    DPB.ledger.save();
  };
})();
