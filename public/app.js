(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  // Referral + campaign capture (?ref=ISO-XXXXX, ?utm_source=…)
  const params = new URLSearchParams(location.search);
  if (params.get('ref')) store.set('iso_ref', params.get('ref'));
  const utm = ['utm_source', 'utm_medium', 'utm_campaign'].map((k) => params.get(k)).filter(Boolean).join('/');
  if (utm) store.set('iso_utm', utm);

  // Ticker — real kinds of ISO posts we see every day.
  const isos = [
    'Vitamix under $150 before a wedding shower',
    'Crutches, this week — sprained my ankle',
    'Peloton shoes size 42',
    'Road bike 54cm for a triathlon course starting Monday',
    'West Elm mid-century dresser, walnut',
    "Sony A7 III body under $1,000",
    'Kids snowboard boots size 3',
    'KitchenAid stand mixer, any colour but red',
    'Herman Miller Aeron size B',
    'Graduation dress, sage green, size 6',
    'Nintendo Switch OLED + 2 controllers',
    'Standing desk 60" for a home office',
    'Discontinued IKEA Stockholm rug',
    'Dyson V11, working battery',
  ];
  const track = $('#ticker');
  if (track) track.innerHTML = [...isos, ...isos].map((t) => `<span>${esc(t)}</span>`).join('');

  let config = { tiers: [] };
  fetch('/api/config').then((r) => r.json()).then((c) => {
    config = c;
    renderTiers();
    renderFooter();
  });

  function renderTiers() {
    $('#tiers').innerHTML = config.tiers.map((t) => `
      <div class="tier ${t.popular ? 'popular' : ''}">
        ${t.popular ? '<span class="badge">Most popular</span>' : ''}
        <h3>${esc(t.name)}</h3>
        <div class="days">${t.days}-DAY HUNT</div>
        <div class="price">$${t.price}</div>
        <div class="perday">$${t.perDay.toFixed(2)}/day · checked daily</div>
        <p>${esc(t.blurb)}</p>
        <a class="btn ${t.popular ? 'signal' : 'ghost'} block" href="#start" data-choose="${t.days}">Hunt for ${t.days} days</a>
      </div>`).join('');
    $('#tierPick').innerHTML = config.tiers.map((t) => `
      <label>
        <input type="radio" name="tier" value="${t.days}" ${t.popular ? 'checked' : ''} />
        <span class="t">${t.days} days</span>
        <b>$${t.price}</b>
        <small>$${t.perDay.toFixed(2)}/day${t.popular ? ' · popular' : ''}</small>
      </label>`).join('');
    $$('[data-choose]').forEach((a) => a.addEventListener('click', () => {
      const r = $(`#tierPick input[value="${a.dataset.choose}"]`);
      if (r) r.checked = true;
    }));
  }

  function renderFooter() {
    const links = [];
    if (config.instagram) links.push(`<a href="https://instagram.com/${esc(config.instagram.replace('@', ''))}" target="_blank" rel="noopener">Instagram</a>`);
    if (config.tiktok) links.push(`<a href="https://tiktok.com/@${esc(config.tiktok.replace('@', ''))}" target="_blank" rel="noopener">TikTok</a>`);
    if (config.contactWhatsapp) links.push(`<a href="https://wa.me/${esc(config.contactWhatsapp)}" target="_blank" rel="noopener">WhatsApp us</a>`);
    if (config.contactEmail) links.push(`<a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>`);
    links.push('<a href="/terms">Hunt terms</a>');
    $('#footerLinks').innerHTML = links.join(' · ');
  }

  // Found wall
  fetch('/api/wins').then((r) => r.json()).then(({ wins }) => {
    if (!wins || !wins.length) return;
    $('#wins-section').hidden = false;
    $('#wins').innerHTML = wins.map((w) => `
      <div class="win">
        ${w.imageUrl ? `<img src="${esc(w.imageUrl)}" alt="" loading="lazy" />` : ''}
        <span class="stamp">FOUND${w.days ? ` IN ${w.days} DAY${w.days > 1 ? 'S' : ''}` : ''}</span>
        <p>${esc(w.blurb)}</p>
        <small>${w.price != null ? `$${w.price} (budget $${w.budget})` : ''}${w.source ? ` · ${esc(w.source)}` : ''}</small>
      </div>`).join('');
  }).catch(() => {});

  // ---------- form ----------
  const form = $('#huntForm');
  if (!form) return;
  let imageData = null;

  $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
    if (b.dataset.tab === 'photo' && !imageData) $('#file').click();
  }));

  function updateTicks() {
    const done = { describe: form.description.value.trim(), photo: imageData, link: form.link.value.trim() };
    $$('.tabs button').forEach((b) => ($('.tick', b).textContent = done[b.dataset.tab] ? '✓' : ''));
  }
  form.description.addEventListener('input', updateTicks);
  form.link.addEventListener('input', updateTicks);

  const drop = $('#drop');
  const file = $('#file');
  drop.addEventListener('click', () => file.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) loadImage(e.dataTransfer.files[0]); });
  file.addEventListener('change', () => file.files[0] && loadImage(file.files[0]));
  document.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f) { loadImage(f); $('[data-tab="photo"]').click(); }
  });

  // Downscale client-side so uploads are fast on mobile data and small in the DB.
  function loadImage(f) {
    if (!f.type.startsWith('image/')) return toast('That file is not an image.');
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const max = 1400;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      imageData = c.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(url);
      $('#dropInner').innerHTML = `<img src="${imageData}" alt="Your photo" /><span class="muted">Tap to change photo</span>`;
      updateTicks();
    };
    img.onerror = () => toast("Couldn't read that image — try a JPG or PNG screenshot.");
    img.src = url;
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function showErrors(errors) {
    $$('.field', form).forEach((f) => f.classList.remove('bad'));
    let first = null;
    for (const [k, msg] of Object.entries(errors)) {
      const key = k === 'image' || k === 'link' ? 'description' : k;
      const f = $(`[data-field="${key}"]`, form);
      if (!f) continue;
      f.classList.add('bad');
      $('.err', f).textContent = msg;
      first = first || f;
    }
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#submitBtn');
    const body = {
      description: form.description.value,
      link: form.link.value,
      image: imageData,
      maxPrice: form.maxPrice.value,
      condition: form.condition.value,
      location: form.location.value,
      shippingOk: form.shippingOk.checked,
      neededBy: form.neededBy.value,
      tier: (form.querySelector('input[name="tier"]:checked') || {}).value,
      name: form.name.value,
      phone: form.phone.value,
      email: form.email.value,
      source: form.source.value,
      agree: form.agree.checked,
      website: form.website.value,
      ref: store.get('iso_ref') || '',
      utm: store.get('iso_utm') || '',
    };
    btn.disabled = true;
    btn.textContent = 'Saving your hunt…';
    try {
      const r = await fetch('/api/hunts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) {
        if (data.errors) showErrors(data.errors);
        else toast(data.error || 'Something went wrong.');
        return;
      }
      store.set('iso_last_hunt', data.token);
      if (typeof window.plausible === 'function') window.plausible('Hunt submitted', { props: { tier: body.tier } });
      location.href = data.payUrl || data.statusUrl;
    } catch {
      toast('Network hiccup — please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Continue to payment →';
    }
  });
})();
