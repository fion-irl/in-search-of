# In Search Of: Go-Live & Growth Plan

**Goal for the first 30 days:** 25 paid hunts, a find rate of 60% or better, and 10 posts on the found wall. That's enough to prove people will pay, not just that we can find things.

---

## Phase 0: Go live (Day 0–2). Mostly Fion's taps

| # | Task | Who | Time |
|---|---|---|---|
| 1 | Check `insearchof.shop` on Porkbun/Cloudflare and buy it. Backups: `isohunt.co`, `insearchof.co`, `getiso.com` | Fion | 5 min |
| 2 | Stripe account (SSN/EIN + bank). Create 3 Payment Links: $20 / $50 / $75. Set each redirect to `/paid` | Fion | 20 min |
| 3 | Replit: import the repo, add Postgres, add Secrets, Deploy, link the domain (see README) | Fion + Claude | 15 min |
| 4 | WhatsApp Business: profile photo = the logo mark, description = the tagline, greeting message on, **Quick Replies** for `/found`, `/checkin`, `/refund` | Fion | 15 min |
| 5 | Stripe webhook → `/api/stripe/webhook` (auto-marks hunts paid) | Fion | 5 min |
| 6 | Grab `@insearchof` (or `@insearchof.shop`) on Instagram and TikTok. Put the handles in Secrets | Fion | 10 min |
| 7 | Smoke test: submit a hunt, pay $20 with a real card, approve it, add a find, WhatsApp yourself, then refund yourself in Stripe | Fion | 10 min |

## Phase 1: Prove willingness to pay (Day 2–7)

The validation showed matchability (64% same-day match, 91% partial). **Payment is still untested.** Do this before anything else.

**The "give first" DM.** Find fresh ISO posts in Bay Area Buy Nothing groups, r/BayAreaMarketplace, and Nextdoor. Run the sweep kit yourself, and if you find a real match, DM the poster:

> Hi [name]! Saw your ISO for [item]. I run a little hunting service and couldn't resist. Here's one I found this morning: [link] ($[price], [distance] away). No charge for this one! If it doesn't work out, I can keep checking every day for you: insearchof.shop. Find it or it's free. 🔎

Why this works: the free find *is* the ad. It proves the service in the first message. Posters who got a free find but whose listing sold are your warmest possible buyers.

- **Target:** 30 DMs → 5 paid hunts. If under 2 convert, test a $10 / 7-day tier before scaling.
- **Log every DM** in the desk notes or a sheet: sent → replied → paid.
- ⚠️ Don't post ads *in* Buy Nothing groups. It's against their rules and you'll get banned. DM only, one-to-one, and only when you have a genuine find.

## Phase 2: The viral loops (Week 2 onward)

