# 6. Hack-day plan: 24 hours, 4 people

[← 5. FlyCheapo demo](05-flycheapo-demo.md) · [Back to README](../README.md) · Next: [7. Business and impact →](07-business-and-impact.md)

> All building happens at the offline hackathon on 1–2 December 2026. Before that, we only plan and prepare, as the ideathon's No-Code Rule requires.

## Before hack day: planning only, no code

- Finish this blueprint, the pitch deck and the video pitch.
- Set up accounts and access: AWS (with credits), Amazon Bedrock model access (approval can take time, so we ask early), ElevenLabs (pick one English and one Hindi voice) and AWS Amplify.
- Sketch FlyCheapo's four pages and the overlay panel on paper.
- Write, in plain English, the questions the AI must answer for each pattern (see [step 4 of the page flow](03-architecture.md#what-happens-on-one-checkout-page)).
- Agree on the page-snapshot fields and the five backend operations described in the [architecture](03-architecture.md).
- Collect public screenshots of real dark patterns, to sanity-check the AI on hack day.

## Four workstreams, one owner each

| Workstream | Owns | Done when |
|---|---|---|
| **1. Extension core** | Content script, page snapshot, rule engine, fix actions, verify step | 8 of 8 traps flagged on FlyCheapo, and fixes change the site's total as expected |
| **2. Overlay and voice** | React overlay, findings list, Honest Price card, ElevenLabs voice (English and Hindi), complaint draft | The card shows ₹5,846 → ₹5,198 and the voice reads it out |
| **3. Cloud and AI** | API Gateway, Lambda (FastAPI), Bedrock checks, DynamoDB ledger and site profiles, S3 evidence | AI flags the guilt-trip text and the trick checkbox; scores and evidence are saved |
| **4. FlyCheapo and demo** | The demo site with 8 traps and honest mode on Amplify, test runs, backup video, pitch | The site is live, and the full demo runs cleanly three times in a row |

## Timeline

| Hours | Phase | What we'll have at the end |
|---|---|---|
| H0–H1 | **Kick-off** (everyone) | Accounts and keys work; snapshot format and backend operations agreed |
| H1–H6 | **Foundations** | Snapshot + first rules · overlay shell + Honest Price card · Lambda + Bedrock "Analyse" · FlyCheapo pages 1–2 with traps 1, 2, 4 |
| **H6** | ✔ **Checkpoint 1** | The extension reads FlyCheapo's seat page and flags the ₹349 seat in the overlay |
| H6–H12 | **All traps** | All rules and fix actions · findings list + Fix it flow · confirm-shaming and trick-question AI checks · pages 3–4, traps 3, 5–8, honest mode |
| **H12** | ✔ **Checkpoint 2** | All 8 traps flagged end to end, each with its CCPA name |
| H12–H17 | **Fix and verify** | Verify step + Price Ledger · voice in English and Hindi + complaint draft · DynamoDB, Fairness Score, S3 evidence · FlyCheapo deployed on Amplify |
| **H17** | ✔ **Checkpoint 3** | Full demo run: ₹5,846 → ₹5,198, confirmed by the site's own total, with voice |
| H17–H21 | **Harden** | Zero findings in honest mode · read-only check on a real site · speed fixes · backup demo video recorded |
| **H21** | ✔ **Feature freeze** | No new features after this point |
| H21–H23 | **Rehearse** | Demo and pitch rehearsed three times; bug fixes only |
| H23–H24 | **Buffer** | Final checks and the pitch |

## Demo script (about 3 minutes)

1. **Search:** open FlyCheapo and search Bengaluru → Delhi: ₹4,999. The agent flags the resetting timer and "only 2 seats left", and says so out loud.
2. **Seat:** the ₹349 seat is pre-selected. Flagged as basket sneaking.
3. **Add-ons:** the ₹299 insurance is pre-ticked, the "No" button guilt-trips, and the skip link is tiny. All three are flagged.
4. **Payment:** a ₹199 fee appears out of nowhere (drip pricing), plus a double-negative checkbox. The card reads "About to pay ₹5,846".
5. **Fix it:** one tap. The insurance is unticked, a free seat is picked and the checkbox is set to "No offers". The agent re-reads the site's total: **₹5,198, ₹648 saved**, spoken in Hindi too.
6. **Complaint:** tap "Draft complaint" to show the ready text with evidence. The agent does not pay.
7. **No false alarms:** switch FlyCheapo to honest mode and run it again. Zero findings.
8. **Real world (if time allows):** a read-only check on a real checkout page. The agent flags tricks and changes nothing.

## Risks and fallbacks

| Risk | Fallback |
|---|---|
| Bedrock access is late or slow | Rules alone still catch 6 of the 8 traps; AI-only findings show as "couldn't check"; AI verdicts are cached for repeat runs |
| Venue Wi-Fi fails | FlyCheapo also runs from a laptop; the backup demo video is ready |
| ElevenLabs quota runs out | The demo alert clips are generated in advance; the browser's built-in voice is the last resort |
| A real site changes or blocks us | The real-site check is read-only and optional; FlyCheapo is the main demo |
| False alarms | Honest-mode test; medium-confidence findings are never fixed automatically |
| Running out of time | Cut in this order: real-site check → Fairness Score → Hindi voice → complaint draft. Never cut detect, fix and verify on FlyCheapo |

## Definition of done

- [ ] All 8 FlyCheapo traps flagged, each with the right CCPA pattern name
- [ ] One tap takes the total from ₹5,846 to ₹5,198, confirmed by the site's own total
- [ ] Zero findings in honest mode
- [ ] Voice alert in English and Hindi
- [ ] Complaint draft with evidence
- [ ] The agent never touches payment

Next: [impact, feasibility and business model →](07-business-and-impact.md)
