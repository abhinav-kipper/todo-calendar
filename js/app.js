// --- Main app initialization ---
import { dateKey, escapeHtml, getRelativeDay, isOverdue, calculateStreak, getMonthStats, getOverdueTodos } from './utils.js';
import * as store from './store.js';
import { initConfetti, launchConfetti, pushUndo, performUndo } from './effects.js';
import { initShortcuts } from './shortcuts.js';
import { openSearch, closeSearch, performSearch, initSearch } from './search.js';

// --- Globals exposed to HTML onclick handlers ---
let currentDate = new Date();
let selectedDate = null;
let currentPriority = 'low';
let currentRepeat = 'none';
let currentView = 'month';
let clickTimer = null;
let draggedTodo = null;

// --- Theme ---
function toggleTheme() {
  const h = document.documentElement;
  const n = h.dataset.theme === 'dark' ? 'light' : 'dark';
  h.dataset.theme = n;
  localStorage.setItem('todo-cal-theme', n);
  document.getElementById('themeBtn').innerHTML = n === 'dark' ? '&#9790;' : '&#9728;';
}

function initTheme() {
  const s = localStorage.getItem('todo-cal-theme');
  if (s) {
    document.documentElement.dataset.theme = s;
    document.getElementById('themeBtn').innerHTML = s === 'dark' ? '&#9790;' : '&#9728;';
  }
}

// --- Sync Status ---
function showSyncStatus(t) {
  const b = document.getElementById('syncBadge');
  b.textContent = t;
  if (t === 'Synced') { b.style.color = 'var(--green)'; b.style.background = 'var(--green-dim)'; }
  else if (t === 'Local') { b.style.color = 'var(--accent)'; b.style.background = 'var(--accent-dim)'; }
  else { b.style.color = 'var(--orange)'; b.style.background = 'var(--orange-dim)'; }
}

// --- Auth UI ---
function updateAuthUI(user) {
  const s = document.getElementById('authSection');
  if (user) {
    s.innerHTML = `<div class="user-info"><img class="user-avatar" src="${user.photoURL || ''}" alt=""><span>${user.displayName || user.email}</span></div><button class="sign-out-btn" onclick="app.signOut()">Sign out</button>`;
  } else {
    s.innerHTML = `<button class="auth-btn" onclick="app.signInWithGoogle()"><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt=""> Sign in</button>`;
  }
}

// --- Views ---
function setView(v) {
  currentView = v;
  document.getElementById('monthView').style.display = v === 'month' ? 'block' : 'none';
  document.getElementById('weekView').style.display = v === 'week' ? 'block' : 'none';
  document.getElementById('inboxView').style.display = v === 'inbox' ? 'block' : 'none';
  document.getElementById('yearView').style.display = v === 'year' ? 'block' : 'none';
  document.getElementById('viewMonthBtn').classList.toggle('btn-active', v === 'month');
  document.getElementById('viewWeekBtn').classList.toggle('btn-active', v === 'week');
  document.getElementById('inboxBtn').classList.toggle('btn-active', v === 'inbox');
  document.getElementById('viewYearBtn').classList.toggle('btn-active', v === 'year');
  if (v === 'inbox') renderInboxView();
  else if (v === 'year') renderYearView();
  else render();
}

function render() {
  if (currentView === 'month') renderCalendar();
  else if (currentView === 'week') renderWeekView();
  else if (currentView === 'year') renderYearView();
  updateStats();
}

// --- Stats ---
function updateStats() {
  const { total, done, pending } = getMonthStats(currentDate.getFullYear(), currentDate.getMonth(), store.getTodosForDay);
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statDone').textContent = done;
  const streakVal = calculateStreak(store.getTodosForDay);
  document.getElementById('statStreak').textContent = streakVal;
  const flameBadge = document.getElementById('flameBadge');
  if (flameBadge) flameBadge.classList.toggle('flame-active', streakVal > 0);
  updateInboxBadge();
}

function updateInboxBadge() {
  const inbox = store.getInbox();
  const badge = document.getElementById('inboxBadge');
  const pending = inbox.filter(t => !t.done).length;
  if (pending > 0) { badge.textContent = pending; badge.style.display = 'inline'; }
  else { badge.style.display = 'none'; }
}

// --- Month View ---
function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const year = currentDate.getFullYear(), month = currentDate.getMonth();
  document.getElementById('monthLabel').textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const fd = new Date(year, month, 1).getDay(), dim = new Date(year, month + 1, 0).getDate(), dip = new Date(year, month, 0).getDate();
  const today = new Date();
  let html = '';
  for (let i = fd - 1; i >= 0; i--) html += buildDayCell(new Date(year, month - 1, dip - i), dip - i, true, today);
  for (let i = 1; i <= dim; i++) html += buildDayCell(new Date(year, month, i), i, false, today);
  const total = Math.ceil((fd + dim) / 7) * 7;
  for (let i = 1; i <= total - (fd + dim); i++) html += buildDayCell(new Date(year, month + 1, i), i, true, today);
  grid.innerHTML = html;
}

