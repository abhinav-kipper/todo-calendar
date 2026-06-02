// --- State management, persistence, and Firebase ---
import { dateKey, generateId, planCarryForward } from './utils.js';

// --- State ---
export let todos = {};
export let recurring = [];
let currentUser = null;
let saveTimeout = null;
let todosForDayCache = {};
let cacheVersion = 0;
let auth, db;
let onStateChange = () => {};
let onDataChange = () => {};
let remoteUnsubscribe = null;
let storageWired = false;

export function setOnStateChange(fn) { onStateChange = fn; }
export function setOnDataChange(fn) { onDataChange = fn; }
export function getCurrentUser() { return currentUser; }

// --- Firebase init ---
export function initFirebase() {
  firebase.initializeApp({
    apiKey: "AIzaSyAMWjbYB6-uWEDHLIXc4wDUmT23vxor2kk",
    authDomain: "todo-calendar-dde90.firebaseapp.com",
    projectId: "todo-calendar-dde90",
    storageBucket: "todo-calendar-dde90.firebasestorage.app",
    messagingSenderId: "791175432633",
    appId: "1:791175432633:web:8a95bfd236fe74f2b10e68"
  });
  auth = firebase.auth();
  db = firebase.firestore();
}

export function onAuthChange(callback) {
  auth.onAuthStateChanged(user => {
    currentUser = user;
    callback(user);
  });
}

export function signInWithGoogle() {
  auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => alert('Sign-in failed: ' + e.message));
}

export function signOut() { auth.signOut(); }

// --- Live sync: Firestore onSnapshot + cross-tab storage events ---
export function subscribeToRemote() {
  unsubscribeFromRemote();
  if (!currentUser) return;
  remoteUnsubscribe = db.collection('users').doc(currentUser.uid).onSnapshot(
    snap => {
      if (!snap.exists) return;
      if (snap.metadata.hasPendingWrites) return;
      const d = snap.data();
      todos = d.todos || {};
      recurring = d.recurring || [];
      localStorage.setItem('todo-calendar-data', JSON.stringify(todos));
      localStorage.setItem('todo-calendar-recurring', JSON.stringify(recurring));
      invalidateCache();
      onDataChange();
    },
    () => {}
  );
}

export function unsubscribeFromRemote() {
  if (remoteUnsubscribe) { remoteUnsubscribe(); remoteUnsubscribe = null; }
}

export function wireStorageSync() {
  if (storageWired) return;
  storageWired = true;
  window.addEventListener('storage', (e) => {
    if (currentUser) return;
    if (!e.key) return;
    try {
      if (e.key === 'todo-calendar-data') {
        todos = e.newValue ? JSON.parse(e.newValue) : {};
        invalidateCache();
        onDataChange();
      } else if (e.key === 'todo-calendar-recurring') {
        recurring = e.newValue ? JSON.parse(e.newValue) : [];
        invalidateCache();
        onDataChange();
      } else if (e.key === 'todo-calendar-inbox') {
        onDataChange();
      }
    } catch {}
  });
}

// --- Cache ---
export function invalidateCache() { cacheVersion++; todosForDayCache = {}; }

export function getTodosForDay(key) {
  const ck = key + '_' + cacheVersion;
  if (todosForDayCache[ck]) return todosForDayCache[ck];

  const base = (todos[key] || []).filter(t => !t.recurringId);
  const d = new Date(key + 'T12:00:00');
  const dow = d.getDay();

  const recTodos = recurring.filter(r => {
    const start = new Date(r.startDate + 'T12:00:00');
    if (d < start) return false;
    if (r.repeat === 'daily') return true;
    if (r.repeat === 'weekdays') return dow >= 1 && dow <= 5;
    if (r.repeat === 'weekly') return dow === start.getDay();
    return false;
  }).map(r => {
    const dm = (todos[key] || []).find(t => t.recurringId === r.id);
    return { ...r, isRecurring: true, done: !!(dm && dm.done) };
  });

  const result = [...base, ...recTodos];
  todosForDayCache[ck] = result;
  return result;
}

