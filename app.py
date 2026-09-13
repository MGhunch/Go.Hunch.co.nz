"""
GO — go.hunch.co.nz
Spine slice: one server, two dumb views (PLAY / DRIVE), one live line.

The server holds the truth: which job is live, and what page it's on.
PLAY listens on a one-way live line (SSE) and shows the deck.
DRIVE posts commands (push / next / back / end).
Neither device talks to the other — both just reach this server, on any network.

Not in this slice (deliberately): upload page, title-page generator, send,
real three-doors auth, Airtable, mothball-on-send. Those hang off this once
the line is proven bulletproof.
"""
import os, glob, json, threading, re, shutil
from flask import (Flask, Response, request, render_template,
                   jsonify, send_file, abort, make_response, redirect)
from pypdf import PdfReader

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 60 * 1024 * 1024   # 60MB ceiling on an upload

BASE = os.path.dirname(os.path.abspath(__file__))
PRESENTATIONS = os.path.join(BASE, "presentations")

# Rough gate so it isn't wide open. This is a stopgap — the real three-doors
# auth (Hunch sees all / client sees only what's pushed) is the next thing.
GO_KEY = os.environ.get("GO_KEY", "hunch")

# Where the truth is written down so a restart doesn't lose the room. Point
# GO_DATA at the mounted Railway volume; unset (local dev) it falls back to a
# file in the repo dir (gitignored). Same volume convention as the family.
GO_DATA = os.environ.get("GO_DATA")
STATE_FILE = os.path.join(GO_DATA if GO_DATA else BASE, "go-state.json")

# Where uploaded decks live — on the volume beside the state file, so they
# survive redeploys. Baked-in decks stay in the repo (read-only). Unset (local
# dev) it falls back to ./uploads.
UPLOADS = os.path.join(GO_DATA, "presentations") if GO_DATA else os.path.join(BASE, "uploads")

# How often the live line sends a beat when nothing's changing. PLAY uses these
# beats to know the wire's alive; when they stop for a couple of seconds, PLAY's
# local keys surface (the hand-over floor). Brisk enough that a real drop shows
# quickly, not so brisk a blink counts.
HEARTBEAT = 2  # seconds

# ---------------------------------------------------------------------------
# LIVE STATE — the truth lives here, in memory, on one worker, AND is written
# to disk on every real change so a restart lands the room back where it was.
# epoch is a runtime counter only — never persisted, resets to 0 on boot.
# ---------------------------------------------------------------------------
_cond = threading.Condition()
STATE = {"live_job": None, "page": 1, "epoch": 0}


def snapshot():
    with _cond:
        return dict(STATE)


def _persist(snap):
    """Write {live_job, page} down, atomically (temp + rename), so a crash
    mid-write can't leave a torn file. Called outside the lock — a tiny dict at
    human pace, disk I/O never blocks the wire."""
    try:
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"live_job": snap["live_job"], "page": snap["page"]}, f)
        os.replace(tmp, STATE_FILE)          # atomic on POSIX
    except OSError as e:
        print(f"[go] couldn't persist state ({e})", flush=True)


def bump(**changes):
    with _cond:
        STATE.update(changes)
        STATE["epoch"] += 1
        _cond.notify_all()
        snap = {"live_job": STATE["live_job"], "page": STATE["page"]}
    _persist(snap)


def _restore():
    """On boot, pick the room back up. Guard: if the persisted deck folder is
    gone, start dark rather than point PLAY at a missing PDF. A stale deck from
    yesterday is fine — a fresh push or End clears it (mothball is parked)."""
    if not os.path.isfile(STATE_FILE):
        return
    try:
        d = json.load(open(STATE_FILE, encoding="utf-8"))
    except (OSError, ValueError) as e:
        print(f"[go] couldn't read persisted state ({e}) — starting dark", flush=True)
        return
    job = d.get("live_job")
    if job and get_deck(job):
        STATE["live_job"] = job
        STATE["page"] = int(d.get("page", 1) or 1)
    # else: deck gone or was dark — leave STATE at its dark default


# ---------------------------------------------------------------------------
# DECKS — read fresh from disk so dropping in a folder needs no restart.
# A presentation is a folder: deck.pdf + config.json (client, job, title).
# ---------------------------------------------------------------------------
_pages_cache = {}


def _page_count(pdf_path):
    key = (pdf_path, os.path.getmtime(pdf_path))
    if key not in _pages_cache:
        try:
            _pages_cache[key] = len(PdfReader(pdf_path).pages)
        except Exception:
            _pages_cache[key] = 1
    return _pages_cache[key]


