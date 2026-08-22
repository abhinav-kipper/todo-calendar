// ─── Knowledge store ──────────────────────────────────────────────────────
// State, persistence and sync for the Knowledge route. Same shape as the
// calendar's store.js: localStorage is the source of truth, Firestore mirrors
// it when signed in, and every mutation funnels through here.
//
// Cloud data lives at knowledge/{uid} — a separate document from the
// calendar's users/{uid}, so the two apps can never clobber each other.

import * as Cal from './store.js';
import * as K from './knowledge-core.js';
import './knowledge-ai.js';

const LS = {
  notebooks: 'almanac-knowledge-notebooks',
  entries: 'almanac-knowledge-entries',
  dumps: 'almanac-knowledge-dumps',
  prefs: 'almanac-knowledge-prefs',
  ai: 'almanac-knowledge-ai',   // stays on this device — never synced
};

const CLOUD_LIMIT = 700 * 1024;  // stay well under Firestore's 1MB doc cap

let state = { notebooks: [], entries: [], dumps: [] };
let prefs = { lastNotebookId: null, view: 'cards', sort: 'manual', sound: true };
let aiConfig = { provider: 'gemini', model: '', apiKey: '', endpoint: '', enabled: false };

let user = null;
let db = null, auth = null;
let listeners = new Set();
let saveTimer = null;
let remoteUnsub = null;
let syncStatus = 'Local';
let statusListeners = new Set();

