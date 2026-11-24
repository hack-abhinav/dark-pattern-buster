# 3. Architecture and technical blueprint

[← 2. Solution](02-solution.md) · [Back to README](../README.md) · Next: [4. Detection rulebook →](04-dark-pattern-rules.md)

> A Chrome extension in the user's own browser does the watching and fixing. A small serverless AWS backend adds AI checks, storage and voice. The prototype in this repo builds most of it: see [What the prototype builds](#what-the-prototype-builds) at the end.

**Data flow:** checkout page → content script → rule engine → (only if unsure) API Gateway → Lambda → Bedrock → overlay → you tap "Fix it" → fixes applied → site total re-read → Price Ledger + voice alert.

## Components

| Component | Runs where | Its job | Built with |
|---|---|---|---|
| **Content script** | Inside the checkout tab | Reads each step, watches for changes, applies approved fixes, draws small highlights next to each trick | MutationObserver; plain JavaScript in the prototype, TypeScript on hack day |
| **Rule engine** | In the browser | Instant checks for the common traps | JavaScript heuristics |
| **Overlay panel** | In the browser (prototype: a panel in a closed shadow root that the site's CSS can't restyle; planned: Chrome's side panel, which the website can't hide) | Findings, "Fix it", Honest Price card, voice and complaint buttons | Plain JavaScript in the prototype, React on hack day |
| **Background service worker** | In the browser | Keeps the Price Ledger for the session and talks to the backend | Chrome Extension Manifest V3 |
| **API Gateway** | AWS | One HTTPS entry point, with rate limits | Amazon API Gateway |
| **Analysis service** | AWS | Sends uncertain elements to the AI, calls ElevenLabs, updates scores | FastAPI (Python) on AWS Lambda |
| **AI model** | AWS | Reads wording (and, later, small images) for subtle patterns | Claude on Amazon Bedrock; the prototype defaults to Claude Opus 5.5 at low effort, set by `BEDROCK_MODEL_ID` |
| **Price Ledger and site profiles** | AWS | Anonymised price lines per step; Fairness Score and the fees each site usually adds late | Amazon DynamoDB |
| **Evidence store** | AWS | Cropped screenshots for complaints, only when the user asks | Amazon S3 (private, auto-deleted after 30 days) |
| **Voice** | ElevenLabs | Speaks alerts and the final saving in English and Hindi | ElevenLabs text-to-speech |
| **Demo site** | AWS | FlyCheapo, the fictional airline with 8 traps | Static HTML and JavaScript in the prototype; hosted on AWS Amplify |

## What happens on one checkout page

| # | Who | What happens |
|---|---|---|
| 1 | Content script | A checkout step loads or changes. The script builds a **page snapshot** (see below). |
| 2 | Rule engine | Runs on the snapshot in under 100 ms and flags obvious traps: pre-ticked paid boxes, a price that wasn't there on the last step, a timer that restarted, a skip link far smaller than the main button. |
| 3 | Service worker | For anything the rules aren't sure about, it sends a short text snippet (and, only if needed, a cropped image of that one element) to API Gateway. |
| 4 | Lambda + Bedrock | The model answers four questions: which CCPA pattern (or none), how sure it is, a one-line explanation for a normal shopper, and the safest fix. |
| 5 | Overlay | Shows the findings and the Honest Price card. The top finding can be read aloud through ElevenLabs. |
| 6 | User | Switches off any fix they don't want and taps **Fix it**. |
| 7 | Content script | Applies only the approved fixes, using the page's own controls. |
| 8 | Content script + ledger | **Verify:** re-reads the site's own total. The card shows "Saved ₹X" only if the site's total really dropped by that amount. |
| 9 | User | Pays on the site themselves. Optionally taps **Draft complaint**. |

## Detection: rules first, AI second

