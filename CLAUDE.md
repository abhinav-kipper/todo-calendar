# Todo Calendar

## Project Overview
A calendar-based todo app with Firebase backend, glassmorphism dark/light theme, rich animations, and multiple views. Built as a personal productivity tool.

**Live URL:** https://abhinav-kipper.github.io/todo-calendar/
**Repo:** https://github.com/abhinav-kipper/todo-calendar
**Owner:** Abhinav Mudgal (abhinav-kipper on GitHub, personal account separate from work GitLab)
**Local path:** ~/todo-calendar/

## Architecture

Vanilla ES modules, no bundler. Uses `<script type="module">` which works natively in modern browsers and on GitHub Pages.

### File Structure
```
todo-calendar/
├── index.html          # HTML shell (no logic, just structure + onclick=app.*)
├── style.css           # All styles (themes, glassmorphism, spring animations, responsive)
├── manifest.json       # PWA manifest (app name, icons, display mode)
├── sw.js               # Service worker (cache-first for static, network-first for Firebase)
├── icons/
│   ├── icon-192.svg    # PWA icon 192x192
│   ├── icon-512.svg    # PWA icon 512x512
│   ├── icon-192.png    # PNG fallback (generate via icons/generate.html)
│   ├── icon-512.png    # PNG fallback (generate via icons/generate.html)
│   └── generate.html   # Open in browser to generate PNG icons from SVG
├── knowledge.html      # Knowledge route — notebooks for dumping/structuring what you learn
├── knowledge.css       # Notebook-specific styles (sits on top of almanac.css tokens)
├── js/
│   ├── app.js          # Main orchestrator: init, view routing, window.app API, all render functions
│   ├── store.js        # State, Firebase, persistence, CRUD (todos, recurring, inbox)
│   ├── utils.js        # Pure functions (dateKey, escapeHtml, stats, streak, overdue)
│   ├── effects.js      # Confetti canvas animation, undo toast system
│   ├── search.js       # Search overlay with fuzzy matching across all todos/notes/inbox
│   ├── shortcuts.js    # Keyboard shortcut handler (/, N, I, F, ?, Esc, arrows)
│   ├── knowledge-core.js   # Knowledge: pure logic (parsing, search, SRS, export) — fully tested
│   ├── knowledge-store.js  # Knowledge: state, localStorage, Firestore, CRUD → window.Knowledge
│   ├── knowledge-ai.js     # Knowledge: LLM providers + prompts → window.KnowledgeAI
│   └── knowledge-app.jsx   # Knowledge: the whole React UI
├── tests/
│   ├── utils.test.js   # Unit tests for calendar pure functions (30+ assertions)
│   ├── knowledge.test.js # Unit tests for knowledge-core.js (60+ assertions)
│   └── run.html        # Browser-based test runner (open in browser to run)
├── server.js           # Local dev server (serves all static files + optional JSON API)
├── todos.json          # Local server data file (not needed for hosted version)
└── CLAUDE.md           # This file
```

### Key Patterns
- All HTML onclick handlers call `app.*` (exposed via `window.app` in app.js)
- State lives in `store.js` - single source of truth, exports CRUD functions
- Pure utility functions in `utils.js` are easily testable (no DOM dependency)
- Views are rendered by functions in `app.js` that read from store
- Firebase persistence is transparent - same API for local/cloud
- Undo system captures deleted items and allows 5-second recovery
- Drag-and-drop uses `draggedTodo` variable in app.js for cross-day moves

### Storage Layer
1. **Firebase Firestore**
   - `users/{uid}` - `{todos, recurring}` (calendar)
   - `knowledge/{uid}` - `{notebooks, entries, dumps}` (Knowledge route, separate doc on
     purpose: the calendar writes `users/{uid}` with `.set()`, which would clobber it)
2. **localStorage** keys:
   - `todo-calendar-data` - todos object (keyed by date string YYYY-MM-DD)
   - `todo-calendar-recurring` - recurring todos array
   - `todo-calendar-inbox` - undated inbox items
   - `todo-cal-theme` - "dark" or "light"
   - `almanac-knowledge-notebooks` / `-entries` / `-dumps` - Knowledge data
   - `almanac-knowledge-prefs` - view, sort, last notebook, sound
   - `almanac-knowledge-ai` - AI provider + key. **Device-local, never synced.**

