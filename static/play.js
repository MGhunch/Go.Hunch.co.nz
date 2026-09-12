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

  /* ==========================================================================
     GRACEFUL FREEZE (spec — do not regress):
     Once loaded, the PDF is fully in this browser. A wire drop cannot blank it.
     We never re-fetch the deck on reconnect (loadDeck early-returns on same
     job), onerror does nothing, and we never clear the canvas on a wire event.
     internet dies -> deck stays crisp on the current page, frozen ->
     internet returns -> next push/turn works and PLAY re-syncs. Never blank.

     THE HAND-OVER LATCH:
     Local keys (space / arrows) are ALWAYS armed but held down by the live
     wire's beat. When the beat goes quiet for a couple of seconds (real drop,
     not a blink), suppression lapses and the first keypress drives the deck
     locally — and LATCHES: from then on the keyboard owns the room. The wire
     coming back does NOT reclaim or yank. Nothing has to fire at the moment of
     failure; the wire's absence is the trigger. One way, no reconcile.
     ========================================================================== */
  const WIRE_DEAD_MS = 4500;    // ~2 missed beats + margin: a drop, not a blink
  let lastBeat = Date.now();
  let latched = false;          // once true, the keyboard owns the room. Never flips back.
  const wireAlive = () => (Date.now() - lastBeat) < WIRE_DEAD_MS;

  function connect() {
    const es = new EventSource('/events');
    es.onopen = () => { lastBeat = Date.now(); };
    es.addEventListener('ping', () => { lastBeat = Date.now(); });
    es.onmessage = e => {
      lastBeat = Date.now();
      if (latched) return;      // handed over — the wire no longer moves this screen
      try { applyState(JSON.parse(e.data)); } catch (_) {}
    };
    es.onerror = () => { /* hold the frame; browser auto-reconnects; let the
                            beat age so the wire reads as down */ };
  }
  connect();

  /* local drive — only bites once the wire's been quiet a couple of seconds */
  function localTurn(dir) {
    if (!body.classList.contains('live') || !pdfDoc) return;
    if (wireAlive()) return;          // suppressed while the wire beats
    latched = true;                   // the hand-over: one way from here
    curPage = Math.max(1, Math.min(curPage + dir, numPages));
    renderPage(curPage);
  }
  window.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') { localTurn(+1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { localTurn(-1); e.preventDefault(); }
  });

  /* ---- re-fit the current page when the screen resizes ---- */
  window.addEventListener('resize', () => { if (body.classList.contains('live')) renderPage(curPage); });

  /* ---- invisible tap-to-advance (right = next, left = back), through the
     server so state stays central. Silently 403s on an un-keyed client screen,
     which is exactly right — nobody taps it there. ---- */
  document.getElementById('tapnav').addEventListener('click', e => {
    if (!body.classList.contains('live')) return;
    const fwd = (e.clientX / window.innerWidth) > 0.5;
    if (wireAlive() && !latched) {
      // wire's up — go through the server so state stays central
      fetch('/control/' + (fwd ? 'next' : 'back'),
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
    } else {
      // wire's down (or already handed over) — drive locally, same latch
      localTurn(fwd ? +1 : -1);
    }
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
