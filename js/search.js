// --- Search ---
import { escapeHtml } from './utils.js';
import { todos, recurring, getInbox } from './store.js';

export function initSearch(openDayFn, setViewFn) {
  window._searchOpenDay = openDayFn;
  window._searchSetView = setViewFn;
}

export function openSearch() {
  document.getElementById('searchOverlay').classList.add('open');
  setTimeout(() => document.getElementById('searchInput').focus(), 100);
}

export function closeSearch() {
  document.getElementById('searchOverlay').classList.remove('open');
  document.getElementById('searchInput').value = '';
  document.getElementById('searchResults').innerHTML = '<div class="search-empty">Type to search across all days</div>';
}

export function performSearch(query) {
  const results = document.getElementById('searchResults');
  if (!query.trim()) {
    results.innerHTML = '<div class="search-empty">Type to search across all days</div>';
    return;
  }
  const q = query.toLowerCase();
  let matches = [];

  Object.entries(todos).forEach(([key, items]) => {
    items.forEach(t => {
      if (t.recurringId) return;
      if (t.text && t.text.toLowerCase().includes(q)) {
        matches.push({ key, text: t.text, done: t.done });
      } else if (t.notes && t.notes.toLowerCase().includes(q)) {
        matches.push({ key, text: t.text, done: t.done, matchInNotes: true });
      }
    });
  });

  recurring.forEach(r => {
    if (r.text.toLowerCase().includes(q)) {
      matches.push({ key: r.startDate, text: r.text + ' (recurring)', done: false });
    }
  });

  const inbox = getInbox();
  inbox.forEach(t => {
    if (t.text.toLowerCase().includes(q)) {
      matches.push({ key: 'inbox', text: t.text, done: t.done });
    }
  });

  if (matches.length === 0) {
    results.innerHTML = '<div class="search-empty">No results found</div>';
    return;
  }

  matches.sort((a, b) => b.key.localeCompare(a.key));

  const escaped = escapeHtml(query);
  results.innerHTML = matches.slice(0, 20).map(m => {
    const highlighted = escapeHtml(m.text).replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
    const dateTxt = m.key === 'inbox' ? 'Inbox' : new Date(m.key + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const onClick = m.key === 'inbox'
      ? `window._searchSetView('inbox');window._searchCloseSearch();`
      : `window._searchOpenDay('${m.key}');window._searchCloseSearch();`;
    return `<div class="search-result-item" onclick="${onClick}"><span class="sr-text ${m.done ? 'sr-done' : ''}">${highlighted}</span><span class="sr-date">${dateTxt}</span></div>`;
  }).join('') + (matches.length > 20 ? `<div class="search-empty">+${matches.length - 20} more results</div>` : '');
}

// Expose closeSearch globally for onclick handlers
window._searchCloseSearch = closeSearch;
