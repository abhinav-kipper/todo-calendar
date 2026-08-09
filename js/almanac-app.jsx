// Almanac – main React app, bridged to store.js for real data persistence
// Adapted from the design prototype; all data ops go through window.AlmanacStore

const { useState, useEffect, useRef, useMemo, useCallback, useId } = React;
const { DAYS, DAYS_FULL, MONTHS, dateKey, parseKey, sameDay, monthMatrix, quoteFor, moodFor, affirmationFor } = U;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "direction": "B",
  "density": "comfy",
  "soundOn": true,
  "volume": 0.4,
  "showShortcuts": true,
  "confetti": true,
  "heatmap": false
}/*EDITMODE-END*/;

const PLANT_LINES = {
  empty: ["nothing to do? naptime~", "give me a task to grow!", "i'm a seed waiting for purpose…"],
  early: ["off to a good start!", "we got this!", "one down — more to come ✿"],
  mid:   ["lookin' lush over here", "you're cruising!", "halfway, hero"],
  late:  ["so close i can taste it", "almost there friend!", "one more and we BLOOM"],
  done:  ["ALL DONE! you legend.", "petals everywhere 🌸", "we did it, today was a vibe"],
};

// ─── Drag ghost ───────────────────────────────────────────
function useDragGhost() {
  const [drag, setDrag] = useState(null);
  useEffect(() => {
    if (!drag) return;
    const move = (e) => {
      const x = e.clientX ?? (e.touches && e.touches[0].clientX);
      const y = e.clientY ?? (e.touches && e.touches[0].clientY);
      setDrag((d) => d ? { ...d, pos: { x, y } } : d);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", move);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("touchmove", move);
    };
  }, [drag?.task?.id]);
  return [drag, setDrag];
}

// ─── Long-press detector — fires onLongPress when finger stays put for `delay`ms
// without moving more than 6px. Cancels on touchend/touchcancel so a short tap
// does nothing, leaving the existing tap-vs-drag logic untouched.
function useLongPress(onLongPress, delay = 500) {
  const timer = useRef(null);
  const startPos = useRef(null);
  const fired = useRef(false);
  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    startPos.current = null;
  }, []);
  const onTouchStart = useCallback((e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    fired.current = false;
    startPos.current = { x: t.clientX, y: t.clientY };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fired.current = true;
      timer.current = null;
      onLongPress();
    }, delay);
  }, [onLongPress, delay]);
  const onTouchMove = useCallback((e) => {
    if (!timer.current || !startPos.current) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    if (Math.abs(t.clientX - startPos.current.x) > 6 || Math.abs(t.clientY - startPos.current.y) > 6) {
      cancel();
    }
  }, [cancel]);
  return { onTouchStart, onTouchMove, onTouchEnd: cancel, onTouchCancel: cancel, didLongPress: () => fired.current };
}

// ─── EditableText — swaps between a label and an inline input, autoselects on
// edit. Submits on Enter / blur, cancels on Esc. Stops mousedown/touchstart from
// reaching parent drag handlers while editing.
function EditableText({ text, editing, onSave, onCancel, tag = "div", className }) {
  const inputRef = useRef(null);
  const [draft, setDraft] = useState(text);
  const committedRef = useRef(false);
  useEffect(() => {
    if (editing) {
      setDraft(text);
      committedRef.current = false;
      const i = inputRef.current;
      if (i) { i.focus(); i.select(); }
    }
  }, [editing, text]);
  if (!editing) {
    const Tag = tag;
    return <Tag className={className}>{text}</Tag>;
  }
  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const next = draft.trim();
    if (next && next !== text) onSave(next); else onCancel();
  };
  return (
    <input
      ref={inputRef}
      className={`${className || ""} editable-input`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        else if (e.key === "Escape") { e.preventDefault(); committedRef.current = true; onCancel(); }
        e.stopPropagation();
      }}
      onBlur={commit}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ─── Toast ────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const show = useCallback((msg, action) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, action, open: true, t: Date.now() });
    timerRef.current = setTimeout(() => setToast((t) => t ? { ...t, open: false } : null), 4000);
    setTimeout(() => setToast(null), 4400);
  }, []);
  return [toast, show];
}

