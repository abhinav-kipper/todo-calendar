// ─── Knowledge AI ─────────────────────────────────────────────────────────
// A thin, provider-agnostic LLM layer. The whole app works without it; every
// AI call is an opt-in enhancement on top of notes you already own.
//
// Keys live in this browser's localStorage only — they are never sent
// anywhere except to the provider you picked. Prompts (and therefore the note
// text you run them on) go to that provider, which is the trade for free
// hosted inference. Ollama keeps everything on your machine.

import { extractJson, parseEntryDrafts, buildContextDigest, entryToPlainText, kindMeta } from './knowledge-core.js';

export const PROVIDERS = {
  gemini: {
    id: 'gemini', label: 'Google Gemini', shape: 'gemini', needsKey: true,
    note: 'Generous free tier. Key from aistudio.google.com/apikey',
    keyUrl: 'https://aistudio.google.com/apikey',
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
  groq: {
    id: 'groq', label: 'Groq', shape: 'openai', needsKey: true,
    note: 'Free and very fast. Key from console.groq.com/keys',
    keyUrl: 'https://console.groq.com/keys',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  },
  openrouter: {
    id: 'openrouter', label: 'OpenRouter', shape: 'openai', needsKey: true,
    note: 'Free community models. Key from openrouter.ai/keys',
    keyUrl: 'https://openrouter.ai/keys',
    models: ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemma-3-27b-it:free'],
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  },
  ollama: {
    id: 'ollama', label: 'Ollama (on this machine)', shape: 'openai', needsKey: false,
    note: 'Fully offline. Run `ollama serve` then pull a model.',
    keyUrl: 'https://ollama.com/download',
    models: ['llama3.1', 'qwen2.5', 'mistral'],
    endpoint: 'http://localhost:11434/v1/chat/completions',
  },
  custom: {
    id: 'custom', label: 'Custom (OpenAI-compatible)', shape: 'openai', needsKey: false,
    note: 'Any endpoint that speaks /chat/completions.',
    keyUrl: '', models: [], endpoint: '',
  },
};

export function providerMeta(id) { return PROVIDERS[id] || PROVIDERS.gemini; }

// ── low-level call ───────────────────────────────────────────────────────
async function callLLM(cfg, { system, user, json = false, temperature = 0.3, maxTokens = 4096 }) {
  const meta = providerMeta(cfg.provider);
  const endpoint = (cfg.endpoint || meta.endpoint || '').trim();
  const model = (cfg.model || meta.models[0] || '').trim();
  if (!endpoint) throw new AiError('No endpoint configured for this provider.', 'config');
  if (!model) throw new AiError('No model name set — pick one in AI settings.', 'config');
  if (meta.needsKey && !cfg.apiKey) throw new AiError(`${meta.label} needs an API key. Add one in AI settings.`, 'nokey');

  const res = meta.shape === 'gemini'
    ? await callGemini({ endpoint, model, apiKey: cfg.apiKey, system, user, json, temperature, maxTokens })
    : await callOpenAiCompatible({ endpoint, model, apiKey: cfg.apiKey, system, user, json, temperature, maxTokens });
  return res;
}

async function fetchJson(url, options, label) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    throw new AiError(
      `Couldn't reach ${label}. Check your connection — or, for a local model, that it allows requests from this page (CORS).`,
      'network');
  }
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    try { detail = extractJson(text)?.error?.message || detail; } catch {}
    if (res.status === 401 || res.status === 403) throw new AiError(`${label} rejected the API key (${res.status}). ${detail}`, 'nokey');
    if (res.status === 429) throw new AiError(`${label} rate-limited you — free tiers are per-minute. Wait a moment and retry.`, 'rate');
    if (res.status === 404) throw new AiError(`${label} doesn't know that model (404). Try another model name. ${detail}`, 'config');
    throw new AiError(`${label} error ${res.status}: ${detail}`, 'server');
  }
  const parsed = extractJson(text);
  if (!parsed) throw new AiError(`${label} returned something unreadable.`, 'parse');
  return parsed;
}

async function callGemini({ endpoint, model, apiKey, system, user, json, temperature, maxTokens }) {
  const url = `${endpoint.replace(/\/$/, '')}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  const data = await fetchJson(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, 'Gemini');
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const out = parts.map((p) => p.text || '').join('').trim();
  if (!out) {
    const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
    throw new AiError(reason ? `Gemini returned nothing (${reason}).` : 'Gemini returned nothing.', 'empty');
  }
  return out;
}

async function callOpenAiCompatible({ endpoint, model, apiKey, system, user, json, temperature, maxTokens }) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const body = {
    model, temperature, max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  };
  const data = await fetchJson(endpoint, { method: 'POST', headers, body: JSON.stringify(body) }, 'The model');
  const out = data?.choices?.[0]?.message?.content;
  if (!out) throw new AiError('The model returned nothing.', 'empty');
  return String(out).trim();
}

export class AiError extends Error {
  constructor(message, code) { super(message); this.name = 'AiError'; this.code = code || 'unknown'; }
}

// ── prompt building ──────────────────────────────────────────────────────
function notebookBrief(notebook) {
  const meta = kindMeta(notebook.kind);
  const bits = [
    `Notebook: "${notebook.title}" (${meta.label.toLowerCase()} notebook).`,
    notebook.topic ? `Subject: ${notebook.topic}.` : '',
    (notebook.sections || []).length ? `Existing sections: ${notebook.sections.map((s) => s.title).join(', ')}.` : '',
    notebook.aiNotes ? `The learner's standing instructions: ${notebook.aiNotes}` : '',
  ];
  return bits.filter(Boolean).join('\n');
}