// ── plumbing ─────────────────────────────────────────────────────────────
function readJson(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

function emit() { listeners.forEach((fn) => { try { fn(snapshot()); } catch {} }); }
function setStatus(s) { if (s === syncStatus) return; syncStatus = s; statusListeners.forEach((fn) => { try { fn(s); } catch {} }); }

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onStatus(fn) { statusListeners.add(fn); fn(syncStatus); return () => statusListeners.delete(fn); }
export function getStatus() { return syncStatus; }

export function snapshot() {
  return {
    notebooks: state.notebooks,
    entries: state.entries,
    dumps: state.dumps,
    prefs,
    ai: aiConfig,
    user,
    status: syncStatus,
  };
}

// ── load / save ──────────────────────────────────────────────────────────
function loadLocal() {
  const notebooks = readJson(LS.notebooks, []);
  const entries = readJson(LS.entries, []);
  const dumps = readJson(LS.dumps, []);
  state = {
    notebooks: Array.isArray(notebooks) ? notebooks.map(normalizeNotebook) : [],
    entries: Array.isArray(entries) ? entries.map((e) => K.sanitizeEntry(e, e && e.notebookId)) : [],
    dumps: Array.isArray(dumps) ? dumps.slice(-200) : [],
  };
  prefs = { ...prefs, ...readJson(LS.prefs, {}) };
  aiConfig = { ...aiConfig, ...readJson(LS.ai, {}) };
}

function normalizeNotebook(n) {
  const meta = K.kindMeta(n && n.kind);
  return {
    id: n.id || K.newId('nb'),
    title: String(n.title || 'Untitled').slice(0, 120),
    subtitle: String(n.subtitle || '').slice(0, 200),
    kind: meta.id,
    emoji: n.emoji || meta.emoji,
    color: K.COLORS.includes(n.color) ? n.color : 'lavender',
    topic: String(n.topic || '').slice(0, 300),
    aiNotes: String(n.aiNotes || '').slice(0, 800),
    sections: Array.isArray(n.sections)
      ? n.sections.filter(Boolean).map((s) => ({ id: s.id || K.newId('sec'), title: String(s.title || 'Section').slice(0, 60) }))
      : [],
    archived: !!n.archived,
    created: n.created || new Date().toISOString(),
    updated: n.updated || new Date().toISOString(),
  };
}

function persistLocal() {
  try {
    localStorage.setItem(LS.notebooks, JSON.stringify(state.notebooks));
    localStorage.setItem(LS.entries, JSON.stringify(state.entries));
    localStorage.setItem(LS.dumps, JSON.stringify(state.dumps.slice(-200)));
  } catch (e) {
    setStatus('Storage full');
  }
}

function save({ immediate = false } = {}) {
  persistLocal();
  emit();
  clearTimeout(saveTimer);
  const push = async () => {
    if (!user || !db) { setStatus('Local'); return; }
    const payload = { notebooks: state.notebooks, entries: state.entries, dumps: state.dumps.slice(-60) };
    if (K.payloadSize(payload) > CLOUD_LIMIT) {
      setStatus('Too big to sync');
      return;
    }
    try {
      await db.collection('knowledge').doc(user.uid).set({ ...payload, updatedAt: new Date().toISOString() });
      setStatus('Synced');
    } catch (e) {
      setStatus('Offline');
    }
  };
  if (immediate) return push();
  saveTimer = setTimeout(push, 600);
}

// ── init ─────────────────────────────────────────────────────────────────
export async function init() {
  loadLocal();
  if (!state.notebooks.length && !readJson(LS.prefs, {}).seeded) {
    seedStarterNotebooks();
  }
  wireStorageSync();
  emit();

  if (typeof firebase !== 'undefined') {
    try {
      if (!firebase.apps.length) firebase.initializeApp(Cal.FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      // Let the calendar store see the same signed-in user, so a practice task
      // pushed from here syncs to the cloud instead of only this device.
      Cal.initFirebase();
      Cal.onAuthChange(() => {});
      auth.onAuthStateChanged(async (u) => {
        user = u || null;
        if (u) { await pullRemote(); subscribeRemote(); }
        else { unsubscribeRemote(); setStatus('Local'); }
        emit();
      });
    } catch (e) {
      setStatus('Local');
    }
  }
  return snapshot();
}

async function pullRemote() {
  if (!user || !db) return;
  try {
    const doc = await db.collection('knowledge').doc(user.uid).get();
    if (doc.exists) {
      const d = doc.data() || {};
      // Remote wins on first load; local-only data is merged in by id.
      const remoteNotebooks = Array.isArray(d.notebooks) ? d.notebooks.map(normalizeNotebook) : [];
      const remoteEntries = Array.isArray(d.entries) ? d.entries.map((e) => K.sanitizeEntry(e, e && e.notebookId)) : [];
      state.notebooks = mergeById(remoteNotebooks, state.notebooks);
      state.entries = mergeById(remoteEntries, state.entries);
      state.dumps = Array.isArray(d.dumps) ? mergeById(d.dumps, state.dumps) : state.dumps;
      persistLocal();
      setStatus('Synced');
    } else {
      await save({ immediate: true });
    }
  } catch (e) {
    setStatus('Offline');
  }
  emit();
}

// Keeps whichever copy of a record was touched last.
function mergeById(remote, local) {
  const byId = new Map();
  [...remote, ...local].forEach((item) => {
    if (!item || !item.id) return;
    const existing = byId.get(item.id);
    if (!existing) { byId.set(item.id, item); return; }
    const a = String(existing.updated || existing.created || '');
    const b = String(item.updated || item.created || '');
    byId.set(item.id, b > a ? item : existing);
  });
  return Array.from(byId.values());
}

function subscribeRemote() {
  unsubscribeRemote();
  if (!user || !db) return;
  remoteUnsub = db.collection('knowledge').doc(user.uid).onSnapshot((snap) => {
    if (!snap.exists || snap.metadata.hasPendingWrites) return;
    const d = snap.data() || {};
    state.notebooks = Array.isArray(d.notebooks) ? d.notebooks.map(normalizeNotebook) : state.notebooks;
    state.entries = Array.isArray(d.entries) ? d.entries.map((e) => K.sanitizeEntry(e, e && e.notebookId)) : state.entries;
    state.dumps = Array.isArray(d.dumps) ? d.dumps : state.dumps;
    persistLocal();
    setStatus('Synced');
    emit();
  }, () => setStatus('Offline'));
}

function unsubscribeRemote() { if (remoteUnsub) { remoteUnsub(); remoteUnsub = null; } }

let storageWired = false;
function wireStorageSync() {
  if (storageWired) return;
  storageWired = true;
  window.addEventListener('storage', (e) => {
    if (!e.key || !Object.values(LS).includes(e.key)) return;
    loadLocal();
    emit();
  });
}

// ── auth ─────────────────────────────────────────────────────────────────
export function signIn() {
  if (!auth) return;
  auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch((e) => alert('Sign-in failed: ' + e.message));
}
export function signOut() { if (auth) auth.signOut(); }
export function getUser() { return user; }

// ── notebooks ────────────────────────────────────────────────────────────
export function createNotebook(patch) {
  const nb = K.makeNotebook(patch);
  state.notebooks = [...state.notebooks, nb];
  save();
  return nb;
}

export function updateNotebook(id, patch) {
  state.notebooks = state.notebooks.map((n) => (n.id === id
    ? normalizeNotebook({ ...n, ...patch, updated: new Date().toISOString() })
    : n));
  save();
}

export function deleteNotebook(id) {
  const notebook = state.notebooks.find((n) => n.id === id);
  const entries = state.entries.filter((e) => e.notebookId === id);
  state.notebooks = state.notebooks.filter((n) => n.id !== id);
  state.entries = state.entries.filter((e) => e.notebookId !== id);
  state.dumps = state.dumps.filter((d) => d.notebookId !== id);
  save();
  return { notebook, entries };
}

export function restoreNotebook({ notebook, entries }) {
  if (!notebook) return;
  state.notebooks = [...state.notebooks, notebook];
  state.entries = [...state.entries, ...(entries || [])];
  save();
}

export function addSection(notebookId, title) {
  const section = { id: K.newId('sec'), title: String(title || 'New section').slice(0, 60) };
  state.notebooks = state.notebooks.map((n) => (n.id === notebookId
    ? { ...n, sections: [...(n.sections || []), section], updated: new Date().toISOString() }
    : n));
  save();
  return section;
}

export function renameSection(notebookId, sectionId, title) {
  state.notebooks = state.notebooks.map((n) => (n.id === notebookId
    ? { ...n, sections: n.sections.map((s) => (s.id === sectionId ? { ...s, title } : s)), updated: new Date().toISOString() }
    : n));
  save();
}

export function deleteSection(notebookId, sectionId) {
  state.notebooks = state.notebooks.map((n) => (n.id === notebookId
    ? { ...n, sections: n.sections.filter((s) => s.id !== sectionId), updated: new Date().toISOString() }
    : n));
  // Cards survive their section — they just fall back to Unsorted.
  state.entries = state.entries.map((e) => (e.sectionId === sectionId ? { ...e, sectionId: null } : e));
  save();
}

export function moveSection(notebookId, sectionId, delta) {
  state.notebooks = state.notebooks.map((n) => {
    if (n.id !== notebookId) return n;
    const list = [...n.sections];
    const i = list.findIndex((s) => s.id === sectionId);
    const j = i + delta;
    if (i === -1 || j < 0 || j >= list.length) return n;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...n, sections: list, updated: new Date().toISOString() };
  });
  save();
}

// Finds a section by (fuzzy) title, creating it when asked to.
export function resolveSection(notebookId, title, { create = false } = {}) {
  const nb = state.notebooks.find((n) => n.id === notebookId);
  if (!nb || !title) return null;
  const wanted = K.slug(title);
  let hit = nb.sections.find((s) => K.slug(s.title) === wanted);
  if (!hit) hit = nb.sections.find((s) => K.similarity(K.slug(s.title), wanted) > 0.8);
  if (hit) return hit.id;
  if (!create) return null;
  return addSection(notebookId, title).id;
}

// ── entries ──────────────────────────────────────────────────────────────
export function getEntries(notebookId) {
  return state.entries.filter((e) => e.notebookId === notebookId);
}

export function addEntry(notebookId, patch) {
  const entry = K.makeEntry(notebookId, patch);
  state.entries = [...state.entries, entry];
  save();
  return entry;
}

export function addEntries(notebookId, patches) {
  const made = patches.map((p) => K.makeEntry(notebookId, p));
  state.entries = [...state.entries, ...made];
  save();
  return made;
}

export function updateEntry(id, patch) {
  state.entries = state.entries.map((e) => (e.id === id
    ? K.sanitizeEntry({ ...e, ...patch, updated: new Date().toISOString() }, e.notebookId)
    : e));
  save();
}

export function updateEntries(patchesById) {
  state.entries = state.entries.map((e) => (patchesById[e.id]
    ? K.sanitizeEntry({ ...e, ...patchesById[e.id], updated: new Date().toISOString() }, e.notebookId)
    : e));
  save();
}

export function deleteEntry(id) {
  const entry = state.entries.find((e) => e.id === id);
  state.entries = state.entries.filter((e) => e.id !== id);
  save();
  return entry;
}

export function restoreEntry(entry) {
  if (!entry) return;
  state.entries = [...state.entries, entry];
  save();
}

export function moveEntry(id, { sectionId, notebookId }) {
  state.entries = state.entries.map((e) => {
    if (e.id !== id) return e;
    const next = { ...e, updated: new Date().toISOString() };
    if (sectionId !== undefined) next.sectionId = sectionId;
    if (notebookId !== undefined && notebookId !== e.notebookId) {
      next.notebookId = notebookId;
      next.sectionId = sectionId !== undefined ? sectionId : null;
    }
    return next;
  });
  save();
}

export function reorderEntries(movingId, targetId) {
  const moving = state.entries.find((e) => e.id === movingId);
  const target = state.entries.find((e) => e.id === targetId);
  if (!moving || !target) return;
  const scope = state.entries.filter((e) => e.notebookId === moving.notebookId && (e.sectionId || null) === (target.sectionId || null));
  const withMoving = scope.some((e) => e.id === movingId) ? scope : [...scope, { ...moving, sectionId: target.sectionId || null }];
  const reordered = K.reorder(withMoving, movingId, targetId);
  const byId = new Map(reordered.map((e) => [e.id, e]));
  state.entries = state.entries.map((e) => (byId.has(e.id) ? { ...e, ...byId.get(e.id), updated: new Date().toISOString() } : e));
  save();
}

export function toggleStar(id) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) return;
  updateEntry(id, {
    starred: !entry.starred,
    // Starring is also how a card enters the practice rotation.
    srs: !entry.starred && !entry.srs ? K.srsInit(K.dateKey(new Date())) : entry.srs,
  });
}