def _scan(root):
    out = []
    for cfg_path in sorted(glob.glob(os.path.join(root, "*", "config.json"))):
        folder = os.path.dirname(cfg_path)
        pdf_path = os.path.join(folder, "deck.pdf")
        if not os.path.exists(pdf_path):
            continue
        try:
            cfg = json.load(open(cfg_path, encoding="utf-8"))
        except Exception:
            cfg = {}
        out.append({
            "id": os.path.basename(folder),
            "client": cfg.get("client", ""),
            "title": cfg.get("title", os.path.basename(folder)),
            "job": cfg.get("job", ""),
            "pages": _page_count(pdf_path),
        })
    return out


def list_decks():
    # Repo seeds first, then the volume (an uploaded id would override a seed).
    seen = {}
    for d in _scan(PRESENTATIONS):
        seen[d["id"]] = d
    for d in _scan(UPLOADS):
        seen[d["id"]] = d
    return list(seen.values())


def deck_folder(deck_id):
    """Where a deck's files actually sit — volume first, then repo."""
    for root in (UPLOADS, PRESENTATIONS):
        folder = os.path.join(root, deck_id)
        if os.path.exists(os.path.join(folder, "deck.pdf")):
            return folder
    return None


def get_deck(deck_id):
    if not deck_id:
        return None
    for d in list_decks():
        if d["id"] == deck_id:
            return d
    return None


def _slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").strip().lower()).strip("-")
    return s or "deck"


def _uploads_writable():
    try:
        os.makedirs(UPLOADS, exist_ok=True)
        return True
    except OSError:
        return False


def authed():
    return request.cookies.get("go_key") == GO_KEY


def _cookie_key(resp):
    """If a valid ?key= is on the URL, remember it on this device."""
    if request.args.get("key") == GO_KEY:
        resp.set_cookie("go_key", GO_KEY, max_age=60 * 60 * 24 * 365, samesite="Lax")
    return resp


# ---------------------------------------------------------------------------
# VIEWS
# ---------------------------------------------------------------------------
@app.route("/")
def choose():
    # The chooser is Michael's surface only. A client's device (no cookie) never
    # gets asked "driving or showing?" — it goes straight to the showing screen.
    # ?key= keys THIS machine (sets the cookie) and lands on the chooser.
    if request.args.get("key") == GO_KEY:
        return _cookie_key(make_response(render_template("choose.html")))
    if not authed():
        return redirect("/play")
    return render_template("choose.html")


@app.route("/play")
def play():
    # Crude parachute: /play?job=one-096 puts a deck up from page 1 with no
    # driver in the loop — a boring URL typed straight into the screen.
    job = request.args.get("job")
    if job and get_deck(job):
        bump(live_job=job, page=1)
    return _cookie_key(make_response(render_template("play.html")))


@app.route("/drive")
def drive():
    # DRIVING is Michael's surface — the machine that runs the show. A client
    # machine (no cookie) can't drive; it's only ever a screen, so it's sent to
    # the show. ?key= keys this machine into a driver.
    if request.args.get("key") == GO_KEY:
        return _cookie_key(make_response(render_template("drive.html")))
    if not authed():
        return redirect("/play")
    return render_template("drive.html")


# ---------------------------------------------------------------------------
# THE LIVE LINE (SSE) — server -> screen, one way.
# On connect (and every silent reconnect) it sends current state, so a device
# that drops and rejoins is told exactly where things are. Heartbeat keeps it
# open through fussy proxies.
# ---------------------------------------------------------------------------
@app.route("/events")
def events():
    def stream():
        s = snapshot()
        yield "data: " + json.dumps(s) + "\n\n"
        last = s["epoch"]
        while True:
            with _cond:
                changed = _cond.wait_for(lambda: STATE["epoch"] != last, timeout=HEARTBEAT)
                s = dict(STATE)
            if changed:
                yield "data: " + json.dumps(s) + "\n\n"
                last = s["epoch"]
            else:
                # A named beat PLAY can hear (a bare comment can't be observed in
                # JS). Its steady arrival is what holds PLAY's local keys down;
                # when it goes quiet, they surface.
                yield "event: ping\ndata: 1\n\n"

    resp = Response(stream(), mimetype="text/event-stream")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["X-Accel-Buffering"] = "no"   # don't let a proxy buffer the stream
    resp.headers["Connection"] = "keep-alive"
    return resp


# ---------------------------------------------------------------------------
# CONTROL — DRIVE -> server. Ordinary POSTs, fire-and-forget.
# ---------------------------------------------------------------------------
@app.route("/control/push", methods=["POST"])
def c_push():
    if not authed():
        abort(403)
    job = (request.get_json(silent=True) or {}).get("job")
    if not get_deck(job):
        abort(404)
    bump(live_job=job, page=1)
    return jsonify(snapshot())


