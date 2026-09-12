/* ============================================================================
   DRIVING — this machine runs the show.
   Pick a pack; it goes live and renders right here. Space / arrows / click
   turn the page LOCALLY-FIRST — instant, because the PDF's already in this
   browser — then tell the server, so it persists and any SHOWING screen
   follows. Works with no wifi at all once the deck's loaded (cable to a TV,
   dead room): local drives, the wire's a passenger.
   ========================================================================== */
(function () {
  const body = document.body;
  const pick = document.getElementById('pick');
  const shelf = document.getElementById('shelf');
  const deckCanvas = document.getElementById('deck-canvas');
  const ctx = deckCanvas.getContext('2d');
  const strip = document.getElementById('strip');
  const pageread = document.getElementById('pageread');
  const saveEl = document.getElementById('save');

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

  function readout() {
    pageread.textContent = 'PAGE ' + curPage + ' / ' + numPages;
    if (curJob) saveEl.href = '/deck/' + curJob + '/pdf?download=1';
  }

  // ---- present a deck on this machine ----
  async function present(job, page) {
    await loadDeck(job);
    curPage = Math.max(1, Math.min(page || 1, numPages));
    body.classList.add('presenting');
    renderPage(curPage);
    readout();
  }

  // ---- the turn: move here NOW, tell the server after ----
  function turn(dir) {
    if (!body.classList.contains('presenting') || !pdfDoc) return;
    const np = Math.max(1, Math.min(curPage + dir, numPages));
    if (np === curPage) return;
    curPage = np;
    renderPage(curPage);
    readout();
    // sync — absolute page, fire-and-forget. If the wire's down it just fails
    // quietly and the local show carries on; the next turn resyncs the server.
    fetch('/control/goto', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: curPage })
    }).catch(() => {});
  }

  // ---- pick a deck from the shelf → push live → present here ----
  async function pickDeck(job) {
    await fetch('/control/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job })
    }).catch(() => {});
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

  // on load: if a deck's already live (resumed from disk), pick the show back
  // up where it was; otherwise show the shelf.
  async function boot() {
    await loadShelf();
    try {
      const s = await (await fetch('/state')).json();
      const d = decks.find(x => x.id === s.live_job);
      if (d) { numPages = d.pages; present(s.live_job, s.page); }
    } catch (_) {}
  }
  boot();

  // ---- controls ----
  document.getElementById('switch').onclick = () => { body.classList.remove('presenting'); };
  document.getElementById('end').onclick = () => {
    fetch('/control/end', { method: 'POST' }).catch(() => {});
    body.classList.remove('presenting');
  };
  document.getElementById('tapnav').addEventListener('click', e => {
    turn((e.clientX / window.innerWidth) > 0.5 ? +1 : -1);
  });
  window.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') { turn(+1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { turn(-1); e.preventDefault(); }
  });
  window.addEventListener('resize', () => { if (body.classList.contains('presenting')) renderPage(curPage); });

  // ---- fullscreen (this machine shows, so it gets the button) ----
  (function () {
    const btn = document.getElementById('full');
    const el = document.documentElement;
    const fsOn = () => document.fullscreenElement || document.webkitFullscreenElement || false;
    function paint() { btn.textContent = fsOn() ? 'EXIT FULL' : 'FULL SCREEN'; }
    btn.onclick = () => {
      if (fsOn()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
      else { const r = el.requestFullscreen || el.webkitRequestFullscreen; if (r) r.call(el).catch(() => {}); }
    };
    document.addEventListener('fullscreenchange', paint);
    document.addEventListener('webkitfullscreenchange', paint);
    paint();
  })();

  // ---- auto-hiding control strip ----
  let hideT;
  function nudge() { strip.classList.add('show'); clearTimeout(hideT); hideT = setTimeout(() => strip.classList.remove('show'), 2500); }
  window.addEventListener('mousemove', nudge);
  window.addEventListener('keydown', nudge);
  document.getElementById('tapnav').addEventListener('click', nudge);

  // ---- wire dot: can this machine reach the server? (green = SHOWING screens
  //      will follow; red = you're driving local-only, which is fine) ----
  const dots = [document.getElementById('dot'), document.getElementById('dot2')].filter(Boolean);
  async function ping() {
    let ok = false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      const r = await fetch('/health', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t); ok = r.ok;
    } catch (_) { ok = false; }
    dots.forEach(d => { d.classList.toggle('live', ok); d.classList.toggle('down', !ok); });
  }
  ping();
  setInterval(ping, 3000);
})();