// --- Persistence ---
export async function loadTodos() {
  if (currentUser) {
    try {
      const doc = await db.collection('users').doc(currentUser.uid).get();
      if (doc.exists) {
        const d = doc.data();
        todos = d.todos || {};
        recurring = d.recurring || [];
      } else {
        todos = JSON.parse(localStorage.getItem('todo-calendar-data') || '{}');
        recurring = JSON.parse(localStorage.getItem('todo-calendar-recurring') || '[]');
        if (Object.keys(todos).length > 0 || recurring.length > 0) {
          await db.collection('users').doc(currentUser.uid).set({ todos, recurring });
        }
      }
      return 'Synced';
    } catch (e) {
      todos = JSON.parse(localStorage.getItem('todo-calendar-data') || '{}');
      recurring = JSON.parse(localStorage.getItem('todo-calendar-recurring') || '[]');
      return 'Offline';
    }
  } else {
    todos = JSON.parse(localStorage.getItem('todo-calendar-data') || '{}');
    recurring = JSON.parse(localStorage.getItem('todo-calendar-recurring') || '[]');
    return 'Local';
  }
}

export function saveTodos(immediate = false) {
  clearTimeout(saveTimeout);
  invalidateCache();
  const doSave = async () => {
    localStorage.setItem('todo-calendar-data', JSON.stringify(todos));
    localStorage.setItem('todo-calendar-recurring', JSON.stringify(recurring));
    if (currentUser) {
      try {
        await db.collection('users').doc(currentUser.uid).set({ todos, recurring });
        syncWidgetDoc();
        return 'Synced';
      } catch (e) { return 'Offline'; }
    }
    return 'Local';
  };
  if (immediate) return doSave();
  saveTimeout = setTimeout(() => doSave().then(s => onStateChange(s)), 500);
}

// Write today's summary to a public-readable doc for desktop widget
function syncWidgetDoc() {
  const now = new Date();
  const todayKey = dateKey(now);
  const dow = now.getDay();
  const todayTodos = (todos[todayKey] || []).filter(t => !t.recurringId);
  const recurringToday = recurring.filter(r => {
    const start = new Date(r.startDate + 'T12:00:00');
    if (now < start) return false;
    if (r.repeat === 'daily') return true;
    if (r.repeat === 'weekdays') return dow >= 1 && dow <= 5;
    if (r.repeat === 'weekly') return dow === start.getDay();
    return false;
  }).map(r => {
    const marker = (todos[todayKey] || []).find(t => t.recurringId === r.id);
    return { text: r.text, done: !!(marker && marker.done), priority: r.priority, isRecurring: true };
  });
  const all = [...todayTodos.map(t => ({ text: t.text, done: t.done, priority: t.priority })), ...recurringToday];
  db.collection('public').doc('widget').set({
    date: todayKey,
    total: all.length,
    done: all.filter(t => t.done).length,
    todos: all,
    updatedAt: new Date().toISOString()
  }).catch(() => {});
}

// --- Todo CRUD ---
export function addTodo(key, text, priority, repeat) {
  if (repeat && repeat !== 'none') {
    recurring.push({ id: generateId(), text, priority, repeat, startDate: key, created: new Date().toISOString() });
  } else {
    if (!todos[key]) todos[key] = [];
    todos[key].push({ text, done: false, priority, created: new Date().toISOString() });
  }
  saveTodos();
}

export function toggleTodo(key, realIdx, isRecurring, recurringId) {
  if (isRecurring) {
    if (!todos[key]) todos[key] = [];
    const ex = todos[key].find(t => t.recurringId === recurringId);
    if (ex) ex.done = !ex.done;
    else todos[key].push({ recurringId, done: true, text: '', priority: 'low' });
  } else {
    const nonRec = (todos[key] || []).filter(t => !t.recurringId);
    if (nonRec[realIdx]) nonRec[realIdx].done = !nonRec[realIdx].done;
  }
  saveTodos();
}

export function deleteTodo(key, realIdx) {
  if (!todos[key]) return null;
  const nri = [];
  todos[key].forEach((t, i) => { if (!t.recurringId) nri.push(i); });
  const ai = nri[realIdx];
  if (ai === undefined) return null;
  const removed = todos[key][ai];
  const removedAt = ai;
  todos[key].splice(ai, 1);
  if (todos[key].length === 0) delete todos[key];
  saveTodos();
  return { removed, key, index: removedAt };
}

export function restoreTodo(key, index, todo) {
  if (!todos[key]) todos[key] = [];
  todos[key].splice(index, 0, todo);
  saveTodos();
}

export function editRecurring(id, text) {
  const r = recurring.find(x => x.id === id);
  if (!r) return;
  const trimmed = String(text || '').trim();
  if (!trimmed || r.text === trimmed) return;
  r.text = trimmed;
  saveTodos();
}

export function deleteRecurring(id) {
  recurring = recurring.filter(r => r.id !== id);
  Object.keys(todos).forEach(k => {
    todos[k] = (todos[k] || []).filter(t => t.recurringId !== id);
    if (todos[k].length === 0) delete todos[k];
  });
  saveTodos();
}

