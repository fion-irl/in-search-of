const test = require('node:test');
const assert = require('node:assert');
const L = require('../lib');

const base = () => ({ id: 'ISO-TEST2', token: 't', name: 'Sam Lee', phone: '14155550134', description: 'Vitamix 5200', maxPrice: 150, tierDays: 30, status: 'awaiting_payment', matches: [], log: [], createdAt: new Date().toISOString() });

test('phone normalisation', () => {
  assert.equal(L.normalizePhone('(415) 555-0134'), '14155550134');
  assert.equal(L.normalizePhone('+44 7700 900123'), '447700900123');
  assert.equal(L.normalizePhone('123'), null);
});

test('submission requires item, budget, phone, tier, name, agreement', () => {
  const { errors } = L.validateSubmission({});
  for (const k of ['description', 'maxPrice', 'phone', 'tier', 'name', 'agree']) assert.ok(errors[k], k);
  const ok = L.validateSubmission({ description: 'x', maxPrice: '$1,200', phone: '4155550134', tier: '7', name: 'A', agree: true });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.maxPrice, 1200);
});

test('over-budget matches are rejected (hard filter)', () => {
  const h = base();
  assert.throws(() => L.validateMatch(h, { url: 'https://x.com/a', price: 151 }), /Over budget/);
  assert.equal(L.validateMatch(h, { url: 'https://www.facebook.com/marketplace/item/1', price: 150 }).source, 'facebook.com');
});

test('lifecycle: pay → approve (clock starts) → expire → refund due', () => {
  const h = base();
  const t0 = Date.parse('2026-10-01T12:00:00Z');
  L.applyAction(h, 'markPaid', {}, t0);
  assert.equal(h.status, 'reviewing');
  assert.equal(L.flags(h, t0 + 25 * 3600e3).feasibilityOverdue, true);
  L.applyAction(h, 'approve', {}, t0 + 3600e3);
  assert.equal(h.status, 'hunting');
  assert.equal(Date.parse(h.huntEndsAt) - Date.parse(h.huntStartedAt), 30 * L.DAY);
  assert.equal(L.refreshHunt(h, t0 + 29 * L.DAY), false);
  assert.equal(L.refreshHunt(h, t0 + 31 * L.DAY), true);
  assert.equal(h.status, 'expired');
  assert.equal(L.flags(h).needsRefund, true);
  L.applyAction(h, 'markRefunded');
  assert.equal(L.flags(h).needsRefund, false);
  assert.throws(() => L.applyAction(h, 'markRefunded'), /Already/);
});

test('cannot start the clock before payment', () => {
  assert.throws(() => L.applyAction(base(), 'approve'), /Can't/);
});

test('public view hides unapproved matches and private fields', () => {
  const h = base();
  h.matches = [{ id: 'a', status: 'pending', url: 'u', title: 't', price: 1, source: 's', createdAt: '' }, { id: 'b', status: 'approved', url: 'u', title: 't', price: 1, source: 's', createdAt: '' }];
  const v = L.publicView(h);
  assert.equal(v.matches.length, 1);
  assert.equal(v.phone, undefined);
  assert.equal(v.name, 'Sam');
});

test('drafts include a wa.me link for the found message', () => {
  const h = base();
  h.status = 'found';
  h.matches = [{ id: 'b', status: 'approved', url: 'https://x', title: 'Vitamix', price: 110, source: 'fb', createdAt: '' }];
  const d = L.drafts(h, { baseUrl: 'https://insearchof.shop' });
  assert.ok(d[0].waUrl.startsWith('https://wa.me/14155550134?text='));
  assert.match(d[0].text, /WE FOUND IT/);
});
