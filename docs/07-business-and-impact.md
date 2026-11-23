# 7. Impact, feasibility and business model

[← 6. Hack-day plan](06-hack-day-plan.md) · [Back to README](../README.md)

> Free for shoppers, paid for by the platforms that need to prove their checkouts are fair.

## Impact

| | |
|---|---|
| **Who benefits** | Online shoppers and flyers, especially first-time, elderly and low-vision users |
| **What we measure** | Rupees saved per booking, tricks caught per checkout, complaints drafted |
| **One booking** | ₹648 saved on a ₹4,999 fare, about 13% of the advertised price |
| **Beyond flights** | The same engine works on food delivery, e-commerce, event tickets and subscriptions |
| **For regulators** | Site Fairness Scores can show where dark patterns are most common |

## Feasibility

| | |
|---|---|
| **Technical** | Proven Chrome extension APIs; rules catch most traps, and AI only reads wording |
| **Time** | A 24-hour MVP scoped to one fictional site and 6–8 patterns, split across 4 members ([plan](06-hack-day-plan.md)) |
| **Cost** | Near zero on AWS and ElevenLabs free tiers |

## Risks and how we handle them

| Risk | How we handle it |
|---|---|
| Sites change their layout | AI reads meaning, not fixed positions |
| Bot blocking | It runs in the user's own browser, so there's no scraping |
| False alarms | The user confirms every fix, and the agent never pays |
| Privacy | Checks run locally first; payment details never leave the browser |
| Legal | The extension only changes the page in the user's own browser, at the user's request, like an ad blocker. CCPA tags explain each finding and are not legal advice. |

## Business model

**Target customers**

- India's online shoppers and flyers
- E-commerce and travel platforms that must comply with the CCPA's dark-pattern guidelines

**Revenue**

| Stream | What it is |
|---|---|
| **Freemium** | The extension is free. Pro costs ₹49/month: more sites, more voice languages and complaint tracking. |
| **B2B: Fair Checkout Audit** | Compliance reports for platforms. The CCPA's June 2025 advisory asked platforms to self-audit for dark patterns, and an outside audit backs up that self-declaration. |
| **Data: Fairness Score API** | Anonymised site scores for comparison sites, consumer groups and researchers |

**Go-to-market**

1. First users: college campuses and student travel groups, starting with RVCE
2. A Chrome Web Store listing and posts in consumer forums
3. Shareable "I saved ₹X" cards that spread the word

**Key costs and partners**

- **Costs:** AI calls, cloud hosting, the voice API
- **Partners:** consumer groups, AWS credit programmes, ElevenLabs

**Sustainability**

- B2B audits pay for the free consumer tool.
- Grow into food delivery, e-commerce and subscriptions.
- Add more Indian languages for text and voice.

## Roadmap after the hackathon

| Phase | Goal |
|---|---|
| **1. Beta** | Chrome Web Store beta for a few airline and travel sites, tested with student users |
| **2. More sectors** | Food delivery and e-commerce checkouts; more Indian languages |
| **3. Platforms** | Fair Checkout Audit pilots with a few platforms; Fairness Score API beta |

[Back to README](../README.md)
