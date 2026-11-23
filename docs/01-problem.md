# 1. The problem

[← Back to README](../README.md) · Next: [2. Solution →](02-solution.md)

> **Problem statement.** Online checkouts are designed to make people pay more than the price they were shown. They hide fees until the last step, slip in add-ons and rush people with fake timers. Today's tools only warn, or take complaints after the money is gone. At the moment of payment, nobody is on the shopper's side.

## What a typical flight checkout looks like

A student books a Bengaluru–Delhi flight advertised at **₹4,999**:

1. **Search results:** a timer says "Fare held for 09:59" and a badge says "Only 2 seats left at this price". Reload the page and the timer starts again.
2. **Seat page:** a **₹349** window seat is already selected. Free seats exist, but they sit further down the page.
3. **Add-ons page:** **₹299** travel insurance is already ticked. The way out is a tiny grey "skip" link, and the decline text reads like "No, I don't care if my trip goes wrong".
4. **Payment page:** a **₹199** convenience fee appears for the first time. A checkbox says something like "Uncheck this box if you do not want to not receive offers".

The total is now **₹5,846**: ₹847 (about 17%) more than the advertised fare, for extras the student never chose and a fee they were never shown.

## How common this is

LocalCircles surveyed airline passengers across India in December 2025: **124,000+ responses from 302 districts**. **8 in 10** said they had faced dark patterns while booking or managing flights. Each question below had about 17,000–17,900 responses.

| Dark pattern | Said "very frequently" | Responses |
|---|---|---|
| Drip pricing (charges not shown upfront appear at final payment) | **80%** | 17,607 |
| Bait and switch | **70%** | 17,883 |
| Forced action | **64%** | 17,253 |
| False urgency | **56%** | 17,880 |
| Nagging | **40%** | 17,403 |
| Confirm shaming | **35%** | 17,256 |
| Basket sneaking (add-ons added without consent) | **30%** | 17,732 |

Source: [LocalCircles airline dark patterns survey](https://m-www.localcircles.com/a/press/page/airline-dark-patterns-survey), also reported by [Business Today](https://www.businesstoday.in/latest/corporate/story/indigo-flight-disruptions-80-flyers-hit-by-airlines-dark-patterns-nationwide-survey-finds-506325-2025-12-11).

## It's already against the rules in India

- **30 November 2023:** the Central Consumer Protection Authority (CCPA) notified the *Guidelines for Prevention and Regulation of Dark Patterns, 2023*, which name 13 dark patterns: false urgency, basket sneaking, confirm shaming, forced action, subscription trap, interface interference, bait and switch, drip pricing, disguised advertisement, nagging, trick question, SaaS billing and rogue malware ([Lok Sabha answer, July 2025](https://eparlib.sansad.in/bitstream/123456789/2997047/1/AU472_qZUfeo.pdf)).
- **24 December 2024:** the Department of Consumer Affairs launched the **Jagriti app**, where people report URLs they suspect of dark patterns; reports become complaints to the CCPA ([PIB](https://pib.gov.in/PressReleasePage.aspx?PRID=2086980)).
- **5 June 2025:** the CCPA advised all e-commerce platforms to **self-audit for dark patterns within three months** ([News On AIR](https://www.newsonair.gov.in/central-consumer-protection-authority-advises-all-e-commerce-platforms-to-not-engage-in-deceptive-unfair-trade-practice)).

The rules exist, but they act after the fact. A complaint takes effort and comes after the money is gone. During the checkout itself, the shopper is on their own.

## Who gets hurt the most

- **First-time and occasional online buyers**, who don't know where the tricks hide
- **Elderly and low-vision users**, for whom tiny grey links and fine print are hard to see
- **Students and budget travellers**, for whom an extra ₹500–₹900 matters
- **Anyone booking in a hurry on a phone**, which is exactly what a fake timer is built for

## Gaps in today's options

| Option | What it does | The gap |
|---|---|---|
| Ad blockers | Hide ads and trackers | Don't understand a checkout flow |
| Price-comparison sites | Compare base fares | Don't show the final price you'll pay |
| Research scanners and detector extensions | Flag dark patterns on a page | Never act for the user, and rarely track money across steps |
| Jagriti app / National Consumer Helpline (1915) | Take reports and complaints | Only after the money is gone, and fully manual |

**What's missing** is something that sits with the shopper *during* the checkout, undoes the trick with their OK, and shows the honest price before they pay. That's [our solution →](02-solution.md)
