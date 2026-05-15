// --- Keyboard shortcuts ---
export function initShortcuts({ openSearch, openDay, setView, openFocusMode, closePanel, closeFocusMode, closeSearch, navDay, dateKey }) {
  document.addEventListener('keydown', e => {
    const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;

    if (e.key === 'Escape') {
      closePanel();
      closeFocusMode();
      closeSearch();
      return;
    }

    if (!isInput) {
      if (e.key === '/') { e.preventDefault(); openSearch(); return; }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openDay(dateKey(new Date())); return; }
      if (e.key === 'i' || e.key === 'I') { e.preventDefault(); setView('inbox'); return; }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); openFocusMode(); return; }
      if (e.key === '?') {
        e.preventDefault();
        const h = document.getElementById('shortcutsHint');
        h.style.opacity = h.style.opacity === '0' ? '1' : '0';
        return;
      }
    }

    const panel = document.getElementById('panel');
    if (panel && panel.style.display === 'flex' && !isInput) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); navDay(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); navDay(1); }
    }
  });
}
