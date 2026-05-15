// --- Pure utility functions ---

export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function getRelativeDay(key) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(key + 'T12:00:00');
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
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
