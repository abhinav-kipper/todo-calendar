// ─── Knowledge ✎ notebooks ───────────────────────────────────────────────
// A separate route from the calendar (knowledge.html) sharing the Almanac's
// design kit, Firebase project and interaction language.
//
// Flow:  dump anything → AI structures it into cards → you keep/edit/file them
//        → practise them → push practice tasks back onto the calendar.
// Every AI step is optional and every AI result is reviewed before it lands.

const { useState, useEffect, useRef, useMemo, useCallback } = React;
const K = window.KCore;

const cls = (...xs) => xs.filter(Boolean).join(" ");
const nowKey = () => K.dateKey(new Date());

const sound = (name) => {
  try {
    if (!window.Sounds) return;
    if (window.Knowledge && window.Knowledge.getPrefs().sound === false) return;
    window.Sounds[name] && window.Sounds[name]();
  } catch {}
};

// ─── Hooks ───────────────────────────────────────────────────────────────

// Hash routing: #/ , #/n/<notebookId> , #/n/<id>/<view>
function useHashRoute() {
  const parse = () => {
    const raw = (window.location.hash || "#/").replace(/^#\/?/, "");
    const parts = raw.split("/").filter(Boolean);
    if (parts[0] === "n" && parts[1]) {
      return { name: "notebook", notebookId: parts[1], sub: parts[2] || null };
    }
    return { name: "shelf" };
  };
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = useCallback((path) => {
    const next = `#${path}`;
    if (window.location.hash === next) setRoute(parse());
    else window.location.hash = next;
  }, []);
  return [route, go];
}

function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((msg, action) => {
    clearTimeout(timer.current);
    setToast({ msg, action, open: true });
    timer.current = setTimeout(() => setToast((t) => (t ? { ...t, open: false } : null)), 4000);
    setTimeout(() => setToast(null), 4400);
  }, []);
  return [toast, show];
}

// Long-press → action sheet on touch devices. Cancels on any real movement so
// it never fights the drag handler.
function useLongPress(onLongPress, delay = 480) {
  const timer = useRef(null);
  const start = useRef(null);
  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    start.current = null;
  }, []);
  return {
    onTouchStart: (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      start.current = { x: t.clientX, y: t.clientY };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { timer.current = null; onLongPress(); }, delay);
    },
    onTouchMove: (e) => {
      const t = e.touches && e.touches[0];
      if (!timer.current || !start.current || !t) return;
      if (Math.abs(t.clientX - start.current.x) > 8 || Math.abs(t.clientY - start.current.y) > 8) cancel();
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  };
}

// Dictation. Optional — the button simply hides where the API is missing.
function useDictation(lang, onText) {
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const supported = typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stop = useCallback(() => {
    try { recRef.current && recRef.current.stop(); } catch {}
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    if (!supported) return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new Ctor();
    rec.lang = lang || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let final = "", partial = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript;
        else partial += r[0].transcript;
      }
      if (final) onText(final.trim() + " ");
      setInterim(partial);
    };
    rec.onerror = () => { setListening(false); setInterim(""); };
    rec.onend = () => { setListening(false); setInterim(""); };
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch {}
  }, [lang, onText, supported]);

  useEffect(() => () => { try { recRef.current && recRef.current.abort(); } catch {} }, []);
  return { supported, listening, interim, start, stop, toggle: () => (listening ? stop() : start()) };
}

// ─── Small components ────────────────────────────────────────────────────
function Spinner() { return <span className="k-busy">✳</span>; }

