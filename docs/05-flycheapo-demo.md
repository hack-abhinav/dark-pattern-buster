# 5. FlyCheapo: the demo site plan

[← 4. Detection rulebook](04-dark-pattern-rules.md) · [Back to README](../README.md) · Next: [6. Hack-day plan →](06-hack-day-plan.md)

> **FlyCheapo is a clearly fictional airline.** It's in [demo-site/](../demo-site/), built only to show the agent working end to end. It is not a real company, every fare is made up, and no real booking or payment ever happens. Every page will say so in its footer.

## Why we need a demo site

- Real sites change every day, so a live demo on them could break at the worst moment.
- We must never make real bookings or real payments during a demo.
- A site we control shows all 8 traps reliably, one at a time or all together, and has an honest mode to prove we don't raise false alarms.

On real airline sites we'll only run **read-only checks**: the agent flags tricks, but changes nothing and never reaches payment.

## The journey: four pages

| Page | What's on it | Traps |
|---|---|---|
| **1. Search results** | Bengaluru → Delhi, advertised at ₹4,999 | 1 (resetting timer), 2 (fake scarcity) |
| **2. Seat selection** | Seat map, with a ₹349 window seat already selected; free seats further down | 4 (pre-selected paid seat) |
| **3. Add-ons** | Travel insurance (₹299, pre-ticked), meals, bags; a big orange "Add & continue" button | 3 (pre-ticked insurance), 6 (guilt-trip decline), 7 (hidden skip link) |
| **4. Review and payment** | Price summary with "Remove" and "Change seat" links, a confusing offers checkbox and a fake payment form | 5 (late convenience fee), 8 (double-negative checkbox) |

The payment form is fake: pressing Pay only shows a "Demo only, no payment taken" screen.

## The 8 traps

| # | Trap | Page | What the user sees | CCPA pattern | How the agent catches it | What "Fix it" does | Effect on price |
|---|---|---|---|---|---|---|---|
| 1 | Resetting countdown | Search | "Fare held for 09:59" restarts on every reload | False urgency | The timer value goes back up after a reload | Labels it "Fake timer: resets on reload" | ₹0 (pressure removed) |
| 2 | Fake scarcity | Search | "Only 2 seats left at this price!" never changes | False urgency | Same claim on every visit; AI reads the urgency wording | Labels it "Unverified claim" | ₹0 |
| 3 | Pre-ticked insurance | Add-ons | The ₹299 insurance box is already ticked | Basket sneaking | A paid box is on although the user never clicked it | Unticks it | −₹299 |
| 4 | Pre-selected paid seat | Seat | A ₹349 seat is picked for you | Basket sneaking | A paid seat is selected without a click, while ₹0 seats exist | Picks a free seat | −₹349 |
| 5 | Late convenience fee | Payment | A ₹199 fee appears for the first time | Drip pricing | The ledger sees a new compulsory charge on the last step | Shows it in the honest total and flags it | ₹0 (but now visible) |
| 6 | Guilt-trip decline | Add-ons | "No, I don't care if my trip goes wrong" | Confirm shaming | AI reads guilt and fear in the decline text | Shows a neutral "No thanks" | ₹0 |
| 7 | Hidden skip link | Add-ons | A tiny grey "skip" next to a big orange "Add & continue" | Interface interference | Size and contrast check against the main button | Shows skip as a clear button | ₹0 |
| 8 | Double-negative checkbox | Payment | "Uncheck this box if you do not want to not receive offers" | Trick question | Negation count, then AI works out the meaning | Rewrites it plainly and sets it to "No offers" | ₹0 |

## Expected totals (our acceptance check)

| Moment | FlyCheapo's total | What the agent shows |
|---|---|---|
| Search results | ₹4,999 | Advertised ₹4,999; timer and scarcity flagged |
| After the seat page | ₹5,348 | Seat flagged: +₹349, basket sneaking |
| After the add-ons page | ₹5,647 | Insurance flagged: +₹299; guilt-trip text and hidden skip link flagged |
| Payment page | ₹5,846 | Fee flagged: +₹199, drip pricing; trick checkbox flagged; card shows "About to pay ₹5,846" |
| After "Fix it" | **₹5,198** | "Saved ₹648", confirmed against FlyCheapo's own total |

The arithmetic: ₹4,999 + ₹349 + ₹299 + ₹199 = ₹5,846. Fix it removes ₹349 + ₹299 = ₹648, which leaves ₹4,999 + ₹199 = ₹5,198.

On a second visit, the backend already knows FlyCheapo adds a ₹199 fee at payment, so the Honest Price card shows ₹5,198 from the search page onward.

## Honest mode and trap switches

- **Honest mode:** the same four pages with no traps. Add-ons start unticked, the fee is shown on the search page, and there's no timer. The agent should find nothing.
- **Trap switches:** each of the 8 traps can be turned on or off, so we can test them one at a time and show judges any single trap on request.

## Build notes

- The prototype is static HTML and plain JavaScript (no build step): serve the repo folder with `python3 -m http.server 8080` and open `/demo-site/`. On hack day we host it on AWS Amplify at a public link so judges can try it themselves.
- Demo controls (bottom left) switch honest mode and each trap on or off. `?agent=preview` runs the agent inside the page for anyone without the extension.
- Fake data only: no accounts, no real payments, no personal data collected.
- A "fictional demo" notice on every page.
- Owned by workstream 4 in the [hack-day plan](06-hack-day-plan.md).

Next: the [24-hour hack-day plan →](06-hack-day-plan.md)