### Firebase Config
- Project: `todo-calendar-dde90`
- Console: https://console.firebase.google.com/project/todo-calendar-dde90
- Auth: Google Sign-in (popup flow)
- Firestore rules (the Knowledge collection needs its own match block):
  ```
  match /users/{userId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
  match /knowledge/{userId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
  ```
  Without the second block the Knowledge route still works — it just stays on
  localStorage and shows "Offline" instead of "Synced".
- Authorized domains: `abhinav-kipper.github.io`, `localhost`
- API key is embedded in store.js (normal for client-side Firebase - security via Firestore rules)

## Features

### Views
- **Month view** - calendar grid, click day to open panel, double-click for quick-add
- **Week view** - 7-column layout with inline checkboxes, quick-add per day, drag between days
- **Inbox** - undated todo bucket, drag items onto calendar days to schedule
- **Focus mode** - full-screen zen view of today's tasks only, large checkboxes, progress counter

### Core
- Dark / Light theme with glassmorphism, spring animations, gradient accents
- Recurring todos (daily, weekdays, weekly)
- Priority levels (low, medium, high) with color coding
- Notes on todos (click to expand, auto-saves on blur)
- Edit task text inline (pencil button in day panel turns the text into an input; Enter/blur saves, Esc cancels) via `store.editTodo`
- Drag reorder within a day (panel)
- Drag between days (panel → calendar, inbox → calendar, week items)
- Quick-add (double-click day cell, inline input in week view, input in focus/inbox)
- Circular SVG progress ring per day (color changes with completion %)
- Overdue indicator (orange border on past days with incomplete todos)
- Confetti celebration when all day's todos completed

### Productivity
- **Search** (keyboard `/`) - searches across all todos, notes, recurring, and inbox
- **Undo** - 5-second toast with timer bar on any delete action
- **Auto carry-forward** - on app load and whenever the date rolls over (midnight, or the tab waking after days away), all unfinished non-recurring tasks from past days are automatically moved onto today so nothing is missed. Completed tasks and recurring markers stay on their original day for history/streaks. Pure logic in `utils.js` (`planCarryForward`), applied via `store.autoCarryForward()`, date-change watch in `app.js`
- **Carry-forward banner** - manual fallback banner showing overdue items from past 7 days with one-click move to today (rarely seen now that carry-forward is automatic)
- **Keyboard shortcuts** - `/` search, `N` new (opens today), `I` inbox, `F` focus, `?` toggle hint, `Esc` close, `←→` navigate days
- Export/Import JSON backup
- Google Sign-in for cross-device cloud sync

## Knowledge route (`knowledge.html`)

A second app on its own URL — `/todo-calendar/knowledge.html` — sharing the
Almanac's design kit, Firebase project and interaction language, but with its
own data and its own hash router (`#/`, `#/n/<notebookId>`).

Built for capturing things learned in a class or a private lesson: you dump
half-remembered, misspelled notes, an LLM turns them into clean filed cards,
and you practise them. It is fully usable with no AI configured.

### Flow
1. **Dump** — a big always-visible box per notebook (`D` to focus), plus
   dictation via the Web Speech API in the notebook's language.
2. **Structure** — the LLM splits one dump into atomic cards, fixes phonetic
   spellings, fills structured fields, tags them and proposes a section.
3. **Review** — nothing is saved until you accept it. Untick cards, edit
   titles/bodies inline, see near-duplicate warnings. "Discard cards, keep raw"
   always available. The original dump is stored on every card it produced.
4. **Tidy** — drag between sections/notebooks, long-press or right-click for the
   action sheet, double-click any title or body to edit.
5. **Practise** — star a card to add it to an SM-2-lite rotation, or generate an
   AI quiz. Push practice tasks onto the calendar.

