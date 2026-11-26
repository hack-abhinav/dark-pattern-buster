# 2. Proposed solution

[← 1. Problem](01-problem.md) · [Back to README](../README.md) · Next: [3. Architecture →](03-architecture.md)

> **Dark Pattern Buster** is an AI browser agent, built as a Chrome extension, that rides along at checkout, catches every trick, undoes it with your OK, and shows the honest price before you pay.

## The agent loop

The agent runs the same five steps on every checkout page.

| Step | What the agent does | Example on FlyCheapo |
|---|---|---|
| **Watch** | Reads each checkout step when it loads and whenever it changes | The seat page loads |
| **Detect** | Rules flag obvious traps instantly; AI checks wording and visuals for subtle ones | A ₹349 seat is selected, but free seats exist |
| **Explain** | Says in plain words what the trick is, what it costs and which CCPA pattern it matches | "A paid seat was picked for you. +₹349. Basket sneaking." |
| **Fix** | Undoes the trick on the page, but only after you tap "Fix it" | Picks a free seat |
| **Verify** | Re-reads the site's own total and confirms the saving | The total drops by ₹349 |

## User flow

1. **Shop normally.** Search, pick a flight and go to checkout as usual.
2. **The agent scans each step.** A small badge shows it is watching.
3. **It flags and explains tricks.** The overlay lists each trick with its cost and its CCPA name. A short voice alert can read it out.
4. **You tap "Fix it".** The agent undoes only the fixes you approved, using the page's own buttons and boxes.
5. **The honest price is shown.** The Honest Price card shows advertised vs about-to-pay vs fixed, checked against the site's total.
6. **You pay.** The agent never pays for you.

## Features

| Feature | What it does | Why it matters |
|---|---|---|
| **Live detection** | Spots dark patterns on each checkout step and tags each one with one of the CCPA's 13 patterns | Shoppers learn their rights; complaints become specific |
| **Price Ledger** | Records every price line at every step: what was added, when, and whether you chose it | Drip pricing and basket sneaking can't hide between steps |
| **One-tap "Fix it"** | Unticks add-ons, picks the free seat, declines extras, sets confusing checkboxes to what you meant | Turns a warning into rupees saved |
| **Honest Price card** | Shows advertised price, about-to-pay price and fixed price, plus the saving | One honest number before you pay |
| **Voice alerts** | ElevenLabs reads alerts and the final saving aloud, in English and Hindi | Helps elderly, low-vision and first-time users |
| **Complaint draft** | Prepares a complaint for the National Consumer Helpline (1915), with the ledger and screenshots attached | Makes it easy to report a site |
| **Real price before you pick** | On a listing page, shows each result's price at checkout and honest price, using fees and pre-selected extras learned from earlier checkouts on that site | The surprise is gone before you even choose |
| **Fairness Score** | A simple score per site, built from the tricks found across checkouts | Shoppers can compare sites; platforms see where they stand |

## What the user sees

The overlay is a narrow panel on the right of the checkout page. The prototype builds it in [extension/agent/overlay.js](../extension/agent/overlay.js):

- **Header:** the site name and its Fairness Score
- **Findings list:** one row per trick, with what it costs, a plain-English explanation and its CCPA tag. Each row has its own on/off switch, so you choose what gets fixed.
- **"Fix it" button:** applies the fixes you left switched on
- **Honest Price card:** advertised · about to pay · after fix · you save
- **Read aloud:** plays the alert in English or Hindi
- **Draft complaint:** prepares the complaint text and evidence
- **A note that never goes away:** "Dark Pattern Buster never pays for you."

## Design principles

1. **You decide.** Every fix needs a tap. Nothing on the page changes silently, and every fix can be undone.
2. **Hands off payment.** The agent never reads or types card, UPI or OTP details and never presses Pay.
3. **Rupees, not jargon.** Every finding says what it costs you in plain words.
4. **Safe when unsure.** If the agent isn't sure, it shows "possible trick" and does not fix it automatically.
5. **Private by default.** Checks run in the browser first. Only short text snippets of suspicious elements are sent for AI checks, never payment or personal details.
6. **Prove it.** The saving is shown only when the site's own total confirms it.

## Scope: hack-day MVP vs later

| Feature | Hack-day MVP (1–2 Dec) | Later |
|---|---|---|
| Detection | 6 CCPA patterns through 8 traps on FlyCheapo | All 13 patterns, on real travel and shopping sites |
| Fix it | Untick add-ons, pick the free seat, reword decline text, make skip links clear, set trick checkboxes | Sector-specific fixes for food delivery, e-commerce and subscriptions |
| Price Ledger + Honest Price | ✅ | Fees learned from many users' checkouts on the same site |
| Voice alerts | English and Hindi | More Indian languages |
| Complaint draft | Text plus evidence, ready to submit | Complaint tracking (Pro) |
| Fairness Score | Basic score per site | Public scores and a Fairness Score API |
| Real airline sites | Read-only check if time allows (no fixes, no payment) | Full support |
| Browsers | Chrome | Edge (same extension format), then Firefox |

Next: how it's built in the [architecture blueprint →](03-architecture.md)
