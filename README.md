# GO — `go.hunch.co.nz`

Get the work onto a screen, cleanly, from anywhere, with your phone as the
remote. Spine + hardening: the live line, and a soft floor under it for when
the wire, the server, or the wifi lets go.

## What it does right now

- One server holds the truth: which job is live, and what page it's on — and
  **writes it to disk on every move, so a restart never loses the room.**
- Two dumb views off that server:
  - **PLAY** (`/play`) — the screen. Hunch Dots at rest; the deck when a job is
    pushed. One tap for fullscreen, then never touched again.
  - **DRIVE** (`/drive`) — your phone. Pick the pack, next / back, end, plus a
    **red/green wire dot** (can this phone reach the server?) and a one-tap
    **save-deck** for the cable floor.
- The two devices **never talk to each other** — both just reach the server, on
  any network. You on cellular, client on their wifi: doesn't matter.
- The **live line** (Server-Sent Events) pushes page turns to the screen one
  way. If it drops it **holds the last page** and reconnects itself silently.
- **Hand-over floor:** the screen's space/arrow keys are always armed but held
  down by the wire's beat. If the beat stops for a couple of seconds, the first
  keypress drives the deck locally — and latches. The wire coming back does not
  reclaim the room. One-way, no reconcile. ("Would you mind driving — press
  space.")

Test deck baked in: `presentations/one-096/` — the ONE 096 App ID & Dashboard
deck (16 pages).

## Run it locally

```bash
pip install -r requirements.txt
python app.py                     # http://localhost:5000
```

Open `/play` in one window and `/drive?key=hunch` in another. Pick the deck on
DRIVE; it appears on PLAY. Drive next/back.

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
  where `go-state.json` (the persisted room) lives, and where uploaded decks will
  land later. Unset (local dev), it falls back to a gitignored file in the repo.
- Set `GO_KEY` in the Railway env (defaults to `hunch`). DRIVE needs it; PLAY
  doesn't.
- Health check: `GET /health` (DRIVE's wire dot polls this too).

## What's deliberately NOT here yet

Upload page · title-page generator · send · real three-doors auth · Airtable ·
mothball-on-send / end-of-day backstop. All of it hangs off this spine once the
line is proven. The container is already a **folder** (PDF + config.json), so a
future deck type (native slides, the Claude-voice slide) is a new folder kind,
not a rewrite.

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
templates/choose.html      driving-or-showing chooser  (/, cookied device only)
templates/play.html        the screen                  (/play)
templates/drive.html       the controls                (/drive)
static/play.js             live line, PDF render, GO button, tap-to-advance, hand-over latch
static/drive.js            shelf, next/back/end, page indicator, wire dot, save-deck
static/dots.js             Hunch constellation (lifted)
static/tokens.css          Hunch tokens (VERBATIM from Robot Sandwich)
static/go.css              GO chrome (+ wire dot, save link)
presentations/one-096/     test deck: deck.pdf + config.json
go-state.json              the persisted room (on the volume; gitignored locally)
```
