// In Search Of — server.
// Public: landing page + hunt intake + customer status page + Stripe webhook.
// Admin (/admin): Fion's daily loop — feasibility gate, sweep kit, match review, WhatsApp drafts, refunds.

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const { createStore } = require('./store');
const L = require('./lib');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('iso:' + ADMIN_PASSWORD).digest('hex');
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_LINKS = { 7: process.env.STRIPE_LINK_7 || '', 30: process.env.STRIPE_LINK_30 || '', 60: process.env.STRIPE_LINK_60 || '' };
const CRAIGSLIST_REGION = process.env.CRAIGSLIST_REGION || 'sfbay';
const CONTACT_WHATSAPP = L.normalizePhone(process.env.CONTACT_WHATSAPP || '') || '';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';
const INSTAGRAM = process.env.INSTAGRAM_HANDLE || '';
const TIKTOK = process.env.TIKTOK_HANDLE || '';

const store = createStore();
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

function baseUrl(req) {
  return (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function payUrl(hunt, req) {
  const link = STRIPE_LINKS[hunt.tierDays];
  if (!link) return null;
  const u = new URL(link);
  u.searchParams.set('client_reference_id', hunt.id); // ties the Stripe payment back to this hunt
  if (hunt.email) u.searchParams.set('prefilled_email', hunt.email);
  return u.toString();
}

// ---------- Stripe webhook (needs the raw body, so it's registered before express.json) ----------
function verifyStripeSignature(raw, header, secret, toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i), kv.slice(i + 1)];
    })
  );
  const sigs = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

app.post('/api/stripe/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  if (!STRIPE_WEBHOOK_SECRET) return res.status(501).send('Webhook not configured');
  const raw = req.body.toString('utf8');
  if (!verifyStripeSignature(raw, req.get('stripe-signature'), STRIPE_WEBHOOK_SECRET)) {
    return res.status(400).send('Bad signature');
  }
  const event = JSON.parse(raw);
  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const hunt = s.client_reference_id && (await store.getHunt(s.client_reference_id));
    if (hunt && hunt.status === 'awaiting_payment') {
      L.applyAction(hunt, 'markPaid', { via: 'stripe' });
      hunt.stripeSessionId = s.id;
      hunt.stripePaymentIntent = s.payment_intent || null;
      hunt.amountPaid = s.amount_total != null ? s.amount_total / 100 : null;
      if (!hunt.email && s.customer_details?.email) hunt.email = s.customer_details.email;
      await store.saveHunt(hunt);
      console.log(`[stripe] ${hunt.id} paid`);
    }
  }
  res.json({ received: true });
});

app.use(express.json({ limit: '9mb' }));

// ---------- tiny helpers ----------
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key) || { n: 0, reset: now + windowMs };
  if (now > b.reset) {
    b.n = 0;
    b.reset = now + windowMs;
  }
  b.n++;
  buckets.set(key, b);
  return b.n <= max;
}

function sign(v) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(v).digest('base64url');
}
function isAdmin(req) {
  const c = (req.get('cookie') || '').split(/;\s*/).find((x) => x.startsWith('iso_admin='));
  if (!c || !ADMIN_PASSWORD) return false;
  const [exp, sig] = c.slice('iso_admin='.length).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not signed in' });
  next();
}

async function loadHunt(id) {
  const hunt = await store.getHunt(id);
  if (hunt && L.refreshHunt(hunt)) await store.saveHunt(hunt);
  return hunt;
}

// ---------- public API ----------
app.get('/api/config', (req, res) => {
  res.json({
    tiers: Object.values(L.TIERS).map((t) => ({ ...t, perDay: +(t.price / t.days).toFixed(2), payEnabled: Boolean(STRIPE_LINKS[t.days]) })),
    contactWhatsapp: CONTACT_WHATSAPP,
    contactEmail: CONTACT_EMAIL,
    instagram: INSTAGRAM,
    tiktok: TIKTOK,
  });
});