export function moveTodo(fromKey, realIdx, toKey) {
  if (!todos[fromKey]) return;
  const nri = [];
  todos[fromKey].forEach((t, i) => { if (!t.recurringId) nri.push(i); });
  const ai = nri[realIdx];
  if (ai === undefined) return;
  const todo = todos[fromKey].splice(ai, 1)[0];
  if (todos[fromKey].length === 0) delete todos[fromKey];
  if (!todos[toKey]) todos[toKey] = [];
  todos[toKey].push(todo);
  saveTodos();
}

export function reorderTodo(key, fromIdx, toIdx) {
  const allItems = todos[key] || [];
  const nri = [];
  allItems.forEach((t, i) => { if (!t.recurringId) nri.push(i); });
  const rf = nri[fromIdx], rt = nri[toIdx];
  if (rf === undefined || rt === undefined) return;
  const el = allItems.splice(rf, 1)[0];
  allItems.splice(rt > rf ? rt - 1 : rt, 0, el);
  todos[key] = allItems;
  saveTodos();
}

export function saveNote(key, realIdx, text) {
  const nri = [];
  (todos[key] || []).forEach((t, i) => { if (!t.recurringId) nri.push(i); });
  const ai = nri[realIdx];
  if (ai === undefined) return;
  todos[key][ai].notes = text;
  saveTodos();
}

export function getYesterdayOpenCount() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const yKey = dateKey(y);
  if (!todos[yKey]) return 0;
  return todos[yKey].filter(t => !t.recurringId && !t.done).length;
}

export function moveYesterdayToToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const yKey = dateKey(y);
  if (!todos[yKey]) return 0;
  const toMove = todos[yKey].filter(t => !t.recurringId && !t.done);
  if (toMove.length === 0) return 0;
  const toKeep = todos[yKey].filter(t => t.recurringId || t.done);
  if (!todos[todayKey]) todos[todayKey] = [];
  todos[todayKey].push(...toMove);
  if (toKeep.length === 0) delete todos[yKey]; else todos[yKey] = toKeep;
  saveTodos();
  return toMove.length;
}

// Automatically move every incomplete task from any past day onto today so that
// nothing is missed when the date rolls over. Persists only if something moved.
// Returns the number of tasks carried forward.
export function autoCarryForward() {
  const todayKey = dateKey(new Date());
  const { todos: next, moved } = planCarryForward(todos, todayKey);
  if (moved === 0) return 0;
  todos = next;
  saveTodos();
  return moved;
}

export function carryForwardAll() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    if (!todos[key]) continue;
    const toMove = todos[key].filter(t => !t.recurringId && !t.done);
    const toKeep = todos[key].filter(t => t.recurringId || t.done);
    if (toMove.length > 0) {
      if (!todos[todayKey]) todos[todayKey] = [];
      todos[todayKey].push(...toMove);
      if (toKeep.length === 0) delete todos[key]; else todos[key] = toKeep;
    }
  }
  saveTodos();
}

// --- Inbox ---
export function getInbox() { return JSON.parse(localStorage.getItem('todo-calendar-inbox') || '[]'); }
export function saveInbox(inbox) { localStorage.setItem('todo-calendar-inbox', JSON.stringify(inbox)); }

export function addInboxTodo(text) {
  const inbox = getInbox();
  inbox.push({ text, done: false, priority: 'low', created: new Date().toISOString() });
  saveInbox(inbox);
  return inbox;
}

export function toggleInboxTodo(idx) {
  const inbox = getInbox();
  if (inbox[idx]) inbox[idx].done = !inbox[idx].done;
  saveInbox(inbox);
  return inbox;
}

export function deleteInboxTodo(idx) {
  const inbox = getInbox();
  const removed = inbox.splice(idx, 1)[0];
  saveInbox(inbox);
  return { inbox, removed, index: idx };
}

export function moveInboxToDay(idx, targetKey) {
  const inbox = getInbox();
  const todo = inbox.splice(idx, 1)[0];
  saveInbox(inbox);
  if (!todos[targetKey]) todos[targetKey] = [];
  todos[targetKey].push(todo);
  saveTodos();
}

// --- Export/Import ---
export function exportData() {
  const data = JSON.stringify({ todos, recurring }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `todo-calendar-backup-${dateKey(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importData(jsonStr) {
  const d = JSON.parse(jsonStr);
  todos = d.todos || {};
  recurring = d.recurring || [];
  saveTodos();
}

// --- Check all done ---
export function isAllDone(key) {
  const dt = getTodosForDay(key);
  return dt.length > 0 && dt.every(t => t.done);
}