function buildDayCell(date, dayNum, otherMonth, today) {
  const key = dateKey(date), dt = store.getTodosForDay(key);
  const isToday = date.toDateString() === today.toDateString();
  const isSel = selectedDate && date.toDateString() === selectedDate.toDateString();
  const has = dt.length > 0, allDone = has && dt.every(t => t.done);
  const overdue = !otherMonth && isOverdue(key, store.getTodosForDay);

  let cls = 'day-cell';
  if (otherMonth) cls += ' other-month'; if (isToday) cls += ' today'; if (isSel) cls += ' selected';
  if (has) cls += ' has-todos'; if (allDone) cls += ' has-all-done'; if (overdue) cls += ' overdue';

  let badge = ''; if (has) { const dc = dt.filter(t => t.done).length; badge = `<span class="day-badge">${dc}/${dt.length}</span>`; }

  let preview = '';
  dt.slice(0, 3).forEach(t => {
    const d = t.done ? ' done' : '', p = t.priority !== 'low' ? ` priority-${t.priority}` : '';
    const txt = t.text.length > 14 ? t.text.slice(0, 14) + '\u2026' : t.text;
    const rec = t.isRecurring ? '<span class="recurring-badge">&#8635;</span>' : '';
    preview += `<div class="todo-preview-item${d}${p}"><span class="todo-preview-dot"></span>${escapeHtml(txt)}${rec}</div>`;
  });
  if (dt.length > 3) preview += `<div class="todo-overflow">+${dt.length - 3} more</div>`;

  return `<div class="${cls}" onclick="app.handleDayClick('${key}')" ondblclick="app.handleDayDblClick(event,'${key}')" ondragover="event.preventDefault()" ondragenter="this.classList.add('drop-target')" ondragleave="this.classList.remove('drop-target')" ondrop="this.classList.remove('drop-target');app.handleCalendarDrop(event,'${key}')"><div class="day-number">${dayNum}${badge}</div><div class="day-todos-preview">${preview}</div></div>`;
}

// --- Week View ---
function renderWeekView() {
  const grid = document.getElementById('weekGrid');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sow = new Date(currentDate); sow.setDate(sow.getDate() - sow.getDay());
  document.getElementById('monthLabel').textContent = sow.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' \u2013 ' +
    new Date(sow.getTime() + 6 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(sow); d.setDate(d.getDate() + i);
    const key = dateKey(d); const dt = store.getTodosForDay(key);
    const isToday = d.toDateString() === today.toDateString();
    const overdue = isOverdue(key, store.getTodosForDay);
    const hc = isToday ? ' today' : overdue ? ' overdue' : '';

    html += `<div class="week-day-col" ondragover="event.preventDefault()" ondragenter="this.classList.add('drop-target')" ondragleave="this.classList.remove('drop-target')" ondrop="this.classList.remove('drop-target');app.handleCalendarDrop(event,'${key}')"><div class="week-day-header${hc}" onclick="app.openDay('${key}')"><div class="day-name">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div><div class="day-num">${d.getDate()}</div></div><div class="week-todo-list">`;

    dt.slice(0, 15).forEach((t, idx) => {
      const dc = t.done ? ' done' : '';
      const pc = t.priority === 'high' ? 'var(--red)' : t.priority === 'medium' ? 'var(--orange)' : 'var(--accent)';
      const isRec = !!t.isRecurring;
      const dragAttr = !isRec ? ` draggable="true" ondragstart="app.startCrossDayDrag(event,'${key}',${idx})"` : '';
      html += `<div class="week-todo-item${dc}"${dragAttr}><input type="checkbox" ${t.done ? 'checked' : ''} onchange="app.toggleWeekTodo('${key}',${idx},${isRec},'${t.id || ''}')" aria-label="${escapeHtml(t.text)}"><span class="week-todo-text">${escapeHtml(t.text)}</span><span class="priority-dot" style="background:${pc}"></span><button class="delete-btn" onclick="app.deleteWeekTodo('${key}',${idx},${isRec},'${t.id || ''}')" style="opacity:0.5;font-size:0.7rem;padding:2px 5px;border:none;background:none;color:var(--text-muted);cursor:pointer" aria-label="Delete">&#10005;</button></div>`;
    });
    if (dt.length > 15) html += `<div style="font-size:0.6rem;color:var(--text-muted);text-align:center;padding:3px">+${dt.length - 15} more</div>`;
    html += `</div><input class="week-add-input" placeholder="+ Add" onkeydown="app.weekQuickAdd(event,'${key}')" aria-label="Add todo"></div>`;
  }
  grid.innerHTML = html;
}