### Concepts
- **Notebook** — one subject. Has a `kind` (`language` / `dance` / `general`)
  that decides starter sections, card types and the AI persona; plus `topic`
  (free text: "Dutch, A2, evening class") and `aiNotes` (standing instructions,
  e.g. "always give the article and plural"). Both are injected into every prompt
  — this is the main quality lever.
- **Entry (card)** — `{type, title, body, fields, tags, raw, sectionId, lessonDate, srs}`.
  `fields` is the structured part (term/translation/article, or count/weight/lead).
  `raw` is what you originally dumped and is never overwritten.
- **Section** — a chapter inside a notebook, and a drop target.
- **Dump** — the raw capture record, kept so a failed AI call never loses text.

### Views
Cards (grid) · List (compact rows) · Board (kanban by section, drag to file) ·
Timeline (grouped by lesson date). Plus Ask (chat grounded in the notebook),
Practice, Check-my-sentence (language notebooks) and Practice plan.

### AI layer (`js/knowledge-ai.js`)
Provider-agnostic, bring-your-own-key, all free-tier friendly:
Gemini (default), Groq, OpenRouter, Ollama (local, fully offline), or any
OpenAI-compatible endpoint. Two request shapes (Gemini-native and
`/chat/completions`) cover all of them. Keys live in localStorage on that device
only and are never written to Firestore. Responses are parsed with
`extractJson`, which digs JSON out of prose and code fences.

Adding an operation: write the prompt + parser in `knowledge-ai.js`, then a
review UI in `knowledge-app.jsx` — never let a model write to the store directly.

Two traps worth knowing about, both handled in `callGemini` / `readJson`:
- **Gemini 2.5 thinks by default and its thinking tokens come out of
  `maxOutputTokens`.** Left alone, a long dump burns the budget reasoning and
  returns nothing or half a JSON object, after a long wait. `thinkingFor()`
  sets `thinkingBudget: 0` for 2.5 Flash (128 for Pro, its minimum); the budget
  is 8192. Don't remove that without raising the budget a lot.
- **A truncated reply parses "successfully".** `extractJson` returns the first
  balanced fragment it finds — one card out of twelve — which looks fine. So
  every operation reads the reply twice (plain and `repairJson`, which closes
  the open braces at the last complete value) and keeps whichever is actually
  usable. When the salvage path fires, the review sheet says so.

### Calendar bridge
`Knowledge.sendToAlmanac(text, dayKey, priority)` re-reads the calendar from
Firestore, appends the task and saves, so a stale in-memory copy can't clobber
the cloud. Used by "Practise on a day" and by "Practice plan".

## Design
- Custom penguin mascot favicon (SVG, visible in browser tab)
- Glassmorphism (backdrop-filter blur on cards/toolbar)
- Spring cubic-bezier animations on all interactions
- Checkbox bounce animation on complete
- Staggered todo entrance animations
- Glow effects on today cell and hover states
- Gradient title, buttons, progress ring

### PWA (Progressive Web App)
- Installable on iOS/Android home screens (standalone mode, no browser chrome)
- Offline support via service worker (cache-first for static assets)
- Network-first strategy for Firebase API calls (sync when online, degrade gracefully offline)
- Versioned cache (`CACHE_NAME` in sw.js) - bump version to force update
- Safe-area-inset padding for notched phones
- Touch targets sized to 44px minimum on touch devices
- To update the cached app: bump `CACHE_NAME` in `sw.js`, deploy, user gets new version on next visit

## Local Development

```bash
cd ~/todo-calendar && node server.js
# App: http://localhost:3847
# Tests: http://localhost:3847/tests/run.html
```

Server serves all static files (HTML, CSS, JS, tests) and optionally the JSON API for local persistence.

## Deployment

Upload all files to the GitHub repo manually (no git CLI configured for personal GitHub on this machine due to corporate network). GitHub Pages serves from `main` branch root. ES modules work without a bundler.

**Important:** When deploying, upload these files:
- `index.html`, `knowledge.html`, `style.css`, `almanac.css`, `almanac-fixes.css`, `knowledge.css`
- `manifest.json`, `sw.js`
- `icons/` folder (SVG icons, plus PNGs if generated)
- `js/` folder (all .js files)
- `tests/` folder (optional, for dev only)