// ─── Main App ───────────────────────────────────────────
function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const urlDir = useMemo(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("dir");
      return v === "A" || v === "B" ? v : null;
    } catch { return null; }
  }, []);
  const direction = urlDir || tweaks.direction;
  const isWidget = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("widget") === "1"; }
    catch { return false; }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.direction = direction;
    if (isWidget) document.documentElement.dataset.widget = "1";
  }, [direction, isWidget]);

  useEffect(() => {
    Sounds.setEnabled(tweaks.soundOn);
    Sounds.setVolume(tweaks.volume);
  }, [tweaks.soundOn, tweaks.volume]);

  // ─── data (bridged from store.js) ───
  const [todos, setTodos] = useState({});
  const [inbox, setInbox] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState('Local');
  const syncEnabled = useRef(false);
  const pendingRemoteApply = useRef(false);

  // Init Firebase + auth on mount (wait for module bridge to be ready)
  useEffect(() => {
    const tryInit = () => {
      const Bridge = window.AlmanacStore;
      if (!Bridge) { setTimeout(tryInit, 30); return; }
      Bridge.initFirebase();
      Bridge.setOnStateChange(s => setSyncStatus(s));
      Bridge.wireStorageSync();
      Bridge.setOnDataChange(() => {
        const { todos: t, inbox: ib } = Bridge.loadForReact();
        pendingRemoteApply.current = true;
        setTodos(t);
        setInbox(ib);
      });
      Bridge.onAuthChange(async (u) => {
        Bridge.unsubscribeFromRemote();
        setUser(u);
        syncEnabled.current = false; // disable sync while loading
        const status = await Bridge.loadTodos();
        setSyncStatus(status);
        const { todos: t, inbox: ib } = Bridge.loadForReact();
        setTodos(t);
        setInbox(ib);
        setLoading(false);
        if (u) Bridge.subscribeToRemote();
        // enable sync AFTER data is loaded (small delay so React batches the state updates first)
        setTimeout(() => { syncEnabled.current = true; }, 100);
      });
    };
    tryInit();
  }, []);

  // Sync React state → store after every user-driven change
  useEffect(() => {
    if (!syncEnabled.current) return;
    if (pendingRemoteApply.current) {
      pendingRemoteApply.current = false;
      return;
    }
    window.AlmanacStore.syncFromReact(todos, inbox);
  }, [todos, inbox]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [view, setView] = useState(() => window.innerWidth < 720 ? "today" : "month");
  const [openDay, setOpenDay] = useState(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [pinHelperOpen, setPinHelperOpen] = useState(false);
  const [draftPriority, setDraftPriority] = useState("low");
  const [draftRepeat, setDraftRepeat] = useState("none");
  const [draftText, setDraftText] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [toast, showToast] = useToast();
  const [drag, setDrag] = useDragGhost();
  const lastDeletedRef = useRef(null);
  const inputRef = useRef(null);

  const onSound = (name) => { if (Sounds[name]) Sounds[name](); };

  // ─── Stats ───
  const monthStats = useMemo(() => {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    let total = 0, done = 0;
    Object.entries(todos).forEach(([k, list]) => {
      const d = parseKey(k);
      if (d.getFullYear() === y && d.getMonth() === m) {
        total += list.length;
        done += list.filter(t => t.done).length;
      }
    });
    return { total, done, pending: total - done };
  }, [todos, cursor]);

  // ─── Streak ───
  const streak = useMemo(() => {
    let n = 0;
    const d = new Date(today);
    while (true) {
      const k = dateKey(d);
      const list = todos[k];
      if (!list || list.length === 0) break;
      if (list.some(t => !t.done)) break;
      n++;
      d.setDate(d.getDate() - 1);
      if (n > 60) break;
    }
    return n;
  }, [todos, today]);

  // ─── Task ops ───
  const newId = () => 't' + Math.random().toString(36).slice(2, 9);

  const addTask = (key, text, opts = {}) => {
    if (!text.trim()) return;
    onSound("add");
    const repeat = opts.repeat || 'none';
    if (repeat !== 'none') {
      // Recurring: delegate to store, then reload
      window.AlmanacStore.addRecurring(key, text, opts.priority || 'low', repeat);
      const { todos: newT } = window.AlmanacStore.loadForReact();
      setTodos(() => newT);
      return;
    }
    const base = {
      id: newId(),
      text: text.trim(),
      priority: opts.priority || 'low',
      repeat: 'none',
      done: false,
      notes: '',
      createdAt: Date.now(),
      _new: true,
      _isRecurring: false,
    };
    setTodos(cur => ({ ...cur, [key]: [...(cur[key] || []), base] }));
  };

  const editTask = (key, id, newText) => {
    const trimmed = (newText || '').trim();
    if (!trimmed) return;
    setTodos(cur => {
      const list = cur[key] || [];
      const target = list.find(t => t.id === id);
      if (!target || target.text === trimmed) return cur;
      if (target._isRecurring) {
        window.AlmanacStore.editRecurring(target._recurringId, trimmed);
        const { todos: t } = window.AlmanacStore.loadForReact();
        return t;
      }
      return { ...cur, [key]: list.map(t => t.id === id ? { ...t, text: trimmed } : t) };
    });
  };

  const editInbox = (id, newText) => {
    const trimmed = (newText || '').trim();
    if (!trimmed) return;
    setInbox(cur => cur.map(t => t.id === id ? { ...t, text: trimmed } : t));
  };

  // editingId is the per-row useId() of the currently-edited row, not a task
  // ID — same task can render in multiple surfaces (TodayPanel + DayPanel +
  // FocusOverlay) and we only want one of them to enter edit mode at a time.
  const [editingId, setEditingId] = useState(null);
  const startEdit = (rowId) => setEditingId(rowId);
  const cancelEdit = () => setEditingId(null);

  const addToInbox = (text) => {
    if (!text.trim()) return;
    onSound("add");
    setInbox(cur => [...cur, {
      id: newId(), text: text.trim(), priority: 'low', repeat: 'none',
      done: false, notes: '', createdAt: Date.now(), _new: true, _isRecurring: false,
    }]);
  };

  const toggleTask = (key, id) => {
    setTodos(cur => {
      const list = cur[key] || [];
      const target = list.find(t => t.id === id);
      if (!target) return cur;
      const willBeDone = !target.done;
      if (target._isRecurring) {
        // Sync recurring toggle directly to store
        const newDone = window.AlmanacStore.toggleRecurring(key, target._recurringId);
        if (newDone) onSound("check"); else onSound("uncheck");
        return { ...cur, [key]: list.map(t => t.id === id ? { ...t, done: newDone } : t) };
      }
      if (willBeDone) onSound("check"); else onSound("uncheck");
      const next = list.map(t => t.id === id ? { ...t, done: willBeDone, _new: false } : t);
      const remaining = next.filter(t => !t.done).length;
      if (willBeDone && remaining === 0 && next.length >= 2) {
        setTimeout(() => { onSound("chime"); if (tweaks.confetti) burstConfetti(); }, 250);
      }
      return { ...cur, [key]: next };
    });
  };

  const toggleInbox = (id) => {
    setInbox(cur => cur.map(t => {
      if (t.id !== id) return t;
      const willBeDone = !t.done;
      if (willBeDone) onSound("check"); else onSound("uncheck");
      return { ...t, done: willBeDone };
    }));
  };

  const deleteTask = (key, id) => {
    setTodos(cur => {
      const list = cur[key] || [];
      const task = list.find(t => t.id === id);
      if (!task) return cur;
      if (task._isRecurring) {
        // Delete all occurrences
        window.AlmanacStore.deleteRecurring(task._recurringId);
        const next = { ...cur };
        Object.keys(next).forEach(k => {
          next[k] = next[k].filter(t => !t._isRecurring || t._recurringId !== task._recurringId);
          if (next[k].length === 0) delete next[k];
        });
        onSound("del");
        showToast(`Recurring "${task.text.slice(0, 24)}…" removed`, null);
        return next;
      }
      lastDeletedRef.current = { key, task, list };
      showToast(`"${task.text.slice(0, 30)}${task.text.length > 30 ? '…' : ''}" deleted`, 'undo');
      onSound("del");
      return { ...cur, [key]: list.filter(t => t.id !== id) };
    });
  };

  const deleteInbox = (id) => {
    setInbox(cur => {
      const task = cur.find(t => t.id === id);
      if (!task) return cur;
      lastDeletedRef.current = { inbox: true, task, list: cur };
      showToast(`"${task.text.slice(0, 30)}" deleted`, 'undo');
      onSound("del");
      return cur.filter(t => t.id !== id);
    });
  };

  const undoDelete = () => {
    const r = lastDeletedRef.current;
    if (!r) return;
    if (r.inbox) setInbox(r.list);
    else setTodos(cur => ({ ...cur, [r.key]: r.list }));
    lastDeletedRef.current = null;
    showToast("Restored", null);
  };

  // ─── Move / drag ───
  const moveTask = (task, fromKey, toKey) => {
    if (fromKey === toKey) return;
    onSound("drop");
    setTodos(cur => {
      const next = { ...cur };
      if (fromKey === "__inbox") {
        setInbox(ib => ib.filter(t => t.id !== task.id));
      } else {
        next[fromKey] = (next[fromKey] || []).filter(t => t.id !== task.id);
        if (next[fromKey].length === 0) delete next[fromKey];
      }
      if (toKey === "__inbox") {
        setInbox(ib => [...ib, { ...task, _new: true }]);
      } else {
        next[toKey] = [...(next[toKey] || []), { ...task, _new: true }];
      }
      return next;
    });
  };

  const quickMove = (task, fromKey, delta) => {
    if (delta === "__inbox") {
      moveTask(task, fromKey, "__inbox");
      showToast(`Moved "${task.text.slice(0, 24)}…" to Inbox ✿`);
      return;
    }
    const d = parseKey(fromKey);
    d.setDate(d.getDate() + delta);
    const toKey = dateKey(d);
    moveTask(task, fromKey, toKey);
    const tmw = new Date(today); tmw.setDate(tmw.getDate() + 1);
    const label = sameDay(d, today) ? "Today"
               : sameDay(d, tmw) ? "Tomorrow"
               : `${DAYS_FULL[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
    showToast(`Moved to ${label} ✿`);
  };

  const beginDrag = (e, task, sourceKey, clickFallback) => {
    const x0 = e.clientX ?? (e.touches && e.touches[0].clientX);
    const y0 = e.clientY ?? (e.touches && e.touches[0].clientY);
    let dragging = false;
    const onMove = (ev) => {
      const x = ev.clientX ?? (ev.touches && ev.touches[0].clientX);
      const y = ev.clientY ?? (ev.touches && ev.touches[0].clientY);
      if (!dragging && (Math.abs(x - x0) > 6 || Math.abs(y - y0) > 6)) {
        dragging = true;
        onSound("pickup");
        setDrag({ task, sourceKey, pos: { x, y } });
      }
    };
    const onUp = (ev) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
      if (!dragging) { if (clickFallback) clickFallback(); return; }
      const ex = ev.clientX ?? (ev.changedTouches && ev.changedTouches[0].clientX);
      const ey = ev.clientY ?? (ev.changedTouches && ev.changedTouches[0].clientY);
      const targetEl = document.elementFromPoint(ex, ey);
      const dropEl = targetEl && targetEl.closest("[data-drop]");
      const dropKey = dropEl ? dropEl.getAttribute("data-drop") : null;
      if (dropKey) moveTask(task, sourceKey, dropKey);
      setDrag(null);
      document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
  };

  // ─── Navigation ───
  // Step by a week in week view, by a month otherwise.
  const goPrev = () => setCursor(d => view === "week"
    ? new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7)
    : new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const goNext = () => setCursor(d => view === "week"
    ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)
    : new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const goToday = () => {
    setCursor(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
    setView(v => v === "week" ? "week" : "month");
  };

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "Escape") {
        if (focusOpen) setFocusOpen(false);
        else if (openDay) { setOpenDay(null); onSound("close"); }
      } else if (e.key.toLowerCase() === "n") {
        setOpenDay(dateKey(today)); onSound("open");
        setTimeout(() => inputRef.current && inputRef.current.focus(), 280);
      } else if (e.key.toLowerCase() === "i") { setView("inbox"); }
      else if (e.key.toLowerCase() === "f") { setFocusOpen(true); }
      else if (e.key.toLowerCase() === "m") { setView("month"); }
      else if (e.key.toLowerCase() === "w") { setView("week"); }
      else if (e.key.toLowerCase() === "q") {
        e.preventDefault();
        if (quickAddRef.current) quickAddRef.current.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openDay, focusOpen, today]);

  const openDayPanel = (key) => { setOpenDay(key); onSound("open"); };
  const closeDayPanel = () => { setOpenDay(null); onSound("close"); };

  // ─── Quick add ───
  const quickAddRef = useRef(null);
  const quickAdd = (text) => {
    const parsed = U.parseQuickAdd(text, today);
    if (!parsed || !parsed.text) return false;
    addTask(parsed.dateKey, parsed.text, { priority: parsed.priority });
    const d = parsed.date;
    const tmw = new Date(today); tmw.setDate(tmw.getDate() + 1);
    const dayLabel = sameDay(d, today) ? "Today"
                   : sameDay(d, tmw) ? "Tomorrow"
                   : `${DAYS_FULL[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
    showToast(`Added to ${dayLabel} ✿`);
    return true;
  };

  // ─── Today progress (plant + mood) ───
  const todayList = todos[dateKey(today)] || [];
  const todayDone = todayList.filter(t => t.done).length;
  const todayTotal = todayList.length;
  const todayProgress = todayTotal ? todayDone / todayTotal : 0;
  const todayMood = moodFor(todayProgress, todayTotal);
  const affirmation = affirmationFor(today);

  // ─── Plant click ───
  const [plantMessage, setPlantMessage] = useState(null);
  const plantMsgTimer = useRef(null);
  const onPlantClick = () => {
    const pool = todayTotal === 0 ? PLANT_LINES.empty
               : todayProgress >= 1 ? PLANT_LINES.done
               : todayProgress >= 0.66 ? PLANT_LINES.late
               : todayProgress >= 0.33 ? PLANT_LINES.mid
               : PLANT_LINES.early;
    const msg = pool[Math.floor(Math.random() * pool.length)];
    if (plantMsgTimer.current) clearTimeout(plantMsgTimer.current);
    setPlantMessage(msg);
    onSound("pickup");
    plantMsgTimer.current = setTimeout(() => setPlantMessage(null), 3000);
  };

  // ─── Export / Import ───
  const handleExport = () => window.AlmanacStore.exportData();
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const ok = window.AlmanacStore.importData(ev.target.result);
      if (ok) {
        const { todos: t, inbox: ib } = window.AlmanacStore.loadForReact();
        setTodos(t); setInbox(ib);
        showToast("Data imported ✿");
      } else {
        showToast("Import failed — invalid file");
      }
    };
    reader.readAsText(file);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'var(--body)', color: 'var(--ink)', fontSize: 18, gap: 12 }}>
        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>✿</span>
        Loading your almanac…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const cells = monthMatrix(cursor.getFullYear(), cursor.getMonth());
  const inboxCount = inbox.filter(t => !t.done).length;

  if (isWidget) {
    const fullUrl = window.location.pathname + (window.location.hash || "");
    return (
      <div className="app widget" data-density={tweaks.density}>
        <div className="widget-bar">
          <div className="widget-date">
            <span className="widget-day">{today.getDate()}</span>
            <span className="widget-day-name">{DAYS_FULL[today.getDay()]}<br/><span>{MONTHS[today.getMonth()]}</span></span>
          </div>
          <div className="widget-actions">
            <span className="sync-pill" data-tip={syncStatus === "Local" ? "Saved on this device" : "Synced to Google"}>{syncStatus}</span>
            {!user && (
              <button className="ghost-btn small" onClick={() => window.AlmanacStore.signInWithGoogle()} data-tip="Sign in to sync">Sign in</button>
            )}
            <a className="iconbtn small" href={fullUrl} target="_blank" rel="noopener noreferrer" data-tip="Open full Almanac" data-tip-align="end" aria-label="Open full Almanac">↗</a>
          </div>
        </div>
        <TodayPanel
          today={today} todos={todos}
          toggleTask={toggleTask} addTask={addTask} deleteTask={deleteTask}
          quickMove={quickMove} beginDrag={beginDrag} draggingId={drag?.task?.id}
          editingId={editingId} startEdit={startEdit} cancelEdit={cancelEdit} editTask={editTask}
          expanded
        />
        {drag && drag.pos && (
          <div className="drag-ghost" style={{ left: drag.pos.x, top: drag.pos.y }}>
            {drag.task.text}
          </div>
        )}
        {toast && (
          <div className={`toast ${toast.open ? "open" : ""}`}>
            <span>{toast.msg}</span>
            {toast.action === "undo" && <button onClick={undoDelete}>Undo</button>}
            <div className="toast-bar" style={{ animation: toast.open ? "shrink 4s linear forwards" : "none" }} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app" data-density={tweaks.density}>
      <TopBar
        cursor={cursor} view={view} setView={setView}
        onPrev={goPrev} onNext={goNext} onToday={goToday}
        onOpenInbox={() => setView("inbox")}
        onOpenFocus={() => setFocusOpen(true)}
        onOpenPinHelper={() => setPinHelperOpen(true)}
        onToggleDirection={() => setTweak("direction", direction === "A" ? "B" : "A")}
        direction={direction}
        inboxCount={inboxCount}
        user={user}
        syncStatus={syncStatus}
        onSignIn={() => window.AlmanacStore.signInWithGoogle()}
        onSignOut={() => window.AlmanacStore.signOut()}
        onExport={handleExport}
        onImport={handleImport}
      />
      <QuickAddBar onAdd={quickAdd} inputRef={quickAddRef} today={today} />
      <VibeStrip mood={todayMood} affirmation={affirmation} stats={monthStats} streak={streak} />

      <div className={`main-layout ${view === "month" ? "with-rail" : ""} ${view === "today" ? "today-only" : ""}`}>
        <div className="main">
          {view === "month" && (
            <MonthView
              cells={cells} cursor={cursor} today={today} todos={todos}
              openDayPanel={openDayPanel}
              beginDrag={beginDrag}
              draggingId={drag?.task?.id}
              toggleTask={toggleTask}
              addTask={addTask}
              heatmap={tweaks.heatmap}
            />
          )}
          {view === "week" && (
            <WeekView
              cursor={cursor} today={today} todos={todos}
              toggleTask={toggleTask}
              openDayPanel={openDayPanel}
              beginDrag={beginDrag}
              draggingId={drag?.task?.id}
              editingId={editingId} startEdit={startEdit} cancelEdit={cancelEdit} editTask={editTask}
            />
          )}
          {view === "inbox" && (
            <InboxView
              inbox={inbox}
              addToInbox={addToInbox}
              toggleInbox={toggleInbox}
              deleteInbox={deleteInbox}
              beginDrag={beginDrag}
              draggingId={drag?.task?.id}
              editingId={editingId} startEdit={startEdit} cancelEdit={cancelEdit} editInbox={editInbox}
            />
          )}
          {view === "today" && (
            <div className="today-view-inner">
              <TodayPanel
                today={today} todos={todos}
                toggleTask={toggleTask} addTask={addTask} deleteTask={deleteTask}
                quickMove={quickMove} beginDrag={beginDrag} draggingId={drag?.task?.id}
                editingId={editingId} startEdit={startEdit} cancelEdit={cancelEdit} editTask={editTask}
                expanded
              />
              <PlantSide
                progress={todayProgress} done={todayDone} total={todayTotal}
                direction={direction} monthStats={monthStats}
                message={plantMessage} onPlantClick={onPlantClick}
              />
            </div>
          )}
        </div>
        {view === "month" && (
          <aside className="today-rail">
            <TodayPanel
              today={today} todos={todos}
              toggleTask={toggleTask} addTask={addTask} deleteTask={deleteTask}
              quickMove={quickMove} beginDrag={beginDrag} draggingId={drag?.task?.id}
              editingId={editingId} startEdit={startEdit} cancelEdit={cancelEdit} editTask={editTask}
            />
            <PlantSide
              progress={todayProgress} done={todayDone} total={todayTotal}
              direction={direction} monthStats={monthStats}
              message={plantMessage} onPlantClick={onPlantClick}
            />
          </aside>
        )}
      </div>

      <DayPanel
        dayKey={openDay} todos={todos}
        addTask={addTask} toggleTask={toggleTask} deleteTask={deleteTask}
        editingId={editingId} startEdit={startEdit} cancelEdit={cancelEdit} editTask={editTask}
        quickMove={quickMove} close={closeDayPanel}
        navDay={(delta) => {
          if (!openDay) return;
          const d = parseKey(openDay);
          d.setDate(d.getDate() + delta);
          setOpenDay(dateKey(d));
        }}
        draftPriority={draftPriority} setDraftPriority={setDraftPriority}
        draftRepeat={draftRepeat} setDraftRepeat={setDraftRepeat}
        draftText={draftText} setDraftText={setDraftText}
        inputFocused={inputFocused} setInputFocused={setInputFocused}
        inputRef={inputRef}
        beginDrag={beginDrag} draggingId={drag?.task?.id}
        today={today}
      />

      <FocusOverlay
        open={focusOpen} close={() => setFocusOpen(false)}
        today={today} todos={todos} toggleTask={toggleTask}
        editingId={editingId} startEdit={startEdit} cancelEdit={cancelEdit} editTask={editTask}
      />

      <PinWidgetModal
        open={pinHelperOpen} close={() => setPinHelperOpen(false)}
      />

      {drag && drag.pos && (
        <div className="drag-ghost" style={{ left: drag.pos.x, top: drag.pos.y }}>
          {drag.task.text}
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.open ? "open" : ""}`}>
          <span>{toast.msg}</span>
          {toast.action === "undo" && <button onClick={undoDelete}>Undo</button>}
          <div className="toast-bar" style={{ animation: toast.open ? "shrink 4s linear forwards" : "none" }} />
        </div>
      )}

      {tweaks.showShortcuts && !openDay && !focusOpen && (
        <div className="shortcuts">
          <span><kbd>Q</kbd> quick-add</span>
          <span><kbd>N</kbd> new</span>
          <span><kbd>I</kbd> inbox</span>
          <span><kbd>F</kbd> focus</span>
          <span><kbd>M</kbd> month</span>
          <span><kbd>W</kbd> week</span>
        </div>
      )}

      <MobileTabBar
        view={view} setView={setView}
        inboxCount={inboxCount}
        todayPending={todayTotal - todayDone}
        focusOpen={focusOpen}
        setFocusOpen={setFocusOpen}
        closeDayPanel={() => setOpenDay(null)}
      />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Direction" />
        <TweakRadio
          label="Vibe" value={direction}
          options={[
            { value: "A", label: "A · Sticker Book" },
            { value: "B", label: "B · Memphis Mall" },
          ]}
          onChange={(v) => setTweak("direction", v)}
        />
        <TweakRadio
          label="Density" value={tweaks.density}
          options={[{ value: "comfy", label: "Comfy" }, { value: "compact", label: "Compact" }]}
          onChange={(v) => setTweak("density", v)}
        />
        <TweakSection label="Fun stuff" />
        <TweakToggle label="Confetti on full day" value={tweaks.confetti} onChange={(v) => setTweak("confetti", v)} />
        <TweakToggle label="Heatmap month view" value={tweaks.heatmap} onChange={(v) => setTweak("heatmap", v)} />
        <TweakSection label="Sound" />
        <TweakToggle label="Effects" value={tweaks.soundOn} onChange={(v) => { setTweak("soundOn", v); if (v) { Sounds.resume(); Sounds.check(); } }} />
        <TweakSlider label="Volume" value={Math.round(tweaks.volume * 100)} min={0} max={100} step={5} unit="%" onChange={(v) => setTweak("volume", v / 100)} />
        <TweakSection label="Help" />
        <TweakToggle label="Show shortcut bar" value={tweaks.showShortcuts} onChange={(v) => setTweak("showShortcuts", v)} />
      </TweaksPanel>
    </div>
  );
}

// ─── Confetti ────────────────────────────────────────────────
function burstConfetti() {
  const canvas = document.getElementById("confetti");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const colors = ["#3D2E5C", "#C8B6E2", "#F4B6C7", "#F7E1A0", "#B5DDC6"];
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  if (accent) colors[1] = accent;
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
  let raf;
  const step = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    bits.forEach(b => {
      if (b.life <= 0) return; alive = true;
      b.x += b.vx; b.y += b.vy; b.vy += 0.45; b.vx *= 0.99;
      b.rot += b.vr; b.life -= 0.012;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.globalAlpha = Math.max(0, b.life); ctx.fillStyle = b.color;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
    });
    if (alive) raf = requestAnimationFrame(step);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  step();
}

// ─── TopBar ────────────────────────────────────────────
function TopBar({ cursor, view, setView, onPrev, onNext, onToday, onOpenInbox, onOpenFocus, onOpenPinHelper, onToggleDirection, direction, inboxCount, user, syncStatus, onSignIn, onSignOut, onExport, onImport }) {
  const subtitles = { A: "a sticker book of days", B: "calendar but make it 90s" };
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" />
        <div>
          <div className="brand-title">Almanac</div>
          <div className="brand-sub">~ {subtitles[direction]} ~</div>
        </div>
      </div>
      <div className="topbar-mid">
        <div className="month-nav">
          <button onClick={onPrev} data-tip={`Previous ${view === "week" ? "week" : "month"} (←)`} aria-label={`Previous ${view === "week" ? "week" : "month"}`}><Icon.Chevron dir="left" /></button>
          <div className="month-display">
            {MONTHS[cursor.getMonth()]} <span className="year">{cursor.getFullYear()}</span>
          </div>
          <button onClick={onNext} data-tip={`Next ${view === "week" ? "week" : "month"} (→)`} aria-label={`Next ${view === "week" ? "week" : "month"}`}><Icon.Chevron dir="right" /></button>
          <button className="today-btn" onClick={onToday} data-tip="Jump back to today's month">Today</button>
        </div>
        <div className="view-switch">
          <button className={view === "month" ? "active" : ""} onClick={() => setView("month")}>Month</button>
          <button className={view === "week" ? "active" : ""} onClick={() => setView("week")}>Week</button>
        </div>
      </div>
      <div className="topbar-right">
        <span className="sync-pill" data-tip={syncStatus === "Local" ? "Saved on this device · sign in to sync" : "Synced to your Google account"} aria-label={syncStatus}>{syncStatus}</span>
        {user ? (
          <div className="user-chip">
            {user.photoURL && <img src={user.photoURL} alt="" className="user-avatar" />}
            <span className="user-name">{user.displayName || user.email}</span>
            <button className="ghost-btn small" onClick={onSignOut} data-tip="Sign out" aria-label="Sign out">↩</button>
          </div>
        ) : (
          <button className="sign-in-btn" onClick={onSignIn} data-tip="Sign in with Google to sync across devices">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" style={{width:16,height:16}} />
            Sign in
          </button>
        )}
        <button className="iconbtn" onClick={onExport} data-tip="Download backup (.json)" aria-label="Export data">↓</button>
        <label className="iconbtn" data-tip="Restore from backup (.json)" aria-label="Import data" style={{cursor:'pointer'}}>
          ↑<input type="file" accept=".json" onChange={onImport} style={{display:'none'}} />
        </label>
        <button className="iconbtn" onClick={onOpenFocus} data-tip="Focus mode · just today (F)" aria-label="Focus mode"><Icon.Focus /></button>
        <button className="iconbtn" onClick={onOpenInbox} data-tip="Inbox · unscheduled tasks (I)" aria-label="Inbox">
          <Icon.Inbox />
          {inboxCount > 0 && <span className="pip inbox-pip">{inboxCount}</span>}
        </button>
        <button className="iconbtn" onClick={onOpenPinHelper} data-tip="Pin today as a dock widget" aria-label="Pin as widget" style={{ fontFamily: "var(--display)", fontSize: 16 }}>◱</button>
        <button className="iconbtn" onClick={onToggleDirection} data-tip={`Switch vibe → ${direction === "A" ? "Memphis Mall" : "Sticker Book"}`} aria-label="Switch design vibe" style={{ fontFamily: "var(--display)", fontSize: 16 }}>
          {direction}
        </button>
      </div>
    </header>
  );
}

// ─── QuickAddBar ──────────────────────────────────────────
function QuickAddBar({ onAdd, inputRef, today }) {
  const [text, setText] = useState("");
  const submit = () => { if (!text.trim()) return; const ok = onAdd(text); if (ok) setText(""); };
  const preview = useMemo(() => text.trim() ? U.parseQuickAdd(text, today) : null, [text, today]);
  const prevLabel = preview && preview.text ? (() => {
    const d = preview.date;
    const tmw = new Date(today); tmw.setDate(tmw.getDate() + 1);
    if (sameDay(d, today)) return "Today";
    if (sameDay(d, tmw)) return "Tomorrow";
    return `${DAYS_FULL[d.getDay()].slice(0, 3)}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
  })() : null;
  return (
    <div className="quickadd-wrap">
      <div className="quickadd">
        <span className="quickadd-icon">✦</span>
        <input
          ref={inputRef} type="text" value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); else if (e.key === "Escape") { setText(""); e.target.blur(); } }}
          placeholder='quick-add… try "buy milk tomorrow" or "yoga mon !!!"'
        />
        <button onClick={submit} disabled={!text.trim()}>Add ↵</button>
        <div className="quickadd-hint"><kbd>Q</kbd> to focus</div>
      </div>
      {preview && preview.text && (
        <div className="quickadd-preview">
          <span className="qa-arrow">→</span>
          <span className={`qa-chip p-${preview.priority}`}>{preview.text}</span>
          <span className="qa-where">{prevLabel}</span>
          {preview.priority !== "low" && <span className="qa-prio">{preview.priority}</span>}
        </div>
      )}
    </div>
  );
}