// --- Year Heatmap View ---
function renderYearView() {
  const grid = document.getElementById('yearGrid');
  const year = currentDate.getFullYear();
  document.getElementById('monthLabel').textContent = String(year);

  const jan1 = new Date(year, 0, 1);
  const totalDays = Math.round((new Date(year, 11, 31) - jan1) / 86400000) + 1;
  const startDow = jan1.getDay();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const dayStats = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(year, 0, 1 + i);
    const key = dateKey(d);
    const todos = store.getTodosForDay(key);
    dayStats.push({ key, total: todos.length, done: todos.filter(t => t.done).length, date: d });
  }

  function getLevel(total, done) {
    if (total === 0) return 0;
    const pct = done / total;
    if (pct === 1) return 4;
    if (pct >= 0.8) return 3;
    if (pct >= 0.5) return 2;
    return 1;
  }

  const totalCols = Math.ceil((startDow + totalDays) / 7);

  let monthLabels = '';
  for (let m = 0; m < 12; m++) {
    const col = Math.floor((startDow + Math.round((new Date(year, m, 1) - jan1) / 86400000)) / 7);
    monthLabels += `<div class="hm-month-label" style="grid-column:${col + 2}">${MONTHS[m]}</div>`;
  }

  let dowLabels = '';
  ['', 'Mon', '', 'Wed', '', 'Fri', ''].forEach((label, row) => {
    dowLabels += `<div class="hm-dow-label" style="grid-row:${row + 2}">${label}</div>`;
  });

  let cells = '';
  for (let i = 0; i < totalDays; i++) {
    const { key, total, done, date } = dayStats[i];
    const level = getLevel(total, done);
    const col = Math.floor((startDow + i) / 7) + 2;
    const row = ((startDow + i) % 7) + 2;
    const isToday = date.toDateString() === today.toDateString();
    const isFuture = date > today;
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    cells += `<div class="hm-cell hm-level-${level}${isToday ? ' hm-cell-today' : ''}${isFuture ? ' hm-cell-future' : ''}" `
           + `style="grid-column:${col};grid-row:${row}" `
           + `data-key="${key}" data-total="${total}" data-done="${done}" data-date="${dateStr}" `
           + `onclick="app.heatmapCellClick('${key}')" `
           + `onmouseenter="app.heatmapShowTooltip(event,this)" onmouseleave="app.heatmapHideTooltip()"></div>`;
  }

  grid.innerHTML = `<div class="hm-grid" style="--hm-cols:${totalCols + 1}">${monthLabels}${dowLabels}${cells}</div>`;

  if (!document.getElementById('heatmapTooltip')) {
    const tip = document.createElement('div');
    tip.id = 'heatmapTooltip'; tip.className = 'hm-tooltip';
    document.body.appendChild(tip);
  }
}

// --- Parallax Calendar ---
function initParallax() {
  if (window.matchMedia('(pointer: coarse)').matches) return;
  const container = document.getElementById('monthView');
  if (!container) return;
  let rafId = null;
  container.addEventListener('mousemove', e => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const grid = document.getElementById('calendarGrid');
      if (!grid) return;
      const rect = container.getBoundingClientRect();
      const normX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const normY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      grid.style.setProperty('--parallax-x', `${normX * 3}px`);
      grid.style.setProperty('--parallax-y', `${normY * 2}px`);
    });
  });
  container.addEventListener('mouseleave', () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    const grid = document.getElementById('calendarGrid');
    if (grid) { grid.style.setProperty('--parallax-x', '0px'); grid.style.setProperty('--parallax-y', '0px'); }
  });
}

// --- Panel ---
function openDay(key) {
  selectedDate = new Date(key + 'T12:00:00');
  document.getElementById('panelOverlay').classList.add('open');
  document.getElementById('panel').style.display = 'flex';
  document.getElementById('panelTitle').textContent = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
  const sub = selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const rel = getRelativeDay(key);
  document.getElementById('panelSub').textContent = rel ? `${sub} \u2022 ${rel}` : sub;
  renderProgress(key); renderPanelTodoList(key); renderYesterdayCarry(key); render();
  setTimeout(() => document.getElementById('todoInput').focus(), 150);
}

function renderYesterdayCarry(key) {
  const banner = document.getElementById('yesterdayCarryBanner');
  if (!banner) return;
  const todayKey = dateKey(new Date());
  if (key !== todayKey) { banner.innerHTML = ''; return; }
  const count = store.getYesterdayOpenCount();
  if (count === 0) { banner.innerHTML = ''; return; }
  banner.innerHTML = `<div class="carry-forward-banner"><span>&#8634; <strong>${count}</strong> unfinished task${count > 1 ? 's' : ''} from yesterday</span><button onclick="app.carryYesterdayToToday()">Move to Today</button></div>`;
}

