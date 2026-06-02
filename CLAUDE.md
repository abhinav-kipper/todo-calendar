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
├── js/
│   ├── app.js          # Main orchestrator: init, view routing, window.app API, all render functions
│   ├── store.js        # State, Firebase, persistence, CRUD (todos, recurring, inbox)
│   ├── utils.js        # Pure functions (dateKey, escapeHtml, stats, streak, overdue)
│   ├── effects.js      # Confetti canvas animation, undo toast system
│   ├── search.js       # Search overlay with fuzzy matching across all todos/notes/inbox
│   └── shortcuts.js    # Keyboard shortcut handler (/, N, I, F, ?, Esc, arrows)
├── tests/
│   ├── utils.test.js   # Unit tests for pure functions (20+ assertions)
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
1. **Firebase Firestore** - signed-in users (`users/{uid}` document with `{todos, recurring}`)
2. **localStorage** keys:
   - `todo-calendar-data` - todos object (keyed by date string YYYY-MM-DD)
   - `todo-calendar-recurring` - recurring todos array
   - `todo-calendar-inbox` - undated inbox items
   - `todo-cal-theme` - "dark" or "light"

### Firebase Config
- Project: `todo-calendar-dde90`
- Console: https://console.firebase.google.com/project/todo-calendar-dde90
- Auth: Google Sign-in (popup flow)
- Firestore rules: `allow read, write: if request.auth != null && request.auth.uid == userId`
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

### Design
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
- `index.html`, `style.css`
- `manifest.json`, `sw.js`
- `icons/` folder (SVG icons, plus PNGs if generated)
- `js/` folder (all .js files)
- `tests/` folder (optional, for dev only)

Do NOT upload: `server.js`, `todos.json`, `node_modules`, `CLAUDE.md`

## Testing

- Open `http://localhost:3847/tests/run.html` in browser
- Tests cover: dateKey, escapeHtml, getRelativeDay, generateId, calculateStreak, getMonthStats, getOverdueTodos
- All tests are pure (no DOM, no Firebase mocking needed)
- Add new test files in `tests/` and import them in `run.html`

## Adding New Features

1. Pure logic → `js/utils.js` (with tests in `tests/utils.test.js`)
2. State/persistence → `js/store.js` (export new functions)
3. UI rendering → `js/app.js` (add render function + expose via `window.app`)
4. Styles → `style.css` (use existing CSS variables)
5. HTML structure → `index.html` (onclick="app.methodName()")
6. Keyboard shortcut → `js/shortcuts.js`

## Known Issues / TODO
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
