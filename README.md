# Octopi — Octopi Chatbot

A campus assistant that knows when your lectures are. Sign in, ask "where is my
practical on Thursday?", get an answer. Under the hood it's the whole loop, not
a mock: a trained Rasa model, custom actions that hit a real database, a REST
API, and a React chat with voice dictation.

Try it: https://oldspoon.github.io/Rasa-AI-Assistant/

## How it fits together

| Path | What it is | Worth knowing |
| --- | --- | --- |
| `rasa/` | NLU + dialogue | DIET for intents, TED and rule policies, explicit fallback thresholds. Serves the REST channel. |
| `action_server/` | Custom actions | The only thing that touches the database. Stateless on purpose: every turn re-queries the schedule, nothing is cached in slots. |
| `web/` | React client | Login (username = first+last, password = last+first), chat, voice. |

Rasa calls the action server over HTTP (`rasa/endpoints.yml` points at
`http://localhost:5055/webhook`). Storage is SQLite by default, Postgres the
moment `DATABASE_URL` is set. Same code, no branches. Two tables: `attendance`
(one lecture and one practical per student: campus, day, time, subject, room) and `users`.

Diagrams of the hosted setup, local setup and a conversation's life:
[`docs/architecture.md`](docs/architecture.md).

## Run it

You need Python 3.10 (Rasa 3.6 won't take anything newer), Node.js 20+, and
bash for the runner scripts.

```bash
(cd action_server && ./dev-run.sh --setup)     # venv + dependencies
(cd rasa && ./dev-run.sh --setup)
python action_server/database/populate_db.py   # seed the database
```

Then three terminals:

```bash
cd action_server && ./dev-run.sh -r                    # actions on :5055
cd rasa && ./dev-run.sh -b && ./dev-run.sh -r          # train, then chat on :5005
cd web && ./dev-run.sh --setup && ./dev-run.sh -r      # UI on :5173
```

Training takes a while. That's normal.

## Tests

Both servers have to be running. From `rasa/`, venv on:

- `python -m rasa test core --e2e --stories tests/test_stories.yml` replays
  nine conversations end to end.
- `python -m pytest tests/test_dialogues.py` runs 27 dialogue tests, one per
  story plus a few extras, each a live round trip to the REST API.

## Voice input

Talk and the words show up in the box as you speak. Tap the mic again to stop.
The text stays there for you to check, and nothing is sent until you hit send.

Chrome and Edge use the browser's own speech recognition. Where that's missing
or broken (Firefox, Opera GX, locked-down networks) the app switches to a small
Whisper model running on your device: about 50 MB, downloaded once, cached, no
server, no account. It transcribes slices while you talk, then makes one more
pass over the full recording when you stop, so the text you keep is the clean
one. A silent mic gets you a hint, not invented words.

The model is [`onnx-community/whisper-base.en`](https://huggingface.co/onnx-community/whisper-base.en),
the ONNX build of OpenAI's `whisper-base.en`, published by the transformers.js
maintainers. It's pinned to commit `51eefc0`, so nothing pushed to the repo
later can change what runs in your browser. The full hash lives in
`WHISPER_REVISION`, in both `web/src/voice/config.js` and `deploy/static-space/app.js`.

That commit was the head of `main` (dated 2024-10-08) when I pinned it, taken
from the Hub's API. I haven't audited what's inside it. To bump it, grab a new
hash from the [commit list](https://huggingface.co/onnx-community/whisper-base.en/commits/main)
and change both files together, or they'll drift.

## Colour modes

The web chat uses the achromatopsia (greyscale) palette by default, so nothing depends on colour alone. It is named "Default" in the options menu. The menu also offers palettes for protanopia, deuteranopia, tritanopia and deuteranomaly. The choice is saved in the browser, and the palettes are in `web/src/styles/tokens.css`.

## Deployment

The client is a static build on GitHub Pages. Rasa and the action server share
one Docker image on Hugging Face Spaces, with the model trained at build time.
Login runs as a Neon Function beside the database, and the data sits in Neon
Postgres on AWS.

Everything comes from environment variables, which is why `DATABASE_URL` alone
swaps SQLite for Postgres, and why the same image should move to AWS (ECS/EKS +
RDS) without surgery. When the Space is asleep, the UI falls back to an
in-browser demo engine and tells you so in a banner.

To look up a conversation by its ID, see [docs/conversation-logs.md](docs/conversation-logs.md).

## Stack

Python 3.10 · Rasa 3.6 (DIET + TED) · React 19 + Vite · PostgreSQL / SQLite ·
Docker · GitHub Actions · Hugging Face Spaces · GitHub Pages