function closePanel() {
  document.getElementById('panelOverlay').classList.remove('open');
  document.getElementById('panel').style.display = 'none';
  selectedDate = null; render();
}

function navDay(delta) {
  if (!selectedDate) return;
  selectedDate.setDate(selectedDate.getDate() + delta);
  openDay(dateKey(selectedDate));
}

function renderProgress(key) {
  const dt = store.getTodosForDay(key), section = document.getElementById('progressSection');
  if (dt.length === 0) { section.innerHTML = ''; return; }
  const done = dt.filter(t => t.done).length, pct = Math.round((done / dt.length) * 100);
  const circ = 2 * Math.PI * 18, offset = circ - (pct / 100) * circ;
  const color = pct === 100 ? 'var(--green)' : pct >= 50 ? 'var(--accent)' : pct > 0 ? 'var(--orange)' : 'var(--text-muted)';
  section.innerHTML = `<div class="panel-progress"><svg class="progress-ring" viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="18"/><circle class="fill" cx="22" cy="22" r="18" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" transform="rotate(-90 22 22)" style="stroke:${color}"/></svg><div class="progress-text"><span class="pct" style="color:${color}">${pct}%</span><span class="label">${done} of ${dt.length} done</span></div></div>`;
}

function renderPanelTodoList(key) {
  const dt = store.getTodosForDay(key), container = document.getElementById('todoListContainer');
  if (dt.length === 0) { container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">&#9744;</div>No tasks yet. Add one above!</div>`; return; }

  const baseItems = (store.todos[key] || []).filter(t => !t.recurringId);
  const recItems = dt.filter(t => t.isRecurring);
  const undone = [...baseItems.map((t, i) => ({ ...t, realIdx: i, isRec: false })).filter(t => !t.done), ...recItems.filter(t => !t.done).map(t => ({ ...t, realIdx: -1, isRec: true }))];
  const doneArr = [...baseItems.map((t, i) => ({ ...t, realIdx: i, isRec: false })).filter(t => t.done), ...recItems.filter(t => t.done).map(t => ({ ...t, realIdx: -1, isRec: true }))];
  const prioOrder = { high: 0, medium: 1, low: 2 };
  undone.sort((a, b) => (prioOrder[a.priority] || 2) - (prioOrder[b.priority] || 2));

  let html = '';
  if (undone.length > 0) { html += `<div class="todo-section-label">To do (${undone.length})</div><div class="todo-list" data-key="${key}" data-section="undone">`; html += undone.map(t => renderPanelTodoItem(key, t)).join(''); html += '</div>'; }
  if (doneArr.length > 0) { html += `<div class="todo-section-label">Completed (${doneArr.length})</div><div class="todo-list">`; html += doneArr.map(t => renderPanelTodoItem(key, t)).join(''); html += '</div>'; }
  container.innerHTML = html;
  initDragDrop(key);
}

function renderPanelTodoItem(key, todo) {
  const prioTag = todo.priority !== 'low' ? `<span class="priority-tag ${todo.priority}">${todo.priority}</span>` : '';
  const timeStr = todo.created ? new Date(todo.created).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  const recBadge = todo.isRec ? `<span class="recurring-badge">&#8635; ${todo.repeat || ''}</span>` : '';
  const noteInd = (!todo.isRec && todo.notes) ? '<span class="note-indicator">&#9998; note</span>' : '';
  const noteClick = !todo.isRec ? `onclick="app.toggleNotes('${key}',${todo.realIdx})"` : '';
  const editBtn = todo.isRec ? '' : `<button class="edit-btn" onclick="event.stopPropagation();app.editTodoText('${key}',${todo.realIdx})" aria-label="Edit">&#9998;</button>`;
  const delBtn = todo.isRec
    ? `<button class="delete-btn" onclick="event.stopPropagation();app.deleteRecurring('${todo.id}')" aria-label="Delete">&#10005;</button>`
    : `<button class="delete-btn" onclick="event.stopPropagation();app.deleteTodoWithUndo('${key}',${todo.realIdx})" aria-label="Delete">&#10005;</button>`;
  return `<div class="todo-item${todo.done ? ' done' : ''}" draggable="${!todo.isRec}" data-real-idx="${todo.realIdx}" data-key="${key}" ondragstart="app.startCrossDayDrag(event,'${key}',${todo.realIdx})"><input type="checkbox" ${todo.done ? 'checked' : ''} onchange="app.toggleTodo('${key}',${todo.realIdx},${todo.isRec},'${todo.id || ''}')" aria-label="${escapeHtml(todo.text)}"><div class="todo-item-content" ${noteClick}><span class="todo-text">${escapeHtml(todo.text)}</span><div class="todo-meta">${prioTag}${recBadge}${noteInd}<span>${timeStr}</span></div></div>${editBtn}${delBtn}</div>`;
}

// --- Drag & Drop ---
function initDragDrop(key) {
  const lists = document.querySelectorAll('.todo-list[data-section="undone"]');
  lists.forEach(list => {
    const items = list.querySelectorAll('.todo-item[draggable="true"]');
    items.forEach(item => {
      item.addEventListener('dragstart', e => { item.classList.add('dragging'); e.dataTransfer.setData('text/plain', item.dataset.realIdx); e.dataTransfer.effectAllowed = 'move'; });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      item.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; item.classList.add('drag-over'); });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
      item.addEventListener('drop', e => {
        e.preventDefault(); item.classList.remove('drag-over');
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
        const toIdx = parseInt(item.dataset.realIdx);
        if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
        store.reorderTodo(key, fromIdx, toIdx);
        renderPanelTodoList(key);
      });
    });
  });
}