app.post('/api/hunts', wrap(async (req, res) => {
  if (!rateLimit('submit:' + req.ip, 8, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many hunts from this device — message us on WhatsApp instead.' });
  }
  if (req.body.website) return res.json({ ok: true }); // honeypot
  const { errors, value } = L.validateSubmission(req.body);

  let image = null;
  if (req.body.image) {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(req.body.image);
    if (!m) errors.image = 'Upload a JPG, PNG or WebP photo.';
    else {
      image = { mime: m[1], data: Buffer.from(m[2], 'base64') };
      if (image.data.length > 6 * 1024 * 1024) errors.image = 'That photo is too big (max 6 MB).';
    }
  }
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const now = new Date().toISOString();
  const hunt = {
    ...value,
    id: L.newHuntId(),
    token: L.newToken(),
    status: 'awaiting_payment',
    createdAt: now,
    updatedAt: now,
    matches: [],
    log: [],
    searchTerms: '',
    notes: '',
  };
  while (await store.getHunt(hunt.id)) hunt.id = L.newHuntId();
  if (image) {
    hunt.imageKey = L.newKey();
    await store.saveImage(hunt.imageKey, image.mime, image.data);
  }
  L.log(hunt, 'Hunt submitted.');
  await store.saveHunt(hunt);
  console.log(`[hunt] new ${hunt.id} — ${hunt.tierDays}d, max ${L.money(hunt.maxPrice)}`);

  res.json({ id: hunt.id, token: hunt.token, statusUrl: `/h/${hunt.token}`, payUrl: payUrl(hunt, req) });
}));

app.get('/api/hunts/:token', wrap(async (req, res) => {
  let hunt = await store.getHuntByToken(req.params.token);
  if (!hunt) return res.status(404).json({ error: 'Hunt not found' });
  if (L.refreshHunt(hunt)) await store.saveHunt(hunt);
  res.json({ ...L.publicView(hunt, { baseUrl: baseUrl(req) }), payUrl: hunt.status === 'awaiting_payment' ? payUrl(hunt, req) : null });
}));

// The "found wall" — wins Fion chose to feature (anonymised).
app.get('/api/wins', wrap(async (req, res) => {
  const hunts = await store.listHunts();
  const wins = hunts
    .filter((h) => h.featured && h.winBlurb)
    .slice(0, 24)
    .map((h) => {
      const m = (h.matches || []).find((x) => x.status === 'approved' || x.status === 'sent');
      const days = h.huntStartedAt && m ? Math.max(1, Math.ceil((Date.parse(m.createdAt) - Date.parse(h.huntStartedAt)) / L.DAY)) : null;
      return { blurb: h.winBlurb, price: m ? m.price : null, budget: h.maxPrice, days, source: m ? m.source : null, imageUrl: h.featureImage && h.imageKey ? `/i/${h.imageKey}` : null };
    });
  res.json({ wins });
}));

app.get('/i/:key', wrap(async (req, res) => {
  const img = await store.getImage(req.params.key);
  if (!img) return res.status(404).end();
  res.set('Content-Type', img.mime).set('Cache-Control', 'public, max-age=31536000, immutable').send(img.data);
}));

// ---------- admin API ----------
app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'Set the ADMIN_PASSWORD secret first.' });
  if (!rateLimit('login:' + req.ip, 10, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  const given = Buffer.from(String(req.body.password || ''));
  const want = Buffer.from(ADMIN_PASSWORD);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(401).json({ error: 'Wrong password' });
  const exp = String(Date.now() + 30 * L.DAY);
  res.cookie('iso_admin', `${exp}.${sign(exp)}`, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 30 * L.DAY, path: '/' });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('iso_admin', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => res.json({ admin: isAdmin(req), configured: Boolean(ADMIN_PASSWORD), store: store.kind }));

function adminSummary(h) {
  return {
    id: h.id,
    status: h.status,
    statusLabel: L.STATUS[h.status],
    name: h.name,
    phone: L.formatPhone(h.phone),
    description: h.description,
    searchTerms: h.searchTerms,
    link: h.link,
    imageUrl: h.imageKey ? `/i/${h.imageKey}` : null,
    maxPrice: h.maxPrice,
    tierDays: h.tierDays,
    price: L.TIERS[h.tierDays].price,
    location: h.location,
    neededBy: h.neededBy,
    createdAt: h.createdAt,
    paidAt: h.paidAt,
    huntEndsAt: h.huntEndsAt,
    refundedAt: h.refundedAt,
    referredBy: h.referredBy,
    source: h.source,
    matchCount: (h.matches || []).length,
    flags: L.flags(h),
  };
}

app.get('/api/admin/hunts', requireAdmin, wrap(async (req, res) => {
  const hunts = await store.listHunts();
  for (const h of hunts) if (L.refreshHunt(h)) await store.saveHunt(h);
  const rows = hunts.map(adminSummary);
  const paid = hunts.filter((h) => h.paidAt);
  const refunded = hunts.filter((h) => h.refundedAt);
  const revenue = paid.reduce((s, h) => s + (h.amountPaid ?? L.TIERS[h.tierDays].price), 0);
  const refunds = refunded.reduce((s, h) => s + (h.amountPaid ?? L.TIERS[h.tierDays].price), 0);
  const decided = hunts.filter((h) => ['found', 'closed', 'expired'].includes(h.status));
  const won = decided.filter((h) => h.status !== 'expired');
  const sourceCounts = {};
  for (const h of hunts) {
    const k = h.referredBy ? 'referral' : h.source || 'unknown';
    sourceCounts[k] = (sourceCounts[k] || 0) + 1;
  }
  res.json({
    hunts: rows,
    stats: {
      total: hunts.length,
      active: hunts.filter((h) => ['reviewing', 'hunting', 'found'].includes(h.status)).length,
      toReview: rows.filter((r) => r.status === 'reviewing').length,
      toSweep: rows.filter((r) => r.flags.needsSweep).length,
      pendingMatches: rows.reduce((s, r) => s + r.flags.pendingMatches, 0),
      refundsDue: rows.filter((r) => r.flags.needsRefund).length,
      revenue,
      refunds,
      net: revenue - refunds,
      findRate: decided.length ? Math.round((won.length / decided.length) * 100) : null,
      sources: sourceCounts,
    },
  });
}));

app.get('/api/admin/hunts/:id', requireAdmin, wrap(async (req, res) => {
  const hunt = await loadHunt(req.params.id);
  if (!hunt) return res.status(404).json({ error: 'Not found' });
  const b = baseUrl(req);
  res.json({
    hunt: { ...hunt, ...adminSummary(hunt), phoneRaw: hunt.phone, email: hunt.email, notes: hunt.notes, matches: hunt.matches, log: hunt.log, token: hunt.token, winBlurb: hunt.winBlurb || '', featured: Boolean(hunt.featured), featureImage: Boolean(hunt.featureImage), condition: hunt.condition, shippingOk: hunt.shippingOk, declineReason: hunt.declineReason, lastSweptAt: hunt.lastSweptAt, sweeps: hunt.sweeps || 0 },
    query: L.searchQuery(hunt),
    searchLinks: L.searchLinks(hunt, { baseUrl: b, craigslistRegion: CRAIGSLIST_REGION }),
    drafts: L.drafts(hunt, { baseUrl: b }),
    statusUrl: `${b}/h/${hunt.token}`,
    payUrl: hunt.status === 'awaiting_payment' ? payUrl(hunt, req) : null,
  });
}));

app.patch('/api/admin/hunts/:id', requireAdmin, wrap(async (req, res) => {
  const hunt = await loadHunt(req.params.id);
  if (!hunt) return res.status(404).json({ error: 'Not found' });
  const b = req.body;
  if ('searchTerms' in b) hunt.searchTerms = String(b.searchTerms).slice(0, 200);
  if ('notes' in b) hunt.notes = String(b.notes).slice(0, 5000);
  if ('winBlurb' in b) hunt.winBlurb = String(b.winBlurb).slice(0, 200);
  if ('featured' in b) hunt.featured = Boolean(b.featured);
  if ('featureImage' in b) hunt.featureImage = Boolean(b.featureImage);
  if ('maxPrice' in b) {
    const v = Number(b.maxPrice);
    if (Number.isFinite(v) && v > 0) {
      if (v !== hunt.maxPrice) L.log(hunt, `Budget changed ${L.money(hunt.maxPrice)} → ${L.money(v)}.`);
      hunt.maxPrice = v;
    }
  }
  hunt.updatedAt = new Date().toISOString();
  await store.saveHunt(hunt);
  res.json({ ok: true });
}));

app.post('/api/admin/hunts/:id/action', requireAdmin, wrap(async (req, res) => {
  const hunt = await loadHunt(req.params.id);
  if (!hunt) return res.status(404).json({ error: 'Not found' });
  try {
    L.applyAction(hunt, req.body.action, req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  await store.saveHunt(hunt);
  res.json({ ok: true, status: hunt.status });
}));

app.post('/api/admin/hunts/:id/matches', requireAdmin, wrap(async (req, res) => {
  const hunt = await loadHunt(req.params.id);
  if (!hunt) return res.status(404).json({ error: 'Not found' });
  let match;
  try {
    match = L.validateMatch(hunt, req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  hunt.matches.push(match);
  L.log(hunt, `Shortlisted: ${match.title} (${L.money(match.price)}, ${match.source}).`);
  await store.saveHunt(hunt);
  res.json({ ok: true, match });
}));

app.patch('/api/admin/hunts/:id/matches/:mid', requireAdmin, wrap(async (req, res) => {
  const hunt = await loadHunt(req.params.id);
  if (!hunt) return res.status(404).json({ error: 'Not found' });
  const m = hunt.matches.find((x) => x.id === req.params.mid);
  if (!m) return res.status(404).json({ error: 'Match not found' });
  const next = req.body.status;
  if (!['approved', 'rejected', 'gone', 'pending'].includes(next)) return res.status(400).json({ error: 'Bad status' });
  m.status = next;
  m[next + 'At'] = new Date().toISOString();
  if (next === 'approved') {
    if (!['hunting', 'found'].includes(hunt.status)) return res.status(400).json({ error: 'Start the hunt (pass feasibility) before sending finds.' });
    hunt.status = 'found';
    hunt.foundAt = hunt.foundAt || m.approvedAt;
    L.log(hunt, `Approved & sent: ${m.title}.`);
  } else {
    L.log(hunt, `Match ${m.title} → ${next}.`);
  }
  await store.saveHunt(hunt);
  res.json({ ok: true });
}));

app.get('/api/admin/export.csv', requireAdmin, wrap(async (req, res) => {
  const hunts = await store.listHunts();
  const cols = ['id', 'status', 'name', 'phone', 'email', 'description', 'maxPrice', 'tierDays', 'createdAt', 'paidAt', 'huntStartedAt', 'foundAt', 'closedAt', 'refundedAt', 'source', 'referredBy'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...hunts.map((h) => cols.map((c) => esc(h[c])).join(','))].join('\n');
  res.set('Content-Type', 'text/csv').set('Content-Disposition', 'attachment; filename="hunts.csv"').send(csv);
}));

// ---------- pages ----------
const pub = path.join(__dirname, 'public');
app.use(express.static(pub, { extensions: ['html'], maxAge: '1h' }));
app.get('/h/:token', (req, res) => res.sendFile(path.join(pub, 'hunt.html')));
app.get('/healthz', (req, res) => res.send('ok'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((req, res) => res.status(404).sendFile(path.join(pub, '404.html')));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something broke on our end. Try again?' });
});

if (require.main === module) {
  store.init().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`In Search Of running on :${PORT} (store: ${store.kind})`);
      if (!ADMIN_PASSWORD) console.warn('⚠  ADMIN_PASSWORD not set — the /admin dashboard is locked.');
      if (store.kind === 'file') console.warn('⚠  No DATABASE_URL — using ./data (not durable on Replit deployments).');
    });
  });
}

module.exports = { app, store, verifyStripeSignature };
