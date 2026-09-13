/* ============================================================================
   DRIVING — this machine runs the show.
   Pick a pack; it presents right here. Space / arrows / click / the on-screen
   back+forward turn the page LOCALLY-FIRST (instant, PDF's already in the
   browser) then tell the server so it persists and any SHOWING screen follows.
   The controller floats over the deck in the Hunch language and auto-hides.
   ========================================================================== */
(function () {
  // Narrow screen? phone.js runs the presenter remote — present-here stands down.
  if (window.matchMedia && matchMedia('(max-width: 820px)').matches) return;
  const body = document.body;
  const shelf = document.getElementById('shelf');
  const deckCanvas = document.getElementById('deck-canvas');
  const ctx = deckCanvas.getContext('2d');
  const ctrl = document.getElementById('ctrl');
  const pageEl = document.getElementById('c-page');
  const timerEl = document.getElementById('c-timer');
  const pip = document.getElementById('c-pip');

  let decks = [], pdfDoc = null, curJob = null, curPage = 1, numPages = 1;
  let rendering = false, pending = null;

  // ---- local PDF render ----
  async function loadDeck(job) {
    if (job === curJob && pdfDoc) return;
    curJob = job; pdfDoc = null;
    pdfDoc = await pdfjsLib.getDocument('/deck/' + job + '/pdf').promise;
    numPages = pdfDoc.numPages;
  }
  async function renderPage(n) {
    if (!pdfDoc) return;
    if (rendering) { pending = n; return; }
    rendering = true;
    try {
      const page = await pdfDoc.getPage(Math.max(1, Math.min(n, numPages)));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const base = page.getViewport({ scale: 1 });
      const fit = Math.min(window.innerWidth / base.width, window.innerHeight / base.height);
      const vp = page.getViewport({ scale: fit * dpr });
      deckCanvas.width = Math.round(vp.width);
      deckCanvas.height = Math.round(vp.height);
      deckCanvas.style.width = (vp.width / dpr) + 'px';
      deckCanvas.style.height = (vp.height / dpr) + 'px';
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    } catch (e) { /* keep the last good frame */ }
    rendering = false;
    if (pending !== null) { const p = pending; pending = null; renderPage(p); }
  }
  function readout() { pageEl.textContent = curPage + ' / ' + numPages; }

  // ---- present a deck on this machine ----
  async function present(job, page) {
    await loadDeck(job);
    curPage = Math.max(1, Math.min(page || 1, numPages));
    body.classList.add('presenting');
    renderPage(curPage); readout(); nudge();
  }

  // ---- the turn: move here NOW, tell the server after ----
  function goTo(page) {
    const np = Math.max(1, Math.min(page, numPages));
    if (np === curPage) return;
    curPage = np; renderPage(curPage); readout();
    fetch('/control/goto', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: curPage })
    }).catch(() => {});
  }
  function turn(d) { if (body.classList.contains('presenting') && pdfDoc) goTo(curPage + d); }

  // ---- pick a deck from the shelf → push live → present here ----
  async function pickDeck(job) {
    await fetch('/control/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job })
    }).catch(() => {});
    resetTimer(); startTimer();
    present(job, 1);
  }

  async function loadShelf() {
    decks = await (await fetch('/decks')).json();
    shelf.innerHTML = '';
    decks.forEach(d => {
      const b = document.createElement('button');
      b.className = 'deck-btn';
      b.innerHTML = (d.client || d.title) +
        '<small>' + [d.job, d.title, d.pages + ' pages'].filter(Boolean).join(' · ') + '</small>';
      b.onclick = () => pickDeck(d.id);
      shelf.appendChild(b);
    });
  }

  async function boot() {
    await loadShelf();
    try {
      const s = await (await fetch('/state')).json();
      const d = decks.find(x => x.id === s.live_job);
      if (d) { numPages = d.pages; present(s.live_job, s.page); }
    } catch (_) {}
  }
  boot();

  // ---- controller actions ----
  document.getElementById('c-back').onclick = () => turn(-1);
  document.getElementById('c-fwd').onclick  = () => turn(+1);
  document.getElementById('c-again').onclick = () => goTo(1);                 // start again
  document.getElementById('c-pick').onclick = () => {                          // pick a new talk
    body.classList.remove('presenting'); stopTimer();
  };
  document.getElementById('c-end').onclick = () => {                           // end → dark
    fetch('/control/end', { method: 'POST' }).catch(() => {});
    body.classList.remove('presenting'); resetTimer();
  };
  document.getElementById('c-hide').onclick = () => ctrl.classList.remove('show');  // tuck controls away

  // keyboard + tap drive too
  window.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') { turn(+1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { turn(-1); e.preventDefault(); }
  });
  document.getElementById('tapnav').addEventListener('click', e => {
    turn((e.clientX / window.innerWidth) > 0.5 ? +1 : -1);
  });
  window.addEventListener('resize', () => { if (body.classList.contains('presenting')) renderPage(curPage); });

  // ---- full screen (timer auto-starts on entering full screen) ----
  const el = document.documentElement;
  const fsOn = () => document.fullscreenElement || document.webkitFullscreenElement || false;
  document.getElementById('c-full').onclick = () => {
    if (fsOn()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    else { const r = el.requestFullscreen || el.webkitRequestFullscreen; if (r) r.call(el).catch(() => {}); }
  };
  function onFs() { if (fsOn() && body.classList.contains('presenting')) startTimer(); nudge(); }
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);

  // ---- elapsed timer (counts up; count-down toggle is a later SET UP option) ----
  let t0 = null, tHandle = null;
  function fmt(ms) { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function startTimer() { if (tHandle) return; if (!t0) t0 = Date.now(); tHandle = setInterval(() => timerEl.textContent = fmt(Date.now() - t0), 500); }
  function stopTimer() { clearInterval(tHandle); tHandle = null; }
  function resetTimer() { stopTimer(); t0 = null; timerEl.textContent = '00:00'; }

  // ---- auto-hide: show on any activity, tuck away after a pause ----
  let hideT;
  function nudge() {
    ctrl.classList.add('show'); clearTimeout(hideT);
    hideT = setTimeout(() => ctrl.classList.remove('show'), 2600);
  }
  ['mousemove', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, nudge, { passive: true }));

  // ---- wire pip: green = this machine reaches the server (SHOWING screens follow) ----
  async function ping() {
    let ok = false;
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 2000);
      const r = await fetch('/health', { signal: c.signal, cache: 'no-store' }); clearTimeout(t); ok = r.ok;
    } catch (_) { ok = false; }
    pip.classList.toggle('live', ok); pip.classList.toggle('down', !ok);
  }
  ping(); setInterval(ping, 3000);
})();