### 1. "Hunting for strangers": the content engine (TikTok / Reels / Shorts)
Every hunt is a mini-story with stakes, a deadline, and a reveal. Film it (with the customer's OK, faces optional):

- **Hook (0–2s):** *"Someone paid me $20 to find a Vitamix under $150 before her sister's wedding shower. I have 7 days."*
- **Middle:** screen-record the sweep. Scroll the dead ends and the over-budget listings ("$180, nope, she said $150"), then the near-miss.
- **Reveal:** the WhatsApp "WE FOUND IT! 🎯" screenshot and the customer's reply. That reply is the shareable moment.
- **CTA:** *"What should I hunt next? Comment it."*

Post daily. Series names: **"ISO of the day"**, **"Can I find it for under $X?"**, **"Budget vs. retail"** (show the retail price next to the find).

### 2. "Hunt Drop Friday": free public hunts
Every Friday, pick one comment and hunt it free, on camera. This turns comments into content and content into followers. Winners get tagged, and they share it.

### 3. The found wall (built in)
On closed hunts, write a one-line blurb and tick "Show on the public found wall". Include the photo *only* with permission. Social proof compounds: "Found in 2 days, $40 under budget" is the whole pitch.

### 4. The "WE FOUND IT!" screenshot
The WhatsApp message is designed to be screenshotted, and people send it to their group chats. The "Ask for a review" draft (on closed hunts) includes their personal share link. **Referral offer:** when a referred friend pays, refund the referrer $10 in Stripe. Track it via the `Referred by ISO-XXXXX` field on the desk.

### 5. Urgency partners (the people who *see* urgent ISOs)
Urgency is the sales driver: weddings, injuries, courses starting. Go where urgent needs come up:

- **Physical therapists / sports clinics:** crutches, knee scooters, braces, recumbent bikes. Leave cards and offer a partner code.
- **Wedding planners and bridal shops:** decor, vintage pieces, specific dresses, "something old".
- **Parent groups / school PTAs:** gear for new sports seasons, costumes, instruments. Back-to-school timing.
- **Movers / realtors:** people furnishing new places fast. A "Welcome home: we'll find your couch" card in closing gifts.
- **Cycling, climbing, and ski clubs:** specific sizes, before the season starts.

### 6. Local press and newsletters
The angle: *"Bay Area founder will hunt down anything secondhand. Money back if she can't."* Pitch The Oaklandside, Berkeleyside, SFGate, SF Standard, and local Substack and Beehiiv newsletters. Lead with a great story from the found wall.

### 7. Reddit, done right
Be genuinely helpful in r/BuyItForLife, r/Frugal, r/BayArea, and r/Thrifting by answering "where do I find X" questions with real finds. Link to the site only in your profile. After ~20 good wins, do a transparent "I built a service that hunts secondhand stuff for people; here's what 30 hunts taught me" post (it works well in r/Entrepreneur and r/SideProject).

## Phase 3: Scale what works (Month 2+)

**The constraint is sweep time, not demand.** At roughly 5 min/day, a 30-day hunt is about 2.5 hours for $50 (about $20/hour). To protect margin:

1. **Saved-search alerts:** for each hunt, save the Facebook Marketplace and eBay search with notifications on, and set a Craigslist alert. Let the platforms do most of the watching, and have the daily sweep catch the rest.
2. **Batch by category:** do all electronics hunts, then all furniture hunts, with the same tabs open.
3. **Decline fast.** The feasibility gate is your best margin tool.
4. **Automate sweeps next.** The biggest leverage is a scheduled job that runs each hunt's searches, filters by max price, and pre-fills the shortlist for Fion to approve. The human stays in the loop, and her time drops to about 1 min per hunt per day.
5. **Pricing test:** once the find rate is above 70%, test $25 / $60 / $90. Also add a **Rush add-on** (+$15: we check 3× a day), since urgency is what people pay for.

## Metrics to watch (all on the desk)

| Metric | Where | Healthy |
|---|---|---|
| Submitted → paid | Unpaid tab vs. total | > 40% |
| Find rate | KPI tile | > 60% (the tiers are priced for this) |
| Time to first find | Log timestamps | < 7 days median |
| Refunds as % of revenue | Net revenue tile | < 30% |
| Acquisition source | Footer of the queue | Double down on the top 2 |
| Referrals | "referral" in sources | ≥ 1 in 5 hunts by Month 2 |

## Week-one content calendar (copy/paste)

| Day | Post |
|---|---|
| Mon | "I tested this: I took 11 real ISO posts and searched for them. 7 were findable the same day." (validation story + the 64% stat) |
| Tue | Live hunt #1: the hook, the sweep, the cliffhanger |
| Wed | Live hunt #1: the reveal + customer reaction |
| Thu | "Things I *won't* hunt (and why)": the honesty builds trust (consumables, one-of-a-kinds) |
| Fri | Hunt Drop Friday: "Comment what you're hunting. I'll pick one and find it free." |
| Sat | The found-wall roundup: "This week we found…" |
| Sun | Behind the scenes: Fion's sweep kit and hunt desk (founder content performs well) |
