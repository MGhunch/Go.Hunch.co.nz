/* ============================================================================
   PHONE — the presenter remote (/drive on a handheld).
   The cookie says "driver"; a narrow screen says "remote". So the phone gets
   THIS instead of present-here: it drives the ROOM through the server, and the
   pane above the controller is a swappable slot (next / current+next / eyes-up).
   It never presents on the phone itself — the room's SHOWING screen does that.

   One truth still holds: the chevrons drive the live show, the room follows the
   server, and this remote follows the server too (via /events). Local previews
   are rendered from the PDF that's already in the browser.
   ========================================================================== */
(function () {
  // Laptop? Stand down — drive.js runs the wide present-here surface instead.
  if (!(window.matchMedia && matchMedia('(max-width: 820px)').matches)) return;

  const $ = id => document.getElementById(id);
  const phone = $('phone');
  if (!phone) return;
  document.body.setAttribute('data-phone', '1');

  const shelfEl = $('ph-shelf');
  const stage   = $('ph-stage');
  const labelEl = $('ph-label');
  const paneEl  = $('ph-pane');
  const curCv   = $('ph-cur-cv');
  const nextCv  = $('ph-next-cv');
  const pgEl    = $('ph-pg');
  const clockEl = $('ph-clock');
  const pipEl   = $('ph-pip');
  const lozEl   = $('ph-loz');
  const modal   = $('ph-modal');

  let pdfDoc = null, curJob = null, numPages = 1, livePage = 1;
  let decksCache = [], curLabel = '';
  const VIEWS = ['next', 'both', 'none'];          // default: next
  let view = 'next';

  // ---- PDF (loaded once; previews render straight from it) ----------------
  async function ensureDeck(job) {
    if (job === curJob && pdfDoc) return;
    curJob = job; pdfDoc = null;
    pdfDoc = await pdfjsLib.getDocument('/deck/' + job + '/pdf').promise;
    numPages = pdfDoc.numPages;
  }
  const busy = {};
  async function renderTo(cv, n) {
    if (!pdfDoc || !cv) return;
    if (n < 1 || n > numPages) { cv.width = cv.width; return; }   // clear (past the ends)
    if (busy[cv.id]) { busy[cv.id] = n; return; }
    busy[cv.id] = true;
    try {
      const page = await pdfDoc.getPage(n);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const base = page.getViewport({ scale: 1 });
      const w = cv.clientWidth || paneEl.clientWidth || 300;
      const vp = page.getViewport({ scale: (w / base.width) * dpr });
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      cv.style.height = (vp.height / dpr) + 'px';
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    } catch (e) { /* keep the last good frame */ }
    const again = busy[cv.id]; busy[cv.id] = false;
    if (typeof again === 'number') renderTo(cv, again);
  }

  function paintPane() {
    paneEl.setAttribute('data-view', view);
    if (view === 'both') renderTo(curCv, livePage);
    if (view === 'both' || view === 'next') renderTo(nextCv, livePage + 1);
  }
  function paintLabel() { labelEl.textContent = curLabel + '  ·  ' + view; }

  function setLive(page) {
    livePage = Math.max(1, Math.min(page, numPages));
    pgEl.textContent = livePage + ' / ' + numPages;
    paintPane();
  }

  // ---- driving the room (through the server; pane updates optimistically) --
  function post(url, obj) {
    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: obj ? JSON.stringify(obj) : '{}'
    }).catch(() => {});
  }
  function drive(dir) {
    const np = Math.max(1, Math.min(livePage + dir, numPages));
    if (np === livePage) return;
    setLive(np);                                   // instant on the remote
    post('/control/' + (dir > 0 ? 'next' : 'back'));
  }

  // ---- shelf → push a deck live → drive it -------------------------------
  async function loadShelf() {
    try { decksCache = await (await fetch('/decks')).json(); } catch (_) { decksCache = decksCache || []; }
    shelfEl.innerHTML = '';
    if (!decksCache.length) {
      shelfEl.innerHTML = '<div class="ph-empty">Nothing loaded yet — add one in SET UP.</div>';
      return;
    }
    decksCache.forEach(d => {
      const b = document.createElement('button');
      b.className = 'ph-deck';
      b.innerHTML = (d.client || d.title) +
        '<small>' + [d.job, d.title, d.pages + ' pages'].filter(Boolean).join(' · ') + '</small>';
      b.onclick = () => pick(d.id);
      shelfEl.appendChild(b);
    });
  }
  function deckLabel(job) {
    const d = decksCache.find(x => x.id === job);
    return (d ? (d.client || d.title || job) : job).toString().toUpperCase();
  }
  async function pick(job) {
    await post('/control/push', { job });
    await ensureDeck(job);
    curLabel = deckLabel(job); paintLabel();
    resetClock(); startClock();
    showStage(); setLive(1);
  }

  function showStage() { shelfEl.hidden = true; stage.hidden = false; }
  function showShelf() { stage.hidden = true; shelfEl.hidden = false; }

  // ---- follow the one truth ----------------------------------------------
  let beat = Date.now();
  function connect() {
    const es = new EventSource('/events');
    es.addEventListener('ping', () => { beat = Date.now(); });
    es.onmessage = async e => {
      beat = Date.now();
      let s; try { s = JSON.parse(e.data); } catch (_) { return; }
      if (s.live_job) {
        await ensureDeck(s.live_job);
        if (stage.hidden) {                        // first time we see a live deck
          curLabel = deckLabel(s.live_job); paintLabel();
          showStage(); if (!clockH) { resetClock(); startClock(); }
        }
        setLive(s.page);
      } else {
        showShelf(); stopClock();
      }
    };
    es.onerror = () => { /* browser auto-reconnects; pip goes red via /health */ };
  }

  // ---- controller wiring --------------------------------------------------
  $('ph-back').onclick = () => drive(-1);
  $('ph-fwd').onclick  = () => drive(+1);
  $('ph-again').onclick = () => { setLive(1); post('/control/goto', { page: 1 }); };
  $('ph-pick').onclick  = () => { showShelf(); loadShelf(); };
  $('ph-end').onclick   = () => { post('/control/end'); stopClock(); showShelf(); loadShelf(); };

  // pane view lives on the label — leaves the pane clear for flick (2.0)
  labelEl.onclick = () => { view = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]; paintLabel(); paintPane(); };

  window.addEventListener('resize', () => { if (!stage.hidden) paintPane(); });

  // ---- clock: timer / countdown / time -----------------------------------
  let clockMode = 'timer', countdownMs = 20 * 60 * 1000, t0 = null, clockH = null;
  const two = n => String(n).padStart(2, '0');
  function fmt(ms) { if (ms < 0) ms = 0; const s = Math.round(ms / 1000); return two(Math.floor(s / 60)) + ':' + two(s % 60); }
  function wall() { const d = new Date(); let h = d.getHours(); const ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12; return h + ':' + two(d.getMinutes()) + ' ' + ap; }
  function tick() {
    if (clockMode === 'time') { clockEl.textContent = wall(); lozEl.classList.remove('warn'); return; }
    const el = t0 ? (Date.now() - t0) : 0;
    if (clockMode === 'countdown') { const rem = countdownMs - el; clockEl.textContent = fmt(rem); lozEl.classList.toggle('warn', rem <= 60000); }
    else { clockEl.textContent = fmt(el); lozEl.classList.remove('warn'); }
  }
  function startClock() { if (clockH) return; if (!t0) t0 = Date.now(); tick(); clockH = setInterval(tick, 500); }
  function stopClock() { clearInterval(clockH); clockH = null; }
  function resetClock() { stopClock(); t0 = null; lozEl.classList.remove('warn'); tick(); }

  function syncModal() {
    modal.setAttribute('data-mode', clockMode);
    modal.querySelectorAll('.ph-mode').forEach(m => m.classList.toggle('on', m.dataset.mode === clockMode));
    $('ph-dur').textContent = fmt(countdownMs);
    $('ph-now').textContent = wall();
  }
  function openClock() { syncModal(); modal.hidden = false; }
  $('ph-clockbtn').onclick = openClock;
  $('ph-timewrap').onclick = openClock;              // tapping the time works too
  modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
  modal.querySelectorAll('.ph-mode').forEach(m => {
    m.onclick = () => {
      clockMode = m.dataset.mode;
      if (clockMode !== 'time' && !clockH) startClock();
      syncModal(); tick();
    };
  });
  $('ph-dur-min').onclick  = () => { countdownMs = Math.max(60000, countdownMs - 60000); syncModal(); tick(); };
  $('ph-dur-plus').onclick = () => { countdownMs = Math.min(180 * 60000, countdownMs + 60000); syncModal(); tick(); };

  // ---- wire pip (green = the room can hear us) ----------------------------
  async function ping() {
    let ok = false;
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 2000);
      const r = await fetch('/health', { signal: c.signal, cache: 'no-store' }); clearTimeout(t); ok = r.ok;
    } catch (_) { ok = false; }
    pipEl.classList.toggle('live', ok); pipEl.classList.toggle('down', !ok);
  }

  // ---- boot ---------------------------------------------------------------
  loadShelf();
  connect();
  ping(); setInterval(ping, 3000);
})();
