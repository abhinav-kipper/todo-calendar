// Bridge: exposes store.js API + data-bridging helpers on window.AlmanacStore
import * as S from './store.js';
import { dateKey } from './utils.js';

window.AlmanacStore = {
  // Auth
  initFirebase: () => S.initFirebase(),
  onAuthChange: (cb) => S.onAuthChange(cb),
  signInWithGoogle: () => S.signInWithGoogle(),
  signOut: () => S.signOut(),
  getCurrentUser: () => S.getCurrentUser(),
  loadTodos: () => S.loadTodos(),
  setOnStateChange: (fn) => S.setOnStateChange(fn),
  setOnDataChange: (fn) => S.setOnDataChange(fn),
  subscribeToRemote: () => S.subscribeToRemote(),
  unsubscribeFromRemote: () => S.unsubscribeFromRemote(),
  wireStorageSync: () => S.wireStorageSync(),

  // Getters (live module bindings)
  get todos() { return S.todos; },
  get recurring() { return S.recurring; },

  // Materialize all store data into React-friendly format (with stable IDs)
  loadForReact() {
    const reactTodos = {};
    // Non-recurring todos
    Object.entries(S.todos).forEach(([key, list]) => {
      const nonRec = list.filter(t => !t.recurringId);
      if (nonRec.length > 0) {
        reactTodos[key] = nonRec.map((t, i) => ({
          id: 'nr_' + key + '_' + i + '_' + String(t.created || '').slice(-4),
          text: t.text,
          done: t.done,
          priority: t.priority || 'low',
          notes: t.notes || '',
          repeat: 'none',
          createdAt: t.created ? new Date(t.created).getTime() : Date.now(),
          _isRecurring: false,
        }));
      }
    });

    // Materialize recurring for ±30 to +90 days
    const today = new Date();
    for (let i = -30; i <= 90; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const key = dateKey(d);
      S.recurring.forEach(r => {
        const start = new Date(r.startDate + 'T12:00:00');
        if (d < start) return;
        const dow = d.getDay();
        let matches = false;
        if (r.repeat === 'daily') matches = true;
        else if (r.repeat === 'weekdays') matches = dow >= 1 && dow <= 5;
        else if (r.repeat === 'weekly') matches = dow === start.getDay();
        if (!matches) return;
        const marker = (S.todos[key] || []).find(t => t.recurringId === r.id);
        if (!reactTodos[key]) reactTodos[key] = [];
        // Avoid duplicates
        if (!reactTodos[key].find(t => t._recurringId === r.id)) {
          reactTodos[key].push({
            id: 'rec_' + r.id + '_' + key,
            text: r.text,
            done: !!(marker && marker.done),
            priority: r.priority || 'low',
            notes: r.notes || '',
            repeat: r.repeat,
            createdAt: r.created ? new Date(r.created).getTime() : Date.now(),
            _isRecurring: true,
            _recurringId: r.id,
          });
        }
      });
    }

    const inbox = (S.getInbox ? S.getInbox() : []).map((t, i) => ({
      id: 'ib_' + i + '_' + String(t.created || '').slice(-4),
      text: t.text,
      done: t.done,
      priority: t.priority || 'low',
      notes: t.notes || '',
      repeat: 'none',
      createdAt: t.created ? new Date(t.created).getTime() : Date.now(),
      _isRecurring: false,
    }));

    return { todos: reactTodos, inbox };
  },

  // Sync React state → store (mutates store.todos in-place, then saves)
  syncFromReact(reactTodos, reactInbox) {
    // Clear non-recurring entries (preserve recurring completion markers)
    Object.keys(S.todos).forEach(k => {
      S.todos[k] = (S.todos[k] || []).filter(t => t.recurringId);
      if (S.todos[k].length === 0) delete S.todos[k];
    });
    // Write non-recurring React todos back
    Object.entries(reactTodos).forEach(([key, list]) => {
      const nonRec = list
        .filter(t => !t._isRecurring)
        .map(t => ({
          text: t.text,
          done: t.done,
          priority: t.priority || 'low',
          notes: t.notes || '',
          created: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
        }));
      if (nonRec.length > 0) {
        const existing = S.todos[key] || [];
        const markers = existing.filter(t => t.recurringId);
        S.todos[key] = [...nonRec, ...markers];
      }
    });
    S.saveTodos();
    // Sync inbox
    if (S.saveInbox) {
      const cleanInbox = reactInbox.map(t => ({
        text: t.text,
        done: t.done,
        priority: t.priority || 'low',
        notes: t.notes || '',
        created: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
      }));
      S.saveInbox(cleanInbox);
    }
  },

  // Toggle a recurring task's done state, returns new done boolean
  toggleRecurring(key, recurringId) {
    if (!S.todos[key]) S.todos[key] = [];
    const list = S.todos[key];
    const marker = list.find(t => t.recurringId === recurringId);
    if (marker) {
      marker.done = !marker.done;
    } else {
      list.push({ recurringId, done: true, text: '', priority: 'low' });
    }
    S.saveTodos();
    const updated = S.todos[key].find(t => t.recurringId === recurringId);
    return !!(updated && updated.done);
  },

  // Add a recurring todo via store (returns the new recurring entry)
  addRecurring(key, text, priority, repeat) {
    S.addTodo(key, text, priority, repeat);
    S.invalidateCache();
    return S.recurring[S.recurring.length - 1];
  },

  // Delete a recurring definition (all occurrences)
  deleteRecurring(id) {
    S.deleteRecurring(id);
  },

  // Edit a recurring task's text (applies to all materialized occurrences)
  editRecurring(id, text) {
    S.editRecurring(id, text);
  },

  // Export/Import
  exportData() {
    const data = { todos: S.todos, recurring: S.recurring, inbox: S.getInbox ? S.getInbox() : [] };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'almanac-backup.json'; a.click();
    URL.revokeObjectURL(url);
  },

  importData(jsonStr) {
    try {
      const d = JSON.parse(jsonStr);
      if (d.todos) {
        Object.keys(S.todos).forEach(k => delete S.todos[k]);
        Object.entries(d.todos).forEach(([k, v]) => { S.todos[k] = v; });
      }
      if (d.recurring) {
        S.recurring.length = 0;
        d.recurring.forEach(r => S.recurring.push(r));
      }
      if (d.inbox && S.saveInbox) S.saveInbox(d.inbox);
      S.saveTodos(true);
      return true;
    } catch (e) { return false; }
  },
};