Do NOT upload: `server.js`, `todos.json`, `node_modules`, `CLAUDE.md`

## Testing

- Open `http://localhost:3847/tests/run.html` in browser (runs both suites)
- To click through the app with no network (CDN scripts blocked), vendor the
  libs once and generate offline copies of the pages — both are gitignored:
  ```bash
  mkdir -p vendor && cd vendor
  curl -sSLO https://unpkg.com/react@18.3.1/umd/react.production.min.js
  curl -sSLO https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js
  curl -sSL -o babel.min.js https://unpkg.com/@babel/standalone@7.29.0/babel.min.js
  for f in firebase-app-compat firebase-auth-compat firebase-firestore-compat; do
    curl -sSL -o $f.js https://www.gstatic.com/firebasejs/10.12.0/$f.js; done
  cd .. && for src in index knowledge; do
    sed -e 's#https://unpkg.com/react@18.3.1/umd/#vendor/#' \
        -e 's#https://unpkg.com/react-dom@18.3.1/umd/#vendor/#' \
        -e 's#https://unpkg.com/@babel/standalone@7.29.0/#vendor/#' \
        -e 's#https://www.gstatic.com/firebasejs/10.12.0/#vendor/#' \
        $src.html > $src.test.html; done
  ```
- Calendar tests cover: dateKey, escapeHtml, getRelativeDay, generateId, calculateStreak, getMonthStats, getOverdueTodos, planCarryForward
- Knowledge tests cover: slug, extractJson, parseEntryDrafts, sanitizeEntry, search, similarity/duplicates, reorder, SRS scheduling, grouping, markdown export
- All tests are pure (no DOM, no Firebase mocking needed)
- Add new test files in `tests/` and import them in `run.html`

## Adding New Features

### Knowledge route
1. Pure logic → `js/knowledge-core.js` (with tests in `tests/knowledge.test.js`)
2. State/persistence → `js/knowledge-store.js` (export it on the `Knowledge` object)
3. Prompts → `js/knowledge-ai.js`
4. UI → `js/knowledge-app.jsx`, styles → `knowledge.css` (reuse almanac.css tokens)

### Calendar
1. Pure logic → `js/utils.js` (with tests in `tests/utils.test.js`)
2. State/persistence → `js/store.js` (export new functions)
3. UI rendering → `js/app.js` (add render function + expose via `window.app`)
4. Styles → `style.css` (use existing CSS variables)
5. HTML structure → `index.html` (onclick="app.methodName()")
6. Keyboard shortcut → `js/shortcuts.js`

## Known Issues / TODO
- Knowledge: the AI provider key sits in localStorage, visible to anyone with the
  device / devtools. Fine for a personal tool with a free-tier key; restrict the
  key by referrer in the provider console if that matters.
- Knowledge: cloud sync is one Firestore document per user, so it stops syncing
  (and says so) past ~700KB. Thousands of cards before that becomes real.
- Knowledge: dictation uses the Web Speech API — Chrome and Safari only.
- GitHub Pages deployment is manual (upload via web UI) since git SSH/HTTPS is blocked on corporate network
- Firestore rules are locked down (no longer test mode) - no expiration concerns
- Inbox data is localStorage-only (not synced to Firebase) - could be added to Firestore document
- The `search.js` module imports `todos` and `recurring` from store but these are `let` exports which may not reflect latest state in some edge cases - could be refactored to use getter functions

## Design Decisions
- Single HTML file was outgrown at ~1100 lines → split into ES modules
- No build step / bundler to keep it simple and instantly deployable to GitHub Pages
- Firebase compat SDK (not modular) to avoid bundler requirement
- All state mutations go through `store.js` functions for consistency
- `window.app` pattern chosen over event delegation for simplicity with inline onclick handlers
- Confetti uses raw canvas for zero-dependency animation
- Spring easing (`cubic-bezier(0.34, 1.56, 0.64, 1)`) used throughout for playful feel
