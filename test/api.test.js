const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-'));
process.env.ADMIN_PASSWORD = 'hunter2';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.STRIPE_LINK_30 = 'https://buy.stripe.com/test_30';
delete process.env.DATABASE_URL;
const { app, store } = require('../server');

let server, url;
test.before(async () => { await store.init(); server = app.listen(0); url = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

const j = (p, opts = {}) => fetch(url + p, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, body: opts.body && JSON.stringify(opts.body) });

test('full flow: submit → stripe webhook → admin approve → find → approve match', async () => {
  const png = 'data:image/png;base64,' + Buffer.from('fakepng').toString('base64');
  let r = await j('/api/hunts', { method: 'POST', body: { description: 'Vitamix 5200', image: png, maxPrice: '150', phone: '415 555 0134', tier: 30, name: 'Sam', agree: true } });
  const created = await r.json();
  assert.equal(r.status, 200, JSON.stringify(created));
  assert.match(created.payUrl, /client_reference_id=ISO-/);

  // Stripe webhook marks it paid
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', client_reference_id: created.id, amount_total: 5000 } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_test').update(`${t}.${payload}`).digest('hex');
  r = await fetch(url + '/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: payload });
  assert.equal(r.status, 200);
  r = await fetch(url + '/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=bad` }, body: payload });
  assert.equal(r.status, 400);

  let pub = await (await fetch(url + '/api/hunts/' + created.token)).json();
  assert.equal(pub.status, 'reviewing');

  // admin
  assert.equal((await j('/api/admin/hunts')).status, 401);
  r = await j('/api/admin/login', { method: 'POST', body: { password: 'hunter2' } });
  const cookie = r.headers.get('set-cookie').split(';')[0];
  const A = (p, opts = {}) => j('/api/admin' + p, { ...opts, headers: { cookie } });
  assert.equal((await A(`/hunts/${created.id}/action`, { method: 'POST', body: { action: 'approve' } })).status, 200);
  r = await A(`/hunts/${created.id}/matches`, { method: 'POST', body: { url: 'https://www.facebook.com/marketplace/item/1', price: 200 } });
  assert.equal(r.status, 400); // over budget
  r = await A(`/hunts/${created.id}/matches`, { method: 'POST', body: { url: 'https://www.facebook.com/marketplace/item/1', price: 110, title: 'Vitamix 5200' } });
  const { match } = await r.json();
  pub = await (await fetch(url + '/api/hunts/' + created.token)).json();
  assert.equal(pub.matches.length, 0); // not visible until approved
  await A(`/hunts/${created.id}/matches/${match.id}`, { method: 'PATCH', body: { status: 'approved' } });
  pub = await (await fetch(url + '/api/hunts/' + created.token)).json();
  assert.equal(pub.status, 'found');
  assert.equal(pub.matches.length, 1);

  const detail = await (await A('/hunts/' + created.id)).json();
  assert.ok(detail.searchLinks.some((l) => l.name.includes('Lens')));
  assert.ok(detail.drafts.some((d) => d.key === 'found-' + match.id));
  const list = await (await A('/hunts')).json();
  assert.equal(list.stats.revenue, 50);

  r = await fetch(url + pub.imageUrl);
  assert.equal(r.status, 200);
});

test('validation errors come back per field', async () => {
  const r = await j('/api/hunts', { method: 'POST', body: {} });
  assert.equal(r.status, 400);
  const { errors } = await r.json();
  assert.ok(errors.phone && errors.maxPrice);
});
