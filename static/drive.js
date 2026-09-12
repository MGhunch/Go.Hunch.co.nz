/* ============================================================================
   DRIVE — the controls. Pick a pack, drive it, end it.
   Also listens on the live line so the page count stays honest and a second
   device picked up mid-talk shows the right page.
   ========================================================================== */
(function () {
  const shelf = document.getElementById('shelf');
  const controls = document.getElementById('controls');
  const pageread = document.getElementById('pageread');
  let decks = [];
  let live = { live_job: null, page: 1 };

  function post(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(r => r.ok ? r.json() : null).catch(() => null);
  }

  async function loadShelf() {
    decks = await (await fetch('/decks')).json();
    shelf.innerHTML = '';
    decks.forEach(d => {
      const b = document.createElement('button');
      b.className = 'deck-btn';
      b.dataset.id = d.id;
      b.innerHTML = (d.client || d.title) + '<small>' + [d.job, d.title, d.pages + ' pages'].filter(Boolean).join(' · ') + '</small>';
      b.onclick = () => post('/control/push', { job: d.id });
      shelf.appendChild(b);
    });
    paint();
  }

  function deckById(id) { return decks.find(d => d.id === id); }

  function paint() {
    const on = !!live.live_job;
    controls.style.display = on ? 'flex' : 'none';
    document.querySelectorAll('.deck-btn').forEach(b =>
      b.classList.toggle('on', b.dataset.id === live.live_job));
    if (on) {
      const d = deckById(live.live_job);
      const total = d ? d.pages : '?';
      pageread.textContent = 'PAGE ' + live.page + ' / ' + total;
    }
  }

  document.getElementById('next').onclick = () => post('/control/next');
  document.getElementById('back').onclick = () => post('/control/back');
  document.getElementById('end').onclick = () => post('/control/end');

  /* live line keeps the indicator in sync no matter what turned the page */
  const es = new EventSource('/events');
  es.onmessage = e => { try { live = JSON.parse(e.data); paint(); } catch (_) {} };

  loadShelf();
})();
