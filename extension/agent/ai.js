/*
 * AI checks for the subtle cases rules can't settle: guilt-trip wording (confirm shaming) and
 * double-negative checkboxes (trick questions).
 *
 * Only the short text of the suspicious element goes to the backend (API Gateway → Lambda → Amazon
 * Bedrock). Never prices you typed, payment fields or personal details. Rule results show first;
 * AI verdicts arrive in the background. If the backend can't be reached, the finding stays a
 * "possible trick" and is never fixed automatically.
 */
(function () {
  'use strict';

  const DPB = window.DPB;
  const U = DPB.util;
  const P = DPB.platform;
  const A = (DPB.ai = {});

  const pending = new Map();
  A.engine = null; // 'bedrock' | 'local-fallback' | 'offline'

  function cacheKey(need) {
    return need.kind + ':' + U.hash(need.text);
  }

  // Turn a candidate finding into a real one using the AI verdict, or drop it.
  function apply(f, verdict) {
    if (verdict.error) {
      return Object.assign({}, f, {
        status: 'unchecked',
        confidence: 'medium',
        source: 'rule',
        fix: f.pattern === 'confirm_shaming' ? f.fix : null,
        explain: f.explain + " The AI check couldn't run, so this stays a possible trick."
      });
    }
    if (verdict.pattern !== f.pattern || verdict.confidence === 'low') return null;
    const out = Object.assign({}, f, {
      status: 'open',
      confidence: verdict.confidence === 'high' ? 'high' : 'medium',
      source: verdict.engine === 'bedrock' ? 'ai' : 'ai-fallback',
      explain: verdict.explanation || f.explain
    });
    if (f.pattern === 'trick_question') {
      // checked_means: what ticking the box really does ("opt_in" to offers, or "opt_out").
      const optOutChecked = verdict.checked_means === 'opt_out';
      const el = f.el;
      const optedIn = el.checked ? verdict.checked_means === 'opt_in' : verdict.checked_means === 'opt_out';
      out.title = optedIn ? 'Confusing checkbox: right now it signs you up for offers' : 'Confusing checkbox (set to no offers)';
      out.fix = verdict.checked_means === 'opt_in' || verdict.checked_means === 'opt_out'
        ? { kind: 'setCheckbox', el, checked: optOutChecked, chip: 'Send me offers: No', label: 'Rewrite it and set it to "No offers"' }
        : null;
    }
    return out;
  }

  // Failed checks are only remembered for this page load, so a reload tries the backend again.
  const failed = new Map();

  A.resolve = function (findings, onUpdate) {
    const s = DPB.state.session;
    return findings.map((f) => {
      if (!f.needsAI) return f;
      const key = cacheKey(f.needsAI);
      const cached = s.aiCache[key] || failed.get(key);
      if (cached) {
        A.engine = cached.error ? 'offline' : cached.engine;
        return apply(f, cached);
      }
      if (!pending.has(key)) {
        const body = Object.assign({ step: DPB.state.snapshot ? DPB.state.snapshot.step : null, site: location.host }, f.needsAI);
        pending.set(key, P.backend('/analyse', { body, timeout: 9000 }).then((res) => {
          const verdict = res && res.data ? res.data : { error: (res && res.error) || 'no answer' };
          if (verdict.error) failed.set(key, verdict);
          else s.aiCache[key] = verdict;
          DPB.ledger.save();
          pending.delete(key);
          onUpdate();
        }));
      }
      return f; // still "checking"
    }).filter(Boolean);
  };
})();