// ─── MobileTabBar ────────────────────────────────────────
function MobileTabBar({ view, setView, inboxCount, todayPending, focusOpen, setFocusOpen, closeDayPanel }) {
  const tabs = [
    { id: "today", label: "Today", icon: "☀", count: todayPending },
    { id: "month", label: "Cal", icon: "▦" },
    { id: "inbox", label: "Inbox", icon: "✉", count: inboxCount },
    { id: "focus", label: "Focus", icon: "◉" },
  ];
  const onTabClick = (id) => {
    closeDayPanel();
    if (id === "focus") {
      setFocusOpen(!focusOpen);
    } else {
      setFocusOpen(false);
      setView(id);
    }
  };
  return (
    <nav className="mobile-tabs" role="tablist">
      {tabs.map(t => {
        const active = t.id === "focus" ? focusOpen : (view === t.id && !focusOpen);
        return (
          <button key={t.id} role="tab" aria-selected={active}
            className={`mtab ${active ? "active" : ""}`}
            onClick={() => onTabClick(t.id)}>
            <span className="mtab-icon">{t.icon}</span>
            <span className="mtab-label">{t.label}</span>
            {t.count > 0 && <span className="mtab-pip">{t.count}</span>}
          </button>
        );
      })}
    </nav>
  );
}

