/*
 * Page snapshot: what the agent reads from a checkout step.
 *
 * Reads: price lines and the total, checkboxes / radio buttons / selects and whether they are on,
 * buttons and links with their size and contrast, countdown timers and scarcity claims.
 * Never reads: free-text fields, or anything inside a payment form (card, UPI, OTP, password).
 */
(function () {
  'use strict';

  const DPB = window.DPB;
  const U = DPB.util;

  const TOTAL_RE = /\b(grand total|total|amount payable|you pay|to pay|net payable)\b/i;
  const SUBTOTAL_RE = /\bsub-?\s?total\b/i;
  const CLOCK_RE = /\b(\d{1,2}):([0-5]\d)\b/;
  const URGENT_CONTEXT_RE = /\b(held|hold|expires?|expiring|ends?|left|hurry|remaining|reserved|timer|countdown|offer)\b/i;
  const SCARCITY_RE = /\bonly\s+\d+\s+(?:seats?|left|rooms?|tickets?|items?|pieces?)\b|\b\d+\s+(?:people|others|travell?ers)\s+(?:are\s+)?(?:viewing|looking|booked|watching)\b|\bselling fast\b|\balmost (?:gone|sold out)\b|\blast few (?:seats|rooms|left)\b|\bhigh demand\b/i;

  const STEPS = [
    ['Done', /\b(done|confirm(?:ation|ed)?|thank(?:s| you)|success|receipt|no payment taken)\b/i],
    ['Payment', /\b(review|payment|pay|checkout|billing)\b/i],
    ['Add-ons', /\b(add-?ons?|addons|extras?|ancillar\w*)\b/i],
    ['Seat', /\bseats?\b/i],
    ['Search', /\b(search|results|flights|listing)\b/i]
  ];

  // Which checkout step is this page? Looks at the URL first, then the heading and title.
  function step() {
    const path = decodeURIComponent(location.pathname + ' ' + location.hash).replace(/[/_.\-#]+/g, ' ');
    for (const [name, re] of STEPS) if (re.test(path)) return name;
    const h1 = document.querySelector('h1');
    const title = (h1 ? h1.textContent : '') + ' ' + document.title;
    for (const [name, re] of STEPS) if (re.test(title)) return name;
    return h1 ? U.short(h1.textContent.trim(), 30) : 'Checkout';
  }

  function amountNodes(root) {
    return U.textNodes(root || document.body, (t) => U.MONEY_TEST.test(t))
      .filter((n) => !U.inPaymentArea(n.parentElement));
  }

  function controlsIn(el) {
    return Array.from(el.querySelectorAll(
      'input[type="checkbox"], input[type="radio"], select, button, [role="button"], a[href]'
    )).filter((c) => !U.isOurs(c) && !U.isSensitive(c) && U.visible(c));
  }

  // A price line is the largest element that holds exactly one rupee amount.
  function priceRows() {
    const nodes = amountNodes();
    const countIn = (el) => {
      let c = 0;
      for (const n of nodes) if (el.contains(n)) c++;
      return c;
    };
    const rows = [];
    for (const node of nodes) {
      const amts = U.amounts(node.nodeValue);
      if (amts.length !== 1) continue;
      let row = node.parentElement;
      while (row.parentElement && row.parentElement !== document.body && countIn(row.parentElement) === 1) {
        row = row.parentElement;
      }
      let label = U.stripMoney(U.text(row, true));
      if (!label && row.previousElementSibling) label = U.stripMoney(U.text(row.previousElementSibling, true));
      const negative = /[−-]\s*(?:₹|Rs|INR)/.test(node.nodeValue);
      rows.push({
        el: row,
        node,
        amount: negative ? -amts[0] : amts[0],
        label,
        key: U.key(label),
        font: parseFloat(getComputedStyle(node.parentElement).fontSize) || 0,
        controls: controlsIn(row)
      });
    }
    return rows;
  }

  // The checkout's price summary: the block around the "Total" line.
  function summary(rows) {
    const totals = rows.filter((r) => TOTAL_RE.test(r.label) && !SUBTOTAL_RE.test(r.label) && r.label.length < 40);
    if (!totals.length) return null;
    const total = totals.reduce((a, b) => (b.font > a.font ? b : a), totals[totals.length - 1]);
    let box = total.el.parentElement;
    while (box && box !== document.body && !rows.some((r) => r !== total && box.contains(r.el))) box = box.parentElement;
    if (!box || box === document.body) return null;
    // Separate totals outside this block (one per product card) mean a listing page, not a checkout summary.
    if (totals.some((t) => t !== total && !box.contains(t.el))) return null;
    const lines = rows.filter((r) => r !== total && box.contains(r.el) && !TOTAL_RE.test(r.label));
    return { el: box, total, lines };
  }

  function choices() {
    const out = [];
    document.querySelectorAll('input[type="checkbox"], input[type="radio"], select').forEach((el) => {
      if (U.isOurs(el) || U.inPaymentArea(el) || U.isSensitive(el)) return;
      const anchor = el.closest('label') || el;
      if (!U.visible(anchor)) return;
      if (el.tagName === 'SELECT') {
        out.push({ el, anchor, kind: 'select', text: U.inputText(el) });
        return;
      }
      const text = U.inputText(el);
      out.push({ el, anchor, kind: el.type, name: el.name, text, price: U.priceOf(text), checked: el.checked, disabled: el.disabled });
    });
    return out;
  }

  function controls() {
    return Array.from(document.querySelectorAll('button, a[href], [role="button"], input[type="submit"], input[type="button"]'))
      .filter((el) => !U.isOurs(el) && U.visible(el))
      .map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          el,
          text: (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(),
          area: r.width * r.height,
          rect: { width: r.width, height: r.height },
          fontSize: parseFloat(cs.fontSize) || 0,
          contrast: U.contrast(el),
          inPayment: U.inPaymentArea(el)
        };
      })
      .filter((c) => c.area > 0);
  }

  function clocks() {
    return U.textNodes(document.body, (t) => CLOCK_RE.test(t)).map((n) => {
      const m = n.nodeValue.match(CLOCK_RE);
      const host = n.parentElement.closest('[role="timer"]') || n.parentElement.parentElement || n.parentElement;
      return { el: host, seconds: Number(m[1]) * 60 + Number(m[2]), context: U.text(host).slice(0, 120), timerRole: host.getAttribute('role') === 'timer' };
    }).filter((c) => c.timerRole || URGENT_CONTEXT_RE.test(c.context.replace(CLOCK_RE, '')));
  }

  function claims() {
    return U.textNodes(document.body, (t) => SCARCITY_RE.test(t))
      .map((n) => ({ el: n.parentElement, text: n.nodeValue.trim() }));
  }

  DPB.snapshot = function () {
    const rows = priceRows();
    const sum = summary(rows);
    return {
      at: Date.now(),
      host: location.host,
      step: step(),
      rows,
      summary: sum,
      total: sum ? sum.total.amount : null,
      choices: choices(),
      controls: controls(),
      clocks: clocks(),
      claims: claims()
    };
  };

  DPB.snapshot.step = step;

  // The product card around a clicked "Select" button: the advertised price and any fees it discloses.
  DPB.snapshot.cardAround = function (el) {
    let card = el;
    for (let i = 0; i < 8 && card && card !== document.body; i++) {
      const nodes = amountNodes(card);
      if (nodes.length) {
        if (nodes.length > 6) return null;
        const parts = nodes.map((n) => ({
          node: n,
          amount: U.amounts(n.nodeValue)[0],
          label: U.stripMoney(U.text(n.parentElement, true)),
          font: parseFloat(getComputedStyle(n.parentElement).fontSize) || 0
        })).filter((p) => p.amount > 0);
        if (!parts.length) return null;
        const main = parts.reduce((a, b) => (b.font > a.font ? b : a));
        const fees = parts.filter((p) => p !== main && p.label && !TOTAL_RE.test(p.label) && p.amount < main.amount)
          .map((p) => ({ label: p.label, key: U.key(p.label), amount: p.amount }));
        return { el: card, priceEl: main.node.parentElement, advertised: main.amount, fees, text: U.short(U.text(card, true), 80) };
      }
      card = card.parentElement;
    }
    return null;
  };
})();
