// Business rules for In Search Of. Pure functions — no I/O — so they're easy to test.

const crypto = require('crypto');

const DAY = 24 * 60 * 60 * 1000;
const FEASIBILITY_WINDOW_MS = DAY;

// Step-down per-day pricing nudges buyers toward longer hunts, where we're most likely to deliver.
const TIERS = {
  7: { days: 7, price: 20, name: 'Sprint', blurb: 'For urgent, common finds.' },
  30: { days: 30, price: 50, name: 'Standard', blurb: 'Our sweet spot. Most hunts land here.', popular: true },
  60: { days: 60, price: 75, name: 'Deep Hunt', blurb: 'For the specific, the sized, the discontinued.' },
};

const STATUS = {
  awaiting_payment: 'Awaiting payment',
  reviewing: 'Feasibility check',
  hunting: 'Hunting',
  found: 'Found — sent to customer',
  closed: 'Closed — customer bought it',
  declined: 'Declined (unfindable)',
  expired: 'Window ended — not found',
  cancelled: 'Cancelled',
};

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

function newHuntId() {
  const bytes = crypto.randomBytes(5);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return 'ISO-' + s;
}

function newToken() {
  return crypto.randomBytes(18).toString('base64url');
}

function newKey() {
  return crypto.randomBytes(16).toString('hex');
}

// Normalise to E.164-ish digits for wa.me links. Assumes US/Canada for bare 10-digit numbers.
function normalizePhone(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  let digits = trimmed.replace(/\D/g, '');
  if (!trimmed.startsWith('+') && digits.length === 10) digits = '1' + digits;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function formatPhone(digits) {
  if (!digits) return '';
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return '+' + digits;
}

function money(n) {
  const v = Number(n);
  return '$' + (Number.isInteger(v) ? v : v.toFixed(2));
}

function isValidUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch {
    return false;
  }
}

function clean(s, max = 500) {
  return String(s ?? '').trim().slice(0, max);
}