function fieldGuide(kind) {
  if (kind === 'language') {
    return `For a word or phrase use fields: term, translation, article (de/het or equivalent), plural, example, exampleTranslation, literal, register.`;
  }
  if (kind === 'dance') {
    return `For a movement or drill use fields: count (e.g. "1-2-3"), timing, weight (which foot carries weight), lead, follow, commonMistake, drill.`;
  }
  return `Use fields only for genuinely structured details (e.g. source, when, who).`;
}

const HOUSE_RULES = `
Hard rules:
- Preserve every fact in the dump. Never invent facts the dump does not contain or imply.
- If a foreign word was clearly written phonetically, correct the spelling and note the original in the body as: heard as "<original>".
- If something is ambiguous or you are unsure, keep it and add a short "unsure:" note rather than dropping or guessing.
- Split into atomic cards: one idea per card. Aim for 1-10 cards, never more than 12.
- Titles are short (max 8 words). Bodies are 1-4 short sentences or bullet lines. No markdown headings.
- Write in clear plain English, second person, keeping the learner's own wording where it is already good.
- Output JSON only. No prose before or after.`;

// ── operations ───────────────────────────────────────────────────────────

// Turn one messy dump into a set of clean, filed cards.
export async function structure(cfg, { text, notebook, types }) {
  const meta = kindMeta(notebook.kind);
  const system = `You are ${meta.persona}. You turn a learner's messy, half-remembered class notes into a tidy knowledge base.
${notebookBrief(notebook)}

Return JSON shaped exactly like:
{"summary":"one sentence on what this dump covered","entries":[{"type":"...","title":"...","body":"...","fields":{},"tags":["..."],"sectionTitle":"..."}]}

"type" must be one of: ${(types || meta.types).join(', ')}.
"sectionTitle" should reuse an existing section name when one fits; propose a new short name only if nothing fits.
"tags" are 1-4 lowercase keywords.
${fieldGuide(notebook.kind)}
${HOUSE_RULES}`;
  const out = await callLLM(cfg, { system, user: `Here is the dump:\n\n"""\n${text}\n"""`, json: true, temperature: 0.25 });
  const parsed = extractJson(out);
  const drafts = parseEntryDrafts(parsed, notebook.id);
  if (!drafts.length) throw new AiError('The model did not return any usable cards. Try again, or save the dump raw.', 'empty');
  const raw = Array.isArray(parsed?.entries) ? parsed.entries : [];
  drafts.forEach((d, i) => { d._sectionTitle = raw[i]?.sectionTitle || ''; });
  return { summary: String(parsed?.summary || '').slice(0, 300), drafts };
}

// Rewrite a single card: fix language, tighten, add the missing structured bits.
export async function enhance(cfg, { entry, notebook, instruction }) {
  const meta = kindMeta(notebook.kind);
  const system = `You are ${meta.persona} improving one card in a learner's knowledge base.
${notebookBrief(notebook)}

Return JSON shaped exactly like:
{"title":"...","body":"...","fields":{},"tags":["..."],"type":"${entry.type}","changes":["what you changed and why, one short line each"]}

Improve clarity, fix spelling and grammar (especially foreign words), fill in obviously missing structured fields, and add at most one genuinely useful extra line (an example, a mnemonic, or a pitfall) clearly marked.
${fieldGuide(notebook.kind)}
${HOUSE_RULES}`;
  const user = `${instruction ? `The learner asks: ${instruction}\n\n` : ''}Current card:\n${entryToPlainText(entry)}${entry.raw ? `\n\nOriginal dump it came from:\n"""\n${entry.raw}\n"""` : ''}`;
  const out = await callLLM(cfg, { system, user, json: true, temperature: 0.3 });
  const data = extractJson(out);
  if (!data || typeof data !== 'object') throw new AiError('Could not read the improved card.', 'parse');
  return {
    patch: {
      title: String(data.title || entry.title).slice(0, 200),
      body: String(data.body || entry.body).slice(0, 6000),
      fields: data.fields && typeof data.fields === 'object' ? data.fields : entry.fields,
      tags: Array.isArray(data.tags) ? data.tags : entry.tags,
      type: data.type || entry.type,
    },
    changes: Array.isArray(data.changes) ? data.changes.map(String).slice(0, 8) : [],
  };
}

