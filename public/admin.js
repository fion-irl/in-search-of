// Fion's hunt desk. Hash routes: #/ (queue) and #/hunt/ISO-XXXXX (detail).
(() => {
  const app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—');
  const fmtT = (d) => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
  const ago = (d) => {
    const m = Math.round((Date.now() - Date.parse(d)) / 60000);
    if (m < 60) return m + 'm ago';
    if (m < 60 * 24) return Math.round(m / 60) + 'h ago';
    return Math.round(m / 1440) + 'd ago';
  };
  let filter = 'today';
  const visited = new Set();

  async function api(path, opts = {}) {
    const r = await fetch('/api/admin' + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) { renderLogin(); throw new Error('auth'); }
    if (!r.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied ✓'); } catch { prompt('Copy:', text); }
  }

  // ---------- login ----------
  async function renderLogin() {
    const me = await fetch('/api/admin/me').then((r) => r.json());
    app.innerHTML = `
      <div class="login card">
        <a class="logo" href="/">ISO<span>.</span><small>Hunt desk</small></a>
        ${me.configured ? `
          <form id="lf" style="margin-top:20px">
            <div class="field"><label for="pw">Password</label><input class="input" id="pw" type="password" autocomplete="current-password" autofocus /></div>
            <button class="btn block">Sign in</button>
            <div class="err" id="le" style="display:block"></div>
          </form>` : `<p style="margin-top:16px">Set the <code>ADMIN_PASSWORD</code> secret (Replit → Secrets) and restart to unlock the desk.</p>`}
      </div>`;
    const f = $('#lf');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#pw').value }) });
      if (r.ok) route();
      else $('#le').textContent = (await r.json()).error;
    };
  }

  // ---------- queue ----------
  const FILTERS = {
    today: ['Today', (h) => h.status === 'reviewing' || h.flags.needsSweep || h.flags.pendingMatches || h.flags.needsRefund],
    active: ['Active', (h) => ['reviewing', 'hunting', 'found'].includes(h.status)],
    awaiting_payment: ['Unpaid', (h) => h.status === 'awaiting_payment'],
    refunds: ['Refunds due', (h) => h.flags.needsRefund],
    done: ['Done', (h) => ['closed', 'declined', 'expired', 'cancelled'].includes(h.status)],
    all: ['All', () => true],
  };

  function statusPill(h) {
    const cls = { reviewing: 'amber', hunting: 'signal', found: 'green', closed: 'green', awaiting_payment: '', declined: '', expired: '', cancelled: '' }[h.status];
    return `<span class="pill ${cls}">${esc(h.statusLabel)}</span>`;
  }

  function todo(h) {
    const out = [];
    if (h.status === 'reviewing') out.push(`<span class="pill ${h.flags.feasibilityOverdue ? 'signal' : 'amber'}">⏱ Feasibility ${h.flags.feasibilityOverdue ? 'OVERDUE' : 'due ' + fmtT(h.flags.feasibilityDueAt)}</span>`);
    if (h.flags.needsSweep) out.push('<span class="pill ink">🔎 Sweep today</span>');
    if (h.flags.pendingMatches) out.push(`<span class="pill amber">${h.flags.pendingMatches} to review</span>`);
    if (h.flags.needsRefund) out.push('<span class="pill signal">💸 Refund due</span>');
    return out.join('');
  }

  async function renderQueue() {
    const { hunts, stats } = await api('/hunts');
    const shown = hunts.filter(FILTERS[filter][1]);
    app.innerHTML = `
      <div class="top">
        <div><a class="logo" href="/" target="_blank">ISO<span>.</span><small>Hunt desk</small></a></div>
        <div class="actions"><a class="btn sm ghost" href="/api/admin/export.csv">Export CSV</a><button class="btn sm ghost" id="logout">Sign out</button></div>
      </div>
      <div class="kpis">
        <button class="kpi ${stats.toReview ? 'hot' : ''}" data-f="today"><b>${stats.toReview}</b><span>Feasibility checks</span></button>
        <button class="kpi ${stats.toSweep ? 'hot' : ''}" data-f="today"><b>${stats.toSweep}</b><span>Hunts to sweep today</span></button>
        <button class="kpi ${stats.pendingMatches ? 'hot' : ''}" data-f="today"><b>${stats.pendingMatches}</b><span>Finds to approve</span></button>
        <button class="kpi ${stats.refundsDue ? 'hot' : ''}" data-f="refunds"><b>${stats.refundsDue}</b><span>Refunds due</span></button>
        <button class="kpi" data-f="active"><b>$${stats.net}</b><span>Net revenue · ${stats.active} active</span></button>
        <button class="kpi" data-f="done"><b>${stats.findRate == null ? '—' : stats.findRate + '%'}</b><span>Find rate (decided hunts)</span></button>
      </div>
      <div class="filters">${Object.entries(FILTERS).map(([k, [label, fn]]) => `<button data-f="${k}" class="${k === filter ? 'on' : ''}">${label} · ${hunts.filter(fn).length}</button>`).join('')}</div>
      <div class="list">${shown.length ? shown.map((h) => `
        <a class="row-h" href="#/hunt/${esc(h.id)}">
          ${h.imageUrl ? `<img class="thumb" src="${esc(h.imageUrl)}" alt="" loading="lazy" />` : '<div class="thumb">🔎</div>'}
          <div style="min-width:0">
            <div class="t">${esc(h.searchTerms || h.description || h.link || 'Photo hunt')}</div>
            <div class="meta"><span>${esc(h.id)}</span><span>${esc(h.name)}</span><span>max <b>$${h.maxPrice}</b></span><span>${h.tierDays}d · $${h.price}</span>${h.neededBy ? `<span class="pill signal">by ${fmt(h.neededBy)}</span>` : ''}${h.location ? `<span>📍 ${esc(h.location)}</span>` : ''}<span>${ago(h.createdAt)}</span></div>
          </div>
          <div class="right">${statusPill(h)}${todo(h)}${h.flags.daysLeft != null && h.status === 'hunting' ? `<span class="muted" style="font-size:13px">${h.flags.daysLeft}d left</span>` : ''}</div>
        </a>`).join('') : `<div class="card center muted">${filter === 'today' ? 'Inbox zero. Go find new hunters.' : 'Nothing here.'}</div>`}</div>
      <p class="muted" style="font-size:13px;margin-top:24px">Sources: ${Object.entries(stats.sources).map(([k, v]) => `${esc(k)} ${v}`).join(' · ') || '—'}</p>`;
    $$('[data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f; renderQueue(); }));
    $('#logout').onclick = async () => { await api('/logout', { method: 'POST' }); renderLogin(); };
  }

  // ---------- detail ----------
  async function renderHunt(id) {
    const d = await api('/hunts/' + encodeURIComponent(id));
    const h = d.hunt;
    const act = (action, label, cls = 'ghost', extra = '') => `<button class="btn sm ${cls}" data-act="${action}" ${extra}>${label}</button>`;
    const actions = [];
    if (h.status === 'awaiting_payment') actions.push(act('markPaid', 'Mark paid', ''), act('decline', 'Decline'), act('cancel', 'Cancel'));
    if (h.status === 'reviewing') actions.push(act('approve', '✓ Findable — start the clock', 'green'), act('decline', '✕ Unfindable — decline'));
    if (h.status === 'hunting') actions.push(act('markSwept', h.flags.sweptToday ? '✓ Swept today' : 'Mark swept today', h.flags.sweptToday ? 'ghost' : ''), act('extend', '+7 days'), act('cancel', 'Cancel'));
    if (h.status === 'found') actions.push(act('close', '🎉 They bought it — close', 'green'), act('resume', 'Fell through — resume'), act('extend', '+7 days'));
    if (h.status === 'expired') actions.push(act('resume', 'Reopen +7 days'));
    if (h.paidAt && !h.refundedAt && ['declined', 'expired', 'cancelled'].includes(h.status)) actions.push(act('markRefunded', '💸 Mark refunded in Stripe', 'signal'));

    app.innerHTML = `
      <div class="top">
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><a class="btn sm ghost" href="#/">← Queue</a><h1>${esc(h.id)}</h1>${statusPill(h)}${todo(h)}</div>
        <div class="actions"><button class="btn sm ghost" id="copyStatus">Copy customer link</button>${d.payUrl ? '<button class="btn sm ghost" id="copyPay">Copy pay link</button>' : ''}</div>
      </div>
      ${h.flags.needsRefund ? `<div class="hl">💸 <b>Refund due.</b> Stripe → Payments → find ${esc(h.email || h.name)} ($${h.price}) → Refund. Then hit "Mark refunded" and send the refund message below.</div>` : ''}
      <div class="card" style="margin-bottom:16px"><div class="actions">${actions.join('') || '<span class="muted">No actions — hunt is finished.</span>'}</div></div>
      <div class="detail">
        <div class="stack">
          <div class="card brief">
            <h3>Brief <span class="muted" style="font:400 14px var(--sans)">${fmtT(h.createdAt)}</span></h3>
            ${h.imageUrl ? `<a href="${esc(h.imageUrl)}" target="_blank"><img src="${esc(h.imageUrl)}" alt="Reference photo" /></a>` : ''}
            ${h.description ? `<p style="margin:0;white-space:pre-wrap">${esc(h.description)}</p>` : ''}
            <dl class="kv">
              ${h.link ? `<dt>Link</dt><dd><a href="${esc(h.link)}" target="_blank" rel="noopener">${esc(h.link)}</a></dd>` : ''}
              <dt>Max price</dt><dd><b>$${h.maxPrice}</b> <button class="btn xs ghost" id="editBudget">edit</button></dd>
              <dt>Condition</dt><dd>${esc({ any: 'Any', good: 'Good+', like_new: 'Like new', new: 'New only' }[h.condition] || 'Any')}</dd>
              <dt>Location</dt><dd>${esc(h.location || '—')} ${h.shippingOk ? '· shipping OK' : '· local only'}</dd>
              ${h.neededBy ? `<dt>Needed by</dt><dd><b>${fmt(h.neededBy)}</b></dd>` : ''}
              <dt>Customer</dt><dd>${esc(h.name)} · <a href="https://wa.me/${esc(h.phoneRaw)}" target="_blank">${esc(h.phone)}</a>${h.email ? ` · ${esc(h.email)}` : ''}</dd>
              <dt>Hunt</dt><dd>${h.tierDays} days · $${h.price}${h.huntEndsAt ? ` · ends ${fmt(h.huntEndsAt)} (${h.flags.daysLeft}d left)` : ''}</dd>
              <dt>Source</dt><dd>${esc(h.referredBy ? 'Referred by ' + h.referredBy : h.source || '—')}${h.utm ? ` · ${esc(h.utm)}` : ''}</dd>
            </dl>
          </div>

          <div class="card">
            <h3>Sweep kit <span class="muted" style="font:400 13px var(--sans)">${h.sweeps} sweeps${h.lastSweptAt ? ' · last ' + fmtT(h.lastSweptAt) : ''}</span></h3>
            <div class="inline" style="margin-bottom:12px">
              <input class="input" id="terms" placeholder="${esc(d.query || 'Search terms')}" value="${esc(h.searchTerms || '')}" />
              <button class="btn sm" id="saveTerms">Save</button>
            </div>
            <div class="links">${d.searchLinks.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener" class="${visited.has(l.url) ? 'visited' : ''}">${esc(l.name)}</a>`).join('')}</div>
            <p class="muted" style="font-size:13px;margin:10px 0 0">Tip: refine the search terms (brand + model + size), then work left to right. Anything over $${h.maxPrice} can't be added.</p>
          </div>

          <div class="card">
            <h3>Add a find</h3>
            <form id="mf">
              <div class="field"><input class="input" name="url" placeholder="Listing URL" required /></div>
              <div class="row">
                <div class="field"><input class="input" name="title" placeholder="Title (e.g. Vitamix 5200, barely used)" /></div>
                <div class="field"><div class="prefix"><span>$</span><input class="input" name="price" inputmode="decimal" placeholder="Price (max ${h.maxPrice})" required /></div></div>
              </div>
              <div class="field"><input class="input" name="note" placeholder="Note for the customer (optional): '3 miles away, seller says pickup this weekend'" /></div>
              <button class="btn sm">Add to shortlist</button>
            </form>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <h3>Shortlist</h3>
            ${h.matches.length ? h.matches.slice().reverse().map((m) => `
              <div class="m ${m.status}">
                <div style="display:flex;justify-content:space-between;gap:8px"><a href="${esc(m.url)}" target="_blank" rel="noopener"><b>${esc(m.title)}</b></a><span class="pill ${m.status === 'approved' ? 'green' : m.status === 'pending' ? 'amber' : ''}">${m.status}</span></div>
                <div class="muted" style="font-size:14px">$${m.price} · ${esc(m.source)} · ${fmtT(m.createdAt)}</div>
                ${m.note ? `<div style="font-size:14px;margin-top:4px">${esc(m.note)}</div>` : ''}
                <div class="actions" style="margin-top:8px">
                  ${m.status === 'pending' ? `<button class="btn xs green" data-m="${m.id}" data-s="approved">Approve & WhatsApp</button><button class="btn xs ghost" data-m="${m.id}" data-s="rejected">Reject</button>` : ''}
                  ${m.status === 'approved' ? `<button class="btn xs ghost" data-m="${m.id}" data-s="gone">Listing gone</button>` : ''}
                </div>
              </div>`).join('') : '<p class="muted" style="margin:0">No finds yet. Run the sweep kit →</p>'}
          </div>

          <div class="card">
            <h3>WhatsApp drafts</h3>
            ${d.drafts.length ? d.drafts.map((x) => `
              <div class="draft" id="draft-${esc(x.key)}">
                <b>${esc(x.label)}</b>
                <pre>${esc(x.text)}</pre>
                <div class="actions"><a class="btn xs wa" href="${esc(x.waUrl)}" target="_blank" rel="noopener">Open in WhatsApp</a><button class="btn xs ghost" data-copy="${esc(x.key)}">Copy</button></div>
              </div>`).join('') : '<p class="muted" style="margin:0">Nothing to send right now.</p>'}
          </div>

          <div class="card">
            <h3>Notes <span class="muted" style="font:400 13px var(--sans)">private</span></h3>
            <textarea class="input" id="notes" placeholder="Seller convos, sizing notes, near-misses…">${esc(h.notes || '')}</textarea>
            <button class="btn sm" id="saveNotes" style="margin-top:8px">Save notes</button>
          </div>

          ${['found', 'closed'].includes(h.status) ? `
          <div class="card">
            <h3>Found wall</h3>
            <div class="field"><input class="input" id="blurb" maxlength="200" placeholder="e.g. A Vitamix for a wedding shower — found in 2 days, $40 under budget" value="${esc(h.winBlurb)}" /></div>
            <label class="check"><input type="checkbox" id="featured" ${h.featured ? 'checked' : ''} /> Show on the public found wall (anonymous)</label>
            ${h.imageUrl ? `<label class="check" style="margin-top:6px"><input type="checkbox" id="featureImage" ${h.featureImage ? 'checked' : ''} /> Include their photo (ask them first!)</label>` : ''}
            <button class="btn sm" id="saveWall" style="margin-top:10px">Save</button>
          </div>` : ''}

          <div class="card"><h3>Log</h3><div class="log">${h.log.slice().reverse().map((l) => `<div><span class="muted">${fmtT(l.at)}</span> — ${esc(l.text)}</div>`).join('')}</div></div>
        </div>
      </div>`;

    const reload = () => renderHunt(id);
    $('#copyStatus').onclick = () => copy(d.statusUrl);
    if ($('#copyPay')) $('#copyPay').onclick = () => copy(d.payUrl);
    $$('[data-act]').forEach((b) => (b.onclick = async () => {
      const body = { action: b.dataset.act };
      if (body.action === 'decline') {
        const reason = prompt('Why is it unfindable? (goes in the customer message)', 'this one almost never comes up secondhand');
        if (reason === null) return;
        body.reason = reason;
      }
      if (body.action === 'cancel' && !confirm('Cancel this hunt?')) return;
      try { await api(`/hunts/${id}/action`, { method: 'POST', body }); toast('Done ✓'); reload(); } catch (e) { if (e.message !== 'auth') toast(e.message); }
    }));
    $('#editBudget').onclick = async () => {
      const v = prompt('New max price ($)', h.maxPrice);
      if (!v) return;
      await api('/hunts/' + id, { method: 'PATCH', body: { maxPrice: Number(v) } });
      reload();
    };
    $('#saveTerms').onclick = async () => { await api('/hunts/' + id, { method: 'PATCH', body: { searchTerms: $('#terms').value } }); toast('Saved'); reload(); };
    $('#terms').onkeydown = (e) => { if (e.key === 'Enter') $('#saveTerms').click(); };
    $$('.links a').forEach((a) => a.addEventListener('click', () => { visited.add(a.href); a.classList.add('visited'); }));
    $('#saveNotes').onclick = async () => { await api('/hunts/' + id, { method: 'PATCH', body: { notes: $('#notes').value } }); toast('Saved'); };
    if ($('#saveWall')) $('#saveWall').onclick = async () => {
      await api('/hunts/' + id, { method: 'PATCH', body: { winBlurb: $('#blurb').value, featured: $('#featured').checked, featureImage: $('#featureImage')?.checked || false } });
      toast('Saved');
    };
    $('#mf').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api(`/hunts/${id}/matches`, { method: 'POST', body: { url: f.url.value, title: f.title.value, price: f.price.value, note: f.note.value } });
        toast('Added to shortlist');
        reload();
      } catch (err) { if (err.message !== 'auth') toast(err.message); }
    };
    $$('[data-m]').forEach((b) => (b.onclick = async () => {
      try {
        await api(`/hunts/${id}/matches/${b.dataset.m}`, { method: 'PATCH', body: { status: b.dataset.s } });
        if (b.dataset.s === 'approved') {
          await renderHunt(id);
          const draft = $(`#draft-found-${b.dataset.m} a.wa`);
          if (draft) { draft.scrollIntoView({ behavior: 'smooth', block: 'center' }); window.open(draft.href, '_blank'); }
          return;
        }
        reload();
      } catch (e) { if (e.message !== 'auth') toast(e.message); }
    }));
    $$('[data-copy]').forEach((b) => (b.onclick = () => copy(d.drafts.find((x) => x.key === b.dataset.copy).text)));
  }

  function route() {
    const m = location.hash.match(/^#\/hunt\/(ISO-[A-Z0-9]+)/);
    (m ? renderHunt(m[1]) : renderQueue()).catch((e) => { if (e.message !== 'auth') app.innerHTML = `<div class="card">${esc(e.message)}</div>`; });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();
