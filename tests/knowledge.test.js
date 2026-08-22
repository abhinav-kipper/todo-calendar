import {
  slug, normalizeTag, extractJson, parseEntryDrafts, sanitizeEntry, makeNotebook, makeEntry,
  scoreEntry, searchEntries, similarity, findDuplicates, sortEntries, reorder,
  srsInit, srsReview, addDays, isDue, dueEntries, groupBy, buildContextDigest,
  notebookToMarkdown, entryToPlainText, typeMeta, kindMeta, payloadSize,
} from '../js/knowledge-core.js';

let passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function test(name, fn) {
  console.log(`\n${name}`);
  fn();
}

const entry = (patch) => sanitizeEntry({ notebookId: 'nb1', ...patch }, 'nb1');

// --- Tests ---
test('slug / normalizeTag', () => {
  assert(slug('Café gezellig!') === 'cafe-gezellig', 'strips accents and punctuation');
  assert(slug('  Hé, wàt?  ') === 'he-wat', 'trims and collapses separators');
  assert(slug('') === '', 'empty in, empty out');
  assert(normalizeTag('#Weight Shift') === 'weight-shift', 'drops the hash and slugs');
});

test('extractJson', () => {
  assert(extractJson('{"a":1}').a === 1, 'parses bare json');
  assert(extractJson('```json\n{"a":2}\n```').a === 2, 'unwraps fenced json');
  assert(extractJson('Sure! {"a":3} hope that helps').a === 3, 'digs json out of prose');
  assert(extractJson('text {"t":"a \\"quoted\\" {brace}"} end').t === 'a "quoted" {brace}',
    'ignores braces inside strings');
  assert(Array.isArray(extractJson('[{"a":1}]')), 'handles top-level arrays');
  assert(extractJson('no json here') === null, 'returns null when there is none');
  assert(extractJson(null) === null, 'survives non-strings');
});

test('parseEntryDrafts', () => {
  const drafts = parseEntryDrafts('{"entries":[{"type":"vocab","title":"zin","tags":["Wanting","wanting"]}]}', 'nb1');
  assert(drafts.length === 1, 'reads the entries array');
  assert(drafts[0].type === 'vocab' && drafts[0].notebookId === 'nb1', 'keeps type, stamps the notebook');
  assert(drafts[0].tags.length === 1 && drafts[0].tags[0] === 'wanting', 'normalizes and dedupes tags');
  assert(parseEntryDrafts('{"cards":[{"title":"x"}]}', 'nb1').length === 1, 'accepts a "cards" key too');
  assert(parseEntryDrafts('[{"title":"y"}]', 'nb1').length === 1, 'accepts a bare array');
  assert(parseEntryDrafts('{"entries":[{"title":""}]}', 'nb1').length === 0, 'drops empty drafts');
  assert(parseEntryDrafts('garbage', 'nb1').length === 0, 'garbage in, empty list out');
});

test('sanitizeEntry', () => {
  const e = sanitizeEntry({ type: 'not-a-type', title: 123, tags: 'nope', fields: [1, 2] }, 'nb1');
  assert(e.type === 'note', 'unknown types fall back to note');
  assert(e.title === '123', 'coerces the title to a string');
  assert(Array.isArray(e.tags) && e.tags.length === 0, 'non-array tags become an empty list');
  assert(Object.keys(e.fields).length === 0, 'non-object fields become an empty object');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(e.lessonDate), 'always gets a valid lesson date');
  const kept = sanitizeEntry({ fields: { term: 'zin', empty: '', nul: null } }, 'nb1');
  assert(Object.keys(kept.fields).length === 1, 'drops empty field values');
});

test('makeNotebook / makeEntry', () => {
  const nb = makeNotebook({ title: 'Dutch', kind: 'language' });
  assert(nb.sections.length === kindMeta('language').sections.length, 'seeds the starter sections');
  assert(nb.sections.every((s) => s.id && s.title), 'every section gets an id');
  assert(makeNotebook({ title: 'x', kind: 'bogus' }).kind === 'general', 'unknown kinds fall back to general');
  assert(makeEntry('nb1').notebookId === 'nb1', 'entries remember their notebook');
  assert(typeMeta('bogus').label === typeMeta('note').label, 'unknown card types render as notes');
});

test('search', () => {
  const list = [
    entry({ title: 'gezellig', body: 'cosy', tags: ['culture'] }),
    entry({ title: 'ik heb zin in', body: 'I feel like', raw: 'gezellig heeft geen vertaling' }),
    entry({ title: 'quantity', body: 'een beetje' }),
  ];
  assert(searchEntries(list, 'gezellig').length === 1, 'the raw dump is not searched, so siblings do not match');
  assert(searchEntries(list, 'zin').length === 1, 'matches on title');
  assert(searchEntries(list, 'culture').length === 1, 'matches on tags');
  assert(searchEntries(list, 'zin gezellig').length === 0, 'every term must match');
  assert(searchEntries(list, '').length === 0, 'empty query matches nothing');
  assert(scoreEntry(list[0], 'gezellig') > scoreEntry(list[2], 'beetje'), 'title hits outrank body hits');
});

