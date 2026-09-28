// Good Rally — waitlist + founding-cohort signups for the 30-day AI health habit challenge.
// Storage: Postgres when DATABASE_URL is set (Replit database), else ./data/signups.json for local dev.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const STRIPE_LINK = process.env.STRIPE_LINK || ''; // founding cohort payment link (optional)
const PRICE = process.env.FOUNDING_PRICE || '29';
const COHORT_START = process.env.COHORT_START || ''; // e.g. "Monday, November 2"

const CHANNELS = ['text', 'email', 'whatsapp'];
const AGES = ['under-45', '45-54', '55-64', '65-74', '75+'];
const COMFORT = ['never', 'tried', 'sometimes', 'often'];
const INTERESTS = ['appointments', 'medications', 'food', 'movement', 'sleep', 'caregiving', 'understanding', 'scams'];

// A repeat signup (same email) only fills in details; it never blanks out earlier answers.
function patchOf(s) {
  const { id, createdAt, ...rest } = s;
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== '' && v !== false && !(Array.isArray(v) && !v.length)));
}

function createStore() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    const url = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1|sslmode=disable/.test(url) ? false : { rejectUnauthorized: false }, max: 3 });
    return {
      async init() {
        await pool.query(`CREATE TABLE IF NOT EXISTS signups (
          id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      },
      async add(s) {
        const r = await pool.query(
          `INSERT INTO signups (id, email, data) VALUES ($1, $2, $3)
           ON CONFLICT (email) DO UPDATE SET data = signups.data || $4::jsonb RETURNING id`,
          [s.id, s.email, s, JSON.stringify(patchOf(s))]
        );
        return r.rows[0].id;
      },
      async all() {
        return (await pool.query('SELECT data FROM signups ORDER BY created_at')).rows.map((r) => r.data);
      },
      async count() {
        return Number((await pool.query('SELECT count(*) FROM signups')).rows[0].count);
      },
    };
  }
  const dir = process.env.DATA_DIR || path.join(__dirname, 'data');
  const file = path.join(dir, 'signups.json');
  fs.mkdirSync(dir, { recursive: true });
  let rows = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const save = () => fs.writeFileSync(file, JSON.stringify(rows, null, 2));
  return {
    async init() {},
    async add(s) {
      const existing = rows.find((r) => r.email === s.email);
      if (existing) {
        Object.assign(existing, patchOf(s));
        save();
        return existing.id;
      }
      rows.push(s);
      save();
      return s.id;
    },
    async all() { return rows; },
    async count() { return rows.length; },
  };
}

function clean(v, max = 200) {
  return String(v ?? '').trim().slice(0, max);
}

function validate(body) {
  const errors = {};
  const name = clean(body.name, 80);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 30).replace(/[^\d+]/g, '');
  const channel = CHANNELS.includes(body.channel) ? body.channel : 'email';
  if (!name) errors.name = 'What should we call you?';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Please check your email address.';
  if ((channel === 'text' || channel === 'whatsapp') && phone.replace(/\D/g, '').length < 10) {
    errors.phone = 'Add a mobile number so we can text you each day.';
  }
  const interests = (Array.isArray(body.interests) ? body.interests : []).filter((i) => INTERESTS.includes(i));
  return {
    errors,
    value: {
      name,
      email,
      phone,
      channel,
      age: AGES.includes(body.age) ? body.age : '',
      comfort: COMFORT.includes(body.comfort) ? body.comfort : '',
      interests,
      note: clean(body.note, 500),
      forSomeoneElse: Boolean(body.forSomeoneElse),
      newsletter: Boolean(body.newsletter), // opted in to the perennial report (import into Substack)
      source: clean(body.source, 80),
    },
  };
}

const store = createStore();
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));

const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const h = hits.get(ip) || { n: 0, reset: now + 3600e3 };
  if (now > h.reset) Object.assign(h, { n: 0, reset: now + 3600e3 });
  h.n++;
  hits.set(ip, h);
  return h.n > 10;
}

app.get('/api/config', async (req, res) => {
  res.json({ price: PRICE, payEnabled: Boolean(STRIPE_LINK), cohortStart: COHORT_START });
});

app.post('/api/signup', async (req, res, next) => {
  try {
    if (limited(req.ip)) return res.status(429).json({ error: 'Too many tries — please wait a little and try again.' });
    if (req.body.website) return res.json({ ok: true }); // honeypot
    const { errors, value } = validate(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    const id = 'GR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const saved = await store.add({ ...value, id, createdAt: new Date().toISOString() });
    let payUrl = null;
    if (STRIPE_LINK) {
      const u = new URL(STRIPE_LINK);
      u.searchParams.set('client_reference_id', saved);
      u.searchParams.set('prefilled_email', value.email);
      payUrl = u.toString();
    }
    console.log(`[signup] ${saved} ${value.channel} ${value.age || '?'}`);
    res.json({ ok: true, id: saved, payUrl });
  } catch (e) {
    next(e);
  }
});

// Signups export for the organiser: /admin/signups.csv (browser asks for the password; any username).
app.get('/admin/signups.csv', async (req, res) => {
  const auth = Buffer.from((req.get('authorization') || '').replace(/^Basic /, ''), 'base64').toString();
  const pass = auth.slice(auth.indexOf(':') + 1);
  const ok = ADMIN_PASSWORD && pass.length === ADMIN_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(ADMIN_PASSWORD));
  if (!ok) return res.set('WWW-Authenticate', 'Basic realm="Good Rally"').status(401).send('Password required');
  const cols = ['id', 'createdAt', 'name', 'email', 'phone', 'channel', 'age', 'comfort', 'interests', 'forSomeoneElse', 'newsletter', 'note', 'source'];
  const esc = (v) => `"${String(Array.isArray(v) ? v.join('; ') : v ?? '').replace(/"/g, '""')}"`;
  const rows = await store.all();
  res.set('Content-Type', 'text/csv').set('Content-Disposition', 'attachment; filename="goodrally-signups.csv"');
  res.send([cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));
app.get('/healthz', (req, res) => res.send('ok'));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

if (require.main === module) {
  store.init().then(() => app.listen(PORT, '0.0.0.0', () => {
    console.log(`Good Rally on :${PORT}`);
    if (!process.env.DATABASE_URL) console.warn('⚠  No DATABASE_URL — signups saved to ./data (not durable on Replit deployments).');
  }));
}

module.exports = { app, store, validate };
