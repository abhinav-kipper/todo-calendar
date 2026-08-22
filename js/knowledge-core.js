// ─── Knowledge core ───────────────────────────────────────────────────────
// Pure, DOM-free helpers for the Knowledge notebooks route.
// Everything here is unit-tested in tests/knowledge.test.js — keep it pure.

import { dateKey } from './utils.js';

export { dateKey };

// ── ids ──────────────────────────────────────────────────────────────────
let idCounter = 0;
export function newId(prefix = 'k') {
  idCounter = (idCounter + 1) % 100000;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function slug(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function normalizeTag(t) {
  return slug(String(t || '').replace(/^#/, '')).replace(/-/g, '-');
}

// ── notebook kinds ───────────────────────────────────────────────────────
// A "kind" decides the starter sections, the card types on offer and the
// persona the AI adopts. Adding a kind is the main extension point.
export const KINDS = {
  language: {
    id: 'language',
    label: 'Language',
    emoji: '🗣️',
    blurb: 'lessons, vocab, grammar, the phrases you keep fumbling',
    sections: ['Vocabulary', 'Grammar', 'Phrases', 'Pronunciation', 'My mistakes'],
    types: ['vocab', 'grammar', 'phrase', 'pronunciation', 'fix', 'note', 'question'],
    persona: 'an experienced, warm language tutor',
    speechLang: 'nl-NL',
  },
  dance: {
    id: 'dance',
    label: 'Dance',
    emoji: '💃',
    blurb: 'moves, weight shifts, drills, corrections from your privates',
    sections: ['Movements', 'Technique', 'Drills', 'Musicality', 'Corrections'],
    types: ['move', 'technique', 'drill', 'cue', 'fix', 'note', 'question'],
    persona: 'a precise, encouraging partner-dance coach',
    speechLang: 'en-US',
  },
  general: {
    id: 'general',
    label: 'General',
    emoji: '📓',
    blurb: 'anything else you want tidied up and kept',
    sections: ['Notes', 'Ideas', 'To practice'],
    types: ['note', 'idea', 'fix', 'question'],
    persona: 'a sharp, plain-spoken editor and study partner',
    speechLang: 'en-US',
  },
};

export const TYPE_META = {
  vocab:         { label: 'Word',       emoji: '🔤', color: 'sky' },
  grammar:       { label: 'Grammar',    emoji: '📐', color: 'lavender' },
  phrase:        { label: 'Phrase',     emoji: '💬', color: 'mint' },
  pronunciation: { label: 'Sound',      emoji: '🔊', color: 'peach' },
  move:          { label: 'Move',       emoji: '🕺', color: 'blush' },
  technique:     { label: 'Technique',  emoji: '⚙️', color: 'lavender' },
  drill:         { label: 'Drill',      emoji: '🔁', color: 'sage' },
  cue:           { label: 'Cue',        emoji: '📣', color: 'butter' },
  fix:           { label: 'Fix',        emoji: '🩹', color: 'blush' },
  idea:          { label: 'Idea',       emoji: '💡', color: 'butter' },
  question:      { label: 'Question',   emoji: '❓', color: 'orchid' },
  note:          { label: 'Note',       emoji: '✎',  color: 'sky' },
};

export const COLORS = ['blush', 'lavender', 'butter', 'sky', 'mint', 'peach', 'sage', 'orchid'];

export function typeMeta(type) {
  return TYPE_META[type] || TYPE_META.note;
}

export function kindMeta(kind) {
  return KINDS[kind] || KINDS.general;
}

// ── factories ────────────────────────────────────────────────────────────
export function makeNotebook({ title, kind = 'general', emoji, color, subtitle } = {}) {
  const meta = kindMeta(kind);
  const now = new Date().toISOString();
  return {
    id: newId('nb'),
    title: String(title || 'Untitled notebook').trim(),
    subtitle: subtitle || meta.blurb,
    kind: meta.id,
    emoji: emoji || meta.emoji,
    color: color || COLORS[Math.floor(Math.random() * COLORS.length)],
    topic: '',      // free text, e.g. "Dutch (A2, Amsterdam classes)" — fed to the AI
    aiNotes: '',    // per-notebook AI instructions, e.g. "always give the article"
    sections: meta.sections.map((s) => ({ id: newId('sec'), title: s })),
    archived: false,
    created: now,
    updated: now,
  };
}

export function makeEntry(notebookId, patch = {}) {
  const now = new Date().toISOString();
  return sanitizeEntry({
    id: newId('e'),
    notebookId,
    sectionId: null,
    type: 'note',
    title: '',
    body: '',
    fields: {},
    tags: [],
    raw: '',
    source: 'manual',
    starred: false,
    status: 'clean',
    lessonDate: dateKey(new Date()),
    order: Date.now(),
    srs: null,
    created: now,
    updated: now,
    ...patch,
  }, notebookId);
}

// Coerces anything (imported JSON, LLM output, an old record) into a safe entry.
export function sanitizeEntry(raw, notebookId) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const now = new Date().toISOString();
  const tags = Array.isArray(src.tags)
    ? src.tags.map(normalizeTag).filter(Boolean).slice(0, 12)
    : [];
  const type = TYPE_META[src.type] ? src.type : 'note';
  const fields = src.fields && typeof src.fields === 'object' && !Array.isArray(src.fields) ? src.fields : {};
  const cleanFields = {};
  Object.entries(fields).forEach(([k, v]) => {
    if (v === null || v === undefined || v === '') return;
    cleanFields[String(k).slice(0, 40)] = typeof v === 'string' ? v.slice(0, 600) : v;
  });
  return {
    id: src.id || newId('e'),
    notebookId: src.notebookId || notebookId || null,
    sectionId: src.sectionId || null,
    type,
    title: String(src.title || '').trim().slice(0, 200),
    body: String(src.body || '').trim().slice(0, 6000),
    fields: cleanFields,
    tags: Array.from(new Set(tags)),
    raw: String(src.raw || '').slice(0, 8000),
    source: src.source || 'manual',
    starred: !!src.starred,
    status: src.status === 'raw' ? 'raw' : 'clean',
    lessonDate: /^\d{4}-\d{2}-\d{2}$/.test(src.lessonDate) ? src.lessonDate : dateKey(new Date()),
    order: typeof src.order === 'number' ? src.order : Date.now(),
    srs: src.srs && typeof src.srs === 'object' ? src.srs : null,
    created: src.created || now,
    updated: src.updated || now,
  };
}

// ── LLM output parsing ───────────────────────────────────────────────────
// Models wrap JSON in prose or ``` fences no matter how firmly you ask them
// not to. Pull the first balanced {...} or [...] out of whatever came back.
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const direct = tryParse(trimmed);
  if (direct !== undefined) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const inner = tryParse(fenced[1].trim());
    if (inner !== undefined) return inner;
  }

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch !== '{' && ch !== '[') continue;
    const close = matchingIndex(trimmed, i);
    if (close === -1) continue;
    const slice = trimmed.slice(i, close + 1);
    const parsed = tryParse(slice);
    if (parsed !== undefined) return parsed;
  }
  return null;
}

