# Good Rally

> Get better at your health, with AI. One short message a day for 30 days.

A waitlist and founding-cohort sign-up site for **goodrally.club**, plus the full 30-day challenge content.

| File | What it is |
|---|---|
| `public/index.html` | The landing page and sign-up form. It's designed for an older audience: Atkinson Hyperlegible body text at 20px, high contrast (every text colour is at least 6:1), large tap targets, and gentle motion that switches off when a device asks for reduced motion. |
| `server.js` | Sign-up API (`POST /api/signup`), a CSV export for the organiser at `/admin/signups.csv` (password protected), and `/healthz`. |
| `CHALLENGE.md` | All 30 daily messages, ready to schedule. |
| `LAUNCH.md` | The founding-cohort test plan, success criteria, guardrails, and ready-to-post launch copy. |

## Run locally

```bash
npm install
ADMIN_PASSWORD=pick-one npm start   # http://localhost:3000
npm test
```

## Deploy on Replit

`.replit` is included. Import this folder as its own Replit App. Ideally move it to its own GitHub repo first (e.g. `goodrally`), so it deploys separately from In Search Of.

1. Add a PostgreSQL database (sets `DATABASE_URL`). Without it, sign-ups are lost on redeploy.
2. Secrets:
   - `ADMIN_PASSWORD` (required): you make it up. It unlocks the CSV export.
   - Optional: `STRIPE_LINK` (founding payment link), `FOUNDING_PRICE` (default 29), `COHORT_START` (e.g. "Monday, November 2").
3. Deploy, then link `goodrally.club` in the deployment settings.

To download sign-ups, visit `/admin/signups.csv`. The browser asks for a password: type anything as the username and your `ADMIN_PASSWORD` as the password.
