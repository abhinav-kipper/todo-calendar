// --- Pure utility functions ---

export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function getRelativeDay(key) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (key === todayKey) return 'Today';
  const d = new Date(key + 'T12:00:00');
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const diff = Math.round((d - t) / 86400000);
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return '';
}

export function isOverdue(key, getTodosForDay) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(key + 'T12:00:00');
  if (d >= today) return false;
  const dt = getTodosForDay(key);
  return dt.length > 0 && dt.some(t => !t.done);
}

export function calculateStreak(getTodosForDay) {
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let d = new Date(today);
  let empty = 0;
  for (let i = 0; i < 60; i++) {
    const key = dateKey(d);
    const items = getTodosForDay(key);
    if (items.length > 0 && items.every(t => t.done)) {
      streak++;
      empty = 0;
    } else if (items.length > 0) {
      break;
    } else {
      empty++;
      if (empty > 7) break;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function getMonthStats(year, month, getTodosForDay) {
  let total = 0, done = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 1; i <= daysInMonth; i++) {
    const key = dateKey(new Date(year, month, i));
    const dt = getTodosForDay(key);
    total += dt.length;
    done += dt.filter(t => t.done).length;
  }
  return { total, done, pending: total - done };
}

export function getOverdueTodos(todos, maxDays = 7) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let overdue = [];
  for (let i = 1; i <= maxDays; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    const dt = (todos[key] || []).filter(t => !t.recurringId && !t.done);
    overdue.push(...dt.map(t => ({ ...t, fromKey: key })));
  }
  return overdue;
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Pure carry-forward planner: given the todos map and today's key, returns a new
// todos map where every incomplete, non-recurring task on a past day is moved to
// today. Completed tasks and recurring markers stay on their original day so that
// history, streaks, and the heatmap remain accurate. Returns { todos, moved }.
export function planCarryForward(todos, todayKey) {
  const next = {};
  // Shallow-clone every day except today; collect tasks that need to move.
  const moved = [];
  for (const key of Object.keys(todos)) {
    if (key === todayKey) continue;
    const items = todos[key] || [];
    if (key < todayKey) {
      const toMove = items.filter(t => !t.recurringId && !t.done);
      const toKeep = items.filter(t => t.recurringId || t.done);
      if (toMove.length > 0) {
        moved.push(...toMove);
        if (toKeep.length > 0) next[key] = toKeep;
        continue;
      }
    }
    next[key] = items;
  }
  const todayItems = (todos[todayKey] || []).slice();
  if (moved.length > 0) todayItems.push(...moved);
  if (todayItems.length > 0) next[todayKey] = todayItems;
  return { todos: next, moved: moved.length };
}
