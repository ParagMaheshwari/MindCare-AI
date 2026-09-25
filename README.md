# MindCare AI

A full mental-wellness web app wired up to your real `Mental_Health_Model.pkl`:
**Auth → Dashboard → 4-step Assessment → real ML prediction → Score dashboard →
personalized wellness suggestions → floating AI Assistant (Gemini, backend-only key).**

```
mindcare-ai/
├── backend/
│   ├── main.py                # FastAPI: /predict, /chat, /health
│   ├── Mental_Health_Model.pkl
│   ├── requirements.txt
│   └── .env.example
└── frontend/                  # plain HTML/CSS/JS, no build step
    ├── index.html, login.html, register.html, dashboard.html,
    │   assessment.html, result.html, my-results.html, wellness.html, profile.html
    ├── css/style.css
    └── js/  (api.js, auth.js, app-shell.js, chatbot.js, assessment.js,
              dashboard.js, result-page.js, my-results-page.js, profile.js, results.js)
```

## 1. Run the backend

```bash
cd backend
python -m venv venv && source venv/bin/activate   # optional but recommended
pip install -r requirements.txt
cp .env.example .env          # then paste your real Gemini key into .env
uvicorn main:app --reload --port 8000
```

Visit `http://127.0.0.1:8000/health` — you should see `{"status":"ok","model_loaded":true}`.

**Important — scikit-learn version:** `Mental_Health_Model.pkl` was pickled with
scikit-learn **1.9.0**. `requirements.txt` pins `scikit-learn>=1.5.0` so `pip`
will grab a current release, but if your environment is stuck on an older
0.x/1.x build you may see `InconsistentVersionWarning` messages in the logs.
In testing here the model still predicted correctly despite the warning, but
if you ever see it fail outright, the fix is `pip install -U scikit-learn`.

**Gemini key:** `/chat` reads `GEMINI_API_KEY` from the environment (via
`.env`) and never sends it to the browser. Without a key set, `/chat` returns
HTTP 503 and the frontend shows "The AI assistant is temporarily unavailable" —
everything else in the app (auth, assessment, prediction, dashboard, history)
works with no key at all.

## 2. Run the frontend

No build step — just serve the static folder (opening `index.html` directly
with `file://` also works, but a local server avoids any browser quirks):

```bash
cd frontend
python -m http.server 5500
```

Then open `http://127.0.0.1:5500`. Keep the backend running on port 8000 at
the same time — `frontend/js/api.js` calls `http://127.0.0.1:8000` directly.

## 3. What to know before you demo it

- **This is a prototype auth system.** Accounts and password hashes
  (SHA-256, hashed client-side — never plain text) live in the browser's
  `localStorage`, not a database. `frontend/js/auth.js` isolates every auth
  call behind one small interface (`registerUser`, `loginUser`, `logoutUser`,
  `getCurrentUser`, `requireAuth`) so swapping in real FastAPI + DB-backed
  auth later only means rewriting that one file.
- **Assessment history is also local**, per logged-in email, in
  `frontend/js/results.js`. Same story: one clearly isolated module to swap
  for a real `/results` API later.
- **The one non-obvious backend detail:** your trained pipeline's
  `ColumnTransformer` expects columns named `Study_Hours`, `Age`,
  `Grouped_country`, etc. — not the `snake_case` API field names. I inspected
  the pickle directly (`pipeline.named_steps["preprocessor"].feature_names_in_`)
  to get the exact names and built `FEATURE_COLUMN_MAP` in `main.py` from
  that. `country` is passed straight through as `Grouped_country` — the
  ten-country dropdown in the assessment form already matches what the
  encoder was fit on (`handle_unknown="ignore"` means any other value just
  contributes nothing to that feature rather than erroring). I ran the exact
  example payload from the spec through the real model to confirm this
  produces a sensible score before calling it done.
- Score ranges (`scoreRanges` in `results.js`) and the rule-based
  `generateWellnessSuggestions()` are plain, easy-to-edit JS — nothing here
  is clinically validated, intentionally, per the brief.

## 4. Test accounts

There are none pre-seeded — register a new account from `register.html`
(local to your browser) and it's immediately usable.
