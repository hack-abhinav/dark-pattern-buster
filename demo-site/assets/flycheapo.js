/*
 * FlyCheapo: a clearly fictional airline, built only to demo Dark Pattern Buster.
 * Every fare is made up. No booking or payment ever happens.
 *
 * The site has 8 dark-pattern traps that can be switched on and off (see TRAPS).
 * "Honest mode" switches them all off, so we can show that the agent raises no false alarms.
 *
 * Plain JavaScript, no build step: open the pages from any static web server.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  const TRAPS = [
    { id: 'timer', name: 'Resetting countdown', pattern: 'False urgency', page: 'Search' },
    { id: 'scarcity', name: 'Fake scarcity', pattern: 'False urgency', page: 'Search' },
    { id: 'insurance', name: 'Pre-ticked insurance', pattern: 'Basket sneaking', page: 'Add-ons' },
    { id: 'seat', name: 'Pre-selected paid seat', pattern: 'Basket sneaking', page: 'Seat' },
    { id: 'fee', name: 'Late convenience fee', pattern: 'Drip pricing', page: 'Payment' },
    { id: 'guilt', name: 'Guilt-trip decline', pattern: 'Confirm shaming', page: 'Add-ons' },
    { id: 'skip', name: 'Hidden skip link', pattern: 'Interface interference', page: 'Add-ons' },
    { id: 'doubleneg', name: 'Double-negative checkbox', pattern: 'Trick question', page: 'Payment' }
  ];

  const FLIGHTS = [
    { id: 'FC 214', dep: '06:10', arr: '08:55', dur: '2h 45m', fare: 4999, tag: 'Cheapest' },
    { id: 'FC 538', dep: '09:45', arr: '12:40', dur: '2h 55m', fare: 5640 },
    { id: 'FC 902', dep: '18:30', arr: '21:20', dur: '2h 50m', fare: 6120 }
  ];

  const FEE = 199;

  const ADDONS = [
    { id: 'insurance', name: 'Travel insurance', price: 299, desc: 'Covers flight delays, lost baggage and medical emergencies.' },
    { id: 'meal', name: 'Hot meal', price: 250, desc: 'Veg biryani or paneer wrap, served on board.' },
    { id: 'bag', name: 'Extra baggage (15 kg)', price: 1050, desc: 'On top of your 15 kg check-in allowance.' }
  ];

  const ROWS = 20;
  const PAID_ROWS = 12; // rows 1–12 cost extra, rows 13–20 are free
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const OCCUPIED = new Set(['1A', '1B', '2C', '2D', '3F', '4A', '5B', '5E', '6C', '7A', '7F', '8D', '9B', '10E',
    '11C', '12F', '13A', '13F', '14B', '16D', '17E', '19C']);
  const PRESELECTED_SEAT = '12A';

  const STEPS = [
    { page: 'search', label: 'Flights', href: 'index.html' },
    { page: 'seat', label: 'Seat', href: 'seat.html' },
    { page: 'addons', label: 'Add-ons', href: 'addons.html' },
    { page: 'review', label: 'Review & pay', href: 'review.html' }
  ];

  const TRAP_KEY = 'flycheapo:traps';
  const BOOKING_KEY = 'flycheapo:booking';
  const PREVIEW_KEY = 'flycheapo:agentPreview';

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const rupee = (n) => '₹' + Number(n).toLocaleString('en-IN');

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage blocked: the demo still works for one page */ }
  }

  function seatInfo(code) {
    if (!code) return null;
    const row = parseInt(code, 10);
    const letter = code.replace(/\d+/g, '');
    const kind = letter === 'A' || letter === 'F' ? 'Window' : letter === 'C' || letter === 'D' ? 'Aisle' : 'Middle';
    let price = 0;
    if (row <= PAID_ROWS) price = kind === 'Middle' ? 199 : 349;
    return { code, row, letter, kind, price };
  }

  // ---------------------------------------------------------------------------
  // Trap switches
  // ---------------------------------------------------------------------------

  function allTraps(on) {
    const t = {};
    TRAPS.forEach((trap) => { t[trap.id] = on; });
    return t;
  }

  function loadTraps() {
    const params = new URLSearchParams(location.search);
    const mode = params.get('mode');
    if (mode === 'honest' || mode === 'traps') {
      const t = allTraps(mode === 'traps');
      writeJSON(TRAP_KEY, t);
      return t;
    }
    return Object.assign(allTraps(true), readJSON(TRAP_KEY, {}));
  }

  const traps = loadTraps();
  const trap = (id) => !!traps[id];
  const honestMode = () => TRAPS.every((t) => !traps[t.id]);

  // ---------------------------------------------------------------------------
  // Booking state (kept in localStorage so it survives page loads)
  // ---------------------------------------------------------------------------

  function loadBooking() {
    return readJSON(BOOKING_KEY, null);
  }

  function saveBooking(b) {
    writeJSON(BOOKING_KEY, b);
  }

  function newBooking(flight) {
    return {
      flight: flight.id,
      fare: flight.fare,
      seat: trap('seat') ? PRESELECTED_SEAT : null,
      addons: { insurance: trap('insurance'), meal: false, bag: false },
      offersChecked: false
    };
  }

  // Does the site show the convenience fee yet? With the "late fee" trap on, only from the payment page.
  function feeShown(page) {
    return !trap('fee') || page === 'review' || page === 'done';
  }

  function priceLines(b, page) {
    const lines = [{ id: 'fare', label: 'Base fare', amount: b.fare }];
    const seat = seatInfo(b.seat);
    if (seat && seat.price > 0) lines.push({ id: 'seat', label: `Seat ${seat.code} (${seat.kind})`, amount: seat.price });
    // Add-ons are only offered from the add-ons page onward.
    if (page !== 'seat') {
      ADDONS.forEach((a) => {
        if (b.addons[a.id]) lines.push({ id: a.id, label: a.name, amount: a.price });
      });
    }
    if (feeShown(page)) lines.push({ id: 'fee', label: 'Convenience fee', amount: FEE });
    return lines;
  }

  function total(b, page) {
    return priceLines(b, page).reduce((sum, l) => sum + l.amount, 0);
  }

  // Offers checkbox. With the trick-question trap on, the wording is a double negative:
  // "Uncheck this box if you do not want to not receive offers" means "uncheck it if you WANT offers",
  // so an unticked box signs you up.
  function receivesOffers(b) {
    return trap('doubleneg') ? !b.offersChecked : b.offersChecked;
  }

  // ---------------------------------------------------------------------------
  // Layout: header, footer, demo controls
  // ---------------------------------------------------------------------------

  function header(page) {
    const current = STEPS.findIndex((s) => s.page === page);
    const steps = STEPS.map((s, i) => {
      const cls = i === current ? 'step current' : i < current ? 'step done' : 'step';
      return `<li class="${cls}"><span class="num">${i + 1}</span>${s.label}</li>`;
    }).join('');
    return `
      <header class="topbar">
        <div class="wrap topbar-inner">
          <a class="logo" href="index.html">Fly<span>Cheapo</span></a>
          <ol class="steps" aria-label="Booking steps">${steps}</ol>
        </div>
      </header>`;
  }

  function footer() {
    return `
      <footer class="footer">
        <div class="wrap">
          <p><strong>FlyCheapo is a fictional airline</strong>, built to demo Dark Pattern Buster for wHACKiest 2026.
          It is not a real company, every fare is made up, and no booking or payment ever happens.</p>
          <p class="muted">Mode: ${honestMode() ? 'honest mode (no traps)' : `${TRAPS.filter((t) => traps[t.id]).length} of 8 traps on`}</p>
        </div>
      </footer>`;
  }

  function demoControls() {
    const rows = TRAPS.map((t, i) => `
      <label class="dc-trap">
        <input type="checkbox" data-trap="${t.id}" ${traps[t.id] ? 'checked' : ''}>
        <span><b>${i + 1}. ${t.name}</b><small>${t.pattern} · ${t.page}</small></span>
      </label>`).join('');
    const preview = sessionStorage.getItem(PREVIEW_KEY) === '1';
    return `
      <div class="dc">
        <button type="button" class="dc-toggle" aria-expanded="false">Demo controls</button>
        <div class="dc-panel" hidden>
          <h2>Demo controls</h2>
          <div class="dc-modes">
            <button type="button" class="btn btn-small" data-mode="traps">All 8 traps</button>
            <button type="button" class="btn btn-small" data-mode="honest">Honest mode</button>
          </div>
          <div class="dc-list">${rows}</div>
          <label class="dc-trap dc-preview">
            <input type="checkbox" data-preview ${preview ? 'checked' : ''}>
            <span><b>Agent preview</b><small>Runs the agent inside this page, for judges without the extension</small></span>
          </label>
          <button type="button" class="btn btn-primary btn-block" data-apply>Apply and restart booking</button>
        </div>
      </div>`;
  }

  function bindDemoControls() {
    const toggle = $('.dc-toggle');
    const panel = $('.dc-panel');
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
    });
    $$('[data-mode]').forEach((btn) => btn.addEventListener('click', () => {
      const on = btn.dataset.mode === 'traps';
      $$('[data-trap]').forEach((box) => { box.checked = on; });
    }));
    $('[data-apply]').addEventListener('click', () => {
      const t = {};
      $$('[data-trap]').forEach((box) => { t[box.dataset.trap] = box.checked; });
      writeJSON(TRAP_KEY, t);
      if ($('[data-preview]').checked) sessionStorage.setItem(PREVIEW_KEY, '1');
      else sessionStorage.removeItem(PREVIEW_KEY);
      localStorage.removeItem(BOOKING_KEY);
      location.href = 'index.html';
    });
  }

  function summaryHTML(b, page) {
    const rows = priceLines(b, page).map((l) =>
      `<div class="row"><span class="label">${l.label}</span><span class="amt">${rupee(l.amount)}</span></div>`).join('');
    return `
      <h2>Price summary</h2>
      ${rows}
      <div class="row total"><span class="label">Total</span><span class="amt">${rupee(total(b, page))}</span></div>`;
  }

  function flightLine(b) {
    const f = FLIGHTS.find((x) => x.id === b.flight) || FLIGHTS[0];
    return `${f.id} · BLR ${f.dep} → DEL ${f.arr} · Wed, 2 Dec 2026`;
  }

  // ---------------------------------------------------------------------------
  // Pages
  // ---------------------------------------------------------------------------

  function pageSearch() {
    const cards = FLIGHTS.map((f) => {
      const scarcity = f.tag && trap('scarcity') ? '<span class="badge badge-hot">Only 2 seats left at this price!</span>' : '';
      const tag = f.tag ? `<span class="badge">${f.tag}</span>` : '';
      const priceSub = trap('fee')
        ? '<div class="sub">per adult</div>'
        : `<div class="sub">+ ${rupee(FEE)} convenience fee</div><div class="sub">${rupee(f.fare + FEE)} total</div>`;
      return `
        <li class="flight-card">
          <div class="times">
            <div><b>${f.dep}</b><span>BLR</span></div>
            <div class="dur">${f.dur}<br><span>Non-stop</span></div>
            <div><b>${f.arr}</b><span>DEL</span></div>
          </div>
          <div class="meta"><span class="flight-no">${f.id}</span>${tag}${scarcity}</div>
          <div class="price"><div class="fare">${rupee(f.fare)}</div>${priceSub}</div>
          <button type="button" class="btn btn-primary" data-flight="${f.id}">Select</button>
        </li>`;
    }).join('');

    const timer = trap('timer')
      ? '<div class="hold" role="timer"><span>Fare held for</span> <b data-hold>09:59</b></div>'
      : '';

    return `
      <main class="wrap">
        <section class="search-head">
          <div>
            <h1>Bengaluru (BLR) → Delhi (DEL)</h1>
            <p class="muted">Wed, 2 Dec 2026 · 1 adult · Economy</p>
          </div>
          ${timer}
        </section>
        <ol class="flights">${cards}</ol>
      </main>`;
  }

  function bindSearch() {
    // Trap 1: the countdown starts again from 09:59 on every page load.
    const hold = $('[data-hold]');
    if (hold) {
      let left = 599;
      setInterval(() => {
        left = left > 0 ? left - 1 : 599;
        const m = String(Math.floor(left / 60)).padStart(2, '0');
        const s = String(left % 60).padStart(2, '0');
        hold.textContent = `${m}:${s}`;
      }, 1000);
    }
    $$('[data-flight]').forEach((btn) => btn.addEventListener('click', () => {
      const flight = FLIGHTS.find((f) => f.id === btn.dataset.flight);
      saveBooking(newBooking(flight));
      location.href = 'seat.html';
    }));
  }

  function pageSeat(b) {
    let rows = '';
    for (let r = 1; r <= ROWS; r++) {
      const seats = LETTERS.map((l) => {
        const info = seatInfo(`${r}${l}`);
        const taken = OCCUPIED.has(info.code);
        const priceText = info.price > 0 ? rupee(info.price) : 'Free';
        const cls = taken ? 'taken' : info.price === 0 ? 'free' : info.price === 199 ? 'p199' : 'p349';
        return `
          <label class="seat ${cls}" title="${info.code} ${info.kind} · ${priceText}">
            <input type="radio" name="seat" value="${info.code}" aria-label="${info.code} ${info.kind} ${priceText}"
              ${b.seat === info.code ? 'checked' : ''} ${taken ? 'disabled' : ''}>
            <span>${l}</span>
          </label>`;
      });
      rows += `<div class="seat-row"><span class="row-no">${r}</span>${seats.slice(0, 3).join('')}<span class="aisle"></span>${seats.slice(3).join('')}</div>`;
      if (r === PAID_ROWS) rows += '<div class="seat-divider">Rows 13–20: free seats</div>';
    }
    return `
      <main class="wrap two-col">
        <section>
          <h1>Choose your seat</h1>
          <p class="muted">${flightLine(b)}</p>
          <div class="legend">
            <span><i class="sw p349"></i>Window or aisle ₹349</span>
            <span><i class="sw p199"></i>Middle ₹199</span>
            <span><i class="sw free"></i>Free</span>
            <span><i class="sw taken"></i>Taken</span>
          </div>
          <fieldset class="seatmap">
            <legend>Seat map, front of the plane at the top</legend>
            ${rows}
          </fieldset>
          <div class="actions"><button type="button" class="btn btn-primary btn-xl" data-next>Continue</button></div>
        </section>
        <aside class="summary" aria-label="Price summary">${summaryHTML(b, 'seat')}</aside>
      </main>`;
  }

  function bindSeat(b) {
    $$('input[name="seat"]').forEach((input) => input.addEventListener('change', () => {
      b.seat = input.value;
      saveBooking(b);
      $('.summary').innerHTML = summaryHTML(b, 'seat');
    }));
    $('[data-next]').addEventListener('click', () => { location.href = 'addons.html'; });
  }

  function pageAddons(b) {
    const cards = ADDONS.map((a) => {
      const decline = a.id === 'insurance'
        ? `<button type="button" class="decline" data-decline>${trap('guilt') ? "No, I don't care if my trip goes wrong" : 'No thanks'}</button>`
        : '';
      return `
        <div class="addon">
          <label class="addon-main">
            <input type="checkbox" name="${a.id}" ${b.addons[a.id] ? 'checked' : ''}>
            <span class="addon-name">${a.name}</span>
            <span class="addon-price">${rupee(a.price)}</span>
          </label>
          <p class="muted">${a.desc}</p>
          ${decline}
        </div>`;
    }).join('');

    const skip = trap('skip')
      ? '<a href="#" class="skip-tiny" data-skip>skip</a>'
      : '<button type="button" class="btn btn-secondary btn-xl" data-skip>Skip add-ons</button>';

    return `
      <main class="wrap two-col">
        <section>
          <h1>Add extras to your trip</h1>
          <p class="muted">${flightLine(b)}</p>
          <div class="addons">${cards}</div>
          <div class="actions">
            <button type="button" class="btn btn-primary btn-xl" data-next>${trap('skip') ? 'Add &amp; continue' : 'Continue'}</button>
            ${skip}
          </div>
        </section>
        <aside class="summary" aria-label="Price summary">${summaryHTML(b, 'addons')}</aside>
      </main>`;
  }

  function bindAddons(b) {
    const refresh = () => {
      saveBooking(b);
      $('.summary').innerHTML = summaryHTML(b, 'addons');
    };
    ADDONS.forEach((a) => {
      $(`input[name="${a.id}"]`).addEventListener('change', (e) => {
        b.addons[a.id] = e.target.checked;
        refresh();
      });
    });
    $('[data-decline]').addEventListener('click', () => {
      $('input[name="insurance"]').checked = false;
      b.addons.insurance = false;
      refresh();
    });
    $('[data-next]').addEventListener('click', () => { location.href = 'review.html'; });
    $('[data-skip]').addEventListener('click', (e) => {
      e.preventDefault();
      ADDONS.forEach((a) => { b.addons[a.id] = false; });
      saveBooking(b);
      location.href = 'review.html';
    });
  }

  function pageReview(b) {
    const seat = seatInfo(b.seat);
    const freeSeats = [];
    for (let r = PAID_ROWS + 1; r <= ROWS; r++) {
      LETTERS.forEach((l) => {
        const code = `${r}${l}`;
        if (!OCCUPIED.has(code) && code !== b.seat) freeSeats.push(seatInfo(code));
      });
    }
    const current = seat
      ? `<option value="${seat.code}">${seat.code} ${seat.kind} · ${seat.price ? rupee(seat.price) : 'Free'}</option>`
      : '<option value="">Assigned free at check-in</option>';
    const options = current + freeSeats.map((s) => `<option value="${s.code}">${s.code} ${s.kind} · Free</option>`).join('');

    const addonRows = ADDONS.filter((a) => b.addons[a.id]).map((a) => `
      <div class="row" data-row="${a.id}">
        <span class="label"><span data-label>${a.name}</span>
          <button type="button" class="link-btn" data-remove="${a.id}" aria-pressed="false">Remove</button></span>
        <span class="amt" data-amt>${rupee(a.price)}</span>
      </div>`).join('');

    const feeRow = feeShown('review')
      ? `<div class="row"><span class="label">Convenience fee</span><span class="amt">${rupee(FEE)}</span></div>`
      : '';

    const offersText = trap('doubleneg')
      ? 'Uncheck this box if you do not want to not receive offers'
      : 'Send me offers and travel deals';

    return `
      <main class="wrap two-col">
        <section>
          <h1>Review and pay</h1>
          <p class="muted">${flightLine(b)}</p>
          <section class="summary summary-main" aria-label="Price summary">
            <h2>Price summary</h2>
            <div class="row"><span class="label">Base fare</span><span class="amt">${rupee(b.fare)}</span></div>
            <div class="row" data-row="seat">
              <span class="label"><span data-label>${seat ? `Seat ${seat.code} (${seat.kind})` : 'Seat'}</span>
                <select data-seat aria-label="Change seat">${options}</select></span>
              <span class="amt" data-amt>${seat && seat.price ? rupee(seat.price) : 'Free'}</span>
            </div>
            ${addonRows}
            ${feeRow}
            <div class="row total"><span class="label">Total</span><span class="amt" data-total>${rupee(total(b, 'review'))}</span></div>
          </section>
          <label class="offers"><input type="checkbox" data-offers ${b.offersChecked ? 'checked' : ''}> ${offersText}</label>
        </section>
        <aside>
          <form class="pay" autocomplete="off" data-pay>
            <h2>Payment</h2>
            <p class="warn">Demo only. Don't type real card details: nothing is charged.</p>
            <label>Card number <input name="cardnumber" autocomplete="cc-number" inputmode="numeric" placeholder="4111 1111 1111 1111"></label>
            <div class="two">
              <label>Expiry <input name="cc-exp" autocomplete="cc-exp" placeholder="MM/YY"></label>
              <label>CVV <input name="cvv" autocomplete="cc-csc" inputmode="numeric" placeholder="123"></label>
            </div>
            <label>Name on card <input name="ccname" autocomplete="cc-name"></label>
            <button type="submit" class="btn btn-primary btn-xl btn-block" data-paybtn>Pay ${rupee(total(b, 'review'))}</button>
          </form>
        </aside>
      </main>`;
  }

  function bindReview(b) {
    // Update the summary in place, so the page's own controls stay the same elements.
    const refresh = () => {
      saveBooking(b);
      const seat = seatInfo(b.seat);
      const seatRow = $('[data-row="seat"]');
      $('[data-label]', seatRow).textContent = seat ? `Seat ${seat.code} (${seat.kind})` : 'Seat';
      $('[data-amt]', seatRow).textContent = seat && seat.price ? rupee(seat.price) : 'Free';
      ADDONS.forEach((a) => {
        const row = $(`[data-row="${a.id}"]`);
        if (!row) return;
        const on = b.addons[a.id];
        $('[data-label]', row).textContent = on ? a.name : `${a.name} (removed)`;
        $('[data-amt]', row).textContent = rupee(on ? a.price : 0);
        const btn = $('[data-remove]', row);
        btn.textContent = on ? 'Remove' : 'Add back';
        btn.setAttribute('aria-pressed', String(!on));
      });
      $('[data-total]').textContent = rupee(total(b, 'review'));
      $('[data-paybtn]').textContent = `Pay ${rupee(total(b, 'review'))}`;
    };

    $('[data-seat]').addEventListener('change', (e) => {
      b.seat = e.target.value || null;
      refresh();
    });
    $$('[data-remove]').forEach((btn) => btn.addEventListener('click', () => {
      const id = btn.dataset.remove;
      b.addons[id] = !b.addons[id];
      refresh();
    }));
    $('[data-offers]').addEventListener('change', (e) => {
      b.offersChecked = e.target.checked;
      saveBooking(b);
    });
    $('[data-pay]').addEventListener('submit', (e) => {
      e.preventDefault();
      b.paidTotal = total(b, 'review');
      saveBooking(b);
      location.href = 'done.html';
    });
  }

  function pageDone(b) {
    const rows = priceLines(b, 'done').map((l) =>
      `<div class="row"><span class="label">${l.label}</span><span class="amt">${rupee(l.amount)}</span></div>`).join('');
    return `
      <main class="wrap narrow">
        <section class="done-card">
          <p class="eyebrow">Demo only: no payment taken</p>
          <h1>You would have paid ${rupee(b.paidTotal || total(b, 'done'))}</h1>
          <p class="muted">${flightLine(b)}</p>
          <section class="summary" aria-label="What you would have paid for">${rows}</section>
          <p class="offers-result">Marketing offers: <b>${receivesOffers(b) ? "you'll receive offers" : 'no offers'}</b></p>
          <button type="button" class="btn btn-primary btn-xl" data-again>Book again</button>
        </section>
      </main>`;
  }

  function bindDone() {
    $('[data-again]').addEventListener('click', () => {
      localStorage.removeItem(BOOKING_KEY);
      location.href = 'index.html';
    });
  }

  // ---------------------------------------------------------------------------
  // Agent preview: runs the Dark Pattern Buster agent inside the page, for people
  // who can't install the extension. The extension itself never needs this.
  // ---------------------------------------------------------------------------

  function maybeLoadAgentPreview() {
    const params = new URLSearchParams(location.search);
    if (params.get('agent') === 'preview') sessionStorage.setItem(PREVIEW_KEY, '1');
    if (params.get('agent') === 'off') sessionStorage.removeItem(PREVIEW_KEY);
    if (sessionStorage.getItem(PREVIEW_KEY) !== '1') return;
    // Give the real extension a moment to start first; if it's running, it wins.
    setTimeout(() => {
      if (document.documentElement.hasAttribute('data-dpb')) return;
      window.DPB_PREVIEW = true;
      ['core', 'snapshot', 'ledger', 'rules', 'ai', 'fixer', 'overlay', 'main'].forEach((name) => {
        const s = document.createElement('script');
        s.src = `../extension/agent/${name}.js`;
        s.async = false;
        document.head.appendChild(s);
      });
    }, 400);
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  function boot() {
    const page = document.body.dataset.page;
    let b = loadBooking();
    if (page !== 'search' && !b) {
      location.href = 'index.html';
      return;
    }

    const views = {
      search: [pageSearch, bindSearch],
      seat: [pageSeat, bindSeat],
      addons: [pageAddons, bindAddons],
      review: [pageReview, bindReview],
      done: [pageDone, bindDone]
    };
    const [render, bind] = views[page];
    document.getElementById('app').innerHTML = header(page) + render(b) + footer() + demoControls();
    bind(b);
    bindDemoControls();
    maybeLoadAgentPreview();
  }

  boot();
})();