// ─── VibeStrip ─────────────────────────────────────────────
function VibeStrip({ mood, affirmation, stats, streak }) {
  const moodSubs = {
    sleepy: "a fresh slate ✨", warming: "easing in, no rush", cruising: "a lil' rhythm going",
    "fired-up": "absolutely cooking", soaring: "nearly there, friend", bloom: "every box ticked 🌸",
  };
  return (
    <div className="vibe-strip">
      <div className="mood-card" data-tip="Mood changes with how much you finish today" data-tip-pos="top">
        <div className="mood-icon">{mood.icon}</div>
        <div className="mood-text">
          <div className="mood-label">today's vibe: {mood.label}</div>
          <div className="mood-sub">{moodSubs[mood.id]}</div>
        </div>
      </div>
      <div className="affirm-card" data-tip="A new affirmation each day ✿" data-tip-pos="top"><div className="affirm-text">{affirmation}</div></div>
      <div className="stats-card">
        <div className="stat" data-tip="Tasks completed this month" data-tip-pos="top"><b>{stats.done}</b><span>done</span></div>
        <div className="v-divide" />
        <div className="stat" data-tip="Tasks remaining this month" data-tip-pos="top"><b>{stats.pending}</b><span>to-do</span></div>
        <div className="v-divide" />
        <div className="stat" data-tip="Consecutive days where every task was finished" data-tip-pos="top">
          <b>{streak}🔥</b><span>day streak</span>
          <div className="streak-dots">
            {Array.from({ length: 7 }).map((_, i) => <i key={i} className={i < Math.min(streak, 7) ? "on" : ""} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PlantSide ─────────────────────────────────────────────
function PlantSide({ progress, done, total, direction, monthStats, message, onPlantClick }) {
  const monthPct = monthStats.total ? Math.round((monthStats.done / monthStats.total) * 100) : 0;
  return (
    <aside className="plant-side">
      <div className="plant-side-title">Sprout</div>
      <div className="plant-side-sub">your lil todo plant</div>
      <div className="plant-clickable" onClick={onPlantClick}>
        <PlantMascot progress={progress} total={total} done={done} direction={direction} />
        {message && <div className="plant-bubble">{message}</div>}
      </div>
      <div className="plant-progress">
        <div className="plant-progress-label"><span>This month</span><span>{monthPct}%</span></div>
        <div className="plant-progress-bar"><div className="plant-progress-fill" style={{ width: `${monthPct}%` }} /></div>
      </div>
    </aside>
  );
}

// ─── TodayPanel ──────────────────────────────────────────
function TodayPanel({ today, todos, toggleTask, addTask, deleteTask, quickMove, beginDrag, draggingId, editingId, startEdit, cancelEdit, editTask }) {
  const key = dateKey(today);
  const list = U.sortTasks(todos[key] || []);
  const done = list.filter(t => t.done).length;
  const total = list.length;
  const pct = total ? (done / total) * 100 : 0;
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const over = () => el.classList.add("drag-over");
    const leave = () => el.classList.remove("drag-over");
    el.addEventListener("mouseover", over);
    el.addEventListener("mouseleave", leave);
    return () => { el.removeEventListener("mouseover", over); el.removeEventListener("mouseleave", leave); };
  }, []);

  const submit = () => {
    if (!draft.trim()) return;
    addTask(key, draft);
    setDraft("");
    setTimeout(() => inputRef.current && inputRef.current.focus(), 10);
  };

  return (
    <div className="today-card" ref={ref} data-drop={key}>
      <div className="today-card-head">
        <div className="today-label-row">
          <span className="today-label">Today</span>
          <span className="today-date-pill">{DAYS_FULL[today.getDay()].slice(0, 3)} · {today.getDate()} {MONTHS[today.getMonth()].slice(0, 3)}</span>
        </div>
        {total > 0 && (
          <div className="today-progress-row">
            <div className="progress-bar"><div className="progress-fill" style={{ width: pct + "%" }} /></div>
            <div className="today-progress-text">{done}/{total}</div>
          </div>
        )}
      </div>
      <div className="today-list">
        {total === 0 && (
          <div className="today-empty">
            <span className="today-empty-em">a clear slate</span>
            <span className="today-empty-sub">capture something below ↓</span>
          </div>
        )}
        {list.map(t => <TodayRow key={t.id} t={t} dayKey={key} {...{ toggleTask, deleteTask, quickMove, beginDrag, draggingId, editingId, startEdit, cancelEdit, editTask }} />)}
      </div>
      <div className="today-add">
        <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="add to today…" />
        <button onClick={submit} disabled={!draft.trim()}>+</button>
      </div>
    </div>
  );
}

function TodayRow({ t, dayKey, toggleTask, deleteTask, quickMove, beginDrag, draggingId, editingId, startEdit, cancelEdit, editTask }) {
  const rowId = useId();
  const editing = editingId === rowId;
  const lp = useLongPress(() => startEdit(rowId));
  return (
    <div
      className={`today-row p-${t.priority} ${t.done ? "done" : ""} ${draggingId === t.id ? "dragging" : ""} ${t._new ? "entering" : ""} ${editing ? "editing" : ""}`}
      onMouseDown={(e) => { if (editing || e.target.closest(".tickbox, button, .editable-input")) return; beginDrag(e, t, dayKey, () => {}); }}
      onTouchStart={(e) => { if (editing || e.target.closest(".tickbox, button, .editable-input")) return; lp.onTouchStart(e); beginDrag(e, t, dayKey, () => {}); }}
      onTouchMove={lp.onTouchMove}
      onTouchEnd={lp.onTouchEnd}
      onTouchCancel={lp.onTouchCancel}
      onDoubleClick={(e) => { if (e.target.closest(".tickbox, button")) return; startEdit(rowId); }}
    >
      <Tickbox checked={t.done} onChange={() => toggleTask(dayKey, t.id)} />
      <div className="today-text">
        <EditableText
          text={t.text} editing={editing}
          onSave={(v) => { editTask(dayKey, t.id, v); cancelEdit(); }}
          onCancel={cancelEdit}
          className="today-task-label"
        />
        {!editing && (t.priority !== "low" || t.repeat !== "none") && (
          <div className="today-task-meta">
            {t.priority !== "low" && <span className={`tag p-${t.priority}`}>{t.priority}</span>}
            {t.repeat !== "none" && <span className="tag">↻ {t.repeat}</span>}
          </div>
        )}
      </div>
      <div className="today-row-acts">
        <button onClick={() => quickMove(t, dayKey, 1)} title="Tomorrow">+1d</button>
        <button className="danger" onClick={() => deleteTask(dayKey, t.id)}>×</button>
      </div>
    </div>
  );
}

// ─── MonthView ─────────────────────────────────────────────
function MonthView({ cells, cursor, today, todos, openDayPanel, beginDrag, draggingId, toggleTask, addTask, heatmap }) {
  let maxPending = 1;
  if (heatmap) {
    cells.forEach(d => {
      const p = (todos[dateKey(d)] || []).filter(t => !t.done).length;
      if (p > maxPending) maxPending = p;
    });
  }
  return (
    <>
      <div className="weekday-row">{DAYS.map(d => <span key={d}>{d}</span>)}</div>
      <div className={`month-grid ${heatmap ? "heatmap" : ""}`}>
        {cells.map((d, i) => {
          const key = dateKey(d);
          const list = todos[key] || [];
          const pending = list.filter(t => !t.done);
          const heatLevel = heatmap && pending.length > 0 ? Math.min(5, Math.ceil((pending.length / maxPending) * 5)) : 0;
          return (
            <DayCell key={i}
              dateKey={key} date={d}
              muted={d.getMonth() !== cursor.getMonth()}
              isToday={sameDay(d, today)}
              weekend={d.getDay() === 0 || d.getDay() === 6}
              list={list}
              visible={U.sortTasks(list).slice(0, 3)}
              pending={pending.length}
              completed={list.length > 0 && pending.length === 0}
              onOpen={() => openDayPanel(key)}
              beginDrag={beginDrag} draggingId={draggingId}
              toggleTask={toggleTask} addTask={addTask}
              heatmap={heatmap} heatLevel={heatLevel}
            />
          );
        })}
      </div>
    </>
  );
}

function DayCell({ dateKey: key, date, muted, isToday, weekend, list, visible, pending, completed, onOpen, beginDrag, draggingId, toggleTask, addTask, heatmap, heatLevel }) {
  const ref = useRef(null);
  const inputRef = useRef(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const over = () => el.classList.add("drag-over");
    const leave = () => el.classList.remove("drag-over");
    el.addEventListener("mouseover", over);
    el.addEventListener("mouseleave", leave);
    return () => { el.removeEventListener("mouseover", over); el.removeEventListener("mouseleave", leave); };
  }, []);
  useEffect(() => { if (adding && inputRef.current) inputRef.current.focus(); }, [adding]);

  const startAdd = (e) => { e.stopPropagation(); setAdding(true); };
  const submitAdd = () => {
    if (draft.trim()) { addTask(key, draft); setDraft(""); } else setAdding(false);
  };

  return (
    <div ref={ref}
      className={`day ${muted ? "muted" : ""} ${isToday ? "today" : ""} ${weekend ? "weekend" : ""} ${completed ? "completed" : ""} ${heatmap ? "heat" : ""} ${heatLevel ? "heat-" + heatLevel : ""}`}
      onClick={() => { if (!adding) onOpen(); }} data-drop={key}>
      <div className="day-num-wrap">
        <span className="day-num">{date.getDate()}</span>
        <span className="day-num-right">
          {completed && <span className="day-stamp" title="All done!">✦</span>}
          {!completed && list.length > 0 && <span className="day-dot">{pending}</span>}
          {!completed && (
            <button className="day-add" onClick={startAdd} onMouseDown={e => e.stopPropagation()} aria-label="Add task">
              <Icon.Plus />
            </button>
          )}
        </span>
      </div>
      <div className="day-tasks">
        {visible.map(t => (
          <div key={t.id}
            className={`task-chip p-${t.priority} ${t.done ? "done" : ""} ${t.repeat !== "none" ? "recur" : ""} ${draggingId === t.id ? "dragging" : ""}`}
            onMouseDown={e => { e.stopPropagation(); beginDrag(e, t, key, () => toggleTask(key, t.id)); }}
            onTouchStart={e => { e.stopPropagation(); beginDrag(e, t, key, () => toggleTask(key, t.id)); }}
            onClick={e => e.stopPropagation()} title={t.text}>
            {t.done && <span className="chip-check">✓</span>}
            <span>{t.text}</span>
          </div>
        ))}
        {list.length > 3 && <div className="day-more">+{list.length - 3} more</div>}
        {adding && (
          <input ref={inputRef} className="day-quickadd" value={draft} placeholder="task…"
            onChange={e => setDraft(e.target.value)}
            onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
            onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") submitAdd(); else if (e.key === "Escape") { setAdding(false); setDraft(""); } }}
            onBlur={() => { setAdding(false); setDraft(""); }} />
        )}
      </div>
    </div>
  );
}

// ─── WeekView ──────────────────────────────────────────────
function WeekView({ cursor, today, todos, toggleTask, openDayPanel, beginDrag, draggingId, editingId, startEdit, cancelEdit, editTask }) {
  const start = U.startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  return (
    <div className="week-grid">
      {days.map(d => {
        const key = dateKey(d);
        return (
          <WeekCol key={key} d={d} dKey={key} list={todos[key] || []} isToday={sameDay(d, today)}
            toggleTask={toggleTask} openDayPanel={openDayPanel} beginDrag={beginDrag} draggingId={draggingId}
            editingId={editingId} startEdit={startEdit} cancelEdit={cancelEdit} editTask={editTask} />
        );
      })}
    </div>
  );
}

function WeekCol({ d, dKey, list, isToday, toggleTask, openDayPanel, beginDrag, draggingId, editingId, startEdit, cancelEdit, editTask }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const over = () => el.classList.add("drag-over");
    const leave = () => el.classList.remove("drag-over");
    el.addEventListener("mouseover", over);
    el.addEventListener("mouseleave", leave);
    return () => { el.removeEventListener("mouseover", over); el.removeEventListener("mouseleave", leave); };
  }, []);
  return (
    <div ref={ref} className={`week-col ${isToday ? "today" : ""}`} data-drop={dKey}>
      <div className="week-col-head">
        <div>
          <div className="week-col-day">{DAYS[d.getDay()]}</div>
          <div className="week-col-num">{d.getDate()}</div>
        </div>
        {list.length > 0 && <div className="day-dot">{list.filter(t => !t.done).length} left</div>}
      </div>
      {list.map(t => <WeekTaskRow key={t.id} t={t} dKey={dKey} {...{ toggleTask, beginDrag, draggingId, editingId, startEdit, cancelEdit, editTask }} />)}
      <button className="week-add" onClick={() => openDayPanel(dKey)}>+ Add to {DAYS[d.getDay()]}</button>
    </div>
  );
}