// "Did I say this right?" — correct a sentence and explain the fixes.
export async function correct(cfg, { text, notebook }) {
  const system = `You are ${kindMeta(notebook.kind).persona} correcting a learner's attempt.
${notebookBrief(notebook)}

Return JSON shaped exactly like:
{"corrected":"the fixed version","natural":"how a native would more likely say it","issues":[{"wrong":"...","right":"...","why":"one short sentence"}],"verdict":"one encouraging sentence"}
If the attempt is already correct, return it unchanged with an empty issues array. Output JSON only.`;
  const out = await callLLM(cfg, { system, user: `Attempt:\n"""\n${text}\n"""`, json: true, temperature: 0.2 });
  const data = extractJson(out);
  if (!data) throw new AiError('Could not read the correction.', 'parse');
  return {
    corrected: String(data.corrected || ''),
    natural: String(data.natural || ''),
    verdict: String(data.verdict || ''),
    issues: Array.isArray(data.issues) ? data.issues.slice(0, 12) : [],
  };
}

// Ask a question answered strictly from this notebook's cards.
export async function ask(cfg, { question, entries, notebook, history = [] }) {
  const digest = buildContextDigest(entries, { query: question, maxChars: 11000 });
  const system = `You are ${kindMeta(notebook.kind).persona} answering questions about the learner's own notes.
${notebookBrief(notebook)}

Answer from the notes below. If the notes don't cover it, say so in one line, then answer from your own knowledge clearly marked as "beyond your notes:".
Be concise: a short paragraph or a few bullet lines. Plain text, no markdown headings. Quote the learner's own card titles when relevant.`;
  const convo = history.slice(-6).map((m) => `${m.role === 'user' ? 'Learner' : 'You'}: ${m.text}`).join('\n');
  const user = `Notes:\n"""\n${digest || '(this notebook is empty)'}\n"""\n${convo ? `\nEarlier in this conversation:\n${convo}\n` : ''}\nQuestion: ${question}`;
  return await callLLM(cfg, { system, user, json: false, temperature: 0.4, maxTokens: 1200 });
}

// Generate a quick quiz from a set of cards.
export async function quiz(cfg, { entries, notebook, count = 8 }) {
  const digest = buildContextDigest(entries, { maxChars: 9000 });
  const system = `You are ${kindMeta(notebook.kind).persona} writing a quick self-test from the learner's own notes.
${notebookBrief(notebook)}

Return JSON shaped exactly like:
{"questions":[{"q":"...","a":"...","hint":"...","cardTitle":"the note it came from"}]}
Ask ${count} questions, only about material present in the notes. Mix recall and application. Output JSON only.`;
  const out = await callLLM(cfg, { system, user: `Notes:\n"""\n${digest}\n"""`, json: true, temperature: 0.5 });
  const data = extractJson(out);
  const list = Array.isArray(data?.questions) ? data.questions : [];
  if (!list.length) throw new AiError('No questions came back — add a few more cards first.', 'empty');
  return list.slice(0, 20).map((q) => ({
    q: String(q.q || ''), a: String(q.a || ''), hint: String(q.hint || ''), cardTitle: String(q.cardTitle || ''),
  })).filter((q) => q.q && q.a);
}

// Turn starred / weak cards into a practice plan you can push to the calendar.
export async function practicePlan(cfg, { entries, notebook, days = 7 }) {
  const digest = buildContextDigest(entries, { maxChars: 9000 });
  const system = `You are ${kindMeta(notebook.kind).persona} writing a practice plan.
${notebookBrief(notebook)}

Return JSON shaped exactly like:
{"intro":"one sentence","tasks":[{"day":1,"text":"a concrete 5-15 minute practice task","why":"the card it drills"}]}
Cover ${days} days, one to two tasks per day, drawn only from the notes. Tasks must be specific and physically doable. Output JSON only.`;
  const out = await callLLM(cfg, { system, user: `Notes:\n"""\n${digest}\n"""`, json: true, temperature: 0.5 });
  const data = extractJson(out);
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  if (!tasks.length) throw new AiError('No plan came back — try again in a moment.', 'empty');
  return {
    intro: String(data.intro || ''),
    tasks: tasks.slice(0, 20).map((t) => ({
      day: Number(t.day) || 1, text: String(t.text || ''), why: String(t.why || ''),
    })).filter((t) => t.text),
  };
}

// One cheap round-trip so settings can say "working" instead of "probably".
export async function testConnection(cfg) {
  const out = await callLLM(cfg, {
    system: 'Reply with the single word: ok', user: 'ping', json: false, temperature: 0, maxTokens: 16,
  });
  return String(out).toLowerCase().includes('ok');
}

export const KnowledgeAI = {
  PROVIDERS, providerMeta, structure, enhance, correct, ask, quiz, practicePlan, testConnection, AiError,
};

if (typeof window !== 'undefined') window.KnowledgeAI = KnowledgeAI;
