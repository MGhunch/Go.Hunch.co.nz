# GO — `go.hunch.co.nz`

Get the work onto a screen, cleanly, from anywhere, with your phone as the
remote. This repo is the **spine slice** — the one genuinely new piece of
engineering proven on its own before anything hangs off it.

## What it does right now

- One server holds the truth: which job is live, and what page it's on.
- Two dumb views off that server:
  - **PLAY** (`/play`) — the screen. Hunch Dots at rest; the deck when a job is
    pushed. One tap for fullscreen, then never touched again.
  - **DRIVE** (`/drive`) — your phone. Pick the pack, next / back, end.
- The two devices **never talk to each other** — both just reach the server, on
  any network. You on cellular, client on their wifi: doesn't matter.
- The **live line** (Server-Sent Events) pushes page turns to the screen one
  way. If it drops it **holds the last page** and reconnects itself silently,
  then the server tells it where things got to.

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

## The crude parachute

`/(play)?job=one-096` typed straight into the screen's browser puts the deck up
from page 1 with no driver in the loop. Boring URL, always works.

## Deploy (Railway)

- `Procfile` runs gunicorn with **one worker, many threads** — one worker
  because the live state is in memory, threads because the live line needs
  concurrency (see the note in the Procfile — this is a deliberate departure
  from Robot Sandwich's single-thread rule). `--timeout 0` keeps the
  long-lived connections open.
- Set `GO_KEY` in the Railway env (defaults to `hunch`). DRIVE needs it; PLAY
  doesn't.
- Health check: `GET /health`.

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
  one worker because the state is in memory. Reasoning is in the Procfile.
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
app.py                     Flask spine — state, live line, control endpoints
Procfile                   gunicorn: 1 worker, 16 threads, no timeout
requirements.txt           Flask, gunicorn, pypdf
templates/choose.html      driving-or-showing chooser  (/)
templates/play.html        the screen                  (/play)
templates/drive.html       the controls                (/drive)
static/play.js             live line, PDF render, GO button, tap-to-advance
static/drive.js            shelf, next/back/end, page indicator
static/dots.js             Hunch constellation (lifted)
static/tokens.css          Hunch tokens (VERBATIM from Robot Sandwich)
static/go.css              GO chrome
presentations/one-096/     test deck: deck.pdf + config.json
```
