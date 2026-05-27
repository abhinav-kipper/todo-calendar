// Shared utilities and small components.

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAYS_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const QUOTES = [
  "Today is a small page in a long book.",
  "Begin where you are.",
  "Slow is smooth.",
  "Tend to the day at hand.",
  "Small things, done often.",
];

// Daily affirmations — cute, retro, encouraging
const AFFIRMATIONS = [
  "You're doing AMAZING, sweetie! 🌟",
  "Plot twist: today is gonna rule.",
  "Your future self says thank you.",
  "One small win = one big mood.",
  "Be the main character today.",
  "Hydrate. Stretch. Conquer.",
  "Imagine how cool you'll feel after.",
  "You are SO that person.",
  "Bloom where you're planted 🌸",
  "Soft heart, sharp focus.",
  "Today's vibe: unstoppable.",
  "Tiny steps, giant glow-up.",
  "Permission slip: granted ✨",
  "Make today a little sparkle.",
  "Your to-do list is shaking.",
];

// Mood for the day — picks based on completion %
const MOODS = [
  { id: "sleepy",   label: "Sleepy",      icon: "💤", min: -1,   max: 0.0001 },
  { id: "warming",  label: "Warming up",  icon: "☕",  min: 0,    max: 0.25 },
  { id: "cruising", label: "Cruising",    icon: "🌤️", min: 0.25, max: 0.5 },
  { id: "fired-up", label: "Fired up",    icon: "🔥", min: 0.5,  max: 0.75 },
  { id: "soaring",  label: "Soaring",     icon: "🚀", min: 0.75, max: 0.9999 },
  { id: "bloom",    label: "Full bloom",  icon: "🌸", min: 0.9999, max: 2 },
];

const moodFor = (progress, total) => {
  if (total === 0) return MOODS[0];
  return MOODS.find((m) => progress >= m.min && progress < m.max) || MOODS[1];
};

const affirmationFor = (d) => {
  const n = (d.getFullYear() * 31 + d.getMonth() * 7 + d.getDate()) % AFFIRMATIONS.length;
  return AFFIRMATIONS[n];
};

// Sort tasks: undone (by priority high→med→low) first, done at bottom.
const PRIO = { high: 0, medium: 1, low: 2 };
const sortTasks = (list) => {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (PRIO[a.priority] ?? 9) - (PRIO[b.priority] ?? 9);
  });
};

// Parse a quick-add string into { text, dateKey, priority }.
// Examples:
//   "buy milk"               → today
//   "buy milk tomorrow"      → today + 1
//   "lunch w/ priya mon"     → next monday
//   "yoga !!! tomorrow"      → tomorrow, priority high
//   "in 3 days call dentist" → today + 3
const DAY_WORDS = ["sun","mon","tue","wed","thu","fri","sat"];
const DAY_WORDS_LONG = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const parseQuickAdd = (raw, today) => {
  let text = String(raw || "").trim();
  if (!text) return null;
  let date = new Date(today);
  let priority = "low";
  let matched = false;

  // priority: !!! = high, !! = medium
  const prioMatch = text.match(/\s(!{1,3})\s*$/) || text.match(/^(!{1,3})\s/);
  if (prioMatch) {
    const bangs = prioMatch[1].length;
    priority = bangs >= 3 ? "high" : bangs === 2 ? "medium" : "high";
    text = text.replace(prioMatch[0], " ").trim();
  }

  // explicit relative: today, tomorrow, tom, tmrw
  const lower = " " + text.toLowerCase() + " ";
  const tryStrip = (re, daysDelta) => {
    const m = lower.match(re);
    if (m) {
      text = (lower.slice(0, m.index) + " " + lower.slice(m.index + m[0].length)).trim().replace(/\s+/g, " ");
      date.setDate(date.getDate() + daysDelta);
      matched = true;
      return true;
    }
    return false;
  };

  if (tryStrip(/\s(today|tdy)\s/, 0)) {}
  else if (tryStrip(/\s(tomorrow|tmrw|tom)\s/, 1)) {}
  else if (lower.match(/\sin\s(\d+)\s(days?|d)\s/)) {
    const m = lower.match(/\sin\s(\d+)\s(days?|d)\s/);
    text = (lower.slice(0, m.index) + " " + lower.slice(m.index + m[0].length)).trim().replace(/\s+/g, " ");
    date.setDate(date.getDate() + Number(m[1]));
    matched = true;
  }
  else if (lower.match(/\snext\s(week|wk)\s/)) {
    const m = lower.match(/\snext\s(week|wk)\s/);
    text = (lower.slice(0, m.index) + " " + lower.slice(m.index + m[0].length)).trim().replace(/\s+/g, " ");
    date.setDate(date.getDate() + 7);
    matched = true;
  }
  else {
    // Day of week: "mon", "fri", "monday", etc — picks NEXT occurrence (or +7 if same day).
    for (let i = 0; i < 7; i++) {
      const short = DAY_WORDS[i];
      const long = DAY_WORDS_LONG[i];
      const re = new RegExp(`\\s(${long}|${short})\\s`);
      const m = lower.match(re);
      if (m) {
        text = (lower.slice(0, m.index) + " " + lower.slice(m.index + m[0].length)).trim().replace(/\s+/g, " ");
        const today_dow = date.getDay();
        let delta = (i - today_dow + 7) % 7;
        if (delta === 0) delta = 7; // "mon" on Monday = next Monday
        date.setDate(date.getDate() + delta);
        matched = true;
        break;
      }
    }
  }

  // Clean up: capitalize first letter
  text = text.trim();
  if (text.length > 0) text = text[0].toUpperCase() + text.slice(1);

  return { text, dateKey: dateKey(date), date, priority, matched };
};