- **Rules** are fast, free, work offline and are easy to explain. They catch the traps with a clear signal: a paid box ticked before the user touched it, a new fee on a later step, a timer that goes back up, a decline link at a tenth of the size of the "Add" button.
- **AI** handles what rules can't: guilt-trip wording, double negatives, ads dressed up as results, and layouts we have never seen. Because it reads meaning rather than fixed positions, a site redesign doesn't break it.
- **Every finding** is mapped to one of the CCPA's 13 dark patterns. The full mapping is in the [detection rulebook](04-dark-pattern-rules.md).

| How sure | What the agent does |
|---|---|
| **High** (rule match, or AI says high) | Shown as a trick, with a fix switched on by default |
| **Medium** | Shown as a "possible trick"; the fix starts switched off |
| **Low** | Not shown; kept in the session log to improve the rules later |

## The page snapshot: what the agent reads

| Reads | Never reads |
|---|---|
| Visible text near prices, buttons and checkboxes | Card number, CVV, expiry date |
| Every checkbox, toggle and option, and whether it was pre-selected | UPI ID or PIN |
| Every price line and the running total at each step | OTPs and passwords |
| Size, colour and contrast of buttons and links | Name, phone, email, passport or ID fields |
| Countdown timers and stock claims ("only 2 left") | Anything on pages where the agent is switched off |
| Pop-ups, and how often they come back after a "No" | Browsing history or other tabs |

## The Price Ledger

The ledger is the agent's running receipt for one checkout. For every step it records each price line: the item, the amount, the step where it first appeared, and whether the user chose it or the site picked it.

- **Drip pricing:** a compulsory charge that first appears on a later step.
- **Basket sneaking:** a paid item that is selected although the user never clicked it.
- **Bait and switch (stretch goal):** the fare at checkout is higher than the fare at search for the same flight.
- **Honest total:** the advertised fare plus every compulsory charge, without the sneaked extras. Once the backend has seen a site add a fee at payment, the card can warn from the first step: "This site usually adds a ₹199 convenience fee at payment."

During checkout the ledger lives in the extension. When the checkout ends, an anonymised summary (no names, no booking IDs) goes to DynamoDB to update the site's Fairness Score and its list of late fees.

## How "Fix it" works safely

- It acts only on elements the agent found and the user approved.
- It uses the page's own controls: unticks the box, picks the ₹0 seat, clicks "Remove" or "Skip". It never rewrites prices on the page.
- After each fix it re-reads the total. If the total didn't change as expected, it stops and tells the user.
- One tap undoes the agent's own fixes.
- If the site quietly adds an item back, the agent flags it again (and counts it as nagging).
- It never presses Pay and never fills in payment details.

## Data we store

**Price Ledger line** (DynamoDB, anonymised)

| Field | Meaning |
|---|---|
| Session | A random ID for one checkout, not linked to the person |
| Site | The website's domain |
| Step | Search, seat, add-ons or payment |
| Item | For example "Travel insurance" |
| Amount | In rupees |
| How it got there | Picked by the site, chosen by the user, or first shown at this step |
| Outcome | Kept, or removed by "Fix it" |
| Seen at | Date and time |

**Site profile** (DynamoDB)

| Field | Meaning |
|---|---|
| Site | The website's domain |
| Tricks seen | Count of each CCPA pattern found on this site |
| Average extra | Average rupees added per checkout by tricks |
| Late fees | Compulsory fees this site usually adds at a later step, with their amounts |
| Fairness Score | Out of 100: fewer and cheaper tricks give a higher score |
| Updated | When the profile last changed |

**Evidence item** (S3, only if the user taps "Draft complaint")

| Field | Meaning |
|---|---|
| Screenshot | Cropped to the tricky element, with personal fields blurred |
| Step and time | Where and when it was captured |
| Ledger link | The checkout session it belongs to |
| Expiry | Deleted automatically after 30 days |

## Backend operations (planned)

| Operation | Called when | Sends | Gets back |
|---|---|---|---|
| **Analyse** | The rules aren't sure about an element | The element's text, nearby button text, element type, step, and optionally a cropped image | CCPA pattern or none, confidence, one-line explanation, suggested fix |
| **Site info** | A checkout starts | The site's domain | Fairness Score and the fees the site usually adds late |
| **Speak** | An alert or the saving should be read aloud | Short alert text and language (no personal data) | An audio clip from ElevenLabs |
| **Ledger summary** | A checkout ends | Anonymised price lines and findings | The updated Fairness Score |
| **Evidence** | The user taps "Draft complaint" | Cropped screenshots and the ledger | A private link and the complaint text |