// --- Inbox View ---
function renderInboxView() {
  const inbox = store.getInbox(); const container = document.getElementById('inboxContent');
  let html = `<div style="max-width:560px;margin:0 auto;padding:20px 0">
    <h2 style="font-size:1.3rem;font-weight:800;margin-bottom:4px">Inbox</h2>
    <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:20px">Undated tasks. Drag them to a day when ready.</p>
    <div class="add-todo-input-row" style="margin-bottom:16px">
      <input type="text" id="inboxInput" placeholder="Capture a thought..." onkeydown="if(event.key==='Enter')app.addInboxTodo()" maxlength="500" style="background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-primary);padding:12px 16px;border-radius:10px;font-size:0.87rem;outline:none;flex:1">
      <button onclick="app.addInboxTodo()" style="background:var(--gradient-green);border:none;color:#fff;padding:12px 18px;border-radius:10px;cursor:pointer;font-weight:600;font-size:0.84rem">Add</button>
    </div>`;
  if (inbox.length === 0) { html += `<div class="empty-state"><div class="empty-state-icon">&#128230;</div>Inbox empty. Capture ideas here without a date.</div>`; }
  else {
    html += '<div class="todo-list">';
    inbox.forEach((t, i) => {
      html += `<div class="todo-item${t.done ? ' done' : ''}" draggable="true" ondragstart="app.startInboxDrag(event,${i})"><input type="checkbox" ${t.done ? 'checked' : ''} onchange="app.toggleInboxTodo(${i})" aria-label="${escapeHtml(t.text)}"><div class="todo-item-content"><span class="todo-text">${escapeHtml(t.text)}</span></div><button class="delete-btn" onclick="app.deleteInboxTodoWithUndo(${i})" aria-label="Delete">&#10005;</button></div>`;
    });
    html += '</div>';
  }
  html += '</div>'; container.innerHTML = html;
  setTimeout(() => { const inp = document.getElementById('inboxInput'); if (inp) inp.focus(); }, 100);
}

// --- Focus Mode ---
function openFocusMode() {
  document.getElementById('focusOverlay').classList.add('open');
  const today = new Date();
  document.getElementById('focusTitle').textContent = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  renderFocusView();
}

function closeFocusMode() { document.getElementById('focusOverlay').classList.remove('open'); }

function renderFocusView() {
  const key = dateKey(new Date()); const dt = store.getTodosForDay(key); const container = document.getElementById('focusContent');
  if (dt.length === 0) { container.innerHTML = '<div class="focus-empty">Nothing planned for today. Enjoy your free day!</div><div style="text-align:center;margin-top:20px"><input class="week-add-input" style="max-width:300px;padding:12px 16px;font-size:0.9rem;border-radius:10px" placeholder="Add a task for today..." onkeydown="app.focusQuickAdd(event)"></div>'; return; }
  const done = dt.filter(t => t.done).length, pct = Math.round((done / dt.length) * 100);
  const color = pct === 100 ? 'var(--green)' : pct >= 50 ? 'var(--accent)' : 'var(--orange)';
  let html = `<div class="focus-progress"><div class="big-pct" style="color:${color}">${pct}%</div><div class="sub">${done} of ${dt.length} tasks completed</div></div>`;
  html += `<div style="margin-bottom:16px"><input class="week-add-input" style="padding:12px 16px;font-size:0.88rem;border-radius:10px" placeholder="Add a task..." onkeydown="app.focusQuickAdd(event)"></div>`;
  html += '<div class="focus-todo-list">';
  dt.forEach((t, i) => {
    const doneCls = t.done ? ' done' : ''; const isRec = !!t.isRecurring;
    const prioHtml = t.priority !== 'low' ? `<span class="focus-prio" style="background:${t.priority === 'high' ? 'var(--red-dim)' : 'var(--orange-dim)'};color:${t.priority === 'high' ? 'var(--red)' : 'var(--orange)'}">${t.priority}</span>` : '';
    html += `<div class="focus-todo-item${doneCls}" style="animation-delay:${i * 0.05}s"><input type="checkbox" ${t.done ? 'checked' : ''} onchange="app.toggleFocusTodo(${i},${isRec},'${t.id || ''}')" aria-label="${escapeHtml(t.text)}"><span class="focus-text">${escapeHtml(t.text)}</span>${prioHtml}<button class="delete-btn" onclick="app.deleteFocusTodo(${i},${isRec},'${t.id || ''}')" style="opacity:0.6;font-size:0.9rem;padding:4px 8px;border:none;background:none;color:var(--text-muted);cursor:pointer" aria-label="Delete">&#10005;</button></div>`;
  });
  html += '</div>'; container.innerHTML = html;
}

