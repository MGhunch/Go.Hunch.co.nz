# GO — `go.hunch.co.nz`

Get the work onto a screen, cleanly, from anywhere, with your phone as the
remote. Spine + hardening: the live line, and a soft floor under it for when
the wire, the server, or the wifi lets go.

Commit Changes

## What it does right now

- One server holds the truth: which job is live, and what page it's on — and
  **writes it to disk on every move, so a restart never loses the room.**
- **The cookie decides what a machine is.** Every device opens the same URL; the
  only question is whether this browser carries Michael's cookie:
  - **No cookie — a client machine.** A dumb screen, always. Straight to the
    Dots, takes the deck when it's pushed, one fullscreen tap, never a choice,
    nothing to type. It can't drive, because it isn't his.
  - **Cookied — Michael's machine.** Lands on the Dots with **three round
    buttons**: **DRIVING** (steering wheel), **SHOWING** (screen), **SET UP**
    (cog).
    - **SHOWING** — a dumb screen like a client's (laptop plugged into the room
      TV, driven from his phone).
    - **DRIVING** — this machine runs the show. Pick a pack and it presents
      **right here**: deck fullscreen, space / arrows / click to turn. Turns are
      **local-first** — instant, then synced so it persists and any SHOWING
      screen follows. Works with no wifi once loaded.
    - **SET UP** — a prep drawer (not a mode): opens over the Dots, closes back
      to the buttons. **Choose a presentation** (loads it, waiting) or **Upload
      a new one** onto the volume. Prep in the lift; walk in ready.
- The two devices **never talk to each other** — both just reach the server, on
  any network. He on cellular, client on their wifi: doesn't matter.
- The **live line** (SSE) pushes the live page to SHOWING screens one way. If it
  drops the screen **holds the last page** and reconnects itself silently.