export function reviewEntry(id, rating) {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry) return;
  const todayKey = K.dateKey(new Date());
  updateEntry(id, { srs: K.srsReview(entry.srs, rating, todayKey) });
}

// ── dumps (the raw capture inbox) ────────────────────────────────────────
export function addDump(notebookId, text, status = 'pending') {
  const dump = {
    id: K.newId('d'), notebookId, text: String(text).slice(0, 20000),
    status, entryIds: [], created: new Date().toISOString(), updated: new Date().toISOString(),
  };
  state.dumps = [...state.dumps, dump];
  save();
  return dump;
}

export function updateDump(id, patch) {
  state.dumps = state.dumps.map((d) => (d.id === id ? { ...d, ...patch, updated: new Date().toISOString() } : d));
  save();
}

export function deleteDump(id) {
  const dump = state.dumps.find((d) => d.id === id);
  state.dumps = state.dumps.filter((d) => d.id !== id);
  save();
  return dump;
}

export function getDumps(notebookId) {
  return state.dumps.filter((d) => d.notebookId === notebookId).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
}

// ── prefs & AI config ────────────────────────────────────────────────────
export function setPref(key, value) {
  prefs = { ...prefs, [key]: value };
  try { localStorage.setItem(LS.prefs, JSON.stringify(prefs)); } catch {}
  emit();
}