// --- Carry Forward ---
function checkCarryForward() {
  const overdue = getOverdueTodos(store.todos);
  const banner = document.getElementById('carryForwardBanner');
  if (overdue.length === 0) { banner.innerHTML = ''; return; }
  banner.innerHTML = `<div class="carry-forward-banner"><span>&#9888; You have <strong>${overdue.length}</strong> unfinished task${overdue.length > 1 ? 's' : ''} from the past week</span><button onclick="app.carryForwardAll()">Move to Today</button></div>`;
}

// --- Export App API (accessible from HTML onclick handlers) ---
window.app = {
  // Auth
  signInWithGoogle: () => store.signInWithGoogle(),
  signOut: () => store.signOut(),

  // Navigation
  changeMonth(delta) { if (currentView === 'week') currentDate.setDate(currentDate.getDate() + delta * 7); else if (currentView === 'year') currentDate.setFullYear(currentDate.getFullYear() + delta); else currentDate.setMonth(currentDate.getMonth() + delta); render(); },
  goToday() { currentDate = new Date(); render(); },
  setView,
  openDay,
  closePanel,
  navDay,
  toggleTheme,

  // Day click handling
  handleDayClick(key) { if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; } clickTimer = setTimeout(() => { clickTimer = null; openDay(key); }, 220); },
  handleDayDblClick(e, key) { if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; } quickAdd(e, key); },

  // Todo actions
  addTodo() {
    const input = document.getElementById('todoInput'), text = input.value.trim();
    if (!text || !selectedDate) return;
    store.addTodo(dateKey(selectedDate), text, currentPriority, currentRepeat);
    input.value = '';
    const key = dateKey(selectedDate); renderProgress(key); renderPanelTodoList(key); render();
  },
  toggleTodo(key, realIdx, isRec, rid) {
    store.toggleTodo(key, realIdx, isRec, rid);
    renderProgress(key); renderPanelTodoList(key); render();
    if (store.isAllDone(key)) launchConfetti();
  },
  deleteTodoWithUndo(key, realIdx) {
    const result = store.deleteTodo(key, realIdx);
    if (!result) return;
    renderProgress(key); renderPanelTodoList(key); render();
    pushUndo(`"${result.removed.text.slice(0, 30)}" deleted`, () => { store.restoreTodo(result.key, result.index, result.removed); render(); if (selectedDate) { renderProgress(key); renderPanelTodoList(key); } });
  },
  deleteRecurring(id) { store.deleteRecurring(id); render(); if (selectedDate) { const key = dateKey(selectedDate); renderProgress(key); renderPanelTodoList(key); } },

  // Inline edit of a normal todo's text
  editTodoText(key, realIdx) {
    const item = document.querySelector(`.todo-item[data-real-idx="${realIdx}"][data-key="${key}"]`);
    if (!item) return;
    const textSpan = item.querySelector('.todo-text');
    if (!textSpan || item.querySelector('.todo-edit-input')) return;
    const current = (store.todos[key] || []).filter(t => !t.recurringId)[realIdx]?.text || '';
    const input = document.createElement('input');
    input.className = 'todo-edit-input'; input.type = 'text'; input.maxLength = 500; input.value = current;
    let done = false;
    const commit = (save) => {
      if (done) return; done = true;
      if (save) store.editTodo(key, realIdx, input.value);
      renderPanelTodoList(key); render();
    };
    input.onkeydown = ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
    };
    input.onblur = () => commit(true);
    textSpan.replaceWith(input);
    input.focus(); input.select();
  },

  // Notes
  toggleNotes(key, realIdx) {
    const existing = document.getElementById(`notes-${key}-${realIdx}`);
    if (existing) { app.saveNote(key, realIdx); existing.remove(); return; }
    document.querySelectorAll('.todo-notes').forEach(n => n.remove());
    const item = document.querySelector(`.todo-item[data-real-idx="${realIdx}"][data-key="${key}"]`);
    if (!item) return;
    const nonRec = (store.todos[key] || []).filter(t => !t.recurringId);
    const todo = nonRec[realIdx]; if (!todo) return;
    const notesDiv = document.createElement('div');
    notesDiv.className = 'todo-notes'; notesDiv.id = `notes-${key}-${realIdx}`;
    notesDiv.innerHTML = `<textarea placeholder="Add notes..." onblur="app.saveNote('${key}',${realIdx})">${escapeHtml(todo.notes || '')}</textarea><div class="todo-notes-hint">Click outside to save</div>`;
    item.querySelector('.todo-item-content').appendChild(notesDiv);
    notesDiv.querySelector('textarea').focus();
  },
  saveNote(key, realIdx) { const el = document.getElementById(`notes-${key}-${realIdx}`); if (!el) return; store.saveNote(key, realIdx, el.querySelector('textarea').value); },

  // Priority & Repeat
  setPriority(p) { currentPriority = p; document.querySelectorAll('.priority-btn').forEach(b => b.classList.toggle('active', b.classList.contains(p))); },
  setRepeat(r) { currentRepeat = r; document.querySelectorAll('.repeat-btn').forEach(b => b.classList.toggle('active', b.dataset.r === r)); },
  handleInputKey(e) { if (e.key === 'Enter') app.addTodo(); },

  // Drag
  startCrossDayDrag(e, key, realIdx) {
    const nonRec = (store.todos[key] || []).filter(t => !t.recurringId);
    const todo = nonRec[realIdx]; if (!todo) return;
    draggedTodo = { key, realIdx, todo: { ...todo } };
    e.dataTransfer.setData('text/plain', 'cross-day'); e.dataTransfer.effectAllowed = 'move';
    if (e.target.classList) e.target.classList.add('dragging');
  },
  startInboxDrag(e, idx) {
    const inbox = store.getInbox(); const todo = inbox[idx];
    draggedTodo = { key: 'inbox', realIdx: idx, todo: { ...todo } };
    e.dataTransfer.setData('text/plain', 'cross-day'); e.dataTransfer.effectAllowed = 'move';
  },
  handleCalendarDrop(e, targetKey) {
    e.preventDefault();
    if (!draggedTodo) return;
    if (draggedTodo.key === 'inbox') { store.moveInboxToDay(draggedTodo.realIdx, targetKey); draggedTodo = null; render(); if (currentView === 'inbox') renderInboxView(); return; }
    if (draggedTodo.key === targetKey) { draggedTodo = null; return; }
    store.moveTodo(draggedTodo.key, draggedTodo.realIdx, targetKey);
    draggedTodo = null; render();
    if (selectedDate) { const key = dateKey(selectedDate); renderProgress(key); renderPanelTodoList(key); }
  },

  // Week actions
  weekQuickAdd(e, key) { if (e.key !== 'Enter' || !e.target.value.trim()) return; store.addTodo(key, e.target.value.trim(), 'low', 'none'); e.target.value = ''; render(); },
  toggleWeekTodo(key, idx, isRec, rid) { store.toggleTodo(key, idx, isRec, rid); render(); if (store.isAllDone(key)) launchConfetti(); },
  deleteWeekTodo(key, idx, isRec, rid) { if (isRec) { store.deleteRecurring(rid); } else { store.deleteTodo(key, idx); } render(); },

  // Inbox
  addInboxTodo() { const input = document.getElementById('inboxInput'); if (!input || !input.value.trim()) return; store.addInboxTodo(input.value.trim()); input.value = ''; renderInboxView(); updateInboxBadge(); },
  toggleInboxTodo(idx) { store.toggleInboxTodo(idx); renderInboxView(); },
  deleteInboxTodoWithUndo(idx) {
    const { inbox, removed, index } = store.deleteInboxTodo(idx);
    renderInboxView(); updateInboxBadge();
    pushUndo(`"${removed.text.slice(0, 30)}" deleted`, () => { const ib = store.getInbox(); ib.splice(index, 0, removed); store.saveInbox(ib); if (currentView === 'inbox') renderInboxView(); updateInboxBadge(); });
  },

  // Focus
  openFocusMode, closeFocusMode,
  toggleFocusTodo(idx, isRec, rid) { const key = dateKey(new Date()); store.toggleTodo(key, idx, isRec, rid); renderFocusView(); render(); if (store.isAllDone(key)) launchConfetti(); },
  deleteFocusTodo(idx, isRec, rid) { const key = dateKey(new Date()); if (isRec) { store.deleteRecurring(rid); } else { store.deleteTodo(key, idx); } renderFocusView(); render(); },
  focusQuickAdd(e) { if (e.key !== 'Enter' || !e.target.value.trim()) return; const key = dateKey(new Date()); store.addTodo(key, e.target.value.trim(), 'low', 'none'); e.target.value = ''; renderFocusView(); render(); },

  // Carry forward
  carryForwardAll() { store.carryForwardAll(); render(); document.getElementById('carryForwardBanner').innerHTML = ''; if (selectedDate) { const k = dateKey(selectedDate); renderProgress(k); renderPanelTodoList(k); renderYesterdayCarry(k); } },
  carryYesterdayToToday() {
    const moved = store.moveYesterdayToToday();
    if (moved === 0) return;
    render();
    if (selectedDate) { const k = dateKey(selectedDate); renderProgress(k); renderPanelTodoList(k); renderYesterdayCarry(k); }
    checkCarryForward();
  },

  // Export/Import
  exportData: () => store.exportData(),
  importData(e) { const file = e.target.files[0]; if (!file) return; if (!confirm('Replace all data?')) return; const reader = new FileReader(); reader.onload = ev => { try { store.importData(ev.target.result); render(); alert('Import successful!'); } catch (err) { alert('Invalid file'); } }; reader.readAsText(file); e.target.value = ''; },

  // Undo
  performUndo() { if (performUndo()) { render(); if (selectedDate) { const key = dateKey(selectedDate); renderProgress(key); renderPanelTodoList(key); } } },

  // Search
  openSearch, closeSearch, performSearch,

  // Year heatmap
  heatmapCellClick(key) {
    currentDate = new Date(key + 'T12:00:00');
    setView('month');
    openDay(key);
  },
  heatmapShowTooltip(e, cell) {
    const tip = document.getElementById('heatmapTooltip');
    if (!tip) return;
    const total = parseInt(cell.dataset.total), done = parseInt(cell.dataset.done);
    tip.textContent = total === 0 ? `${cell.dataset.date} — no tasks` : `${cell.dataset.date} — ${done}/${total} done`;
    tip.style.display = 'block';
    const rect = cell.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left + rect.width / 2, window.innerWidth - 140));
    tip.style.left = left + 'px';
    tip.style.top = (rect.top + window.scrollY - 38) + 'px';
    tip.style.transform = 'translateX(-50%)';
  },
  heatmapHideTooltip() {
    const tip = document.getElementById('heatmapTooltip');
    if (tip) tip.style.display = 'none';
  },
};