The complaint text is filled from a fixed template with facts from the ledger: site, date, items, amounts and CCPA pattern names. The AI may smooth the wording but never adds facts.

## Privacy and security

- **Local first:** rules run in the browser. Only short snippets of suspicious elements leave it.
- **Payment stays private:** payment, OTP, password and personal fields are never read, stored or sent.
- **Secrets stay on AWS:** the ElevenLabs key and Bedrock access live on the AWS side, never inside the extension.
- **Minimal access:** the extension runs only on checkout pages the user turns it on for; no access to other tabs or history.
- **Short memory:** evidence is private and auto-deleted after 30 days; ledger data is anonymised.
- **Abuse limits:** API Gateway rate limits protect the backend and our free-tier budget.

## Performance and cost targets

These are targets for hack day, not measurements.

| What | Target |
|---|---|
| Rule checks per page change | Under 100 ms |
| AI check per uncertain element | Under 3 seconds, in the background; rule results show first |
| Fix + verify | Under 2 seconds |
| Cost during the hackathon | Near zero on AWS and ElevenLabs free tiers |

## When something goes wrong

| Problem | What the agent does |
|---|---|
| AI is slow or unavailable | Rules keep working; AI-only findings show as "couldn't check" |
| The site changes its layout | AI reads meaning, not fixed positions |
| A fix doesn't lower the total | Stops, tells the user and leaves the page as it is |
| The site re-adds an item | Flags it again |
| No internet | Rule checks, the ledger and the Honest Price card still work in the browser |

## Sponsor technology

- **AWS:** six services, each with a clear job: **Bedrock** for AI checks, **Lambda** and **API Gateway** for the backend, **DynamoDB** for the ledger and site profiles, **S3** for evidence, and **Amplify** to host FlyCheapo.
- **ElevenLabs:** spoken alerts and the final saving in English and Hindi, so elderly, low-vision and first-time users hear the fine print instead of missing it.

## Why a browser extension

A server-side bot would be blocked, would need the user's login, and would see a different page from the user. An extension runs as the user, in their own browser, on exactly the page they see, so sites can't block it as a bot and no passwords are shared.

## What the prototype builds

| Part | Where | Status |
|---|---|---|
| Page snapshot (never reads payment or free-text fields) | [extension/agent/snapshot.js](../extension/agent/snapshot.js), [core.js](../extension/agent/core.js) | ✅ |
| Rule engine for all 8 FlyCheapo traps | [extension/agent/rules.js](../extension/agent/rules.js) | ✅ |
| Price Ledger across steps, Fairness Score, site memory | [extension/agent/ledger.js](../extension/agent/ledger.js) | ✅ |
| AI checks with "couldn't check" when offline | [extension/agent/ai.js](../extension/agent/ai.js), [backend/app/analysis.py](../backend/app/analysis.py) | ✅ (local fallback without AWS) |
| Fix it, verify against the site's total, one-tap undo | [extension/agent/fixer.js](../extension/agent/fixer.js) | ✅ |
| Overlay, Honest Price card, highlights, voice, complaint draft | [extension/agent/overlay.js](../extension/agent/overlay.js) | ✅ |
| Background worker, read-only check from the popup | [extension/background.js](../extension/background.js), [popup.js](../extension/popup.js) | ✅ |
| Analyse, Site info, Speak, Ledger summary, Evidence | [backend/app/main.py](../backend/app/main.py) | ✅ (8 tests) |
| API Gateway, Lambda, DynamoDB, S3 with 30-day expiry | [backend/template.yaml](../backend/template.yaml) | Template ready, not yet deployed |
| Cropped-image AI checks, Chrome side panel, TypeScript + React | – | Hack day |

Next: the full [detection rulebook →](04-dark-pattern-rules.md)
