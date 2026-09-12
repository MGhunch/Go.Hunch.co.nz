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
import os, glob, json, threading
from flask import (Flask, Response, request, render_template,
                   jsonify, send_file, abort, make_response, redirect)
from pypdf import PdfReader

app = Flask(__name__)

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


def list_decks():
    decks = []
    for cfg_path in sorted(glob.glob(os.path.join(PRESENTATIONS, "*", "config.json"))):
        folder = os.path.dirname(cfg_path)
        pdf_path = os.path.join(folder, "deck.pdf")
        if not os.path.exists(pdf_path):
            continue
        try:
            cfg = json.load(open(cfg_path, encoding="utf-8"))
        except Exception:
            cfg = {}
        decks.append({
            "id": os.path.basename(folder),
            "client": cfg.get("client", ""),
            "title": cfg.get("title", os.path.basename(folder)),
            "job": cfg.get("job", ""),
            "pages": _page_count(pdf_path),
        })
    return decks


def get_deck(deck_id):
    if not deck_id:
        return None
    for d in list_decks():
        if d["id"] == deck_id:
            return d
    return None


def authed():
    return request.cookies.get("go_key") == GO_KEY


def _cookie_key(resp):
    """If a valid ?key= is on the URL, remember it on this device."""
    if request.args.get("key") == GO_KEY:
        resp.set_cookie("go_key", GO_KEY, max_age=60 * 60 * 12, samesite="Lax")
    return resp


# ---------------------------------------------------------------------------
# VIEWS
# ---------------------------------------------------------------------------
@app.route("/")
def choose():
    # The chooser is Michael's surface only. A client's device (no cookie) never
    # gets asked "driving or showing?" — it goes straight to the showing screen.
    # The choice only appears once this iPad has been keyed as his.
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
    resp = make_response(render_template("drive.html", authed=(request.args.get("key") == GO_KEY or authed())))
    return _cookie_key(resp)


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
    if not get_deck(deck_id):
        abort(404)
    path = os.path.join(PRESENTATIONS, deck_id, "deck.pdf")
    # ?download=1 forces a save (the cable-and-local-PDF floor); plain serve is
    # what PLAY streams to render. Same file either way.
    if request.args.get("download"):
        return send_file(path, mimetype="application/pdf",
                         as_attachment=True, download_name=f"{deck_id}.pdf")
    return send_file(path, mimetype="application/pdf")


@app.route("/health")
def health():
    return jsonify({"ok": True, "decks": len(list_decks())})


# Pick the room back up on boot (survives a restart). Runs at import, so it
# fires under gunicorn's single worker too, not only `python app.py`.
_restore()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), threaded=True)
