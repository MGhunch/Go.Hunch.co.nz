/* ============================================================================
   PLAY — the dumb screen.
   Listens on the live line. Shows the Dots at rest; shows the deck when a job
   is pushed. Holds its last frame if the wire drops (never blanks) and re-syncs
   itself silently when the line comes back.
   ========================================================================== */
(function () {
  const body = document.body;
  const deckCanvas = document.getElementById('deck-canvas');
  const ctx = deckCanvas.getContext('2d');

  let pdfDoc = null, curJob = null, curPage = 1, numPages = 1;
  let rendering = false, pending = null;

  async function loadDeck(job) {
    if (job === curJob && pdfDoc) return;
    curJob = job;
    pdfDoc = null;
    const task = pdfjsLib.getDocument('/deck/' + job + '/pdf');
    pdfDoc = await task.promise;
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
    } catch (e) { /* leave the last good frame up */ }
    rendering = false;
    if (pending !== null) { const p = pending; pending = null; renderPage(p); }
  }

  async function applyState(s) {
    if (s.live_job) {
      body.classList.add('live');
      await loadDeck(s.live_job);
      curPage = s.page;
      renderPage(s.page);
    } else {
      body.classList.remove('live');   // back to the Dots (a real 'end', not a drop)
      curJob = null; pdfDoc = null;
    }
  }

  /* ---- the live line. onerror does nothing on purpose: EventSource retries
     itself, and we keep the last frame on screen the whole time. ---- */
  function connect() {
    const es = new EventSource('/events');
    es.onmessage = e => { try { applyState(JSON.parse(e.data)); } catch (_) {} };
    es.onerror = () => { /* hold the frame; browser auto-reconnects */ };
  }
  connect();

  /* ---- re-fit the current page when the screen resizes ---- */
  window.addEventListener('resize', () => { if (body.classList.contains('live')) renderPage(curPage); });

  /* ---- invisible tap-to-advance (right = next, left = back), through the
     server so state stays central. Silently 403s on an un-keyed client screen,
     which is exactly right — nobody taps it there. ---- */
  document.getElementById('tapnav').addEventListener('click', e => {
    if (!body.classList.contains('live')) return;
    const dir = (e.clientX / window.innerWidth) > 0.5 ? 'next' : 'back';
    fetch('/control/' + dir, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .catch(() => {});
  });

  /* ---- the GO button: the one tap the client's browser is asked for.
     Dynamic label, watches fullscreen state, flips back if it drops. ---- */
  (function () {
    const btn = document.getElementById('go-btn');
    const el = document.documentElement;
    const fsOn = () => document.fullscreenElement || document.webkitFullscreenElement || false;

    function paint() {
      if (fsOn()) { btn.textContent = "LET'S GO"; }
      else { btn.textContent = "GO FULL SCREEN"; btn.classList.remove('hidden'); }
    }
    function goFull() {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) Promise.resolve(req.call(el)).catch(() => {});
    }
    btn.addEventListener('click', () => { fsOn() ? btn.classList.add('hidden') : goFull(); });
    document.addEventListener('fullscreenchange', paint);
    document.addEventListener('webkitfullscreenchange', paint);
    paint();
  })();
})();
