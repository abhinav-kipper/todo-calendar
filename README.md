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

## ✎ Knowledge notebooks

A second app at `/knowledge.html`, same look, same account, different job:
somewhere to dump what you learn and have it come back tidy.

- 📓 A notebook per subject — Dutch class, dance privates, anything
- 🧠 **Brain dump box** — type or dictate; misspelled, half-remembered notes are the point
- ✨ **Structure it** — an LLM splits one dump into clean cards, fixes the foreign
  words, fills in term/translation/article (or count/weight/lead), tags and files them
- 👀 **You review everything** before it's saved — untick, edit inline, duplicate warnings
- 📜 The raw dump is kept on every card it produced, forever
- 🗂 Sections, drag-and-drop between sections and notebooks, long-press menus
- 🃏 Cards / List / Board / Timeline views
- 💬 **Ask this notebook** — answers grounded in your own cards
- ✓ **Check my sentence** — corrections with explanations, savable as a card
- ◉ **Practice** — spaced repetition on starred cards, or an AI quiz
- 📅 **Practice plan** → drops real tasks onto your Almanac calendar
- 🔌 Bring your own free model: Gemini, Groq, OpenRouter, or Ollama running locally
- 🔒 Your API key stays in your browser and is never synced

Works completely without AI — it's a notebook first, an assistant second.

---

## 🧠 Tech stack

This project keeps things simple:

- HTML
- CSS
- Vanilla JavaScript ES modules
- React 18 + Babel standalone, loaded straight from a CDN (no build step)
- Firebase Auth
- Firebase Firestore
- localStorage
- Service Worker / PWA
- Node.js local static server

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
````
