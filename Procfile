# GO diverges from Robot Sandwich's Procfile ON PURPOSE.
#
# Robot Sandwich runs one worker, one thread, because containers.py swaps
# module globals for the length of a call — unsafe under concurrency.
# GO has no such trick: state lives in one dict behind a lock, and decks are
# read fresh and statelessly. So threads are safe here — and REQUIRED: the
# live line (SSE) holds a connection open per screen. A sync single-thread
# worker would let the first open screen block every other request.
#
# Still ONE worker: the live state is in memory and must be shared.
# --timeout 0 so the long-lived live-line connections are never reaped.
web: gunicorn app:app --worker-class gthread --workers 1 --threads 16 --timeout 0