- **Hand-over floor (client SHOWING screen only):** its space/arrow keys are
  always armed but held down by the wire's beat. If the beat stops for a couple
  of seconds, the first keypress drives the deck locally — and latches. The wire
  coming back does not reclaim the room. One-way, no reconcile. ("Would you mind
  driving — press space.")

Test deck baked in: `presentations/one-096/` — the ONE 096 App ID & Dashboard
deck (16 pages).

## Run it locally

```bash
pip install -r requirements.txt
python app.py                     # http://localhost:5000
```

Key your machine once (`/drive?key=hunch` or `/?key=hunch`), then it's a driver.
On DRIVING, pick the deck — it presents right there; space / arrows / click turn
the page. Open `/play` in another window (or another device) to watch a SHOWING
screen follow. An un-keyed browser only ever gets the dumb SHOWING screen.

## The bulletproof test (the only thing worth proving first)

1. PLAY on one device/network, DRIVE on another.
2. Push the deck, drive to page 4.
3. Kill PLAY's network (flight mode / pull wifi) for 20 seconds, then restore.
   - The screen **must not blank** — it holds page 4.
   - When the network's back it **re-syncs itself**, no tap, no refresh.
4. Turn a page on DRIVE while PLAY was offline, then bring PLAY back — it should
   land on the current page, because the server remembered, not the phone.
5. **Persisted state (survives a restart):** push a deck, drive to page 6,
   restart the server (redeploy, or kill the worker). PLAY must return to page 6
   within a second or two, **no human action** — the truth survived the restart.
6. **Backup on hand:** on DRIVE, tap SAVE DECK TO THIS DEVICE — the current PDF
   downloads to the phone/laptop in one tap.
7. **The hand-over floor:** with a deck up, kill both devices' network. After a
   couple of seconds, press SPACE (or arrow keys) on the screen — the deck turns
   its own pages, locally, no wire. Restore the network: the screen stays on the
   keyboard (it does **not** jump back to the server's page). One-way by design.

## The manual floor (no server, no wifi — documented, not code)

When everything is down, the deck is a flat PDF already on your device:

**laptop → screen via cable → open the downloaded PDF → arrow keys.**

Pull the PDF onto the laptop before the room with SAVE DECK TO THIS DEVICE (or
`/deck/<id>/pdf?download=1`). This shares nothing with GO — it works when the
building's on fire. GO just makes sure the PDF is always one tap away.

## The crude parachute

`/(play)?job=one-096` typed straight into the screen's browser puts the deck up
from page 1 with no driver in the loop. Boring URL, always works.

## Deploy (Railway)

- `Procfile` runs gunicorn with **one worker, many threads**, `--timeout 0`.
  Threads because the live line holds a connection open per screen; a departure
  from Robot Sandwich's single-thread rule, which exists there for a folder trick
  GO doesn't use.
- **One worker is a correctness requirement, not a performance dial.** The live
  line and its `notify_all` are per-process — a second worker wouldn't share the
  wire *or* the wake-up, so screens on the "other" worker would freeze. The new
  state file backs the truth across a restart; it does **not** unlock a second
  worker. Do not raise the worker count. (This reasoning lives here, not in the
  Procfile — Railway's Procfile parser chokes on comment lines.)
- **Volume:** add a Railway volume and set `GO_DATA` to its mount path. That's
  where `go-state.json` (the persisted room) **and uploaded decks**
  (`GO_DATA/presentations/<id>/`) live. Baked-in decks stay in the repo,
  read-only. **Uploads need the volume** — without `GO_DATA` an upload has
  nowhere permanent to land and the server returns `507`; the SET UP modal shows
  "Sorry — not connected" when the server's unreachable. Unset locally, state and
  uploads fall back to gitignored files in the repo dir.
- Set `GO_KEY` in the Railway env (defaults to `hunch`). Driving/Set-up need it;
  a showing screen doesn't.
- Health check: `GET /health` (the wire dot and SET UP's connectivity poll it).

## What's deliberately NOT here yet

Title-page generator · send · "who's in the room" (2.0) · real three-doors auth ·
Airtable · mothball-on-send / end-of-day backstop. The container is a **folder**
(PDF + config.json), so a future deck type (native slides, the Claude-voice
slide) is a new folder kind, not a rewrite. Upload lands a PDF folder on the
volume; a phone is now the whole app — pick, upload, drive.

## Notes — checked against the Robot Sandwich repo

- `static/tokens.css` is now the **verbatim** Robot Sandwich file (byte-identical).
  `go.css` uses the real token names (`--red`, `--ink`, `--paper`, `--display`,
  `--body`, `--pill`, …), not the stand-ins from the first cut.
- Fonts load the same family line as Robot Sandwich (Bebas Neue / Oswald 500 /
  Inter 300–700).
- `static/dots.js` is the constellation engine lifted verbatim from the splash.
- **Procfile diverges on purpose.** Robot Sandwich runs 1 worker / 1 thread
  (its `containers.py` swaps module globals mid-call). GO has no such trick and
  the live line needs concurrency, so GO runs 1 worker / many threads — still
  one worker because the state is in memory *and* the wire's wake-up is
  per-process (see Deploy). The Procfile stays comment-free; Railway's parser
  chokes on comments, so that reasoning lives in this README.
- **PDF library:** GO uses `pypdf` (page count only; rendering is client-side
  PDF.js), not Robot Sandwich's `pdfplumber` (copy extraction). Say the word if
  you'd rather one lib across the family.
- **Auth:** the current `GO_KEY` gate is a stopgap. The real port reuses
  Robot Sandwich's `auth.py` almost verbatim — a magic word → Flask session,
  `people.json` read fresh from the volume, three doors. In GO: DRIVE = the
  Hunch door (`sees: "ALL"`), PLAY needs no door. The port swaps the body of
  `authed()`; the endpoints and PLAY-needs-nothing shape don't change.

## Map

```
app.py                     Flask spine — state (+disk persist), live line, control
Procfile                   gunicorn: 1 worker, 16 threads, no timeout (comment-free)
requirements.txt           Flask, gunicorn, pypdf
templates/choose.html      three-button door + SET UP modal  (/, cookied only)
templates/play.html        the screen (SHOWING)        (/play)
templates/drive.html       DRIVING — present-here      (/drive, cookied only)
static/play.js             live line, PDF render, GO button, tap-to-advance, hand-over latch
static/drive.js            present-here, local-first turns (goto sync), wire dot, save
static/setup.js            SET UP modal — choose (push live) + upload-to-volume
static/dots.js             Hunch constellation (lifted)
static/tokens.css          Hunch tokens (VERBATIM from Robot Sandwich)
static/go.css              GO chrome (door buttons, modal, SHOWING deck, DRIVING strip)
presentations/one-096/     baked-in test deck (repo, read-only)
GO_DATA/presentations/     uploaded decks (the volume)
go-state.json              the persisted room (on the volume; gitignored locally)
```