// Materialize a recurring task across 60 days.
// Returns [{ key, task }] — one entry per occurrence.
// Each occurrence gets a fresh id (via newId) and shares an _originId so we
// can group them later.
const materializeRecurring = (startKey, taskBase, newId) => {
  if (!taskBase.repeat || taskBase.repeat === "none") {
    return [{ key: startKey, task: { ...taskBase } }];
  }
  const out = [];
  const startDate = parseKey(startKey);
  const originId = taskBase.id;
  for (let i = 0; i < 60; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    let matches = false;
    if (taskBase.repeat === "daily") matches = true;
    else if (taskBase.repeat === "weekdays") matches = d.getDay() >= 1 && d.getDay() <= 5;
    else if (taskBase.repeat === "weekly") matches = i % 7 === 0;
    if (matches) {
      out.push({
        key: dateKey(d),
        task: {
          ...taskBase,
          id: i === 0 ? taskBase.id : (newId ? newId() : taskBase.id + "_" + i),
          _originId: originId,
          done: false,
          _new: i === 0,
        },
      });
    }
  }
  return out;
};

const dateKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const parseKey = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const startOfWeek = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
};

const monthMatrix = (year, month) => {
  // returns 6 rows × 7 cells of Date objects, padded around the target month
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const cells = [];
  const cur = new Date(start);
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return cells;
};

// quote of the day - stable per date
const quoteFor = (d) => {
  const n = (d.getFullYear() * 31 + d.getMonth() * 7 + d.getDate()) % QUOTES.length;
  return QUOTES[n];
};

// SVG icons (kept simple)
const Icon = {
  Chevron: ({ dir = "left", size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d={dir === "left" ? "M10 3L5 8L10 13" : "M6 3L11 8L6 13"}
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Plus: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path d="M6 1.5V10.5M1.5 6H10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  Check: ({ size = 10 }) => (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none">
      <path d="M2 5.2L4 7.2L8.2 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Close: ({ size = 12 }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  Trash: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M3 4.5H13M6 4.5V3.5C6 3 6.3 2.5 7 2.5H9C9.7 2.5 10 3 10 3.5V4.5M4.5 4.5L5 13C5 13.5 5.4 14 6 14H10C10.6 14 11 13.5 11 13L11.5 4.5M6.5 7V11.5M9.5 7V11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Note: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="3" y="3" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 6.5H10.5M5.5 9H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  Moon: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M13 9.5C12.3 11.7 10.3 13.3 8 13.3C5 13.3 2.6 10.9 2.6 8C2.6 5.7 4.2 3.7 6.5 3C6.1 4.7 6.5 6.5 7.7 7.7C8.9 8.9 10.7 9.3 12.4 8.9C12.7 9.1 12.9 9.3 13 9.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
  Sun: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 1.5V2.5M8 13.5V14.5M14.5 8H13.5M2.5 8H1.5M12.6 3.4L11.9 4.1M4.1 11.9L3.4 12.6M12.6 12.6L11.9 11.9M4.1 4.1L3.4 3.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  Inbox: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M2 8.5V11.5C2 12.3 2.7 13 3.5 13H12.5C13.3 13 14 12.3 14 11.5V8.5M2 8.5L3.5 4C3.7 3.4 4.2 3 4.9 3H11.1C11.8 3 12.3 3.4 12.5 4L14 8.5M2 8.5H5L6 10H10L11 8.5H14" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  ),
  Focus: ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="1.8" fill="currentColor" />
    </svg>
  ),
  Recur: ({ size = 10 }) => (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path d="M2 6C2 3.8 3.8 2 6 2C7.5 2 8.8 2.8 9.4 4M10 6C10 8.2 8.2 10 6 10C4.5 10 3.2 9.2 2.6 8M9.4 2V4H7.4M2.6 10V8H4.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

// Tiny check box component
function Tickbox({ checked, onChange, size }) {
  const [bouncing, setBouncing] = React.useState(false);
  const handle = (e) => {
    e.stopPropagation();
    setBouncing(true);
    setTimeout(() => setBouncing(false), 400);
    onChange(!checked);
  };
  return (
    <button
      className={`tickbox ${checked ? "checked" : ""} ${bouncing ? "bouncing" : ""}`}
      onClick={handle}
      style={size ? { width: size, height: size, flexBasis: size } : null}
      aria-pressed={checked}
    >
      <Icon.Check />
      {bouncing && <span className="tick-ripple" />}
    </button>
  );
}

window.U = { DAYS, DAYS_FULL, MONTHS, QUOTES, AFFIRMATIONS, MOODS, dateKey, parseKey, sameDay, startOfWeek, monthMatrix, quoteFor, moodFor, affirmationFor, sortTasks, parseQuickAdd, materializeRecurring };
window.Icon = Icon;
window.Tickbox = Tickbox;