function tryParse(s) {
  try { return JSON.parse(s); } catch { return undefined; }
}

function matchingIndex(s, start) {
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Normalizes whatever shape the model returned into a list of draft entries.
export function parseEntryDrafts(payload, notebookId) {
  const data = typeof payload === 'string' ? extractJson(payload) : payload;
  if (!data) return [];
  const list = Array.isArray(data) ? data
    : Array.isArray(data.entries) ? data.entries
    : Array.isArray(data.cards) ? data.cards
    : Array.isArray(data.items) ? data.items
    : null;
  if (!list) return [];
  return list
    .filter((x) => x && typeof x === 'object')
    .map((x) => sanitizeEntry({ ...x, source: 'ai', id: newId('e') }, notebookId))
    .filter((e) => e.title || e.body || Object.keys(e.fields).length);
}

// ── search ───────────────────────────────────────────────────────────────
export function entryText(entry) {
  if (!entry) return '';
  const fieldText = Object.entries(entry.fields || {})
    .map(([k, v]) => `${k}: ${v}`).join('\n');
  return [entry.title, entry.body, fieldText, (entry.tags || []).join(' '), entry.raw]
    .filter(Boolean).join('\n');
}

// The raw dump is deliberately left out of the search haystack: one dump can
// produce a dozen cards that all carry the same original text, which would
// make every one of them match every word in it.
export function searchText(entry) {
  if (!entry) return '';
  const fieldText = Object.entries(entry.fields || {})
    .map(([k, v]) => `${k}: ${v}`).join('\n');
  return [entry.title, entry.body, fieldText, (entry.tags || []).join(' ')]
    .filter(Boolean).join('\n');
}

export function scoreEntry(entry, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return 0;
  const terms = q.split(/\s+/).filter(Boolean);
  const title = (entry.title || '').toLowerCase();
  const hay = searchText(entry).toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!hay.includes(term)) return 0;          // every term must appear
    if (title.includes(term)) score += 6;
    if (title.startsWith(term)) score += 4;
    if ((entry.tags || []).some((t) => t.includes(term))) score += 3;
    score += 1;
  }
  if (entry.starred) score += 2;
  return score;
}