// Validate a public hunt submission. Returns { errors, value }.
function validateSubmission(body) {
  const errors = {};
  const description = clean(body.description, 2000);
  const link = clean(body.link, 1000);
  const hasImage = Boolean(body.image);

  if (!description && !link && !hasImage) {
    errors.description = 'Tell us what you are hunting: a photo, a link, or a description.';
  }
  if (link && !isValidUrl(link)) errors.link = 'That link does not look right.';

  const maxPrice = Number(String(body.maxPrice ?? '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(maxPrice) || maxPrice <= 0) errors.maxPrice = 'Set a max price — we never show you anything over it.';
  else if (maxPrice > 100000) errors.maxPrice = 'For hunts over $100k, message us directly.';

  const phone = normalizePhone(body.phone);
  if (!phone) errors.phone = 'We need a WhatsApp number to tell you the moment we find it.';

  const tierDays = Number(body.tier);
  if (!TIERS[tierDays]) errors.tier = 'Pick a hunt length.';

  const name = clean(body.name, 80);
  if (!name) errors.name = 'What should we call you?';

  const email = clean(body.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'That email does not look right.';

  if (!body.agree) errors.agree = 'Please accept the hunt terms.';

  let neededBy = clean(body.neededBy, 10);
  if (neededBy && !/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) neededBy = '';

  return {
    errors,
    value: {
      description,
      link,
      maxPrice: Math.round(maxPrice * 100) / 100,
      phone,
      tierDays,
      name,
      email,
      location: clean(body.location, 120),
      shippingOk: Boolean(body.shippingOk),
      condition: ['any', 'new', 'like_new', 'good'].includes(body.condition) ? body.condition : 'any',
      neededBy,
      source: clean(body.source, 80),
      referredBy: /^ISO-[A-Z0-9]{5}$/.test(body.ref || '') ? body.ref : '',
      utm: clean(body.utm, 200),
    },
  };
}

// Derive time-based state. Hunts whose window has passed while still hunting become "expired"
// (and therefore refund-due) — this is the "find it or it's free" engine.
function refreshHunt(hunt, now = Date.now()) {
  if (hunt.status === 'hunting' && hunt.huntEndsAt && now > Date.parse(hunt.huntEndsAt)) {
    hunt.status = 'expired';
    hunt.expiredAt = new Date(now).toISOString();
    log(hunt, 'Hunt window ended without a find — refund due.');
    return true;
  }
  return false;
}

function flags(hunt, now = Date.now()) {
  const paid = Boolean(hunt.paidAt);
  const f = {
    needsRefund: paid && !hunt.refundedAt && ['declined', 'expired'].includes(hunt.status),
    feasibilityDueAt: null,
    feasibilityOverdue: false,
    sweptToday: false,
    daysLeft: null,
    dayNumber: null,
    pendingMatches: (hunt.matches || []).filter((m) => m.status === 'pending').length,
  };
  if (hunt.status === 'reviewing' && hunt.paidAt) {
    const due = Date.parse(hunt.paidAt) + FEASIBILITY_WINDOW_MS;
    f.feasibilityDueAt = new Date(due).toISOString();
    f.feasibilityOverdue = now > due;
  }
  if (hunt.lastSweptAt) {
    f.sweptToday = new Date(hunt.lastSweptAt).toDateString() === new Date(now).toDateString();
  }
  if (hunt.huntStartedAt && hunt.huntEndsAt) {
    f.dayNumber = Math.min(hunt.tierDays, Math.floor((now - Date.parse(hunt.huntStartedAt)) / DAY) + 1);
    f.daysLeft = Math.max(0, Math.ceil((Date.parse(hunt.huntEndsAt) - now) / DAY));
  }
  f.needsSweep = hunt.status === 'hunting' && !f.sweptToday;
  return f;
}

function log(hunt, text) {
  hunt.log = hunt.log || [];
  hunt.log.push({ at: new Date().toISOString(), text });
}

// State machine for admin actions. Throws on invalid transitions.
function applyAction(hunt, action, opts = {}, now = Date.now()) {
  const iso = new Date(now).toISOString();
  const need = (...states) => {
    if (!states.includes(hunt.status)) {
      throw new Error(`Can't "${action}" a hunt that is ${STATUS[hunt.status] || hunt.status}.`);
    }
  };
  switch (action) {
    case 'markPaid':
      need('awaiting_payment');
      hunt.paidAt = iso;
      hunt.status = 'reviewing';
      log(hunt, opts.via === 'stripe' ? 'Payment received via Stripe.' : 'Marked paid manually.');
      break;
    case 'approve': // passes the 24h feasibility gate — the clock starts now
      need('reviewing');
      hunt.status = 'hunting';
      hunt.huntStartedAt = iso;
      hunt.huntEndsAt = new Date(now + hunt.tierDays * DAY).toISOString();
      log(hunt, `Feasibility approved. ${hunt.tierDays}-day hunt clock started.`);
      break;
    case 'decline':
      need('reviewing', 'awaiting_payment');
      hunt.status = 'declined';
      hunt.declineReason = clean(opts.reason, 500);
      log(hunt, `Declined as unfindable${hunt.declineReason ? ': ' + hunt.declineReason : ''}.`);
      break;
    case 'markSwept':
      need('hunting');
      hunt.lastSweptAt = iso;
      hunt.sweeps = (hunt.sweeps || 0) + 1;
      break;
    case 'resume': // listing was gone / not as described → keep hunting on the same clock
      need('found', 'expired');
      if (hunt.status === 'expired') {
        hunt.huntEndsAt = new Date(now + Number(opts.days || 7) * DAY).toISOString();
        log(hunt, `Hunt reopened for ${opts.days || 7} more days.`);
      } else {
        log(hunt, 'Resumed hunting (previous find fell through).');
      }
      hunt.status = 'hunting';
      break;
    case 'extend':
      need('hunting', 'found');
      hunt.huntEndsAt = new Date(Date.parse(hunt.huntEndsAt) + Number(opts.days || 7) * DAY).toISOString();
      log(hunt, `Extended by ${opts.days || 7} days.`);
      break;
    case 'close':
      need('found', 'hunting');
      hunt.status = 'closed';
      hunt.closedAt = iso;
      log(hunt, 'Closed — customer got their item. 🎉');
      break;
    case 'markRefunded':
      if (!hunt.paidAt) throw new Error('This hunt was never paid.');
      if (hunt.refundedAt) throw new Error('Already refunded.');
      hunt.refundedAt = iso;
      if (!['declined', 'expired', 'cancelled'].includes(hunt.status)) hunt.status = 'cancelled';
      log(hunt, 'Refund issued in Stripe.');
      break;
    case 'cancel':
      need('awaiting_payment', 'reviewing', 'hunting');
      hunt.status = 'cancelled';
      log(hunt, 'Cancelled.');
      break;
    default:
      throw new Error('Unknown action: ' + action);
  }
  hunt.updatedAt = iso;
  return hunt;
}

function validateMatch(hunt, body) {
  const url = clean(body.url, 1000);
  if (!isValidUrl(url)) throw new Error('Paste the listing URL.');
  const price = Number(String(body.price ?? '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(price) || price < 0) throw new Error('Add the listing price.');
  // Hard filter — never surface over-budget finds.
  if (price > hunt.maxPrice) {
    throw new Error(`Over budget: ${money(price)} > max ${money(hunt.maxPrice)}. We never surface these.`);
  }
  let source = clean(body.source, 60);
  if (!source) {
    try {
      source = new URL(url).hostname.replace(/^www\./, '');
    } catch {}
  }
  return {
    id: newKey().slice(0, 10),
    url,
    title: clean(body.title, 200) || 'Listing',
    price,
    source,
    note: clean(body.note, 500),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
}

// Search terms: admin-refined terms if present, else the first line of the description.
function searchQuery(hunt) {
  const q = hunt.searchTerms || hunt.description.split(/\n|\.(\s|$)/)[0] || '';
  return q.trim().slice(0, 100);
}

function searchLinks(hunt, { baseUrl = '', craigslistRegion = 'sfbay' } = {}) {
  const q = searchQuery(hunt);
  const e = encodeURIComponent;
  const max = Math.floor(hunt.maxPrice);
  const links = [];
  if (hunt.imageKey && baseUrl) {
    links.push({ name: 'Google Lens (photo)', url: `https://lens.google.com/uploadbyurl?url=${e(`${baseUrl}/i/${hunt.imageKey}`)}` });
  }
  if (hunt.link) links.push({ name: 'Their reference link', url: hunt.link });
  if (!q) return links;
  links.push(
    { name: 'Facebook Marketplace', url: `https://www.facebook.com/marketplace/search/?query=${e(q)}&maxPrice=${max}&sortBy=creation_time_descend` },
    { name: 'Craigslist', url: `https://${craigslistRegion}.craigslist.org/search/sss?query=${e(q)}&max_price=${max}&sort=date` },
    { name: 'OfferUp', url: `https://offerup.com/search?q=${e(q)}&price_max=${max}` },
    { name: 'Poshmark', url: `https://poshmark.com/search?query=${e(q)}&sort_by=added_desc` },
    { name: 'Mercari', url: `https://www.mercari.com/search/?keyword=${e(q)}` },
    { name: 'eBay', url: `https://www.ebay.com/sch/i.html?_nkw=${e(q)}&_udhi=${max}&_sop=10` },
    { name: 'Depop', url: `https://www.depop.com/search/?q=${e(q)}` },
    { name: 'Google Shopping', url: `https://www.google.com/search?q=${e(q)}&tbm=shop&tbs=mr:1,price:1,ppr_max:${max}` },
    { name: 'Google (past week)', url: `https://www.google.com/search?q=${e(q + ' for sale')}&tbs=qdr:w` },
    { name: 'Reddit', url: `https://www.reddit.com/search/?q=${e(q + ' for sale')}&sort=new` }
  );
  return links;
}

function firstName(hunt) {
  return (hunt.name || '').split(/\s+/)[0] || 'there';
}

// WhatsApp message drafts. Fion sends them herself via WhatsApp Business (wa.me deep link).
function drafts(hunt, { baseUrl = '' } = {}) {
  const hi = `Hi ${firstName(hunt)}!`;
  const statusUrl = `${baseUrl}/h/${hunt.token}`;
  const what = hunt.searchTerms || hunt.description.slice(0, 80) || 'your item';
  const f = flags(hunt);
  const out = [];
  const push = (key, label, text) => out.push({ key, label, text, waUrl: waLink(hunt.phone, text) });

  if (hunt.status === 'awaiting_payment') {
    push('pay', 'Payment nudge', `${hi} This is In Search Of 🔎 We got your hunt for "${what}". Tap here to lock it in and we start the feasibility check right away: ${statusUrl}`);
  }
  if (hunt.status === 'reviewing') {
    push('welcome', 'Welcome', `${hi} In Search Of here 🔎 We've got your hunt for "${what}" (max ${money(hunt.maxPrice)}). We'll confirm within 24 hours that it's findable — if it's not, you get a full refund before the clock even starts. Track it anytime: ${statusUrl}`);
  }
  if (hunt.status === 'hunting') {
    push('started', 'Hunt started', `${hi} Good news — your hunt for "${what}" is officially on 🔎 We'll sweep Marketplace, Poshmark, Craigslist, eBay and the rest every day for the next ${hunt.tierDays} days. The moment something fits your ${money(hunt.maxPrice)} budget, you'll hear from us here.`);
    push('checkin', 'Check-in', `${hi} Quick update on "${what}": day ${f.dayNumber} of ${hunt.tierDays}, still sweeping daily. Nothing that meets your bar yet — we'd rather wait for the right one than send you junk. Anything changed (budget, size, colour)? Just reply here.`);
  }
  for (const m of hunt.matches || []) {
    if (m.status === 'approved' || m.status === 'sent') {
      push('found-' + m.id, `Found it! — ${m.title}`, `${hi} 🎯 WE FOUND IT!\n\n${m.title} — ${money(m.price)} on ${m.source}\n${m.url}${m.note ? '\n\n' + m.note : ''}\n\nGood listings move fast, so message the seller soon! If it's gone or not as described, reply here and we'll keep hunting.\n\n${statusUrl}`);
    }
  }
  if (hunt.status === 'declined') {
    push('declined', 'Declined + refund', `${hi} Honest answer on "${what}": ${hunt.declineReason || "we don't think we can find this one reliably"}. Rather than take your money for a long shot, we've issued a full refund — you'll see it in 5–10 days. Hope we can hunt something down for you another time.`);
  }
  if (hunt.status === 'expired') {
    push('expired', 'Not found + refund', `${hi} Your ${hunt.tierDays}-day hunt for "${what}" has ended and we didn't find one that met your bar. As promised: find it or it's free — we've refunded you in full. If you'd like us to keep looking anyway, just reply.`);
  }
  if (hunt.status === 'closed') {
    push('review', 'Ask for a review', `${hi} So glad you got it! 🙌 One favour: would you tell a friend who's hunting for something? Here's your share link: ${baseUrl}/?ref=${hunt.id}\n\nAnd if you're up for it, a quick sentence about your experience would mean the world to us.`);
  }
  return out;
}

function waLink(phone, text) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

// What the customer is allowed to see on their status page.
function publicView(hunt, { baseUrl = '' } = {}) {
  const f = flags(hunt);
  return {
    id: hunt.id,
    status: hunt.status,
    statusLabel: STATUS[hunt.status],
    createdAt: hunt.createdAt,
    paidAt: hunt.paidAt || null,
    huntStartedAt: hunt.huntStartedAt || null,
    huntEndsAt: hunt.huntEndsAt || null,
    refundedAt: hunt.refundedAt || null,
    declineReason: hunt.status === 'declined' ? hunt.declineReason || '' : '',
    description: hunt.description,
    link: hunt.link,
    hasImage: Boolean(hunt.imageKey),
    imageUrl: hunt.imageKey ? `/i/${hunt.imageKey}` : null,
    maxPrice: hunt.maxPrice,
    tierDays: hunt.tierDays,
    price: TIERS[hunt.tierDays].price,
    name: firstName(hunt),
    sweeps: hunt.sweeps || 0,
    lastSweptAt: hunt.lastSweptAt || null,
    dayNumber: f.dayNumber,
    daysLeft: f.daysLeft,
    feasibilityDueAt: f.feasibilityDueAt,
    matches: (hunt.matches || [])
      .filter((m) => m.status === 'approved' || m.status === 'sent')
      .map(({ id, url, title, price, source, note, createdAt }) => ({ id, url, title, price, source, note, createdAt })),
    shareUrl: `${baseUrl}/?ref=${hunt.id}`,
  };
}

module.exports = {
  DAY,
  TIERS,
  STATUS,
  newHuntId,
  newToken,
  newKey,
  normalizePhone,
  formatPhone,
  money,
  validateSubmission,
  refreshHunt,
  flags,
  log,
  applyAction,
  validateMatch,
  searchQuery,
  searchLinks,
  drafts,
  waLink,
  publicView,
};