// Quick-add (inline on double-click)
function quickAdd(e, key) {
  e.stopPropagation();
  const cell = e.currentTarget;
  if (cell.querySelector('.quick-add-input')) return;
  const input = document.createElement('input');
  input.className = 'quick-add-input'; input.placeholder = 'Quick add...'; input.maxLength = 500;
  input.onkeydown = ev => {
    if (ev.key === 'Enter' && input.value.trim()) { store.addTodo(key, input.value.trim(), 'low', 'none'); render(); }
    if (ev.key === 'Escape' || ev.key === 'Enter') { ev.stopPropagation(); input.remove(); }
  };
  input.onblur = () => setTimeout(() => input.remove(), 100);
  cell.appendChild(input); input.focus();
}

// --- Bootstrap ---
function init() {
  initTheme();
  initConfetti();
  store.initFirebase();
  store.setOnStateChange(showSyncStatus);
  initSearch(openDay, setView);
  initShortcuts({ openSearch, openDay, setView, openFocusMode, closePanel, closeFocusMode, closeSearch, navDay, dateKey });
  initParallax();

  store.onAuthChange(async user => {
    updateAuthUI(user);
    const status = await store.loadTodos();
    showSyncStatus(status);
    store.invalidateCache();
    // Auto-roll any unfinished tasks from past days onto today so nothing is missed.
    store.autoCarryForward();
    lastSeenDateKey = dateKey(new Date());
    render();
    setTimeout(checkCarryForward, 300);
  });

  initDateRolloverWatch();
}

// --- Auto carry-forward on date change ---
// When the calendar date changes (midnight, or the tab waking after days away),
// pull every unfinished task from past days onto the new "today" automatically.
let lastSeenDateKey = dateKey(new Date());
function handleDateRollover() {
  const nowKey = dateKey(new Date());
  if (nowKey === lastSeenDateKey) return;
  lastSeenDateKey = nowKey;
  const moved = store.autoCarryForward();
  store.invalidateCache();
  render();
  if (selectedDate) {
    const key = dateKey(selectedDate);
    renderProgress(key); renderPanelTodoList(key); renderYesterdayCarry(key);
  }
  if (document.getElementById('focusOverlay')?.classList.contains('open')) renderFocusView();
  if (moved > 0) checkCarryForward();
}

function initDateRolloverWatch() {
  setInterval(handleDateRollover, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) handleDateRollover(); });
  window.addEventListener('focus', handleDateRollover);
}

init();