export function searchEntries(entries, query, limit = 60) {
  return (entries || [])
    .map((e) => ({ entry: e, score: scoreEntry(e, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (b.entry.updated || '').localeCompare(a.entry.updated || ''))
    .slice(0, limit)
    .map((r) => r.entry);
}

// Near-duplicate detection so the same word doesn't get filed five times.
export function findDuplicates(entries, candidate, threshold = 0.82) {
  const key = dupeKey(candidate);
  if (!key) return [];
  return (entries || []).filter((e) => {
    if (e.id === candidate.id) return false;
    const other = dupeKey(e);
    return other && similarity(key, other) >= threshold;
  });
}

function dupeKey(entry) {
  const f = entry.fields || {};
  return slug(f.term || f.word || entry.title || '').replace(/-/g, ' ').trim();
}

// Dice coefficient on character bigrams — cheap, no deps, good enough.
export function similarity(a, b) {
  const s1 = String(a || '').toLowerCase(), s2 = String(b || '').toLowerCase();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;
  const bigrams = new Map();
  for (let i = 0; i < s1.length - 1; i++) {
    const g = s1.slice(i, i + 2);
    bigrams.set(g, (bigrams.get(g) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const g = s2.slice(i, i + 2);
    const count = bigrams.get(g) || 0;
    if (count > 0) { bigrams.set(g, count - 1); hits++; }
  }
  return (2 * hits) / (s1.length + s2.length - 2);
}

// ── grouping / ordering ──────────────────────────────────────────────────
export function groupBy(list, keyFn) {
  const out = new Map();
  (list || []).forEach((item) => {
    const k = keyFn(item);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(item);
  });
  return out;
}

export function sortEntries(entries, mode = 'manual') {
  const list = [...(entries || [])];
  if (mode === 'newest') return list.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  if (mode === 'oldest') return list.sort((a, b) => (a.created || '').localeCompare(b.created || ''));
  if (mode === 'alpha') return list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  return list.sort((a, b) => (a.order || 0) - (b.order || 0));
}

// Moves `movingId` to sit where `targetId` is, returning fresh `order` values.
export function reorder(entries, movingId, targetId) {
  const list = sortEntries(entries, 'manual');
  const from = list.findIndex((e) => e.id === movingId);
  const to = list.findIndex((e) => e.id === targetId);
  if (from === -1 || to === -1 || from === to) return entries;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((e, i) => ({ ...e, order: (i + 1) * 100 }));
}

// ── spaced repetition (SM-2 lite) ────────────────────────────────────────
export const RATINGS = ['again', 'hard', 'good', 'easy'];

export function srsInit(todayKey) {
  return { due: todayKey, interval: 0, ease: 2.5, reps: 0, lapses: 0, last: null };
}

export function srsReview(srs, rating, todayKey) {
  const base = srs && typeof srs === 'object' ? { ...srsInit(todayKey), ...srs } : srsInit(todayKey);
  let { interval, ease, reps, lapses } = base;
  if (rating === 'again') {
    interval = 0; lapses += 1; reps = 0; ease = Math.max(1.3, ease - 0.2);
  } else if (rating === 'hard') {
    interval = interval <= 1 ? 1 : Math.max(1, Math.round(interval * 1.2));
    ease = Math.max(1.3, ease - 0.15); reps += 1;
  } else if (rating === 'easy') {
    interval = interval === 0 ? 4 : Math.round(interval * ease * 1.3);
    ease = Math.min(3.2, ease + 0.15); reps += 1;
  } else { // good
    interval = interval === 0 ? 1 : interval === 1 ? 3 : Math.round(interval * ease);
    reps += 1;
  }
  interval = Math.min(interval, 365);
  return {
    due: addDays(todayKey, rating === 'again' ? 0 : Math.max(1, interval)),
    interval, ease: Math.round(ease * 100) / 100, reps, lapses, last: todayKey,
  };
}

export function addDays(key, days) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

export function isDue(entry, todayKey) {
  if (!entry || !entry.srs) return false;
  return String(entry.srs.due || '') <= todayKey;
}

export function dueEntries(entries, todayKey) {
  return (entries || []).filter((e) => isDue(e, todayKey));
}

// ── AI context ───────────────────────────────────────────────────────────
export function entryToPlainText(entry) {
  const lines = [];
  const meta = typeMeta(entry.type);
  lines.push(`### ${entry.title || '(untitled)'} [${meta.label}]`);
  Object.entries(entry.fields || {}).forEach(([k, v]) => lines.push(`- ${k}: ${v}`));
  if (entry.body) lines.push(entry.body);
  if ((entry.tags || []).length) lines.push(`tags: ${entry.tags.join(', ')}`);
  return lines.join('\n');
}

// Builds a token-bounded digest of a notebook for "ask my notebook".
export function buildContextDigest(entries, { maxChars = 12000, query = '' } = {}) {
  const ranked = query
    ? [...searchEntries(entries, query, 200), ...entries.filter((e) => scoreEntry(e, query) === 0)]
    : sortEntries(entries, 'newest');
  const out = [];
  let used = 0;
  for (const e of ranked) {
    const chunk = entryToPlainText(e);
    if (used + chunk.length > maxChars) break;
    out.push(chunk);
    used += chunk.length + 1;
  }
  return out.join('\n\n');
}

// ── export ───────────────────────────────────────────────────────────────
export function notebookToMarkdown(notebook, entries) {
  const lines = [`# ${notebook.emoji || ''} ${notebook.title}`.trim()];
  if (notebook.subtitle) lines.push(`_${notebook.subtitle}_`);
  const sections = [...(notebook.sections || []), { id: null, title: 'Unsorted' }];
  sections.forEach((sec) => {
    const inSection = sortEntries(entries.filter((e) => (e.sectionId || null) === (sec.id || null)), 'manual');
    if (!inSection.length) return;
    lines.push('', `## ${sec.title}`);
    inSection.forEach((e) => lines.push('', entryToPlainText(e)));
  });
  return lines.join('\n');
}

// Rough guard against Firestore's 1MB per-document ceiling.
export function payloadSize(obj) {
  try { return JSON.stringify(obj).length; } catch { return Infinity; }
}

if (typeof window !== 'undefined') {
  window.KCore = {
    newId, slug, normalizeTag, KINDS, TYPE_META, COLORS, typeMeta, kindMeta,
    makeNotebook, makeEntry, sanitizeEntry, extractJson, parseEntryDrafts,
    entryText, searchText, scoreEntry, searchEntries, findDuplicates, similarity, groupBy,
    sortEntries, reorder, RATINGS, srsInit, srsReview, addDays, isDue, dueEntries,
    entryToPlainText, buildContextDigest, notebookToMarkdown, payloadSize, dateKey,
  };
}
