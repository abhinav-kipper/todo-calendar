# Todo Calendar

## Project Overview
A single-file dark/light themed calendar todo app hosted on GitHub Pages with Firebase backend.

**Live URL:** https://abhinav-kipper.github.io/todo-calendar/
**Repo:** https://github.com/abhinav-kipper/todo-calendar
**Owner:** Abhinav Mudgal (abhinav-kipper on GitHub)

## Architecture

Single `index.html` file containing all HTML, CSS, and JS. No build step, no dependencies beyond Firebase CDN.

### Storage Layer (priority order):
1. **Firebase Firestore** - when user is signed in with Google (cloud sync, cross-device)
2. **localStorage** - fallback when not signed in or offline (per-browser persistence)

### Firebase Config:
- Project: `todo-calendar-dde90`
- Auth: Google Sign-in (popup flow)
- Database: Firestore (`users/{uid}/todos` document)
- Authorized domain: `abhinav-kipper.github.io`

### Key Design Decisions:
- Side panel (not modal) for day view - slides from right
- CSS variables for theming (`[data-theme="dark"]` / `[data-theme="light"]`)
- Debounced saves (500ms) to avoid thrashing Firestore
- Auto-migration: first Google sign-in migrates localStorage data to Firestore
- Circular SVG progress ring per day
- Todos sorted: undone (by priority) then done
- Theme preference stored in localStorage key `todo-cal-theme`
- Todo data in localStorage key `todo-calendar-data`

## File Structure

```
~/todo-calendar/
├── index.html      # The entire app (upload this to GitHub)
├── server.js       # Local dev server (optional, saves to todos.json)
├── todos.json      # Local server data file (not needed for GitHub Pages)
└── CLAUDE.md       # This file
```

## Deployment

Upload `index.html` to the GitHub repo manually (no git CLI configured on this machine for personal GitHub). The repo deploys via GitHub Pages from `main` branch root.

## Local Development

```bash
cd ~/todo-calendar && node server.js
# Opens at http://localhost:3847
```

Note: The local server uses `todos.json` file storage. The hosted version uses localStorage + Firestore.

## Firebase Console

- URL: https://console.firebase.google.com/project/todo-calendar-dde90
- Auth providers: Google
- Firestore rules: currently in test mode (open read/write)
- TODO: Lock down Firestore rules to only allow authenticated users to read/write their own document

## Important Notes

- The `server.js` and `todos.json` files are NOT needed for the hosted version
- Firebase API key is embedded in `index.html` (this is normal for client-side Firebase - security comes from Firestore rules, not key secrecy)
- No npm/node_modules - pure vanilla JS with Firebase CDN scripts
- Supports keyboard navigation: Enter (add), Esc (close), Arrow keys (prev/next day)