export function getPrefs() { return prefs; }

export function setAiConfig(patch) {
  aiConfig = { ...aiConfig, ...patch };
  try { localStorage.setItem(LS.ai, JSON.stringify(aiConfig)); } catch {}
  emit();
}

export function getAiConfig() { return aiConfig; }
export function aiReady() {
  const meta = window.KnowledgeAI ? window.KnowledgeAI.providerMeta(aiConfig.provider) : null;
  if (!meta) return false;
  if (meta.needsKey && !aiConfig.apiKey) return false;
  return !!(aiConfig.model || meta.models[0]);
}

// ── calendar bridge ──────────────────────────────────────────────────────
// Push a practice task onto a day in the Almanac. Re-reads the calendar first
// so a stale in-memory copy can never overwrite what's in the cloud.
export async function sendToAlmanac(text, dayKey, priority = 'medium') {
  try {
    await Cal.loadTodos();
    Cal.addTodo(dayKey, text, priority, 'none');
    await Cal.saveTodos(true);
    return true;
  } catch (e) {
    return false;
  }
}

// ── import / export ──────────────────────────────────────────────────────
export function exportAll() {
  const data = {
    kind: 'almanac-knowledge', version: 1, exportedAt: new Date().toISOString(),
    notebooks: state.notebooks, entries: state.entries, dumps: state.dumps,
  };
  download(JSON.stringify(data, null, 2), `almanac-knowledge-${K.dateKey(new Date())}.json`, 'application/json');
}