function WeekTaskRow({ t, dKey, toggleTask, beginDrag, draggingId, editingId, startEdit, cancelEdit, editTask }) {
  const rowId = useId();
  const editing = editingId === rowId;
  const lp = useLongPress(() => startEdit(rowId));
  return (
    <div
      className={`week-task ${t.done ? "done" : ""} ${draggingId === t.id ? "dragging" : ""} ${editing ? "editing" : ""}`}
      onMouseDown={(e) => { if (editing || e.target.closest(".tickbox, .editable-input")) return; beginDrag(e, t, dKey); }}
      onTouchStart={(e) => { if (editing || e.target.closest(".tickbox, .editable-input")) return; lp.onTouchStart(e); beginDrag(e, t, dKey); }}
      onTouchMove={lp.onTouchMove}
      onTouchEnd={lp.onTouchEnd}
      onTouchCancel={lp.onTouchCancel}
      onDoubleClick={(e) => { if (e.target.closest(".tickbox")) return; startEdit(rowId); }}
    >
      <Tickbox checked={t.done} onChange={() => toggleTask(dKey, t.id)} />
      <div style={{ flex: 1 }}>
        <EditableText
          text={t.text} editing={editing}
          onSave={(v) => { editTask(dKey, t.id, v); cancelEdit(); }}
          onCancel={cancelEdit}
          className="week-task-label"
        />
        {!editing && (
          <div className="week-task-meta">
            <span style={{ color: t.priority === "high" ? "var(--danger)" : t.priority === "medium" ? "var(--warn)" : "var(--ink-4)" }}>{t.priority}</span>
            {t.repeat !== "none" && <span>· {t.repeat}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── InboxView ─────────────────────────────────────────────
function InboxView({ inbox, addToInbox, toggleInbox, deleteInbox, beginDrag, draggingId, editingId, startEdit, cancelEdit, editInbox }) {
  const [text, setText] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const over = () => el.classList.add("drag-over");
    const leave = () => el.classList.remove("drag-over");
    el.addEventListener("mouseover", over);
    el.addEventListener("mouseleave", leave);
    return () => { el.removeEventListener("mouseover", over); el.removeEventListener("mouseleave", leave); };
  }, []);
  return (
    <div className="inbox-view" ref={ref} data-drop="__inbox">
      <h1 className="inbox-title">Inbox</h1>
      <div className="inbox-sub">Loose tasks · drag onto a day to schedule</div>
      <div className="inbox-add">
        <input placeholder="Capture a thought…" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { addToInbox(text); setText(""); } }} />
        <button onClick={() => { addToInbox(text); setText(""); }}>Add</button>
      </div>
      <div className="inbox-list">
        {inbox.map(t => <InboxItemRow key={t.id} t={t} {...{ toggleInbox, deleteInbox, beginDrag, draggingId, editingId, startEdit, cancelEdit, editInbox }} />)}
        {inbox.length === 0 && (
          <div className="empty">
            <div className="empty-illust">All caught up.</div>
            <div className="empty-sub">— nothing in the inbox —</div>
          </div>
        )}
      </div>
    </div>
  );
}

function InboxItemRow({ t, toggleInbox, deleteInbox, beginDrag, draggingId, editingId, startEdit, cancelEdit, editInbox }) {
  const rowId = useId();
  const editing = editingId === rowId;
  const lp = useLongPress(() => startEdit(rowId));
  return (
    <div
      className={`inbox-item ${t.done ? "done" : ""} ${draggingId === t.id ? "dragging" : ""} ${editing ? "editing" : ""}`}
      onMouseDown={(e) => { if (editing || e.target.closest(".tickbox, button, .editable-input")) return; beginDrag(e, t, "__inbox"); }}
      onTouchStart={(e) => { if (editing || e.target.closest(".tickbox, button, .editable-input")) return; lp.onTouchStart(e); beginDrag(e, t, "__inbox"); }}
      onTouchMove={lp.onTouchMove}
      onTouchEnd={lp.onTouchEnd}
      onTouchCancel={lp.onTouchCancel}
      onDoubleClick={(e) => { if (e.target.closest(".tickbox, button")) return; startEdit(rowId); }}
    >
      <Tickbox checked={t.done} onChange={() => toggleInbox(t.id)} />
      <EditableText
        text={t.text} editing={editing}
        onSave={(v) => { editInbox(t.id, v); cancelEdit(); }}
        onCancel={cancelEdit}
        className="inbox-item-text"
      />
      <button className="danger small" onClick={() => deleteInbox(t.id)} title="Delete">×</button>
      <span className="inbox-grab">⠿ drag</span>
    </div>
  );
}

// ─── DayPanel ────────────────────────────────────────────
function DayPanel({ dayKey, todos, addTask, toggleTask, deleteTask, quickMove, close, navDay, draftPriority, setDraftPriority, draftRepeat, setDraftRepeat, draftText, setDraftText, inputFocused, setInputFocused, inputRef, beginDrag, draggingId, today, editingId, startEdit, cancelEdit, editTask }) {
  const open = !!dayKey;
  const date = dayKey ? parseKey(dayKey) : null;
  const rawList = (dayKey && todos[dayKey]) || [];
  const list = U.sortTasks(rawList);
  const done = list.filter(t => t.done).length;
  const total = list.length;
  const pct = total ? (done / total) * 100 : 0;

  const submit = () => {
    if (!draftText.trim()) return;
    addTask(dayKey, draftText, { priority: draftPriority, repeat: draftRepeat });
    setDraftText("");
    setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
  };

  return (
    <>
      <div className={`panel-overlay ${open ? "open" : ""}`} onClick={close} />
      <div className={`panel ${open ? "open" : ""}`}>
        {date && (
          <>
            <div className="panel-head">
              <div className="panel-head-top">
                <div>
                  <div className="panel-date-day">
                    {DAYS_FULL[date.getDay()]} · {MONTHS[date.getMonth()]} {date.getFullYear()}
                    {sameDay(date, today) && <span style={{ marginLeft: 8, color: "var(--accent)" }}>· Today</span>}
                  </div>
                  <div className="panel-date">{date.getDate()} <span>{MONTHS[date.getMonth()].slice(0, 3)}</span></div>
                </div>
                <button className="panel-close" onClick={close} aria-label="Close"><Icon.Close /></button>
              </div>
              <div className="progress-row">
                <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                <div className="progress-text">{done} / {total}</div>
              </div>
            </div>
            <div className="panel-body">
              <div className={`add-task ${inputFocused ? "focused" : ""}`}>
                <div className="add-task-input">
                  <input ref={inputRef} type="text" placeholder="Add a task…" value={draftText}
                    onChange={e => setDraftText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") submit(); }}
                    onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} />
                  <button className="add-task-btn" onClick={submit} disabled={!draftText.trim()}>Add</button>
                </div>
                <div className="add-task-opts">
                  <span className="opt-label">Priority</span>
                  {["low", "medium", "high"].map(p => (
                    <button key={p} className={`opt-chip p-${p} ${draftPriority === p ? "active" : ""}`} onClick={() => setDraftPriority(p)}>
                      {p[0].toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                  <span className="opt-divider" />
                  <span className="opt-label">Repeat</span>
                  {[["none", "None"], ["daily", "Daily"], ["weekdays", "Weekdays"], ["weekly", "Weekly"]].map(([r, label]) => (
                    <button key={r} className={`opt-chip ${draftRepeat === r ? "active" : ""}`} onClick={() => setDraftRepeat(r)}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="task-list">
                {list.map(t => <DayTaskRow key={t.id} t={t} dayKey={dayKey} {...{ toggleTask, deleteTask, quickMove, beginDrag, draggingId, editingId, startEdit, cancelEdit, editTask }} />)}
                {list.length === 0 && (
                  <div className="empty">
                    <div className="empty-illust">A clear day.</div>
                    <div className="empty-sub">— nothing scheduled —</div>
                  </div>
                )}
              </div>
            </div>
            <div className="panel-foot">
              <div className="kb-hint"><kbd>Enter</kbd> add &middot; <kbd>Esc</kbd> close</div>
              <div className="nav-buttons">
                <button className="ghost-btn" onClick={() => navDay(-1)}>← Prev</button>
                <button className="ghost-btn" onClick={() => navDay(1)}>Next →</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function DayTaskRow({ t, dayKey, toggleTask, deleteTask, quickMove, beginDrag, draggingId, editingId, startEdit, cancelEdit, editTask }) {
  const rowId = useId();
  const editing = editingId === rowId;
  const lp = useLongPress(() => startEdit(rowId));
  return (
    <div
      className={`task-row ${t.done ? "done" : ""} ${t._new ? "entering" : ""} ${draggingId === t.id ? "dragging" : ""} ${editing ? "editing" : ""}`}
      onMouseDown={(e) => { if (editing || e.target.closest(".tickbox, .row-act, .task-label, .editable-input")) return; beginDrag(e, t, dayKey); }}
      onTouchStart={(e) => { if (editing || e.target.closest(".tickbox, .row-act, .task-label, .editable-input")) return; lp.onTouchStart(e); beginDrag(e, t, dayKey); }}
      onTouchMove={lp.onTouchMove}
      onTouchEnd={lp.onTouchEnd}
      onTouchCancel={lp.onTouchCancel}
      onDoubleClick={(e) => { if (e.target.closest(".tickbox, .row-act, button")) return; startEdit(rowId); }}
    >
      <Tickbox checked={t.done} onChange={() => toggleTask(dayKey, t.id)} />
      <div className="task-body">
        <EditableText
          text={t.text} editing={editing}
          onSave={(v) => { editTask(dayKey, t.id, v); cancelEdit(); }}
          onCancel={cancelEdit}
          className="task-label"
        />
        {!editing && (
          <div className="task-meta">
            <span className={`tag p-${t.priority}`}>{t.priority}</span>
            {t.repeat !== "none" && <span className="tag">↻ {t.repeat}</span>}
          </div>
        )}
      </div>
      <div className="row-actions">
        <button className="row-act" onClick={() => quickMove(t, dayKey, 1)}>+1d</button>
        <button className="row-act" onClick={() => quickMove(t, dayKey, 7)}>+7d</button>
        <button className="row-act" onClick={() => quickMove(t, dayKey, "__inbox")}>↩</button>
        <button className="row-act danger" onClick={() => deleteTask(dayKey, t.id)}><Icon.Trash /></button>
      </div>
    </div>
  );
}

// ─── FocusOverlay ──────────────────────────────────────────
function FocusOverlay({ open, close, today, todos, toggleTask, editingId, startEdit, cancelEdit, editTask }) {
  const key = dateKey(today);
  const list = todos[key] || [];
  const done = list.filter(t => t.done).length;
  const total = list.length;
  const pct = total ? (done / total) * 100 : 0;
  return (
    <div className={`focus ${open ? "open" : ""}`}>
      <div className="focus-head">
        <div className="focus-eye">
          <div className="focus-day-num">{today.getDate()}</div>
          <div className="focus-day-meta">
            <div className="focus-day-name">{DAYS_FULL[today.getDay()]} · {MONTHS[today.getMonth()]}</div>
            <div className="focus-quote">{quoteFor(today)}</div>
          </div>
        </div>
        <button className="ghost-btn" onClick={close}>← Back to calendar</button>
      </div>
      <div className="focus-body">
        <div className="focus-progress">
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
          <div className="progress-text">{done} of {total} done</div>
        </div>
        {list.map(t => <FocusTaskRow key={t.id} t={t} dayKey={key} {...{ toggleTask, editingId, startEdit, cancelEdit, editTask }} />)}
        {list.length === 0 && (
          <div className="empty" style={{ paddingTop: 80 }}>
            <div className="empty-illust">Nothing planned for today.</div>
            <div className="empty-sub">— add tasks from the month view —</div>
          </div>
        )}
      </div>
    </div>
  );
}

function FocusTaskRow({ t, dayKey, toggleTask, editingId, startEdit, cancelEdit, editTask }) {
  const rowId = useId();
  const editing = editingId === rowId;
  const lp = useLongPress(() => startEdit(rowId));
  return (
    <div
      className={`focus-task ${t.done ? "done" : ""} ${editing ? "editing" : ""}`}
      onTouchStart={(e) => { if (editing || e.target.closest(".tickbox, .editable-input")) return; lp.onTouchStart(e); }}
      onTouchMove={lp.onTouchMove}
      onTouchEnd={lp.onTouchEnd}
      onTouchCancel={lp.onTouchCancel}
      onDoubleClick={(e) => { if (e.target.closest(".tickbox")) return; startEdit(rowId); }}
    >
      <Tickbox checked={t.done} onChange={() => toggleTask(dayKey, t.id)} size={22} />
      <div style={{ flex: 1 }}>
        <EditableText
          text={t.text} editing={editing}
          onSave={(v) => { editTask(dayKey, t.id, v); cancelEdit(); }}
          onCancel={cancelEdit}
          className="focus-task-label"
        />
        {!editing && (
          <div className="focus-task-meta">{t.priority}{t.repeat !== "none" ? ` · ${t.repeat}` : ""}</div>
        )}
      </div>
    </div>
  );
}

// ─── PinWidgetModal ────────────────────────────────────────
function PinWidgetModal({ open, close }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);
  if (!open) return null;
  const url = window.location.origin + window.location.pathname + "?widget=1";
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const preview = () => {
    window.open(url, "almanac-widget-preview", "width=380,height=620,resizable=yes,scrollbars=no");
  };
  return (
    <div className="pin-overlay open" onClick={close}>
      <div className="pin-card" onClick={(e) => e.stopPropagation()}>
        <button className="pin-close" onClick={close} aria-label="Close"><Icon.Close /></button>
        <div className="pin-eyebrow">◱ &nbsp; Pin as a widget</div>
        <h2 className="pin-title">Today, always a click away.</h2>
        <p className="pin-sub">Install Almanac as a small Mac app showing just today's tasks. Live-synced with the full app and your other devices.</p>

        <div className="pin-url-row">
          <code className="pin-url">{url}</code>
          <button className="pin-copy" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
        </div>

        <div className="pin-step">
          <div className="pin-step-num">1</div>
          <div className="pin-step-body">
            <div className="pin-step-title">Open that URL in <b>Safari</b> or <b>Chrome</b></div>
          </div>
        </div>

        <div className="pin-step">
          <div className="pin-step-num">2</div>
          <div className="pin-step-body">
            <div className="pin-step-title">Install it</div>
            <ul className="pin-step-list">
              <li><b>Safari:</b> <code>File → Add to Dock</code></li>
              <li><b>Chrome:</b> click the <span className="pin-key">install icon</span> in the address bar, or <code>⋮ → Cast, save, and share → Install Almanac</code></li>
            </ul>
          </div>
        </div>

        <div className="pin-step">
          <div className="pin-step-num">3</div>
          <div className="pin-step-body">
            <div className="pin-step-title">Park it where you like</div>
            <p className="pin-step-note">Resize the new window to roughly <b>380 × 620</b> and drag it to a corner of the desktop. macOS remembers the spot between launches.</p>
            <p className="pin-step-note">In Chrome, also <b>right-click the dock icon → Options → Keep in Dock</b> so it stays there after you quit.</p>
          </div>
        </div>

        <div className="pin-foot">
          <button className="pin-preview-btn" onClick={preview}>Preview at widget size →</button>
          <span className="pin-foot-note">Works offline after first online launch.</span>
        </div>
      </div>
    </div>
  );
}

// ─── Mount ───────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);

const wake = () => { Sounds.resume(); window.removeEventListener("pointerdown", wake); };
window.addEventListener("pointerdown", wake);