function Modal({ open, onClose, title, sub, children, foot, wide, icon }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={cls("k-overlay", open && "open")} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cls("k-modal", wide && "wide")} role="dialog" aria-modal="true">
        <div className="k-modal-head">
          {icon && <span style={{ fontSize: 26 }}>{icon}</span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="k-modal-title">{title}</div>
            {sub && <div className="k-modal-sub">{sub}</div>}
          </div>
          <button className="k-icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="k-modal-body">{children}</div>
        {foot && <div className="k-modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

function ActionSheet({ sheet, onClose }) {
  if (!sheet) return null;
  return (
    <div className={cls("k-sheet-overlay", sheet && "open")} onClick={onClose}>
      <div className="k-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="k-sheet-grip" />
        <div className="k-sheet-title">{sheet.title}</div>
        {sheet.actions.map((a) => (
          <button key={a.label} className={cls("k-sheet-act", a.danger && "danger")}
            onClick={() => { onClose(); a.run(); }}>
            <span className="ic">{a.icon}</span>{a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Inline-editable text: click to edit, Enter/blur saves, Esc cancels.
function Editable({ value, onSave, className, placeholder, multiline }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);
  const committed = useRef(false);
  useEffect(() => { if (editing) { setDraft(value); committed.current = false; } }, [editing, value]);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select && ref.current.select(); } }, [editing]);

  if (!editing) {
    return (
      <span className={className} onDoubleClick={() => setEditing(true)} title="Double-click to edit">
        {value || <span style={{ opacity: 0.45 }}>{placeholder}</span>}
      </span>
    );
  }
  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    const next = String(draft).trim();
    if (next && next !== value) onSave(next);
    setEditing(false);
  };
  const Tag = multiline ? "textarea" : "input";
  return (
    <Tag
      ref={ref} className="k-editable" value={draft}
      rows={multiline ? 4 : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !multiline) { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); committed.current = true; setEditing(false); }
      }}
      onBlur={commit}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
}

function Field({ label, children, hint }) {
  return (
    <div className="k-field">
      <label className="k-label">{label}</label>
      {children}
      {hint && <div className="k-hint">{hint}</div>}
    </div>
  );
}

function Empty({ emoji, title, sub, children }) {
  return (
    <div className="k-empty">
      <span className="k-empty-emoji">{emoji}</span>
      <div className="k-empty-title">{title}</div>
      {sub && <div className="k-empty-sub">{sub}</div>}
      {children && <div style={{ marginTop: 16 }}>{children}</div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// App
// ═════════════════════════════════════════════════════════════════════════
function App() {
  const [snap, setSnap] = useState(null);
  const [route, go] = useHashRoute();
  const [toast, showToast] = useToast();
  const [drag, setDrag] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(null);
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState(null);
  const [starOnly, setStarOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState(null);
  const undoRef = useRef(null);
  const dumpRef = useRef(null);
  const searchRef = useRef(null);

  // ── boot ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let stop = false;
    const tryInit = async () => {
      if (!window.Knowledge) { setTimeout(tryInit, 60); return; }
      const unsub = window.Knowledge.subscribe((s) => { if (!stop) setSnap(s); });
      await window.Knowledge.init();
      if (!stop) setSnap(window.Knowledge.snapshot());
      return unsub;
    };
    const p = tryInit();
    return () => { stop = true; p && p.then && p.then((u) => u && u()); };
  }, []);

  // ── derived ────────────────────────────────────────────────────────────
  const notebooks = snap ? snap.notebooks : [];
  const allEntries = snap ? snap.entries : [];
  const prefs = snap ? snap.prefs : {};
  const view = prefs.view || "cards";

  const notebook = useMemo(
    () => (route.name === "notebook" ? notebooks.find((n) => n.id === route.notebookId) : null),
    [route, notebooks]);

  const entries = useMemo(
    () => (notebook ? allEntries.filter((e) => e.notebookId === notebook.id) : []),
    [notebook, allEntries]);

  const today = nowKey();

  // Section chosen in the rail, plus search / star / type filters.
  const visible = useMemo(() => {
    let list = entries;
    if (activeSection === "__raw") list = list.filter((e) => e.status === "raw");
    else if (activeSection === "__due") list = list.filter((e) => K.isDue(e, today));
    else if (activeSection === "__none") list = list.filter((e) => !e.sectionId);
    else if (activeSection) list = list.filter((e) => (e.sectionId || null) === activeSection);
    if (starOnly) list = list.filter((e) => e.starred);
    if (typeFilter) list = list.filter((e) => e.type === typeFilter);
    if (query.trim()) list = K.searchEntries(list, query, 300);
    else list = K.sortEntries(list, prefs.sort || "manual");
    return list;
  }, [entries, activeSection, starOnly, typeFilter, query, prefs.sort, today]);

  const counts = useMemo(() => {
    const byNotebook = {};
    allEntries.forEach((e) => {
      const c = byNotebook[e.notebookId] || (byNotebook[e.notebookId] = { total: 0, due: 0, raw: 0, starred: 0 });
      c.total++;
      if (K.isDue(e, today)) c.due++;
      if (e.status === "raw") c.raw++;
      if (e.starred) c.starred++;
    });
    return byNotebook;
  }, [allEntries, today]);

  // ── AI plumbing ────────────────────────────────────────────────────────
  const aiCfg = snap ? snap.ai : {};
  const aiOn = !!(snap && window.Knowledge && window.Knowledge.aiReady());

  const needsAi = useCallback(() => {
    if (aiOn) return false;
    setModal({ type: "settings", reason: "AI isn't set up yet — pick a provider and paste a key to unlock the ✨ buttons." });
    return true;
  }, [aiOn]);

  const aiError = useCallback((e) => {
    const msg = (e && e.message) || "Something went wrong.";
    showToast(msg);
    if (e && (e.code === "nokey" || e.code === "config")) setModal({ type: "settings", reason: msg });
  }, [showToast]);

  // ── entry actions ──────────────────────────────────────────────────────
  const removeEntry = (entry) => {
    const removed = window.Knowledge.deleteEntry(entry.id);
    undoRef.current = { kind: "entry", payload: removed };
    sound("del");
    showToast(`Deleted "${entry.title || "card"}"`, "undo");
  };

  const removeNotebook = (nb) => {
    const removed = window.Knowledge.deleteNotebook(nb.id);
    undoRef.current = { kind: "notebook", payload: removed };
    sound("del");
    go("/");
    showToast(`Deleted "${nb.title}" and its ${removed.entries.length} cards`, "undo");
  };

  const doUndo = () => {
    const u = undoRef.current;
    if (!u) return;
    if (u.kind === "entry") window.Knowledge.restoreEntry(u.payload);
    if (u.kind === "notebook") window.Knowledge.restoreNotebook(u.payload);
    undoRef.current = null;
    sound("add");
    showToast("Restored ✿");
  };

  const enhanceEntry = async (entry, instruction) => {
    if (needsAi()) return;
    setBusy(entry.id);
    try {
      const res = await window.KnowledgeAI.enhance(aiCfg, { entry, notebook, instruction });
      setModal({ type: "enhance", entry, ...res });
      sound("chime");
    } catch (e) { aiError(e); }
    finally { setBusy(null); }
  };

  // ── dump → cards ───────────────────────────────────────────────────────
  const saveDumpRaw = (text) => {
    if (!text.trim() || !notebook) return false;
    const dump = window.Knowledge.addDump(notebook.id, text, "kept");
    window.Knowledge.addEntry(notebook.id, {
      type: "note",
      title: text.trim().split("\n")[0].slice(0, 60),
      body: text.trim(),
      raw: text.trim(),
      status: "raw",
      source: "dump",
      sectionId: activeSection && activeSection.startsWith("sec") ? activeSection : null,
    });
    window.Knowledge.updateDump(dump.id, { status: "kept" });
    sound("add");
    showToast("Dumped — raw and safe. Structure it whenever.");
    return true;
  };

  const structureDump = async (text) => {
    if (!text.trim() || !notebook) return false;
    if (needsAi()) return false;
    setBusy("dump");
    const dump = window.Knowledge.addDump(notebook.id, text, "pending");
    try {
      const { summary, drafts, truncated } = await window.KnowledgeAI.structure(aiCfg, { text, notebook });
      drafts.forEach((d) => { d.raw = text.trim(); d.lessonDate = today; });
      setModal({ type: "review", drafts, summary, truncated, dumpId: dump.id, sourceText: text.trim() });
      sound("chime");
      return true;
    } catch (e) {
      window.Knowledge.updateDump(dump.id, { status: "failed" });
      aiError(e);
      return false;
    } finally { setBusy(null); }
  };

  // Drafts the user kept become real cards; their sections are created on demand.
  const commitDrafts = (drafts, dumpId, sourceText) => {
    if (!notebook) return;
    const made = drafts.map((d) => {
      const sectionId = d._sectionTitle
        ? window.Knowledge.resolveSection(notebook.id, d._sectionTitle, { create: true })
        : (activeSection && activeSection.startsWith("sec") ? activeSection : null);
      const { _sectionTitle, id, ...rest } = d;
      return { ...rest, sectionId, source: "ai", status: "clean" };
    });
    const created = window.Knowledge.addEntries(notebook.id, made);
    if (dumpId) window.Knowledge.updateDump(dumpId, { status: "processed", entryIds: created.map((e) => e.id) });
    setModal(null);
    sound("chime");
    showToast(`Filed ${created.length} card${created.length === 1 ? "" : "s"} ✿`);
    if (created.length >= 4) burstConfetti();
    void sourceText;
  };

  // ── drag & drop ────────────────────────────────────────────────────────
  // Pointer-based so one code path covers mouse and touch, matching the
  // calendar. Drop targets declare themselves with data-drop="kind:id".
  const beginDrag = (e, entry, clickFallback) => {
    if (e.button === 2) return;
    const x0 = e.clientX ?? (e.touches && e.touches[0].clientX);
    const y0 = e.clientY ?? (e.touches && e.touches[0].clientY);
    let dragging = false;
    let lastEl = null;

    const clearHighlight = () => {
      document.querySelectorAll(".drag-over, .drop-target").forEach((el) => el.classList.remove("drag-over", "drop-target"));
    };

    const onMove = (ev) => {
      const x = ev.clientX ?? (ev.touches && ev.touches[0].clientX);
      const y = ev.clientY ?? (ev.touches && ev.touches[0].clientY);
      if (x === undefined) return;
      if (!dragging && (Math.abs(x - x0) > 7 || Math.abs(y - y0) > 7)) {
        dragging = true;
        sound("pickup");
        setDrag({ entry, pos: { x, y } });
      }
      if (!dragging) return;
      if (ev.cancelable) ev.preventDefault();
      setDrag((d) => (d ? { ...d, pos: { x, y } } : d));
      const el = document.elementFromPoint(x, y);
      const dropEl = el && el.closest("[data-drop]");
      if (dropEl !== lastEl) {
        clearHighlight();
        lastEl = dropEl;
        if (dropEl) {
          const kind = (dropEl.getAttribute("data-drop") || "").split(":")[0];
          dropEl.classList.add(kind === "entry" ? "drop-target" : "drag-over");
        }
      }
    };

    const onUp = (ev) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
      clearHighlight();
      if (!dragging) { setDrag(null); if (clickFallback) clickFallback(); return; }
      const x = ev.clientX ?? (ev.changedTouches && ev.changedTouches[0].clientX);
      const y = ev.clientY ?? (ev.changedTouches && ev.changedTouches[0].clientY);
      const el = x !== undefined ? document.elementFromPoint(x, y) : null;
      const dropEl = el && el.closest("[data-drop]");
      setDrag(null);
      if (!dropEl) return;
      const [kind, id] = (dropEl.getAttribute("data-drop") || "").split(":");
      if (kind === "section") {
        const sectionId = id === "none" ? null : id;
        if ((entry.sectionId || null) !== sectionId) {
          window.Knowledge.moveEntry(entry.id, { sectionId });
          sound("drop");
          const sec = notebook && notebook.sections.find((s) => s.id === sectionId);
          showToast(`Moved to ${sec ? sec.title : "Unsorted"}`);
        }
      } else if (kind === "notebook") {
        if (entry.notebookId !== id) {
          window.Knowledge.moveEntry(entry.id, { notebookId: id, sectionId: null });
          sound("drop");
          const nb = notebooks.find((n) => n.id === id);
          showToast(`Moved to ${nb ? nb.title : "notebook"}`);
        }
      } else if (kind === "entry" && id !== entry.id) {
        window.Knowledge.reorderEntries(entry.id, id);
        sound("drop");
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
  };

  // ── long-press menu ────────────────────────────────────────────────────
  const entrySheet = (entry) => ({
    title: entry.title || "Card",
    actions: [
      { icon: "✎", label: "Open & edit", run: () => setModal({ type: "entry", entry }) },
      { icon: "✨", label: "Improve with AI", run: () => enhanceEntry(entry) },
      { icon: entry.starred ? "☆" : "★", label: entry.starred ? "Unstar" : "Star (adds to practice)", run: () => window.Knowledge.toggleStar(entry.id) },
      { icon: "⇄", label: "Move to…", run: () => setModal({ type: "move", entry }) },
      { icon: "📅", label: "Practise on a day", run: () => setModal({ type: "toCalendar", entry }) },
      { icon: "🗑", label: "Delete", danger: true, run: () => removeEntry(entry) },
    ],
  });

  // ── keyboard ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (e.key === "Escape") {
        if (modal) setModal(null);
        else if (query) setQuery("");
        else if (route.name === "notebook") go("/");
        return;
      }
      if (modal) return;
      if (k === "d" && notebook) { e.preventDefault(); dumpRef.current && dumpRef.current.focus(); }
      else if (k === "/") { e.preventDefault(); searchRef.current && searchRef.current.focus(); }
      else if (k === "n" && notebook) { e.preventDefault(); setModal({ type: "entry", entry: null }); }
      else if (k === "n") { e.preventDefault(); setModal({ type: "notebook", notebook: null }); }
      else if (k === "a" && notebook) setModal({ type: "ask" });
      else if (k === "p" && notebook) setModal({ type: "practice" });
      else if (k === "c" && notebook) setModal({ type: "correct" });
      else if (k === "b") go("/");
      else if (k === "?") setModal({ type: "help" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, notebook, route, query, go]);

  // Reset per-notebook UI state when the notebook changes.
  useEffect(() => { setActiveSection(null); setQuery(""); setStarOnly(false); setTypeFilter(null); }, [route.notebookId]);
  useEffect(() => { if (notebook) window.Knowledge.setPref("lastNotebookId", notebook.id); }, [notebook && notebook.id]);

  // ── render ─────────────────────────────────────────────────────────────
  if (!snap) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12, fontSize: 18 }}>
        <Spinner /> Opening your notebooks…
      </div>
    );
  }

  return (
    <div className="k-app">
      <KTopBar
        route={route} go={go} notebook={notebook} snap={snap} aiOn={aiOn}
        onSettings={() => setModal({ type: "settings" })}
        onEditNotebook={() => setModal({ type: "notebook", notebook })}
        onHelp={() => setModal({ type: "help" })}
      />

      {route.name === "shelf" ? (
        <Shelf
          notebooks={notebooks} counts={counts} go={go}
          onNew={() => setModal({ type: "notebook", notebook: null })}
          onSheet={(nb) => setSheet({
            title: nb.title,
            actions: [
              { icon: "→", label: "Open", run: () => go(`/n/${nb.id}`) },
              { icon: "✎", label: "Edit notebook", run: () => setModal({ type: "notebook", notebook: nb }) },
              { icon: "↓", label: "Export as Markdown", run: () => window.Knowledge.exportNotebookMarkdown(nb.id) },
              { icon: "🗑", label: "Delete notebook", danger: true, run: () => removeNotebook(nb) },
            ],
          })}
        />
      ) : notebook ? (
        <NotebookView
          notebook={notebook} entries={entries} visible={visible} counts={counts[notebook.id]}
          today={today} view={view} prefs={prefs}
          activeSection={activeSection} setActiveSection={setActiveSection}
          query={query} setQuery={setQuery} searchRef={searchRef}
          starOnly={starOnly} setStarOnly={setStarOnly}
          typeFilter={typeFilter} setTypeFilter={setTypeFilter}
          dumpRef={dumpRef} busy={busy} aiOn={aiOn}
          onSaveRaw={saveDumpRaw} onStructure={structureDump}
          onOpenEntry={(entry) => setModal({ type: "entry", entry })}
          onNewEntry={() => setModal({ type: "entry", entry: null })}
          onEnhance={enhanceEntry}
          onStar={(entry) => { window.Knowledge.toggleStar(entry.id); sound("check"); }}
          onDelete={removeEntry}
          onSheet={(entry) => setSheet(entrySheet(entry))}
          beginDrag={beginDrag} draggingId={drag && drag.entry.id}
          onAsk={() => setModal({ type: "ask" })}
          onPractice={() => setModal({ type: "practice" })}
          onCorrect={() => setModal({ type: "correct" })}
          onPlan={() => setModal({ type: "plan" })}
          onAddSection={() => {
            const title = prompt("Name the new section");
            if (title && title.trim()) { window.Knowledge.addSection(notebook.id, title.trim()); sound("add"); }
          }}
          onSectionSheet={(sec) => setSheet({
            title: sec.title,
            actions: [
              { icon: "✎", label: "Rename", run: () => { const t = prompt("Rename section", sec.title); if (t && t.trim()) window.Knowledge.renameSection(notebook.id, sec.id, t.trim()); } },
              { icon: "↑", label: "Move up", run: () => window.Knowledge.moveSection(notebook.id, sec.id, -1) },
              { icon: "↓", label: "Move down", run: () => window.Knowledge.moveSection(notebook.id, sec.id, 1) },
              { icon: "🗑", label: "Delete section (cards kept)", danger: true, run: () => window.Knowledge.deleteSection(notebook.id, sec.id) },
            ],
          })}
        />
      ) : (
        <Empty emoji="🤔" title="That notebook is gone" sub="It may have been deleted on another device.">
          <button className="k-btn primary" onClick={() => go("/")}>Back to the shelf</button>
        </Empty>
      )}

      <Modals
        modal={modal} setModal={setModal} notebook={notebook} notebooks={notebooks}
        entries={entries} allEntries={allEntries} snap={snap} aiCfg={aiCfg} aiOn={aiOn}
        today={today} showToast={showToast} aiError={aiError}
        commitDrafts={commitDrafts} onDeleteEntry={removeEntry}
        activeSection={activeSection}
      />

      <ActionSheet sheet={sheet} onClose={() => setSheet(null)} />

      {drag && drag.pos && (
        <div className="k-drag-ghost" style={{ left: drag.pos.x, top: drag.pos.y }}>
          {drag.entry.title || "card"}
        </div>
      )}

      {toast && (
        <div className={cls("toast", toast.open && "open")}>
          <span>{toast.msg}</span>
          {toast.action === "undo" && <button onClick={doUndo}>Undo</button>}
          <div className="toast-bar" style={{ animation: toast.open ? "shrink 4s linear forwards" : "none" }} />
        </div>
      )}

      {route.name === "notebook" && (
        <div className="k-shortcuts">
          <span><kbd>D</kbd> dump</span>
          <span><kbd>N</kbd> new card</span>
          <span><kbd>/</kbd> search</span>
          <span><kbd>A</kbd> ask</span>
          <span><kbd>P</kbd> practise</span>
          <span><kbd>C</kbd> check</span>
          <span><kbd>B</kbd> shelf</span>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Chrome
// ═════════════════════════════════════════════════════════════════════════
function KTopBar({ route, go, notebook, snap, aiOn, onSettings, onEditNotebook, onHelp }) {
  const user = snap.user;
  return (
    <header className="k-topbar">
      <div className="k-brand" onClick={() => go("/")} style={{ cursor: "pointer" }}>
        <span className="k-brand-mark">✎</span>
        <div>
          <div className="k-brand-title">Knowledge</div>
          <div className="k-brand-sub">~ dump it, we'll tidy it ~</div>
        </div>
      </div>

      <div className="k-crumbs">
        <span className="k-crumb link" onClick={() => go("/")}>Shelf</span>
        {notebook && <>
          <span className="k-crumb-sep">›</span>
          <span className="k-crumb" style={{ background: `var(--${notebook.color})` }}>
            {notebook.emoji} {notebook.title}
          </span>
          <button className="k-icon-btn hide-sm" onClick={onEditNotebook} data-tip="Notebook settings" aria-label="Notebook settings">⚙</button>
        </>}
      </div>

      <div className="k-topbar-right">
        <span className="sync-pill k" title={snap.status === "Synced" ? "Synced to your Google account" : "Saved on this device"}>{snap.status}</span>
        <a className="k-btn small nav-almanac" href="index.html" title="Back to the calendar">🗓<span className="lbl"> Almanac</span></a>
        <button className={cls("k-icon-btn", aiOn && "on")} onClick={onSettings}
          title={aiOn ? "AI is connected" : "Connect an AI model"} aria-label="AI settings">✨</button>
        <button className="k-icon-btn hide-sm" onClick={onHelp} aria-label="Help">?</button>
        {user
          ? <button className="k-icon-btn" onClick={() => window.Knowledge.signOut()} title={`Signed in as ${user.displayName || user.email} — sign out`}>
              {user.photoURL ? <img src={user.photoURL} alt="" style={{ width: 24, height: 24, borderRadius: "50%" }} /> : "↩"}
            </button>
          : <button className="k-btn small" onClick={() => window.Knowledge.signIn()}>Sign in</button>}
      </div>
    </header>
  );
}

// ─── Shelf ───────────────────────────────────────────────────────────────
function Shelf({ notebooks, counts, go, onNew, onSheet }) {
  const live = notebooks.filter((n) => !n.archived);
  return (
    <>
      <div className="shelf-head">
        <div>
          <div className="shelf-title">Your notebooks</div>
          <div className="shelf-sub">one per thing you're learning</div>
        </div>
        <button className="k-btn primary" onClick={onNew}>＋ New notebook</button>
      </div>

      {live.length === 0 ? (
        <Empty emoji="📚" title="Nothing on the shelf yet"
          sub="Make a notebook for each thing you're learning — Dutch class, dance privates, whatever else you keep forgetting.">
          <button className="k-btn primary" onClick={onNew}>Make your first notebook</button>
        </Empty>
      ) : (
        <div className="shelf">
          {live.map((nb) => (
            <NotebookCard key={nb.id} notebook={nb} counts={counts[nb.id]}
              onOpen={() => go(`/n/${nb.id}`)} onSheet={() => onSheet(nb)} />
          ))}
          <button className="nb-card nb-card-add" onClick={onNew}>
            <span className="plus">＋</span>
            New notebook
          </button>
        </div>
      )}
    </>
  );
}

function NotebookCard({ notebook: nb, counts, onOpen, onSheet }) {
  const c = counts || { total: 0, due: 0, raw: 0 };
  const press = useLongPress(onSheet);
  return (
    <button className="nb-card" style={{ "--nb-color": `var(--${nb.color})` }}
      data-drop={`notebook:${nb.id}`}
      onClick={onOpen}
      onContextMenu={(e) => { e.preventDefault(); onSheet(); }}
      {...press}>
      <div className="nb-card-top">
        <span className="nb-emoji">{nb.emoji}</span>
        <div style={{ minWidth: 0 }}>
          <div className="nb-name">{nb.title}</div>
          <div className="nb-sub">{nb.subtitle || K.kindMeta(nb.kind).blurb}</div>
        </div>
      </div>
      <div className="nb-stats">
        <span className="nb-stat">{c.total} card{c.total === 1 ? "" : "s"}</span>
        {c.due > 0 && <span className="nb-stat due">{c.due} to practise</span>}
        {c.raw > 0 && <span className="nb-stat raw">{c.raw} raw</span>}
      </div>
    </button>
  );
}

// ─── Notebook ────────────────────────────────────────────────────────────
function NotebookView(p) {
  const { notebook, entries, visible, counts, today, view, activeSection, setActiveSection } = p;
  const c = counts || { total: 0, due: 0, raw: 0, starred: 0 };
  const unsorted = entries.filter((e) => !e.sectionId).length;

  return (
    <div className="nb-layout" style={{ "--nb-color": `var(--${notebook.color})` }}>
      <aside className="k-rail">
        <div className="rail-head">
          <span>Sections</span>
          <button className="k-btn tiny" onClick={p.onAddSection}>＋</button>
        </div>
        <SectionItem label="Everything" emoji="✦" count={entries.length}
          active={activeSection === null} onClick={() => setActiveSection(null)} />
        {notebook.sections.map((sec) => (
          <SectionItem key={sec.id} label={sec.title} drop={`section:${sec.id}`}
            count={entries.filter((e) => e.sectionId === sec.id).length}
            active={activeSection === sec.id}
            onClick={() => setActiveSection(sec.id)}
            onMenu={() => p.onSectionSheet(sec)} />
        ))}
        <SectionItem label="Unsorted" drop="section:none" count={unsorted}
          active={activeSection === "__none"}
          onClick={() => setActiveSection(activeSection === "__none" ? null : "__none")} muted />

        <div className="rail-divider" />
        <SectionItem label="To practise" emoji="◉" count={c.due}
          active={activeSection === "__due"} onClick={() => setActiveSection(activeSection === "__due" ? null : "__due")} />
        <SectionItem label="Still raw" emoji="✎" count={c.raw}
          active={activeSection === "__raw"} onClick={() => setActiveSection(activeSection === "__raw" ? null : "__raw")} />

        <div className="rail-divider" />
        <button className="k-btn block small" onClick={p.onAsk}>💬 Ask this notebook</button>
        <button className="k-btn block small" onClick={p.onPractice} style={{ marginTop: 6 }}>◉ Practise{c.due ? ` (${c.due})` : ""}</button>
        {notebook.kind === "language" && (
          <button className="k-btn block small" onClick={p.onCorrect} style={{ marginTop: 6 }}>✓ Check my sentence</button>
        )}
        <button className="k-btn block small" onClick={p.onPlan} style={{ marginTop: 6 }}>📅 Practice plan</button>
      </aside>

      <div>
        <DumpBox
          notebook={notebook} dumpRef={p.dumpRef} busy={p.busy === "dump"} aiOn={p.aiOn}
          onSaveRaw={p.onSaveRaw} onStructure={p.onStructure} />

        <div className="k-toolbar">
          <div className="view-tabs">
            {[["cards", "Cards"], ["list", "List"], ["board", "Board"], ["timeline", "Timeline"]].map(([id, label]) => (
              <button key={id} className={cls(view === id && "active")}
                onClick={() => window.Knowledge.setPref("view", id)}>{label}</button>
            ))}
          </div>
          <button className="k-btn small" onClick={p.onNewEntry}>＋ Card</button>
          <span className="k-spacer" />
          <button className={cls("filter-chip", p.starOnly && "on")} onClick={() => p.setStarOnly(!p.starOnly)}>★ Starred</button>
          {p.typeFilter && (
            <button className="filter-chip on" onClick={() => p.setTypeFilter(null)}>
              {K.typeMeta(p.typeFilter).label} ✕
            </button>
          )}
          <div className="k-search">
            <span style={{ opacity: 0.5 }}>⌕</span>
            <input ref={p.searchRef} value={p.query} placeholder="search cards…"
              onChange={(e) => p.setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { p.setQuery(""); e.target.blur(); } }} />
            {p.query && <button className="k-btn tiny" onClick={() => p.setQuery("")}>✕</button>}
          </div>
        </div>

        {entries.length === 0 ? (
          <Empty emoji="🌱" title="This notebook is empty"
            sub="Dump whatever you remember from the last class into the box above — half sentences, wrong spellings, all of it. Structure it now or later." />
        ) : visible.length === 0 ? (
          <Empty emoji="🔍" title="Nothing matches" sub="Try a different word, or clear the filters." />
        ) : view === "board" ? (
          <BoardView {...p} />
        ) : view === "timeline" ? (
          <TimelineView {...p} />
        ) : view === "list" ? (
          <div className="entry-rows">
            {visible.map((e) => <EntryRow key={e.id} entry={e} {...p} />)}
          </div>
        ) : (
          <div className="entry-grid">
            {visible.map((e) => <EntryCard key={e.id} entry={e} {...p} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionItem({ label, emoji, count, active, onClick, onMenu, drop, muted }) {
  const press = useLongPress(() => onMenu && onMenu());
  return (
    <button className={cls("sec-item", active && "active")} onClick={onClick} data-drop={drop}
      onContextMenu={(e) => { if (onMenu) { e.preventDefault(); onMenu(); } }}
      style={muted ? { opacity: 0.75 } : null} {...press}>
      {emoji && <span>{emoji}</span>}
      <span className="sec-name">{label}</span>
      <span className="sec-count">{count}</span>
      {onMenu && <span className="sec-drag">⋮</span>}
    </button>
  );
}

// ─── Dump box ────────────────────────────────────────────────────────────
function DumpBox({ notebook, dumpRef, busy, aiOn, onSaveRaw, onStructure }) {
  const [text, setText] = useState("");
  const meta = K.kindMeta(notebook.kind);
  const dictation = useDictation(meta.speechLang, (chunk) => setText((t) => (t ? `${t.trimEnd()} ${chunk}` : chunk)));

  const placeholders = {
    language: 'e.g. "leraar zei ik moet zeggen ik heb zin in ipv ik wil graag… ook iets met hoeveelheid — een beetje / veel / weinig. en gezellig heeft geen vertaling"',
    dance: 'e.g. "body roll on 5-6, weight stays left, don\'t rush the 7. she said my left arm collapses on the turn — keep frame. drill: 8 slow body rolls to the mirror"',
    general: "e.g. anything you heard, read or want to remember — messy is fine",
  };

  // Only clear the box once the handler confirms it took the text — a missing
  // API key or a rate-limited request must never eat what you just dumped.
  const submit = async (fn) => {
    const value = text.trim();
    if (!value) return;
    const ok = await fn(value);
    if (ok === false) return;
    setText("");
    if (dictation.listening) dictation.stop();
  };

  return (
    <div className={cls("dumpbox", dictation.listening && "recording")}>
      <div className="dumpbox-head">
        <span className="dumpbox-title">Brain dump</span>
        <span style={{ fontSize: 13, opacity: 0.65 }}>{notebook.emoji} {notebook.title}</span>
        <span className="dumpbox-kbd"><kbd>D</kbd> to focus</span>
      </div>
      <textarea
        ref={dumpRef} value={text + (dictation.interim ? ` ${dictation.interim}` : "")}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholders[notebook.kind] || placeholders.general}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(onStructure); }
        }}
      />
      <div className="dumpbox-actions">
        {dictation.supported && (
          <button className={cls("k-icon-btn", "mic-btn", dictation.listening && "live")}
            onClick={dictation.toggle}
            title={dictation.listening ? "Stop dictation" : `Dictate (${meta.speechLang})`}>🎙</button>
        )}
        <button className="k-btn go" disabled={!text.trim() || busy} onClick={() => submit(onStructure)}
          title={aiOn ? "Let the AI split this into tidy cards" : "Set up AI first"}>
          {busy ? <><Spinner /> Structuring…</> : <>✨ Structure it</>}
        </button>
        <button className="k-btn" disabled={!text.trim() || busy} onClick={() => submit(onSaveRaw)}
          title="Keep the raw text now, tidy it later">Save raw</button>
        <span className="dumpbox-count">
          {dictation.listening ? "listening…" : text.trim() ? `${text.trim().split(/\s+/).length} words · ⌘↵ to structure` : ""}
        </span>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// Entry cards
// ═════════════════════════════════════════════════════════════════════════
function EntryCard({ entry, notebook, busy, draggingId, beginDrag, onOpenEntry, onEnhance, onStar, onDelete, onSheet, setTypeFilter, today }) {
  const [showRaw, setShowRaw] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const press = useLongPress(() => onSheet(entry));
  const meta = K.typeMeta(entry.type);
  const section = notebook.sections.find((s) => s.id === entry.sectionId);
  const due = K.isDue(entry, today);
  const fields = Object.entries(entry.fields || {});
  const longBody = (entry.body || "").length > 320;

  return (
    <article
      className={cls("entry-card", draggingId === entry.id && "dragging", entry.status === "raw" && "raw", busy === entry.id && "busy")}
      data-drop={`entry:${entry.id}`}
      onContextMenu={(e) => { e.preventDefault(); onSheet(entry); }}
      {...press}
    >
      <div className="entry-top">
        <button className="type-chip" style={{ "--chip-color": `var(--${meta.color})` }}
          onClick={() => setTypeFilter(entry.type)} title={`Show only ${meta.label} cards`}>
          {meta.emoji} {meta.label}
        </button>
        <h3 className="entry-title">
          <Editable value={entry.title} placeholder="untitled"
            onSave={(v) => window.Knowledge.updateEntry(entry.id, { title: v })} />
        </h3>
        <button className={cls("star-btn", entry.starred && "on")} onClick={() => onStar(entry)}
          title={entry.starred ? "Starred — in your practice rotation" : "Star to practise this"}>★</button>
      </div>

      {fields.length > 0 && (
        <div className="entry-fields">
          {fields.map(([k, v]) => (
            <React.Fragment key={k}>
              <span className="field-key">{k}</span>
              <span className="field-val">{String(v)}</span>
            </React.Fragment>
          ))}
        </div>
      )}

      {entry.body && (
        <div className={cls("entry-body", longBody && !expanded && "clamped")}>{entry.body}</div>
      )}
      {longBody && (
        <button className="entry-more" onClick={() => setExpanded(!expanded)}>
          {expanded ? "less" : "more"}
        </button>
      )}

      {showRaw && entry.raw && <div className="entry-raw">{entry.raw}</div>}

      {entry.tags.length > 0 && (
        <div className="entry-tags">
          {entry.tags.map((t) => <span key={t} className="k-tag">#{t}</span>)}
        </div>
      )}

      <div className="entry-foot">
        {entry.status === "raw" && <span className="raw-badge">raw</span>}
        {due && <span className="raw-badge due-badge">practise</span>}
        <span className="entry-meta">{section ? section.title : "Unsorted"} · {entry.lessonDate}</span>
        <div className="entry-acts">
          {entry.raw && (
            <button className="act" onClick={() => setShowRaw(!showRaw)} title="Show what you originally dumped">✎</button>
          )}
          <button className="act magic" onClick={() => onEnhance(entry)} title="Improve with AI">
            {busy === entry.id ? <Spinner /> : "✨"}
          </button>
          <button className="act" onClick={() => onOpenEntry(entry)} title="Open">⤢</button>
          <button className="act grab" title="Drag to another section or notebook"
            onMouseDown={(e) => beginDrag(e, entry)}
            onTouchStart={(e) => beginDrag(e, entry)}>⠿</button>
          <button className="act danger" onClick={() => onDelete(entry)} title="Delete">🗑</button>
        </div>
      </div>
    </article>
  );
}

function EntryRow({ entry, notebook, draggingId, beginDrag, onOpenEntry, onStar, onSheet, onEnhance, busy, today }) {
  const press = useLongPress(() => onSheet(entry));
  const meta = K.typeMeta(entry.type);
  const sub = Object.values(entry.fields || {})[0] || entry.body || "";
  return (
    <div className={cls("entry-row", draggingId === entry.id && "dragging")}
      data-drop={`entry:${entry.id}`}
      onContextMenu={(e) => { e.preventDefault(); onSheet(entry); }} {...press}>
      <span className="act grab" onMouseDown={(e) => beginDrag(e, entry)} onTouchStart={(e) => beginDrag(e, entry)}>⠿</span>
      <span className="type-chip" style={{ "--chip-color": `var(--${meta.color})` }}>{meta.emoji}</span>
      <span className="entry-row-title" onClick={() => onOpenEntry(entry)}>{entry.title || "untitled"}</span>
      <span className="entry-row-sub">{String(sub).replace(/\s+/g, " ").slice(0, 90)}</span>
      {K.isDue(entry, today) && <span className="raw-badge due-badge">practise</span>}
      <button className={cls("star-btn", entry.starred && "on")} onClick={() => onStar(entry)}>★</button>
      <button className="act magic" onClick={() => onEnhance(entry)} title="Improve with AI">
        {busy === entry.id ? <Spinner /> : "✨"}
      </button>
    </div>
  );
}

// Kanban by section — the fastest way to file a pile of fresh cards.
function BoardView(p) {
  const { notebook, visible } = p;
  const cols = [...notebook.sections, { id: null, title: "Unsorted" }];
  return (
    <div className="board">
      {cols.map((sec) => {
        const inCol = visible.filter((e) => (e.sectionId || null) === sec.id);
        return (
          <div key={sec.id || "none"} className="board-col" data-drop={`section:${sec.id || "none"}`}>
            <div className="board-col-head">
              <span>{sec.title}</span>
              <span className="board-col-count">{inCol.length}</span>
            </div>
            {inCol.map((e) => <EntryCard key={e.id} entry={e} {...p} />)}
            {inCol.length === 0 && (
              <div style={{ fontSize: 12.5, opacity: 0.5, textAlign: "center", padding: "18px 8px" }}>
                drag cards here
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Grouped by the day you captured it — your class-by-class history.
function TimelineView(p) {
  const groups = useMemo(() => {
    const map = K.groupBy(p.visible, (e) => e.lessonDate || "undated");
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [p.visible]);
  return (
    <div>
      {groups.map(([date, list]) => (
        <div key={date} className="tl-group">
          <div className="tl-head">
            <span className="tl-date">{prettyDate(date)}</span>
            <span className="tl-count">{list.length} card{list.length === 1 ? "" : "s"}</span>
            <span className="tl-rule" />
          </div>
          <div className="entry-grid">
            {list.map((e) => <EntryCard key={e.id} entry={e} {...p} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function prettyDate(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const d = new Date(`${key}T12:00:00`);
  const today = new Date();
  const diff = Math.round((d - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  const U = window.U;
  return `${U.DAYS[d.getDay()]}, ${U.MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

// ═════════════════════════════════════════════════════════════════════════
// Modals
// ═════════════════════════════════════════════════════════════════════════
function Modals(p) {
  const { modal, setModal } = p;
  if (!modal) return null;
  const close = () => setModal(null);
  switch (modal.type) {
    case "review":     return <ReviewSheet {...p} close={close} />;
    case "enhance":    return <EnhanceModal {...p} close={close} />;
    case "entry":      return <EntryModal {...p} close={close} />;
    case "notebook":   return <NotebookModal {...p} close={close} />;
    case "settings":   return <SettingsModal {...p} close={close} />;
    case "ask":        return <AskModal {...p} close={close} />;
    case "practice":   return <PracticeModal {...p} close={close} />;
    case "correct":    return <CorrectModal {...p} close={close} />;
    case "plan":       return <PlanModal {...p} close={close} />;
    case "move":       return <MoveModal {...p} close={close} />;
    case "toCalendar": return <ToCalendarModal {...p} close={close} />;
    case "help":       return <HelpModal close={close} />;
    default:           return null;
  }
}

// ─── Review the AI's proposed cards before anything is saved ─────────────
function ReviewSheet({ modal, close, notebook, entries, commitDrafts, showToast }) {
  const [drafts, setDrafts] = useState(() => modal.drafts.map((d, i) => ({ ...d, _keep: true, _i: i })));
  const kept = drafts.filter((d) => d._keep);

  const patch = (i, changes) => setDrafts((ds) => ds.map((d) => (d._i === i ? { ...d, ...changes } : d)));

  const existingSection = (title) => (notebook.sections || []).some(
    (s) => K.slug(s.title) === K.slug(title || "") || K.similarity(K.slug(s.title), K.slug(title || "")) > 0.8);

  return (
    <Modal open wide onClose={close} icon="✨"
      title={`${modal.drafts.length} card${modal.drafts.length === 1 ? "" : "s"} from that dump`}
      sub="Nothing is saved until you keep it. Edit titles inline, untick anything you don't want."
      foot={<>
        <button className="k-btn" onClick={() => { window.Knowledge.updateDump(modal.dumpId, { status: "kept" }); close(); showToast("Kept the raw dump — nothing filed."); }}>
          Discard cards, keep raw
        </button>
        <span className="k-spacer" />
        <button className="k-btn" onClick={() => setDrafts((ds) => ds.map((d) => ({ ...d, _keep: !kept.length })))}>
          {kept.length ? "Untick all" : "Tick all"}
        </button>
        <button className="k-btn go" disabled={!kept.length}
          onClick={() => commitDrafts(kept.map(({ _keep, _i, ...d }) => d), modal.dumpId, modal.sourceText)}>
          Keep {kept.length} card{kept.length === 1 ? "" : "s"} →
        </button>
      </>}>
      {modal.truncated && (
        <div className="k-banner warn">
          ✂️ <span className="k-spacer">
            The model ran out of room mid-answer, so these are the cards it finished.
            Your raw dump is kept whole — dump the rest in a second pass to catch anything missing.
          </span>
        </div>
      )}
      {modal.summary && <div className="review-summary">📝 {modal.summary}</div>}
      <div className="draft-list">
        {drafts.map((d) => {
          const dupes = K.findDuplicates(entries, d);
          const meta = K.typeMeta(d.type);
          const isNewSection = d._sectionTitle && !existingSection(d._sectionTitle);
          return (
            <div key={d._i} className={cls("draft", !d._keep && "off")}>
              <button className={cls("draft-check", d._keep && "on")} onClick={() => patch(d._i, { _keep: !d._keep })}
                aria-label={d._keep ? "Don't keep this card" : "Keep this card"}>{d._keep ? "✓" : ""}</button>
              <div className="draft-main">
                <div className="draft-title-row">
                  <span className="type-chip" style={{ "--chip-color": `var(--${meta.color})` }}>{meta.emoji} {meta.label}</span>
                  <span className="draft-title">
                    <Editable value={d.title} placeholder="untitled" onSave={(v) => patch(d._i, { title: v })} />
                  </span>
                  {d._sectionTitle && (
                    <span className={cls("draft-sec", isNewSection && "new")}>
                      {isNewSection ? "new section · " : ""}{d._sectionTitle}
                    </span>
                  )}
                </div>
                {Object.keys(d.fields || {}).length > 0 && (
                  <div className="entry-fields">
                    {Object.entries(d.fields).map(([k, v]) => (
                      <React.Fragment key={k}>
                        <span className="field-key">{k}</span>
                        <span className="field-val">{String(v)}</span>
                      </React.Fragment>
                    ))}
                  </div>
                )}
                {d.body && (
                  <div className="draft-body">
                    <Editable multiline value={d.body} onSave={(v) => patch(d._i, { body: v })} />
                  </div>
                )}
                {d.tags.length > 0 && (
                  <div className="entry-tags">{d.tags.map((t) => <span key={t} className="k-tag">#{t}</span>)}</div>
                )}
                {dupes.length > 0 && (
                  <div className="draft-dupe">⚠ You already have "{dupes[0].title}" — keep it anyway or untick.</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ─── Enhance one card: side-by-side, accept or throw away ───────────────
function EnhanceModal({ modal, close, notebook, aiCfg, aiError, showToast }) {
  const { entry } = modal;
  const [patch, setPatch] = useState(modal.patch);
  const [changes, setChanges] = useState(modal.changes);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);

  const rerun = async () => {
    setBusy(true);
    try {
      const res = await window.KnowledgeAI.enhance(aiCfg, { entry, notebook, instruction });
      setPatch(res.patch); setChanges(res.changes); setInstruction("");
    } catch (e) { aiError(e); }
    finally { setBusy(false); }
  };

  const accept = () => {
    window.Knowledge.updateEntry(entry.id, { ...patch, status: "clean", raw: entry.raw || entry.body });
    close(); sound("chime"); showToast("Card updated ✿");
  };

  return (
    <Modal open wide onClose={close} icon="✨" title="Improved card"
      sub="Your original is on the left. Nothing changes until you accept."
      foot={<>
        <button className="k-btn" onClick={close}>Keep mine</button>
        <span className="k-spacer" />
        <button className="k-btn go" onClick={accept}>Use the new version</button>
      </>}>
      <div className="diff-grid">
        <div className="diff-col">
          <div className="diff-head">Before</div>
          <b>{entry.title}</b>
          <FieldsBlock fields={entry.fields} />
          <div style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 13.5, lineHeight: 1.6 }}>{entry.body}</div>
        </div>
        <div className="diff-col after">
          <div className="diff-head">After</div>
          <b>{patch.title}</b>
          <FieldsBlock fields={patch.fields} />
          <div style={{ whiteSpace: "pre-wrap", marginTop: 8, fontSize: 13.5, lineHeight: 1.6 }}>{patch.body}</div>
        </div>
      </div>
      {changes.length > 0 && (
        <ul className="change-list">{changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <input className="k-input" placeholder="ask for something specific — 'add a mnemonic', 'shorter', 'add the plural'"
          value={instruction} onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && instruction.trim()) rerun(); }} />
        <button className="k-btn" disabled={busy || !instruction.trim()} onClick={rerun}>
          {busy ? <Spinner /> : "Redo"}
        </button>
      </div>
    </Modal>
  );
}

function FieldsBlock({ fields }) {
  const list = Object.entries(fields || {});
  if (!list.length) return null;
  return (
    <div className="entry-fields" style={{ marginTop: 8 }}>
      {list.map(([k, v]) => (
        <React.Fragment key={k}>
          <span className="field-key">{k}</span>
          <span className="field-val">{String(v)}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Full card editor ───────────────────────────────────────────────────
function EntryModal({ modal, close, notebook, activeSection, setModal, onDeleteEntry, showToast }) {
  const existing = modal.entry;
  const meta = K.kindMeta(notebook.kind);
  const [form, setForm] = useState(() => existing || K.makeEntry(notebook.id, {
    sectionId: activeSection && activeSection.startsWith("sec") ? activeSection : null,
  }));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const [fieldRows, setFieldRows] = useState(() => Object.entries(form.fields || {}));

  const save = () => {
    const fields = {};
    fieldRows.forEach(([k, v]) => { if (String(k).trim()) fields[String(k).trim()] = v; });
    const payload = { ...form, fields, tags: form.tags };
    if (existing) window.Knowledge.updateEntry(existing.id, payload);
    else window.Knowledge.addEntry(notebook.id, payload);
    sound("add");
    close();
    showToast(existing ? "Saved ✿" : "Card added ✿");
  };

  return (
    <Modal open onClose={close} icon={K.typeMeta(form.type).emoji}
      title={existing ? "Edit card" : "New card"}
      sub={existing ? `Captured ${existing.lessonDate}` : notebook.title}
      foot={<>
        {existing && <button className="k-btn warn" onClick={() => { close(); onDeleteEntry(existing); }}>Delete</button>}
        {existing && <button className="k-btn" onClick={() => setModal({ type: "toCalendar", entry: existing })}>📅 Practise on…</button>}
        <span className="k-spacer" />
        <button className="k-btn" onClick={close}>Cancel</button>
        <button className="k-btn go" onClick={save}>Save</button>
      </>}>
      <Field label="Type">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {meta.types.map((t) => {
            const m = K.typeMeta(t);
            return (
              <button key={t} className={cls("filter-chip", form.type === t && "on")} onClick={() => set({ type: t })}>
                {m.emoji} {m.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Title">
        <input className="k-input" value={form.title} autoFocus
          onChange={(e) => set({ title: e.target.value })} placeholder="short and findable" />
      </Field>

      <Field label="Details">
        <textarea className="k-textarea" value={form.body} rows={5}
          onChange={(e) => set({ body: e.target.value })} placeholder="the explanation, in your words" />
      </Field>

      <Field label="Structured bits" hint="Key/value pairs — e.g. term / translation, or count / weight.">
        {fieldRows.map(([k, v], i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input className="k-input" style={{ flex: "0 0 34%" }} value={k} placeholder="key"
              onChange={(e) => setFieldRows((rows) => rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} />
            <input className="k-input" value={v} placeholder="value"
              onChange={(e) => setFieldRows((rows) => rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} />
            <button className="k-icon-btn" onClick={() => setFieldRows((rows) => rows.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="k-btn small ghost" onClick={() => setFieldRows((rows) => [...rows, ["", ""]])}>＋ Add field</button>
      </Field>

      <Field label="Section">
        <select className="k-select" value={form.sectionId || ""} onChange={(e) => set({ sectionId: e.target.value || null })}>
          <option value="">Unsorted</option>
          {notebook.sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </Field>

      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Tags">
          <input className="k-input" value={form.tags.join(", ")}
            onChange={(e) => set({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
            placeholder="comma, separated" />
        </Field>
        <Field label="Lesson date">
          <input className="k-input" type="date" value={form.lessonDate}
            onChange={(e) => set({ lessonDate: e.target.value })} />
        </Field>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 14 }}>
        <input type="checkbox" checked={!!form.starred}
          onChange={(e) => set({ starred: e.target.checked, srs: e.target.checked && !form.srs ? K.srsInit(nowKey()) : form.srs })} />
        Star this — adds it to the practice rotation
      </label>

      {existing && existing.raw && existing.raw !== existing.body && (
        <Field label="What you originally dumped">
          <div className="entry-raw">{existing.raw}</div>
        </Field>
      )}
    </Modal>
  );
}

// ─── Notebook editor ────────────────────────────────────────────────────
function NotebookModal({ modal, close, showToast }) {
  const existing = modal.notebook;
  const [form, setForm] = useState(() => existing || K.makeNotebook({ title: "", kind: "language" }));
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = () => {
    if (!form.title.trim()) return;
    if (existing) window.Knowledge.updateNotebook(existing.id, form);
    else {
      const meta = K.kindMeta(form.kind);
      window.Knowledge.createNotebook({
        title: form.title, kind: form.kind, emoji: form.emoji || meta.emoji,
        color: form.color, subtitle: form.subtitle,
      });
      // createNotebook builds fresh sections; carry the AI fields over.
      const made = window.Knowledge.snapshot().notebooks.slice(-1)[0];
      if (made) window.Knowledge.updateNotebook(made.id, { topic: form.topic, aiNotes: form.aiNotes });
    }
    sound("add");
    close();
    showToast(existing ? "Notebook saved ✿" : `"${form.title}" is on the shelf ✿`);
  };

  return (
    <Modal open onClose={close} icon={form.emoji || "📓"}
      title={existing ? "Notebook settings" : "New notebook"}
      sub={existing ? "The AI reads these fields on every request." : "One notebook per subject works best."}
      foot={<>
        {existing && <button className="k-btn" onClick={() => window.Knowledge.exportNotebookMarkdown(existing.id)}>↓ Markdown</button>}
        <span className="k-spacer" />
        <button className="k-btn" onClick={close}>Cancel</button>
        <button className="k-btn go" disabled={!form.title.trim()} onClick={save}>{existing ? "Save" : "Create"}</button>
      </>}>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Icon">
          <input className="k-input" style={{ width: 76, textAlign: "center", fontSize: 22 }}
            value={form.emoji} onChange={(e) => set({ emoji: e.target.value.slice(0, 4) })} />
        </Field>
        <div style={{ flex: 1 }}>
          <Field label="Name">
            <input className="k-input" value={form.title} autoFocus placeholder="Dutch, Bachata, Guitar…"
              onChange={(e) => set({ title: e.target.value })} />
          </Field>
        </div>
      </div>

      {!existing && (
        <Field label="Kind" hint="Decides the starter sections, the card types and how the AI talks to you.">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.values(K.KINDS).map((k) => (
              <button key={k.id} className={cls("filter-chip", form.kind === k.id && "on")}
                onClick={() => set({ kind: k.id, emoji: form.emoji || k.emoji })}>
                {k.emoji} {k.label}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="Colour">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {K.COLORS.map((c) => (
            <button key={c} onClick={() => set({ color: c })}
              aria-label={c}
              style={{
                width: 34, height: 34, borderRadius: 10, background: `var(--${c})`,
                border: form.color === c ? "3px solid var(--ink)" : "2px solid var(--ink)",
                boxShadow: form.color === c ? "3px 3px 0 0 var(--shadow-c)" : "none",
              }} />
          ))}
        </div>
      </Field>

      <Field label="Subtitle">
        <input className="k-input" value={form.subtitle} onChange={(e) => set({ subtitle: e.target.value })}
          placeholder="what this notebook is for" />
      </Field>

      <Field label="Subject — tell the AI what this is"
        hint='The more precise, the better the cards. e.g. "Dutch (Nederlands), A2, evening class in Amsterdam" or "Bachata sensual, weekly privates".'>
        <input className="k-input" value={form.topic} onChange={(e) => set({ topic: e.target.value })}
          placeholder="language / style / level" />
      </Field>

      <Field label="Standing instructions for the AI"
        hint="Applied to every structure and improve request in this notebook.">
        <textarea className="k-textarea" rows={3} value={form.aiNotes}
          onChange={(e) => set({ aiNotes: e.target.value })}
          placeholder="e.g. always give the article and plural for nouns; keep explanations under two sentences" />
      </Field>
    </Modal>
  );
}

// ─── AI + data settings ─────────────────────────────────────────────────
function SettingsModal({ modal, close, snap, showToast }) {
  const [cfg, setCfg] = useState(snap.ai);
  const [testing, setTesting] = useState(null);
  const meta = window.KnowledgeAI.providerMeta(cfg.provider);
  const fileRef = useRef(null);

  const set = (patch) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    window.Knowledge.setAiConfig(next);
  };

  const test = async () => {
    setTesting("running");
    try {
      await window.KnowledgeAI.testConnection({ ...cfg, model: cfg.model || meta.models[0] });
      setTesting("ok");
    } catch (e) { setTesting(e.message || "Failed"); }
  };

  return (
    <Modal open onClose={close} icon="✨" title="AI & data"
      sub="Everything here is optional — the notebooks work fine without it."
      foot={<>
        <span className="k-spacer" />
        <button className="k-btn go" onClick={close}>Done</button>
      </>}>
      {modal.reason && <div className="k-banner warn">{modal.reason}</div>}

      <Field label="Provider">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.values(window.KnowledgeAI.PROVIDERS).map((prov) => (
            <button key={prov.id} className={cls("filter-chip", cfg.provider === prov.id && "on")}
              onClick={() => { setTesting(null); set({ provider: prov.id, model: "", endpoint: prov.endpoint || "" }); }}>
              {prov.label}
            </button>
          ))}
        </div>
        <div className="k-hint">
          {meta.note}
          {meta.keyUrl && <> · <a href={meta.keyUrl} target="_blank" rel="noopener noreferrer">get one →</a></>}
        </div>
      </Field>

      {meta.needsKey && (
        <Field label="API key" hint="Stored in this browser only. It is never synced to the cloud and never leaves this device except to your chosen provider.">
          <input className="k-input" type="password" value={cfg.apiKey} placeholder="paste your key"
            onChange={(e) => set({ apiKey: e.target.value.trim() })} />
        </Field>
      )}

      <Field label="Model">
        <input className="k-input" value={cfg.model} placeholder={meta.models[0] || "model name"}
          onChange={(e) => set({ model: e.target.value.trim() })} />
        {meta.models.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {meta.models.map((m) => (
              <button key={m} className={cls("filter-chip", cfg.model === m && "on")} onClick={() => set({ model: m })}>{m}</button>
            ))}
          </div>
        )}
      </Field>

      {(cfg.provider === "custom" || cfg.provider === "ollama") && (
        <Field label="Endpoint" hint="Must accept POST /chat/completions in the OpenAI format.">
          <input className="k-input" value={cfg.endpoint} placeholder="http://localhost:11434/v1/chat/completions"
            onChange={(e) => set({ endpoint: e.target.value.trim() })} />
        </Field>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button className="k-btn" onClick={test} disabled={testing === "running"}>
          {testing === "running" ? <><Spinner /> Testing…</> : "Test connection"}
        </button>
        {testing === "ok" && <span style={{ fontWeight: 700 }}>✓ Working</span>}
        {testing && testing !== "ok" && testing !== "running" && (
          <span style={{ fontSize: 13, color: "#A03050", flex: 1 }}>{testing}</span>
        )}
      </div>

      <div className="k-banner">
        🔒 <span className="k-spacer">Text you run AI on is sent to the provider you picked. Pick Ollama to keep everything on your machine.</span>
      </div>

      <Field label="Sound">
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 14 }}>
          <input type="checkbox" checked={snap.prefs.sound !== false}
            onChange={(e) => window.Knowledge.setPref("sound", e.target.checked)} />
          Little clicks and chimes
        </label>
      </Field>

      <Field label="Your data" hint="Notebooks live in this browser, and sync to your Google account when you're signed in.">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="k-btn small" onClick={() => window.Knowledge.exportAll()}>↓ Export everything</button>
          <button className="k-btn small" onClick={() => fileRef.current.click()}>↑ Import backup</button>
          <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                const res = window.Knowledge.importAll(ev.target.result);
                showToast(res.ok ? `Imported ${res.notebooks} notebooks, ${res.entries} cards ✿` : res.error);
              };
              reader.readAsText(file);
              e.target.value = "";
            }} />
        </div>
      </Field>
    </Modal>
  );
}

// ─── Ask this notebook ──────────────────────────────────────────────────
function AskModal({ close, notebook, entries, aiCfg, aiError }) {
  const [log, setLog] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);

  const suggestions = notebook.kind === "language"
    ? ["What do I keep getting wrong?", "Quiz me on this week's words", "Summarise the grammar I've collected"]
    : notebook.kind === "dance"
      ? ["What should I drill this week?", "What corrections keep coming up?", "Explain the weight shifts I noted"]
      : ["What are the main themes here?", "What's still unclear?", "Summarise this notebook"];

  const send = async (question) => {
    const text = (question || q).trim();
    if (!text || busy) return;
    setQ("");
    setLog((l) => [...l, { role: "user", text }]);
    setBusy(true);
    try {
      const answer = await window.KnowledgeAI.ask(aiCfg, { question: text, entries, notebook, history: log });
      setLog((l) => [...l, { role: "ai", text: answer }]);
    } catch (e) {
      setLog((l) => [...l, { role: "err", text: e.message }]);
      aiError(e);
    } finally { setBusy(false); }
  };

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log, busy]);

  return (
    <Modal open wide onClose={close} icon="💬" title={`Ask ${notebook.title}`}
      sub={`Answers come from your ${entries.length} cards first, then from the model.`}
      foot={<>
        <div className="chat-form" style={{ width: "100%" }}>
          <textarea className="k-textarea" rows={2} value={q} placeholder="ask anything about your notes…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="k-btn go" disabled={busy || !q.trim()} onClick={() => send()}>
            {busy ? <Spinner /> : "Ask ↵"}
          </button>
        </div>
      </>}>
      {log.length === 0 && (
        <div className="suggest-row">
          {suggestions.map((s) => (
            <button key={s} className="filter-chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}
      <div className="chat-log" ref={logRef}>
        {log.map((m, i) => (
          <div key={i} className={cls("bubble", m.role === "user" ? "me" : m.role === "err" ? "err" : "ai")}>{m.text}</div>
        ))}
        {busy && <div className="bubble ai"><Spinner /> thinking…</div>}
      </div>
    </Modal>
  );
}

// ─── Practice ───────────────────────────────────────────────────────────
// Two modes: spaced-repetition on your own cards (no AI needed), or a quick
// AI-written quiz when you want questions you can't predict.
function practiceFront(entry) {
  const f = entry.fields || {};
  return f.term || f.word || entry.title || "(untitled)";
}

function practiceBack(entry) {
  const f = { ...(entry.fields || {}) };
  delete f.term; delete f.word;
  const lines = Object.entries(f).map(([k, v]) => `${k}: ${v}`);
  if (entry.title && practiceFront(entry) !== entry.title) lines.unshift(entry.title);
  if (entry.body) lines.push(entry.body);
  return lines.join("\n");
}

function PracticeModal({ close, notebook, entries, today, aiCfg, aiOn, aiError }) {
  const [mode, setMode] = useState("cards");
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [quiz, setQuiz] = useState(null);
  const [busy, setBusy] = useState(false);

  const deck = useMemo(() => {
    const due = K.dueEntries(entries, today);
    if (due.length) return K.sortEntries(due, "oldest");
    const starred = entries.filter((e) => e.starred);
    return K.sortEntries(starred.length ? starred : entries, "newest").slice(0, 20);
  }, [entries, today]);

  const list = mode === "quiz" ? (quiz || []) : deck;
  const card = list[i];
  const finished = !card;

  const rate = (rating) => {
    if (mode === "cards" && card) window.Knowledge.reviewEntry(card.id, rating);
    sound(rating === "again" ? "uncheck" : "check");
    setDone((d) => d + 1);
    setRevealed(false);
    setI((n) => n + 1);
  };

  const makeQuiz = async () => {
    setBusy(true);
    try {
      const qs = await window.KnowledgeAI.quiz(aiCfg, { entries, notebook, count: 8 });
      setQuiz(qs); setMode("quiz"); setI(0); setRevealed(false); setDone(0);
    } catch (e) { aiError(e); }
    finally { setBusy(false); }
  };

  useEffect(() => { if (finished && done > 0) burstConfetti(); }, [finished, done]);

  return (
    <Modal open onClose={close} icon="◉" title="Practice"
      sub={mode === "quiz" ? "AI questions from your cards" : `${K.dueEntries(entries, today).length} due today · star cards to add them`}
      foot={<>
        <div className="view-tabs">
          <button className={cls(mode === "cards" && "active")} onClick={() => { setMode("cards"); setI(0); setRevealed(false); }}>My cards</button>
          <button className={cls(mode === "quiz" && "active")} onClick={() => (quiz ? (setMode("quiz"), setI(0)) : makeQuiz())} disabled={!aiOn || busy}>
            {busy ? <Spinner /> : "AI quiz"}
          </button>
        </div>
        <span className="k-spacer" />
        <button className="k-btn" onClick={close}>Done</button>
      </>}>
      {finished ? (
        <Empty emoji={done > 0 ? "🌸" : "🌱"}
          title={done > 0 ? `${done} card${done === 1 ? "" : "s"} practised` : "Nothing queued"}
          sub={done > 0
            ? "Each one comes back on its own schedule — sooner if you found it hard."
            : "Star a few cards, or run an AI quiz over everything in this notebook."}>
          {mode === "quiz" && aiOn && (
            <button className="k-btn primary" onClick={makeQuiz} disabled={busy}>{busy ? <Spinner /> : "New quiz"}</button>
          )}
        </Empty>
      ) : (
        <div className="practice-wrap">
          <div className="practice-progress">{i + 1} / {list.length}</div>
          <div className="practice-card" onClick={() => setRevealed(true)}>
            <div className="practice-q">{mode === "quiz" ? card.q : practiceFront(card)}</div>
            {revealed ? (
              <div className="practice-a">{mode === "quiz" ? card.a : practiceBack(card)}</div>
            ) : (
              <div className="practice-flip-hint">
                {mode === "quiz" && card.hint ? `hint: ${card.hint}` : "tap to reveal"}
              </div>
            )}
          </div>
          {revealed ? (
            mode === "quiz" ? (
              <button className="k-btn go" onClick={() => { setRevealed(false); setI((n) => n + 1); setDone((d) => d + 1); }}>Next →</button>
            ) : (
              <div className="rating-row">
                {K.RATINGS.map((r) => (
                  <button key={r} className={cls("k-btn", "rate-btn", r)} onClick={() => rate(r)}>{r}</button>
                ))}
              </div>
            )
          ) : (
            <button className="k-btn primary" onClick={() => setRevealed(true)}>Reveal</button>
          )}
        </div>
      )}
    </Modal>
  );
}

// ─── "Did I say this right?" ────────────────────────────────────────────
function CorrectModal({ close, notebook, aiCfg, aiError, showToast }) {
  const [text, setText] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { setRes(await window.KnowledgeAI.correct(aiCfg, { text: text.trim(), notebook })); }
    catch (e) { aiError(e); }
    finally { setBusy(false); }
  };

  const keep = () => {
    window.Knowledge.addEntry(notebook.id, {
      type: "fix",
      title: text.trim().slice(0, 60),
      body: [res.corrected && `✓ ${res.corrected}`, res.natural && `more natural: ${res.natural}`,
        ...res.issues.map((x) => `• ${x.wrong} → ${x.right} — ${x.why}`)].filter(Boolean).join("\n"),
      fields: { attempt: text.trim(), corrected: res.corrected },
      tags: ["correction"],
      starred: true,
      srs: K.srsInit(nowKey()),
    });
    sound("add");
    close();
    showToast("Saved as a card to practise ✿");
  };

  return (
    <Modal open onClose={close} icon="✓" title="Check my sentence"
      sub={`Write it your way — get it corrected and explained.`}
      foot={<>
        {res && <button className="k-btn primary" onClick={keep}>Keep as a card</button>}
        <span className="k-spacer" />
        <button className="k-btn go" disabled={busy || !text.trim()} onClick={run}>
          {busy ? <><Spinner /> Checking…</> : "Check it"}
        </button>
      </>}>
      <textarea className="k-textarea" rows={3} value={text} autoFocus
        placeholder="ik heb zin in een koffie…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }} />
      {res && (
        <div style={{ marginTop: 18 }}>
          <div className="k-banner">✓ <span className="k-spacer"><b>{res.corrected}</b></span></div>
          {res.natural && res.natural !== res.corrected && (
            <div className="k-hint" style={{ marginBottom: 12 }}>More natural: <b>{res.natural}</b></div>
          )}
          {res.issues.length > 0 ? (
            <ul className="change-list">
              {res.issues.map((x, n) => (
                <li key={n}><s>{x.wrong}</s> → <b>{x.right}</b> — {x.why}</li>
              ))}
            </ul>
          ) : <div className="k-hint">No mistakes found.</div>}
          {res.verdict && <div className="k-hint" style={{ marginTop: 12, fontStyle: "italic" }}>{res.verdict}</div>}
        </div>
      )}
    </Modal>
  );
}

// ─── Practice plan → straight onto the calendar ─────────────────────────
function PlanModal({ close, notebook, entries, aiCfg, aiError, showToast }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState({});
  const [sending, setSending] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const res = await window.KnowledgeAI.practicePlan(aiCfg, { entries, notebook, days: 7 });
      setPlan(res);
      setPicked(Object.fromEntries(res.tasks.map((_, i) => [i, true])));
    } catch (e) { aiError(e); }
    finally { setBusy(false); }
  };

  const send = async () => {
    setSending(true);
    const chosen = plan.tasks.filter((_, i) => picked[i]);
    let ok = 0;
    for (const t of chosen) {
      const day = K.addDays(nowKey(), Math.max(0, (t.day || 1) - 1));
      const done = await window.Knowledge.sendToAlmanac(`${notebook.emoji} ${t.text}`, day, "medium");
      if (done) ok++;
    }
    setSending(false);
    close();
    showToast(ok ? `Added ${ok} task${ok === 1 ? "" : "s"} to your Almanac 🗓` : "Couldn't reach the calendar.");
  };

  return (
    <Modal open onClose={close} icon="📅" title="Practice plan"
      sub="A week of concrete tasks built from these cards — sent to your calendar."
      foot={<>
        {plan && <button className="k-btn" onClick={run} disabled={busy}>Regenerate</button>}
        <span className="k-spacer" />
        {plan
          ? <button className="k-btn go" onClick={send} disabled={sending}>
              {sending ? <><Spinner /> Adding…</> : `Add ${Object.values(picked).filter(Boolean).length} to Almanac →`}
            </button>
          : <button className="k-btn go" onClick={run} disabled={busy}>{busy ? <><Spinner /> Planning…</> : "Make a plan"}</button>}
      </>}>
      {!plan ? (
        <Empty emoji="🗓" title="Turn notes into practice"
          sub="The AI reads this notebook and writes short daily drills. You pick which ones land on your calendar." />
      ) : (
        <>
          {plan.intro && <div className="review-summary">{plan.intro}</div>}
          <div className="draft-list">
            {plan.tasks.map((t, i) => (
              <div key={i} className={cls("draft", !picked[i] && "off")}>
                <button className={cls("draft-check", picked[i] && "on")}
                  onClick={() => setPicked((p) => ({ ...p, [i]: !p[i] }))}>{picked[i] ? "✓" : ""}</button>
                <div className="draft-main">
                  <div className="draft-title-row">
                    <span className="draft-sec">{prettyDate(K.addDays(nowKey(), Math.max(0, (t.day || 1) - 1)))}</span>
                    <span className="draft-title">{t.text}</span>
                  </div>
                  {t.why && <div className="k-hint" style={{ margin: 0 }}>{t.why}</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

// ─── Move a card (the non-drag path, and the only one on small screens) ──
function MoveModal({ modal, close, notebooks, showToast }) {
  const { entry } = modal;
  const [target, setTarget] = useState(entry.notebookId);
  const [section, setSection] = useState(entry.sectionId || "");
  const nb = notebooks.find((n) => n.id === target);

  return (
    <Modal open onClose={close} icon="⇄" title="Move card" sub={entry.title}
      foot={<>
        <span className="k-spacer" />
        <button className="k-btn" onClick={close}>Cancel</button>
        <button className="k-btn go" onClick={() => {
          window.Knowledge.moveEntry(entry.id, { notebookId: target, sectionId: section || null });
          sound("drop"); close(); showToast("Moved ✿");
        }}>Move</button>
      </>}>
      <Field label="Notebook">
        <select className="k-select" value={target} onChange={(e) => { setTarget(e.target.value); setSection(""); }}>
          {notebooks.map((n) => <option key={n.id} value={n.id}>{n.emoji} {n.title}</option>)}
        </select>
      </Field>
      <Field label="Section">
        <select className="k-select" value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">Unsorted</option>
          {(nb ? nb.sections : []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
      </Field>
    </Modal>
  );
}

// ─── Send one card to the calendar as a practice task ───────────────────
function ToCalendarModal({ modal, close, notebook, showToast }) {
  const { entry } = modal;
  const [day, setDay] = useState(nowKey());
  const [text, setText] = useState(`Practise: ${entry.title}`);
  const [busy, setBusy] = useState(false);

  return (
    <Modal open onClose={close} icon="📅" title="Practise on a day"
      sub="Drops a task into your Almanac calendar."
      foot={<>
        <span className="k-spacer" />
        <button className="k-btn" onClick={close}>Cancel</button>
        <button className="k-btn go" disabled={busy || !text.trim()} onClick={async () => {
          setBusy(true);
          const ok = await window.Knowledge.sendToAlmanac(`${notebook.emoji} ${text.trim()}`, day, "medium");
          setBusy(false); close();
          showToast(ok ? "Added to your calendar 🗓" : "Couldn't reach the calendar.");
        }}>{busy ? <Spinner /> : "Add to Almanac"}</button>
      </>}>
      <Field label="Task"><input className="k-input" value={text} onChange={(e) => setText(e.target.value)} /></Field>
      <Field label="Day"><input className="k-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
    </Modal>
  );
}

// ─── Help ───────────────────────────────────────────────────────────────
function HelpModal({ close }) {
  return (
    <Modal open onClose={close} icon="?" title="How this works"
      foot={<><span className="k-spacer" /><button className="k-btn go" onClick={close}>Got it</button></>}>
      <ol style={{ lineHeight: 1.8, paddingLeft: 20, fontSize: 14.5 }}>
        <li><b>Dump.</b> Type or dictate whatever you remember. Spelling doesn't matter.</li>
        <li><b>Structure.</b> The AI splits it into cards, fixes the words and files them. You review every card before it's saved — and the raw text is always kept on the card.</li>
        <li><b>Tidy.</b> Drag cards between sections and notebooks, double-click any title or body to edit, long-press (or right-click) for the full menu.</li>
        <li><b>Practise.</b> Star a card to put it in the spaced-repetition rotation, or ask for an AI quiz. Push practice tasks onto your Almanac calendar.</li>
      </ol>
      <div className="rail-divider" />
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 14 }}>
        {[["D", "focus the dump box"], ["N", "new card / notebook"], ["/", "search"], ["A", "ask this notebook"],
          ["P", "practise"], ["C", "check a sentence"], ["B", "back to the shelf"], ["Esc", "close / go back"]].map(([k, v]) => (
            <React.Fragment key={k}><kbd style={{ fontFamily: "Geist Mono, monospace", border: "1.5px solid var(--ink)", borderRadius: 5, padding: "2px 7px", justifySelf: "start" }}>{k}</kbd><span>{v}</span></React.Fragment>
          ))}
      </div>
    </Modal>
  );
}

// ─── Confetti (same burst as the calendar) ──────────────────────────────
function burstConfetti() {
  const canvas = document.getElementById("confetti");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ["#3D2E5C", "#C8B6E2", "#F4B6C7", "#F7E1A0", "#B5DDC6"];
  const N = 60, cx = window.innerWidth / 2, cy = window.innerHeight * 0.4;
  const bits = Array.from({ length: N }, () => ({
    x: cx, y: cy,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 4,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6, h: 2 + Math.random() * 2,
    color: colors[Math.floor(Math.random() * colors.length)], life: 1,
  }));
  const step = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    bits.forEach((b) => {
      if (b.life <= 0) return; alive = true;
      b.x += b.vx; b.y += b.vy; b.vy += 0.45; b.vx *= 0.99;
      b.rot += b.vr; b.life -= 0.012;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.globalAlpha = Math.max(0, b.life); ctx.fillStyle = b.color;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
    });
    if (alive) requestAnimationFrame(step);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  step();
}

// ─── Mount ──────────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById("root")).render(<App />);

const wake = () => { window.Sounds && window.Sounds.resume(); window.removeEventListener("pointerdown", wake); };
window.addEventListener("pointerdown", wake);
