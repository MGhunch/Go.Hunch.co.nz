/* ============================================================================
   SET UP — the prep drawer on the cookied front door.
   Choose a loaded pack, or upload a new one onto the volume. Prep before you
   pick DRIVING or SHOWING and walk in. Closes back to the three buttons.
   ========================================================================== */
(function () {
  const modal = document.getElementById('setup');
  const shelf = document.getElementById('shelf');
  const msg = document.getElementById('up-msg');
  let decks = [], live = null, online = true;

  document.getElementById('setup-btn').onclick = () => { modal.hidden = false; refresh(); };
  document.getElementById('setup-close').onclick = () => { modal.hidden = true; };
  modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });

  async function refresh() {
    try {
      decks = await (await fetch('/decks')).json();
      live = (await (await fetch('/state')).json()).live_job;
    } catch (_) { decks = decks || []; }
    shelf.innerHTML = '';
    if (!decks.length) { shelf.innerHTML = '<div class="empty">Nothing loaded yet.</div>'; return; }
    decks.forEach(d => {
      const b = document.createElement('button');
      b.className = 'deck-btn' + (d.id === live ? ' on' : '');
      b.innerHTML = (d.client || d.title) +
        '<small>' + [d.job, d.title, d.pages + ' pages'].filter(Boolean).join(' · ') + '</small>' +
        (d.id === live ? '<span class="tag">LOADED</span>' : '');
      b.onclick = async () => {
        await fetch('/control/push', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job: d.id })
        }).catch(() => {});
        live = d.id; refresh();
      };
      shelf.appendChild(b);
    });
  }

  // file label reflects the chosen file
  const pdf = document.getElementById('pdf');
  const filelabel = document.getElementById('filelabel');
  pdf.onchange = () => {
    const f = pdf.files[0];
    filelabel.firstChild.textContent = f ? f.name : 'CHOOSE PDF';
  };

  function say(text, bad) { msg.textContent = text; msg.className = 'up-msg' + (bad ? ' bad' : ' ok'); }

  document.getElementById('up-go').onclick = async () => {
    const f = pdf.files[0];
    if (!f) { say('Choose a PDF first.', true); return; }
    if (!online) { say('Sorry — not connected.', true); return; }   // wire's down: no upload
    const fd = new FormData();
    fd.append('pdf', f);
    fd.append('client', document.getElementById('up-client').value);
    fd.append('job', document.getElementById('up-job').value);
    fd.append('title', document.getElementById('up-title').value);
    say('Uploading…');
    try {
      const r = await fetch('/upload', { method: 'POST', body: fd });
      if (!r.ok) { const e = await r.json().catch(() => ({})); say(e.message || 'Upload failed.', true); return; }
      const { deck } = await r.json();
      say('Loaded ' + (deck.client || deck.title) + '.');
      pdf.value = ''; filelabel.firstChild.textContent = 'CHOOSE PDF';
      ['up-client', 'up-job', 'up-title'].forEach(id => document.getElementById(id).value = '');
      refresh();
    } catch (_) { say('Sorry — not connected.', true); }   // fetch threw: treat as offline
  };

  // connectivity: gates upload and colours the message. Upload only works live.
  async function ping() {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 2000);
      const r = await fetch('/health', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t); online = r.ok;
    } catch (_) { online = false; }
  }
  ping(); setInterval(ping, 3000);
})();