@app.route("/control/next", methods=["POST"])
def c_next():
    if not authed():
        abort(403)
    s = snapshot()
    if not s["live_job"]:
        return jsonify(s)
    d = get_deck(s["live_job"])
    pages = d["pages"] if d else 1
    changed = False
    with _cond:
        newp = min(STATE["page"] + 1, pages)
        if newp != STATE["page"]:
            STATE["page"] = newp
            STATE["epoch"] += 1
            _cond.notify_all()
            changed = True
        snap = {"live_job": STATE["live_job"], "page": STATE["page"]}
        s = dict(STATE)
    if changed:
        _persist(snap)          # write down only on a real move, not a no-op
    return jsonify(s)


@app.route("/control/back", methods=["POST"])
def c_back():
    if not authed():
        abort(403)
    changed = False
    with _cond:
        newp = max(STATE["page"] - 1, 1)
        if newp != STATE["page"]:
            STATE["page"] = newp
            STATE["epoch"] += 1
            _cond.notify_all()
            changed = True
        snap = {"live_job": STATE["live_job"], "page": STATE["page"]}
        s = dict(STATE)
    if changed:
        _persist(snap)
    return jsonify(s)


@app.route("/control/end", methods=["POST"])
def c_end():
    # Send the screen dark, back to the Dots. This is the mothball hook.
    if not authed():
        abort(403)
    bump(live_job=None, page=1)
    return jsonify(snapshot())


@app.route("/control/goto", methods=["POST"])
def c_goto():
    # Absolute page set — used by a DRIVING machine that turned its own page
    # locally-first and is now telling the server where it landed (so state
    # persists and any SHOWING screen follows). Absolute, not relative, so the
    # server never drifts from the driver even if a turn's POST was dropped.
    if not authed():
        abort(403)
    body = request.get_json(silent=True) or {}
    s = snapshot()
    if not s["live_job"]:
        return jsonify(s)
    d = get_deck(s["live_job"])
    pages = d["pages"] if d else 1
    try:
        target = int(body.get("page", s["page"]))
    except (TypeError, ValueError):
        target = s["page"]
    target = max(1, min(target, pages))
    changed = False
    with _cond:
        if target != STATE["page"]:
            STATE["page"] = target
            STATE["epoch"] += 1
            _cond.notify_all()
            changed = True
        snap = {"live_job": STATE["live_job"], "page": STATE["page"]}
        s = dict(STATE)
    if changed:
        _persist(snap)
    return jsonify(s)


# ---------------------------------------------------------------------------
# DATA + FILES
# ---------------------------------------------------------------------------
@app.route("/decks")
def decks():
    return jsonify(list_decks())


@app.route("/state")
def state():
    return jsonify(snapshot())


@app.route("/deck/<deck_id>/pdf")
def deck_pdf(deck_id):
    folder = deck_folder(deck_id)
    if not folder:
        abort(404)
    path = os.path.join(folder, "deck.pdf")
    # ?download=1 forces a save (the cable-and-local-PDF floor); plain serve is
    # what a screen streams to render. Same file either way.
    if request.args.get("download"):
        return send_file(path, mimetype="application/pdf",
                         as_attachment=True, download_name=f"{deck_id}.pdf")
    return send_file(path, mimetype="application/pdf")


@app.route("/upload", methods=["POST"])
def upload():
    # SET UP → upload a new presentation onto the volume. Needs the server (the
    # file travels here) and a writable volume; the modal only calls this when
    # it believes it's connected, and we fail loudly if the volume's missing.
    if not authed():
        abort(403)
    if not _uploads_writable():
        return jsonify({"error": "no-store",
                        "message": "No writable storage — set GO_DATA to the volume on Railway."}), 507
    f = request.files.get("pdf")
    if not f or not (f.filename or "").lower().endswith(".pdf"):
        return jsonify({"error": "not-pdf", "message": "Choose a PDF."}), 400

    client = (request.form.get("client") or "").strip()
    job = (request.form.get("job") or "").strip()
    title = (request.form.get("title") or "").strip()

    base_id, did, n = _slug(job or title or os.path.splitext(f.filename)[0]), None, 2
    did = base_id
    while os.path.exists(os.path.join(UPLOADS, did)):
        did, n = f"{base_id}-{n}", n + 1
    folder = os.path.join(UPLOADS, did)
    os.makedirs(folder, exist_ok=True)
    pdf_path = os.path.join(folder, "deck.pdf")
    f.save(pdf_path)

    try:
        if len(PdfReader(pdf_path).pages) < 1:
            raise ValueError("no pages")
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        return jsonify({"error": "bad-pdf", "message": "That didn't read as a PDF."}), 400

    with open(os.path.join(folder, "config.json"), "w", encoding="utf-8") as c:
        json.dump({"id": did, "client": client, "job": job,
                   "title": title or os.path.splitext(f.filename)[0]}, c)
    return jsonify({"ok": True, "deck": get_deck(did)})


@app.route("/health")
def health():
    return jsonify({"ok": True, "decks": len(list_decks())})


# Pick the room back up on boot (survives a restart). Runs at import, so it
# fires under gunicorn's single worker too, not only `python app.py`.
_restore()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), threaded=True)
