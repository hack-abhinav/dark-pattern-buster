# 4. Detection rulebook: the 13 CCPA dark patterns

[← 3. Architecture](03-architecture.md) · [Back to README](../README.md) · Next: [5. FlyCheapo demo →](05-flycheapo-demo.md)

> For each of the 13 dark patterns in the CCPA's *Guidelines for Prevention and Regulation of Dark Patterns, 2023*: what it looks like at a checkout, how we'll detect it, and what "Fix it" does. The descriptions are in our own words. They help explain each finding and are not legal advice.

## Summary

| # | CCPA pattern | In plain words | Detected by | What "Fix it" does | Hack day |
|---|---|---|---|---|---|
| 1 | **False urgency** | Fake timers or fake "only 2 left" pressure | Rule (timer) + AI (wording) | Labels it: "This timer resets. There's no real deadline." | ✅ MVP |
| 2 | **Basket sneaking** | Extras added to your order without asking | Rule (ledger) | Unticks the add-on or picks the free option | ✅ MVP |
| 3 | **Confirm shaming** | Guilt or fear wording on the "No" option | AI | Shows a neutral "No thanks" in its place | ✅ MVP |
| 4 | **Forced action** | You must buy, sign up or share data to continue | Rule + AI | Shows the way around if there is one; otherwise warns | Later |
| 5 | **Subscription trap** | Easy to start, hard to cancel; free trial that renews | AI | Warns and shows the renewal date and price | Later |
| 6 | **Interface interference** | The option you want is hidden, tiny or greyed out | Rule (size and contrast) | Makes the hidden option a clear button | ✅ MVP |
| 7 | **Bait and switch** | You're shown one thing and served another | Rule (ledger) + AI | Shows the difference between the shown and charged price | Stretch |
| 8 | **Drip pricing** | Parts of the price appear only at later steps | Rule (ledger) | Puts the fee in the honest total from the start and flags it | ✅ MVP |
| 9 | **Disguised advertisement** | Ads dressed up as results or advice | AI | Labels it as an ad | Later |
| 10 | **Nagging** | The same request again and again after you said no | Rule (repeat count) | Hides repeats after your first "No" | Stretch |
| 11 | **Trick question** | Confusing wording or double negatives | AI + rule (negation count) | Rewrites it in plain words and sets it to what you meant | ✅ MVP |
| 12 | **SaaS billing** | Quiet recurring charges for software or subscriptions | AI | Warns and shows the recurring amount | Later |
| 13 | **Rogue malware** | Fake virus alerts or malicious downloads | Out of scope | Left to the browser's own safe-browsing and antivirus | – |

**Hack-day MVP:** 6 patterns (1, 2, 3, 6, 8, 11) through FlyCheapo's 8 traps. **Stretch:** bait and switch and nagging, for 8 patterns.

## The six MVP patterns in detail

### 1. False urgency

- **Signals:** a countdown whose value goes back up after a reload or a new visit; a scarcity claim ("only 2 seats left") that never changes across visits; urgent wording near the price.
- **Check:** rule for the timer (the agent remembers the timer's value across reloads); AI for urgency wording.
- **Fix:** no money changes. The overlay labels the timer as fake and the claim as unverified, so the pressure is gone.

### 2. Basket sneaking

- **Signals:** a checkbox, toggle or option that costs money is already on when the page loads, and the user never clicked it; the total goes up between steps with no click from the user; a paid seat is selected while ₹0 seats exist.
- **Check:** rule, using the Price Ledger.
- **Fix:** untick the box, or pick the free option, using the page's own controls. Then re-read the total.

### 3. Confirm shaming

- **Signals:** the "No" option uses guilt, fear or ridicule ("No, I don't care about my family's safety").
- **Check:** AI reads the decline text and the buttons around it.
- **Fix:** shows a neutral label ("No thanks") next to the original and makes declining one clear click.

### 6. Interface interference

- **Signals:** the decline or skip option is much smaller than the main button, has low contrast (grey on white), is a plain link instead of a button, or sits below the fold.
- **Check:** rule that compares size, colour contrast and position with the main call-to-action.
- **Fix:** shows the hidden option as a clear button the same size as the main one.

### 8. Drip pricing

- **Signals:** a compulsory fee (convenience fee, platform fee, "processing" charge) appears for the first time on a later step; or the backend already knows this site adds such a fee at payment.
- **Check:** rule, using the Price Ledger and the site profile.
- **Fix:** the fee can't be removed, so the Honest Price card includes it from the first step and flags it. The user sees the real price before they commit.

### 11. Trick question

- **Signals:** checkbox or option text with two or more negatives ("Uncheck this box if you do not want to not receive offers"), or wording where ticking and unticking mean the opposite of what they seem.
- **Check:** a rule counts negatives to flag candidates; AI works out what each choice really means.
- **Fix:** rewrites the line in plain words ("Send me offers: Yes / No") and sets the box to "No offers", the choice that costs nothing and shares nothing.

## Testing the rules

| Test | How | Target |
|---|---|---|
| **Catch rate** | Run the full FlyCheapo journey with all 8 traps on | 8 of 8 traps flagged, each with the right CCPA name |
| **False alarms** | Run the same journey in FlyCheapo's honest mode (no traps) | Zero findings |
| **One trap at a time** | Switch on each trap alone | Only that trap is flagged |
| **Fix check** | Tap "Fix it" on the full journey | The site's total goes from ₹5,846 to ₹5,198 |
| **Real sites** | Read-only checks on public checkout pages (no fixes, no payment) | Findings make sense to a human reviewer |

Next: the [FlyCheapo demo plan →](05-flycheapo-demo.md)