test('similarity / duplicates', () => {
  assert(similarity('gezellig', 'gezellig') === 1, 'identical strings score 1');
  assert(similarity('gezellig', 'gezelig') > 0.85, 'a typo still scores high');
  assert(similarity('gezellig', 'fiets') < 0.2, 'unrelated words score low');
  assert(similarity('', 'x') === 0, 'empty strings score 0');
  const list = [entry({ id: 'a', title: 'gezellig', fields: { term: 'gezellig' } })];
  assert(findDuplicates(list, entry({ id: 'b', fields: { term: 'gezelig' } })).length === 1, 'catches near-duplicates');
  assert(findDuplicates(list, entry({ id: 'b', fields: { term: 'fiets' } })).length === 0, 'leaves distinct cards alone');
  assert(findDuplicates(list, list[0]).length === 0, 'a card is never its own duplicate');
});

test('ordering', () => {
  const list = [entry({ id: 'a', order: 300 }), entry({ id: 'b', order: 100 }), entry({ id: 'c', order: 200 })];
  assert(sortEntries(list).map((e) => e.id).join('') === 'bca', 'manual sort follows order');
  const moved = reorder(list, 'a', 'b');
  assert(moved.map((e) => e.id).join('') === 'abc', 'moving a card onto b puts it first');
  assert(moved.every((e, i) => e.order === (i + 1) * 100), 'orders are renumbered with room to spare');
  assert(reorder(list, 'a', 'a') === list, 'a no-op move returns the original list');
  assert(reorder(list, 'a', 'zzz') === list, 'an unknown target is a no-op');
});

test('spaced repetition', () => {
  const today = '2026-08-22';
  const fresh = srsInit(today);
  assert(fresh.due === today && fresh.interval === 0, 'a new card is due immediately');
  const good = srsReview(fresh, 'good', today);
  assert(good.due === '2026-08-23' && good.interval === 1, 'first "good" pushes it a day out');
  const again = srsReview(good, 'again', today);
  assert(again.due === today && again.lapses === 1, '"again" brings it straight back and counts a lapse');
  assert(again.ease < good.ease, '"again" makes the card harder');
  const easy = srsReview({ ...fresh, interval: 10, ease: 2.5 }, 'easy', today);
  assert(easy.interval > 10, '"easy" stretches the interval');
  assert(srsReview({ interval: 400, ease: 3 }, 'good', today).interval <= 365, 'intervals are capped at a year');
  assert(srsReview(null, 'good', today).interval === 1, 'a missing srs record is treated as new');
  assert(addDays('2026-12-31', 1) === '2027-01-01', 'addDays crosses the year boundary');
});

test('due filtering', () => {
  const today = '2026-08-22';
  const list = [
    entry({ id: 'a', srs: { due: '2026-08-20' } }),
    entry({ id: 'b', srs: { due: '2026-09-01' } }),
    entry({ id: 'c' }),
  ];
  assert(isDue(list[0], today) === true, 'an overdue card is due');
  assert(isDue(list[1], today) === false, 'a future card is not');
  assert(isDue(list[2], today) === false, 'an unstarred card never comes up');
  assert(dueEntries(list, today).length === 1, 'dueEntries filters the deck');
});

test('grouping and context', () => {
  const list = [entry({ lessonDate: '2026-08-22' }), entry({ lessonDate: '2026-08-22' }), entry({ lessonDate: '2026-08-01' })];
  const groups = groupBy(list, (e) => e.lessonDate);
  assert(groups.size === 2 && groups.get('2026-08-22').length === 2, 'groups by lesson date');
  const digest = buildContextDigest(list, { maxChars: 40 });
  assert(digest.length <= 80, 'the digest respects its character budget');
  assert(entryToPlainText(entry({ title: 'zin', fields: { term: 'zin' } })).includes('term: zin'), 'fields make it into the plain text');
});

test('markdown export', () => {
  const nb = makeNotebook({ title: 'Dutch', kind: 'language' });
  const secId = nb.sections[0].id;
  const md = notebookToMarkdown(nb, [
    entry({ title: 'gezellig', sectionId: secId }),
    entry({ title: 'loose card', sectionId: null }),
  ]);
  assert(md.startsWith('# '), 'starts with the notebook heading');
  assert(md.includes(`## ${nb.sections[0].title}`), 'includes sections that have cards');
  assert(md.includes('Unsorted'), 'sectionless cards land under Unsorted');
  assert(!md.includes(`## ${nb.sections[1].title}`), 'skips empty sections');
});

test('payloadSize', () => {
  assert(payloadSize({ a: 1 }) === JSON.stringify({ a: 1 }).length, 'measures the serialized length');
  const cyclic = {}; cyclic.self = cyclic;
  assert(payloadSize(cyclic) === Infinity, 'unserializable payloads read as infinitely large');
});

// --- Summary ---
console.log(`\n${'='.repeat(40)}`);
console.log(`Knowledge: ${passed} passed, ${failed} failed`);
console.log('='.repeat(40));
