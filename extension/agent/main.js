/*
 * The agent loop: Watch → Detect → Explain → Fix → Verify.
 *
 * Watch:   re-read the page whenever it changes (MutationObserver) or the user clicks.
 * Detect:  rules first (rules.js), AI for the subtle cases (ai.js).
 * Explain: the overlay lists each trick, what it costs and its CCPA name (overlay.js).
 * Fix:     only after the user taps "Fix it", only the fixes they left on (fixer.js).
 * Verify:  re-read the site's own total before claiming any saving.
 */
(async function () {
  'use strict';

  const DPB = window.DPB;
  const root = document.documentElement;

  // One agent per page: the extension and the in-page preview never run together.
  if (!DPB || root.hasAttribute('data-dpb')) return;
  root.setAttribute('data-dpb', DPB.platform.isExtension ? 'extension' : 'preview');

  DPB.state.readOnly = !!window.DPB_READ_ONLY;
  DPB.state.lang = (await DPB.platform.settings()).lang;

  await DPB.ledger.init();
  DPB.ledger.listen();

  const rescan = DPB.util.schedule(scan, 700);

  DPB.overlay.mount({
    onFix: async () => {
      const result = await DPB.fixer.apply(DPB.overlay.selectedFixes());
      await scan();
      return result;
    },
    onUndo: async () => {
      await DPB.fixer.undo();
      await scan();
    }
  });

  async function scan() {
    const snap = DPB.snapshot();
    DPB.state.snapshot = snap;
    DPB.ledger.enterStep(snap.step);
    DPB.ledger.update(snap);
    const found = DPB.rules.run(snap, DPB.state.session);
    DPB.state.findings = DPB.ai.resolve(found, rescan);
    DPB.ledger.recordFindings(DPB.state.findings);
    DPB.state.forecast = snap.summary ? null : DPB.ledger.forecast();
    if (snap.step === 'Done') await DPB.ledger.finish();
    DPB.overlay.render();
  }

  new MutationObserver((mutations) => {
    if (mutations.every((m) => DPB.util.isOurs(m.target))) return;
    rescan();
  }).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'disabled', 'aria-checked', 'aria-pressed', 'value']
  });
  document.addEventListener('change', rescan, true);
  document.addEventListener('click', () => setTimeout(rescan, 60), true);

  await scan();
  // A second look shortly after load, so countdowns can be seen ticking.
  setTimeout(rescan, 1500);
})();
