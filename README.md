# In Search Of 🔎

> Tell us what you're hunting. We check everywhere, every day, until we find it. **Find it or it's free.**

A modern ISO / finder's-fee service. Customers submit a hunt (photo, link or description + max price + WhatsApp number + hunt length), pay once through Stripe, and a human (Fion) sweeps the marketplaces daily and WhatsApps them the moment there's a match.

## What's in the box

| Page | Who | What it does |
|---|---|---|
| `/` | Customers | Landing page: pitch, how it works, what we're good at / won't take, pricing tiers, guarantee, found wall, FAQ, and the hunt form (photo upload with client-side resize, link, description, budget, need-by date, tier, WhatsApp). Captures `?ref=` referrals and `utm_*`. |
| Stripe Payment Link | Customers | Checkout. The hunt ID is passed as `client_reference_id`, so payment is matched back to the hunt automatically. |
| `/paid` | Customers | Stripe's after-payment redirect → forwards to their hunt page. |
| `/h/<token>` | Customers | Private status page: timeline, days left, sweeps so far, approved finds, and share buttons. |
| `/admin` | Fion | **The hunt desk.** Daily queue (feasibility checks due, hunts to sweep, finds to approve, refunds due), KPIs (net revenue, find rate, acquisition sources), and per-hunt tools (below). |
| `/terms` | Everyone | Plain-English hunt terms and refund policy. |

**Per-hunt tools on the desk:**
- **24h feasibility gate:** "Findable, start the clock" or "Unfindable, decline" (the refund message is drafted automatically). Overdue checks turn red.
- **Sweep kit:** one-click searches prefilled with the query and max price on Facebook Marketplace, Craigslist, OfferUp, Poshmark, Mercari, eBay, Depop, Google Shopping, Google (past week), Reddit, and **Google Lens** for photo hunts. There's also a "Mark swept today" button.
- **Shortlist:** paste a listing. Anything over budget is **rejected by the server**, so over-budget finds can never be surfaced. "Approve & WhatsApp" publishes the find to the customer's page and opens WhatsApp with the "WE FOUND IT!" message pre-typed. Fion just hits send.
- **WhatsApp drafts** for every stage: payment nudge, welcome, hunt started, weekly check-in, found it, declined + refund, expired + refund, and a review/referral ask.
- **Guarantee engine:** hunts auto-expire when their window ends and land in "Refunds due". Refund in Stripe, then click "Mark refunded".
- **Found wall:** feature a closed hunt on the homepage (anonymous blurb, optional photo) for social proof.
- Private notes, an activity log, budget edits, +7 day extensions, and CSV export.

## Stack

Node 20+ · Express · Postgres (or a JSON file for local dev) · vanilla HTML/CSS/JS. No build step. There are only two dependencies (`express`, `pg`).

```bash
npm install
ADMIN_PASSWORD=test npm start     # http://localhost:3000, desk at /admin
npm test                          # business rules + full API flow incl. Stripe webhook signature
```

## Deploy on Replit (≈10 minutes)

1. **Import:** on replit.com, click **Create → Import from GitHub** and pick `fion-irl/in-search-of`. `.replit` is already configured.
2. **Database:** open **Tools → Database** and create a PostgreSQL database. This sets `DATABASE_URL` automatically, and the tables are created on boot. *(Skipping this means hunts are stored on disk and are **wiped on every redeploy**.)*
3. **Secrets:** under **Tools → Secrets**, add the values from `.env.example`. At minimum set `ADMIN_PASSWORD`, then the three `STRIPE_LINK_*` values once Stripe is ready. Without Stripe links the form still works: customers land on their status page with "we'll WhatsApp you a payment link".
4. **Run** to test in the preview, then **Deploy → Autoscale**.
5. **Custom domain:** go to Deployments → Settings → Link a domain → `insearchof.shop`, then add the A/TXT records Replit shows you at your registrar.
6. **Stripe:**
   - Create 3 Payment Links ($20 / $50 / $75).
   - For each one, go to *After payment* → *Don't show confirmation page* → redirect to `https://insearchof.shop/paid`.
   - Optionally add a webhook to `https://insearchof.shop/api/stripe/webhook` for `checkout.session.completed` and put its signing secret in `STRIPE_WEBHOOK_SECRET`. Hunts then flip to "Feasibility check" the moment someone pays.

See **[LAUNCH_PLAN.md](LAUNCH_PLAN.md)** for the go-live checklist and growth plan.

## Photos

Hero photos in `public/img/` are from [Unsplash](https://unsplash.com) (free to use under the Unsplash License). Swap them for photos of real finds as soon as you have some; real wins are more convincing.
