````md
# 🗓️ Todo Calendar

A fun, fast, calendar-first todo app for people who like seeing their life laid out day by day.

No heavy framework. No build step. Just clean HTML, CSS, vanilla JavaScript modules, Firebase sync, offline support, and a little confetti when you actually finish your tasks. 🎉

Live app: https://abhinav-kipper.github.io/todo-calendar/

---

## ✨ What it does

- 📅 Month view for planning your tasks visually
- 🗓️ Week view for focused short-term planning
- 📥 Inbox for undated “I’ll deal with this later” tasks
- 🎯 Focus mode for today’s tasks
- ✅ Mark tasks as done
- 🚦 Priority levels: low, medium, high
- 🔁 Recurring tasks:
  - Daily
  - Weekdays
  - Weekly
- 📝 Notes on tasks
- 🔍 Search across tasks and notes
- 🧲 Drag tasks between days
- 📦 Move inbox tasks into calendar days
- ⚠️ Carry forward unfinished tasks from the past week
- 🌙 Light/dark theme
- 🎉 Confetti when all tasks for a day are completed
- ↩️ Undo delete
- 📤 Export backup as JSON
- 📥 Import backup from JSON
- 🔐 Google sign-in with Firebase
- ☁️ Cloud sync with Firestore
- 📴 Local/offline mode using localStorage
- 📱 PWA support with manifest + service worker

---

## 🧠 Tech stack

This project keeps things simple:

- HTML
- CSS
- Vanilla JavaScript ES modules
- Firebase Auth
- Firebase Firestore
- localStorage
- Service Worker / PWA
- Node.js local static server

No React.  
No Vite.  
No bundler.  
No npm dependency jungle. 🧘

---

## 🚀 Run locally

Clone the repo:

```bash
git clone https://github.com/abhinav-kipper/todo-calendar.git
cd todo-calendar
```

Start the local server:

```bash
node server.js
```

Open:

```txt
http://localhost:3847
```

Tests are available at:

```txt
http://localhost:3847/tests/run.html
```

---

## ⌨️ Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `/` | Open search |
| `N` | New task for today |
| `I` | Open inbox |
| `F` | Open focus mode |
| `?` | Toggle shortcut help |
| `Esc` | Close panels / search / focus mode |
| `← / →` | Move between days inside task panel |

---

## ☁️ Sync behavior

The app works in three modes:

| Status | Meaning |
|---|---|
| `Local` | You are using localStorage without signing in |
| `Synced` | You are signed in and data is saved to Firestore |
| `Offline` | Firebase failed, so the app falls back to local data |

If you sign in with Google, your tasks can sync through Firebase Firestore.

---

## 📦 Backup and restore

You can export your data as a JSON backup and import it again later.

Export includes:

```json
{
  "todos": {},
  "recurring": []
}
```

---

## 📴 PWA support

The app includes:

- `manifest.json`
- app icons
- `sw.js`
- cache-first app shell
- Firebase network-first handling
- offline fallback for navigation

So yes, it wants to behave like a tiny productivity app living on your device. 📱

---

## 🧪 Tests

Run the app locally and visit:

```txt
http://localhost:3847/tests/run.html
```

---

## 🤝 Contributing

Want to make this calendar more powerful, prettier, or slightly more dangerous to procrastination?

1. Create a branch:

```bash
git checkout -b feature/your-feature-name
```

2. Make changes

3. Commit:

```bash
git commit -m "Add your feature"
```

4. Push:

```bash
git push origin feature/your-feature-name
```

5. Open a Pull Request


Add one if you want others to reuse or contribute under clear terms.
````