export function exportNotebookMarkdown(notebookId) {
  const nb = state.notebooks.find((n) => n.id === notebookId);
  if (!nb) return;
  const md = K.notebookToMarkdown(nb, getEntries(notebookId));
  download(md, `${K.slug(nb.title) || 'notebook'}.md`, 'text/markdown');
}

function download(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importAll(jsonStr, { merge = true } = {}) {
  let data;
  try { data = JSON.parse(jsonStr); } catch { return { ok: false, error: 'That file is not valid JSON.' }; }
  if (!data || (!Array.isArray(data.notebooks) && !Array.isArray(data.entries))) {
    return { ok: false, error: "That doesn't look like a Knowledge backup." };
  }
  const notebooks = (data.notebooks || []).map(normalizeNotebook);
  const entries = (data.entries || []).map((e) => K.sanitizeEntry(e, e && e.notebookId));
  state.notebooks = merge ? mergeById(notebooks, state.notebooks) : notebooks;
  state.entries = merge ? mergeById(entries, state.entries) : entries;
  if (Array.isArray(data.dumps)) state.dumps = merge ? mergeById(data.dumps, state.dumps) : data.dumps;
  save();
  return { ok: true, notebooks: notebooks.length, entries: entries.length };
}

// ── first run ────────────────────────────────────────────────────────────
function seedStarterNotebooks() {
  const dutch = K.makeNotebook({
    title: 'Dutch', kind: 'language', emoji: '🇳🇱', color: 'sky',
    subtitle: 'class notes, vocab and the words that keep escaping',
  });
  dutch.topic = 'Dutch (Nederlands) — evening classes, beginner to intermediate';
  dutch.aiNotes = 'Always give the article (de/het) and the plural for nouns. Add a short example sentence with its English translation.';

  const bachata = K.makeNotebook({
    title: 'Bachata', kind: 'dance', emoji: '💃', color: 'blush',
    subtitle: 'privates, movements, weight shifts, things to drill',
  });
  bachata.topic = 'Bachata (sensual + dominican) — weekly private lessons';
  bachata.aiNotes = 'Always name which foot the weight is on and the count. Flag anything that is a lead-follow connection point.';

  state.notebooks = [dutch, bachata];
  setPref('seeded', true);
  save();
}

// ── expose ───────────────────────────────────────────────────────────────
export const Knowledge = {
  init, subscribe, onStatus, getStatus, snapshot,
  signIn, signOut, getUser,
  createNotebook, updateNotebook, deleteNotebook, restoreNotebook,
  addSection, renameSection, deleteSection, moveSection, resolveSection,
  getEntries, addEntry, addEntries, updateEntry, updateEntries, deleteEntry, restoreEntry,
  moveEntry, reorderEntries, toggleStar, reviewEntry,
  addDump, updateDump, deleteDump, getDumps,
  setPref, getPrefs, setAiConfig, getAiConfig, aiReady,
  sendToAlmanac, exportAll, exportNotebookMarkdown, importAll,
};

if (typeof window !== 'undefined') window.Knowledge = Knowledge;
