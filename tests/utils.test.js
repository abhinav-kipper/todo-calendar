import { dateKey, escapeHtml, getRelativeDay, calculateStreak, getMonthStats, getOverdueTodos, generateId } from '../js/utils.js';

let passed = 0, failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function test(name, fn) {
  console.log(`\n${name}`);
  fn();
}

// --- Tests ---
test('dateKey', () => {
  assert(dateKey(new Date(2026, 0, 5)) === '2026-01-05', 'pads single digit month and day');
  assert(dateKey(new Date(2026, 11, 25)) === '2026-12-25', 'handles december');
  assert(dateKey(new Date(2026, 4, 13)) === '2026-05-13', 'handles may');
});

test('escapeHtml', () => {
  assert(escapeHtml('<script>') === '&lt;script&gt;', 'escapes angle brackets');
  assert(escapeHtml('"hello"') === '&quot;hello&quot;', 'escapes quotes');
  assert(escapeHtml('a & b') === 'a &amp; b', 'escapes ampersand');
  assert(escapeHtml('normal text') === 'normal text', 'leaves normal text alone');
});

test('getRelativeDay', () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);
  assert(getRelativeDay(todayKey) === 'Today', 'recognizes today');

  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  assert(getRelativeDay(dateKey(tomorrow)) === 'Tomorrow', 'recognizes tomorrow');

  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  assert(getRelativeDay(dateKey(yesterday)) === 'Yesterday', 'recognizes yesterday');

  const farAway = new Date(today); farAway.setDate(farAway.getDate() + 10);
  assert(getRelativeDay(dateKey(farAway)) === '', 'returns empty for other days');
});

test('generateId', () => {
  const id1 = generateId();
  const id2 = generateId();
  assert(typeof id1 === 'string', 'returns a string');
  assert(id1.length > 5, 'is reasonably long');
  assert(id1 !== id2, 'generates unique ids');
});

test('calculateStreak', () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Mock getTodosForDay
  const k0 = dateKey(today);
  const k1 = dateKey(new Date(today.getTime() - 86400000));
  const k2 = dateKey(new Date(today.getTime() - 2 * 86400000));

  const mockAllDone = (key) => {
    if (key === k0) return [{ done: true }, { done: true }];
    if (key === k1) return [{ done: true }];
    if (key === k2) return [{ done: false }]; // breaks streak
    return [];
  };
  assert(calculateStreak(mockAllDone) === 2, 'counts consecutive all-done days');

  const mockNone = () => [];
  assert(calculateStreak(mockNone) === 0, 'returns 0 when no todos');

  const mockTodayUndone = (key) => {
    if (key === k0) return [{ done: false }];
    return [];
  };
  assert(calculateStreak(mockTodayUndone) === 0, 'returns 0 when today has undone items');
});

test('getMonthStats', () => {
  const mock = (key) => {
    if (key.endsWith('-01')) return [{ done: true }, { done: false }];
    if (key.endsWith('-02')) return [{ done: true }];
    return [];
  };
  const stats = getMonthStats(2026, 4, mock); // May 2026
  assert(stats.total === 3, 'counts total todos');
  assert(stats.done === 2, 'counts done todos');
  assert(stats.pending === 1, 'counts pending todos');
});

test('getOverdueTodos', () => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const yKey = dateKey(yesterday);

  const todos = { [yKey]: [{ text: 'undone', done: false }, { text: 'done', done: true }] };
  const overdue = getOverdueTodos(todos, 7);
  assert(overdue.length === 1, 'finds undone todos from past days');
  assert(overdue[0].text === 'undone', 'returns the undone todo');
  assert(overdue[0].fromKey === yKey, 'includes source key');

  const emptyOverdue = getOverdueTodos({}, 7);
  assert(emptyOverdue.length === 0, 'returns empty for no todos');
});

// --- Summary ---
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) console.error('TESTS FAILED');
else console.log('ALL TESTS PASSED');
