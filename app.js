'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const TYPES = ['homework', 'test', 'quiz', 'project', 'study', 'other'];
const TYPE_LABEL = { homework: 'Homework', test: 'Test', quiz: 'Quiz', project: 'Project', study: 'Study session', other: 'Other' };
const TYPE_ORDER = { test: 0, quiz: 1, project: 2, homework: 3, study: 4, other: 5 };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const GRADE_POINTS = { A: 5, B: 4, C: 3, D: 2, E: 1 };
const GRADE_OPTIONS = ['A+', 'A', 'B', 'C', 'D', 'E'];   // only A has a plus
const typeLabel = ty => t(TYPE_LABEL[ty] || ty);
const AUTO_COLORS = ['#e5484d', '#f0932b', '#2fa66a', '#0ea5e9', '#8e4ec6', '#d946ef', '#14b8a6', '#f59e0b', '#6366f1', '#84cc16'];

const state = {
  items: [],
  grades: [],
  recurring: [],
  settings: null,
  view: 'list',
  subjectView: null,          // subject page open for this subject
  calMode: 'month',
  calMonth: startOfMonth(new Date()),
  weekStart: mondayOf(todayStr()),
  selectedDay: todayStr(),
  filter: { search: '', subject: '' },
  editingId: null,
  editingRec: null,
  undo: null,
  offline: false,
  trash: [],                  // recently deleted items (server keeps them 30 days)
  term: null,                 // stats/grades scope: null = current term, 'all', or a term's from-date
};

// ---------- date helpers ----------
function pad(n) { return String(n).padStart(2, '0'); }
function dateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayStr() { return dateStr(new Date()); }
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return dateStr(d); }
function dayDiff(from, to) {
  const a = parseDate(from), b = parseDate(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}
function dowIndex(s) { return (parseDate(s).getDay() + 6) % 7; } // Monday = 0
function mondayOf(s) { return addDays(s, -dowIndex(s)); }
function nextWeekday(dow) { // 1 = Monday … 7 = Sunday; always strictly in the future
  const d = new Date();
  const cur = d.getDay() === 0 ? 7 : d.getDay();
  let delta = (dow - cur + 7) % 7; if (delta === 0) delta = 7;
  d.setDate(d.getDate() + delta);
  return dateStr(d);
}
function dueLabel(s) {
  const d = dayDiff(todayStr(), s);
  if (d === 0) return t('Today');
  if (d === 1) return t('Tomorrow');
  if (d === -1) return t('Yesterday');
  if (d < 0) return t('{n} days ago', { n: -d });
  const dt = parseDate(s);
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  if (dt.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return cap(fmtDate(dt, opts));
}
function longDate(s) { return cap(fmtDate(parseDate(s), { weekday: 'long', day: 'numeric', month: 'long' })); }
function shortDate(s) { return fmtDate(parseDate(s), { day: 'numeric', month: 'short' }); }
function isoDateOf(ts) { return ts ? dateStr(new Date(ts)) : null; }
function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return fmtClock(h, m);
}

// ---------- local cache & offline outbox ----------
const LS = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } },
};
let outbox = LS.get('hw_outbox', []);   // [{ op: 'create'|'update'|'delete', id?, tempId?, fields? }]
let nextTempId = Math.min(-1, ...outbox.filter(o => o.tempId).map(o => o.tempId)) - 1;
function saveOutbox() { LS.set('hw_outbox', outbox); renderOfflineBadge(); }
function tempItem(op) {
  return { id: op.tempId, title: '', subject: '', type: 'homework', notes: '', done: false, starred: false, due_time: null, parent_id: null, recurring_id: null, subtasks: [], pending: true, ...op.fields };
}
function pendingItems() { return outbox.filter(o => o.op === 'create').map(tempItem); }
function renderOfflineBadge() {
  const b = $('#offline');
  const n = outbox.length;
  if (!state.offline && !n) { b.hidden = true; return; }
  b.hidden = false;
  b.textContent = state.offline ? (n ? t('Offline · {n} waiting to sync', { n }) : t('Offline')) : t('Syncing {n}…', { n });
}

// ---------- api ----------
class OfflineError extends Error { constructor() { super(t('You are offline')); this.offline = true; } }
function goLogin() { setAuthToken(''); location.replace(loginUrl()); }
async function api(path, opts = {}) {
  let res;
  try {
    res = await apiFetch(path, {
      headers: apiHeaders({ 'Content-Type': 'application/json' }),
      cache: 'no-store',
      ...opts,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    throw new OfflineError();
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { goLogin(); throw new Error(t('Please sign in')); }
  if (!res.ok) throw new Error(data.error || t('Request failed ({status})', { status: res.status }));
  return data;
}
function setOnline(on) {
  $('#conn').classList.toggle('on', on);
  if (state.offline === !on) return;
  state.offline = !on;
  renderOfflineBadge();
}

async function loadItems() {
  try {
    const items = await api('/api/assignments');
    state.items = items.concat(pendingItems());
    LS.set('hw_items', items);
    setOnline(true);
    render();
  } catch (err) {
    if (err.offline) {
      setOnline(false);
      if (!state.items.length) { state.items = LS.get('hw_items', []).concat(pendingItems()); render(); }
    } else toast(t('Could not load: {err}', { err: err.message }));
  }
}
async function loadGrades() {
  try { state.grades = await api('/api/grades'); LS.set('hw_grades', state.grades); render(); }
  catch (err) { if (err.offline) { state.grades = LS.get('hw_grades', []); } else toast(t('Could not load grades: {err}', { err: err.message })); }
}
async function loadRecurring() {
  try { state.recurring = await api('/api/recurring'); renderRecurringList(); }
  catch { /* ignore */ }
}
async function loadTrash() {
  try { state.trash = await api('/api/trash'); if (state.view === 'list') renderList(); }
  catch { /* ignore */ }
}

// Mutations: applied on the server when online; queued (and shown immediately) when offline.
async function createItem(fields) {
  try {
    const r = await api('/api/assignments', { method: 'POST', body: fields });
    loadItems();
    return r;
  } catch (err) {
    if (!err.offline) throw err;
    const op = { op: 'create', tempId: nextTempId--, fields: { ...fields } };
    outbox.push(op); saveOutbox(); setOnline(false);
    state.items.push(tempItem(op)); render();
    toast(t('Saved on this device — will sync when online'));
    return tempItem(op);
  }
}
async function updateItem(id, fields) {
  try {
    const r = await api(`/api/assignments/${id}`, { method: 'PATCH', body: fields });
    loadItems();
    return r;
  } catch (err) {
    if (!err.offline) throw err;
    setOnline(false);
    if (id < 0) { const op = outbox.find(o => o.tempId === id); if (op) Object.assign(op.fields, fields); }
    else outbox.push({ op: 'update', id, fields: { ...fields } });
    saveOutbox();
    const it = state.items.find(i => i.id === id);
    if (it) { Object.assign(it, fields); if (fields.done !== undefined) it.completed_at = fields.done ? new Date().toISOString() : null; }
    render();
    return it;
  }
}
async function deleteItem(id) {
  try {
    const r = await api(`/api/assignments/${id}`, { method: 'DELETE' });
    loadItems();
    return r;
  } catch (err) {
    if (!err.offline) throw err;
    setOnline(false);
    if (id < 0) outbox = outbox.filter(o => o.tempId !== id);
    else outbox.push({ op: 'delete', id });
    saveOutbox();
    state.items = state.items.filter(i => i.id !== id);
    render();
    return { ok: true };
  }
}
let flushing = false;
async function flushOutbox() {
  if (flushing || !outbox.length) return;
  flushing = true;
  try {
    while (outbox.length) {
      const op = outbox[0];
      try {
        if (op.op === 'create') {
          const created = await api('/api/assignments', { method: 'POST', body: op.fields });
          for (const o of outbox) if (o.id === op.tempId) o.id = created.id;   // later ops on the same temp item
        } else if (op.op === 'update') {
          if (op.id > 0) await api(`/api/assignments/${op.id}`, { method: 'PATCH', body: op.fields });
        } else if (op.op === 'delete') {
          if (op.id > 0) await api(`/api/assignments/${op.id}`, { method: 'DELETE' });
        }
        outbox.shift(); saveOutbox();
      } catch (err) {
        if (err.offline) { setOnline(false); return; }
        outbox.shift(); saveOutbox();
        toast(t('Could not sync one change: {err}', { err: err.message }));
      }
    }
    toast(t('Synced'));
  } finally {
    flushing = false;
    renderOfflineBadge();
    loadItems();
  }
}
window.addEventListener('online', () => { setOnline(true); flushOutbox(); });
setInterval(() => { if (outbox.length && !state.offline) flushOutbox(); }, 30000);

// ---------- toast & undo ----------
let toastTimer;
function toast(msg, undoFn) {
  const t = $('#toast');
  $('#toast-text').textContent = msg;
  const u = $('#toast-undo');
  state.undo = undoFn || null;
  u.hidden = !undoFn;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; state.undo = null; }, undoFn ? 6000 : 2600);
}
$('#toast-undo').addEventListener('click', async () => {
  const fn = state.undo; state.undo = null; $('#toast').hidden = true;
  if (!fn) return;
  try { await fn(); toast(t('Undone')); } catch (err) { toast(err.message); }
});

// ---------- settings-derived helpers ----------
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// the subject list from Settings, plus anything in the timetable
function subjectOptions() {
  const list = [...(state.settings?.subjects || [])];
  const seen = new Set(list.map(s => s.toLowerCase()));
  const tt = state.settings?.timetable;
  if (tt) for (const w of weeksInUse()) for (const d of DAYS) for (const c of parseDay(tt[w][d])) {
    if (!seen.has(c.subject.toLowerCase())) { seen.add(c.subject.toLowerCase()); list.push(c.subject); }
  }
  return list.sort((a, b) => a.localeCompare(b));
}
const NEW_SUBJECT = '__new__';
// fill a <select class="subject-select">: blank, the subjects, the item's own subject if it isn't listed any more, "+ New subject…"
function fillSubjectSelect(sel, current = '', blank = t('No subject')) {
  const list = subjectOptions();
  const cur = (current === NEW_SUBJECT ? sel.dataset.prev || '' : current || '').trim();
  const match = cur && list.find(s => s.toLowerCase() === cur.toLowerCase());
  if (cur && !match) list.push(cur);
  const key = JSON.stringify([blank, list]);
  if (sel.dataset.key !== key) {
    sel.innerHTML = `<option value="">${esc(blank)}</option>${list.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}<option value="${NEW_SUBJECT}">${t('+ New subject…')}</option>`;
    sel.dataset.key = key;
  }
  sel.value = match || cur;
  sel.dataset.prev = sel.value;
}
function subjectSelectHtml(id, current = '', blank = t('Subject'), attrs = '') {
  const list = subjectOptions();
  if (current && !list.some(s => s === current)) list.push(current);
  return `<select id="${id}" class="subject-select" aria-label="${esc(blank)}" ${attrs}><option value="">${esc(blank)}</option>${list.map(s => `<option value="${esc(s)}"${s === current ? ' selected' : ''}>${esc(s)}</option>`).join('')}<option value="${NEW_SUBJECT}">${t('+ New subject…')}</option></select>`;
}
const subjectOf = sel => (sel.value === NEW_SUBJECT ? '' : sel.value.trim());
// add to the list in Settings (saved right away); returns the name as listed, or null if it could not be saved
async function addSubject(name) {
  const list = state.settings?.subjects || [];
  const hit = list.find(s => s.toLowerCase() === name.toLowerCase());
  if (hit) return hit;
  return (await saveSettings({ subjects: [...list, name] })) ? name : null;
}
// "+ New subject…" chosen in any subject dropdown
document.addEventListener('change', async e => {
  const sel = e.target;
  if (!sel.matches('select.subject-select')) return;
  if (sel.value !== NEW_SUBJECT) { sel.dataset.prev = sel.value; return; }
  const blank = sel.options[0]?.textContent, prev = sel.dataset.prev || '';
  const name = (prompt(t('Name of the new subject:')) || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const added = name ? await addSubject(name) : null;
  const live = sel.isConnected ? sel : document.getElementById(sel.id);   // the panel may have been rebuilt meanwhile
  if (!live) return;
  fillSubjectSelect(live, added || prev, blank);
  live.dispatchEvent(new Event('change', { bubbles: true }));
});
// what is typed in a small inline form, so a re-render (live update, settings save) doesn't wipe it
function draftOf(ids) { const o = {}; for (const id of ids) { const el = document.getElementById(id); if (el) o[id] = el.value; } return o; }
function restoreDraft(o) { for (const [id, v] of Object.entries(o)) { const el = document.getElementById(id); if (el && v) el.value = v; } }
function colorFor(subject) {
  if (!subject) return '';
  const sc = state.settings?.subject_colors || {};
  if (sc[subject]) return sc[subject];
  let h = 0; for (const ch of subject) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AUTO_COLORS[h % AUTO_COLORS.length];
}
function applyTheme() {
  const s = state.settings; if (!s) return;
  const root = document.documentElement;
  if (s.theme === 'light' || s.theme === 'dark') root.dataset.theme = s.theme; else delete root.dataset.theme;
  root.style.setProperty('--accent', s.accent || '#4f6df5');
  $('meta[name=theme-color]').content = s.accent || '#4f6df5';
}

// ----- holidays -----
function holidayOn(s) {
  return (state.settings?.holidays || []).find(h => s >= h.from && s <= h.to) || null;
}
function weekIsHoliday(monday) {
  for (let i = 0; i < 5; i++) if (!holidayOn(addDays(monday, i))) return false;
  return true;
}

// ----- timetable -----
function parseDay(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(\d{1,2}):(\d{2})\s+(.+)$/);
    return m ? { time: `${pad(+m[1])}:${m[2]}`, subject: m[3].trim() } : { time: null, subject: l };
  });
}
// 'ab' = the timetable alternates between week A and week B; 'single' = same every week
function abWeeks() { return state.settings?.week_mode !== 'single'; }
function weeksInUse() { return abWeeks() ? ['A', 'B'] : ['A']; }
function hasTimetable() {
  const tt = state.settings?.timetable; if (!tt) return false;
  return weeksInUse().some(w => DAYS.some(d => tt[w][d].trim()));
}
// Week letter, alternating each school week; weeks that are entirely holiday don't count.
function weekLetter(s) {
  const a = state.settings?.week_anchor;
  if (!abWeeks() || !a || !a.date) return 'A';
  const start = mondayOf(a.date), target = mondayOf(s);
  let letter = a.letter;
  const step = dayDiff(start, target) >= 0 ? 7 : -7;
  let guard = 0;
  for (let m = start; m !== target && guard++ < 600; m = addDays(m, step)) {
    const crossed = step > 0 ? m : addDays(m, -7);
    if (!weekIsHoliday(crossed)) letter = letter === 'A' ? 'B' : 'A';
  }
  return letter;
}
function classesOn(s) {
  const tt = state.settings?.timetable; if (!tt || holidayOn(s)) return [];
  return parseDay(tt[weekLetter(s)][DAYS[dowIndex(s)]]);
}
const lessonMinutes = () => Number(state.settings?.lesson_minutes) || 45;
const startOfClass = c => { const [h, m] = c.time.split(':').map(Number); return h * 60 + m; };
// a lesson ends after lesson_minutes, or when the next one starts, whichever comes first
function classEnd(classes, idx) {
  const next = classes.slice(idx + 1).find(c => c.time);
  return Math.min(startOfClass(classes[idx]) + lessonMinutes(), next ? startOfClass(next) : Infinity);
}
function currentClassIndex(classes, now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  let idx = -1;
  classes.forEach((c, i) => { if (c.time && startOfClass(c) <= mins) idx = i; });
  if (idx >= 0 && mins >= classEnd(classes, idx)) return -1;
  return idx;
}
// School days: Monday-Friday minus holidays (a Saturday counts if the timetable has classes then).
function isSchoolDay(s) {
  if (holidayOn(s)) return false;
  return dowIndex(s) < 5 || (hasTimetable() && classesOn(s).length > 0);
}
function nextSchoolDay(from = todayStr(), n = 1) {   // the n-th school day after `from`
  let d = from, guard = 0;
  while (n > 0 && guard++ < 120) { d = addDays(d, 1); if (isSchoolDay(d)) n--; }
  return d;
}
function schoolDayOnOrAfter(s) {
  let d = s, guard = 0;
  while (!isSchoolDay(d) && guard++ < 120) d = addDays(d, 1);
  return d;
}
// "Today" / "Tomorrow" / "Monday" / "Mon 2 Nov". Albanian declines the weekday
// ("të hënën" = on Monday) except where it is a heading ("E hënë").
function dayName(s, { heading = false } = {}) {
  const d = dayDiff(todayStr(), s);
  if (d === 0) return t('Today');
  if (d === 1) return t('Tomorrow');
  if (d > 1 && d < 7 && LANG === 'sq' && !heading) return cap(SQ_DAYS_ON[parseDate(s).getDay()]);
  return d > 1 && d < 7 ? cap(fmtDate(parseDate(s), { weekday: 'long' })) : dueLabel(s);
}
function nextLesson(subject, from = todayStr()) {
  if (!subject || !hasTimetable()) return null;
  const want = subject.trim().toLowerCase();
  for (let i = 1; i <= 42; i++) {
    const d = addDays(from, i);
    if (classesOn(d).some(c => c.subject.toLowerCase() === want)) return d;
  }
  return null;
}

// ----- grades -----
// Two grading scales: letters (A+, A, B, C, D, E) or numbers 1-10 (10 is best).
function gradeScale() { return state.settings?.grade_scale === 'numbers' ? 'numbers' : 'letters'; }
function gradePoints(g) {
  if (!g) return null;
  if (gradeScale() === 'numbers') { const n = Number(String(g).replace(',', '.')); return Number.isFinite(n) ? n : null; }
  const base = GRADE_POINTS[g[0]]; if (base === undefined) return null;
  return base + (g[1] === '+' ? 0.33 : g[1] === '-' ? -0.33 : 0);
}
function pointsToLetter(p) {
  let best = GRADE_OPTIONS[0], bd = Infinity;
  for (const g of GRADE_OPTIONS) { const d = Math.abs(gradePoints(g) - p); if (d < bd) { bd = d; best = g; } }
  return best;
}
// an average, shown in the scale's own terms ("B+" or "7.8")
function formatAvg(p) { return gradeScale() === 'numbers' ? p.toFixed(1) : pointsToLetter(p); }
function gradeRange() { return gradeScale() === 'numbers' ? [1, 10] : [1, 5.33]; }
// the grade picker: a dropdown of letters, or a number box
function gradeFieldHtml(id, value = '', { empty = false, required = false } = {}) {
  if (gradeScale() === 'numbers') return `<input type="number" id="${id}" min="1" max="10" step="0.1" inputmode="decimal" placeholder="${empty ? t('Not graded yet') : t('e.g. 7.5')}" value="${esc(value)}"${required ? ' required' : ''}>`;
  return `<select id="${id}">${empty ? `<option value="">${t('Not graded yet')}</option>` : ''}${GRADE_OPTIONS.map(g => `<option${g === value ? ' selected' : ''}>${g}</option>`).join('')}</select>`;
}
function gradeForAssignment(id) { return state.grades.find(g => g.assignment_id === id); }

// ----- terms -----
function terms() { return state.settings?.terms || []; }
function currentTerm(s = todayStr()) { return terms().find(t => s >= t.from && s <= t.to) || null; }
// the term used to scope stats and grades (null = everything)
function selectedTerm() {
  if (!terms().length || state.term === 'all') return null;
  if (state.term) return terms().find(t => t.from === state.term) || null;
  return currentTerm();
}
function inTerm(dateStr) { const t = selectedTerm(); return !t || (dateStr >= t.from && dateStr <= t.to); }
function termLabel() { const term = selectedTerm(); return term ? term.name : t('all time'); }
function termChips() {
  if (!terms().length) return '';
  const sel = selectedTerm();
  return `<div class="chips term-chips">${terms().map(t => `<button type="button" data-term="${t.from}" class="${sel && sel.from === t.from ? 'active' : ''}">${esc(t.name)}</button>`).join('')}<button type="button" data-term="all" class="${sel ? '' : 'active'}">${t('All time')}</button></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('.term-chips button[data-term]'); if (!b) return;
  state.term = b.dataset.term;
  render();
});
function schoolDaysLeft(term) {
  let n = 0;
  for (let d = addDays(todayStr(), 1); d <= term.to; d = addDays(d, 1)) if (dowIndex(d) < 5 && !holidayOn(d)) n++;
  return n;
}

// ----- project steps with their own date, shown as rows of their own -----
function stepRows(items = state.items) {
  const out = [];
  for (const p of items) {
    if (p.type !== 'project' || p.done) continue;
    for (const st of p.subtasks || []) {
      if (!st.due_date || st.done) continue;
      out.push({ step: true, id: p.id, sid: st.id, title: st.title, subject: p.subject, type: 'project', due_date: st.due_date, due_time: null, starred: false, done: false, project: p });
    }
  }
  return out;
}
function stepHtml(st, { showDue = true } = {}) {
  const late = dayDiff(todayStr(), st.due_date) < 0;
  return `
    <div class="item type-project step" data-id="${st.id}" data-step="${st.sid}">
      <input type="checkbox" data-sub="${st.sid}" aria-label="${t('Mark step done')}">
      <div class="body">
        <div class="title">${esc(st.title)}</div>
        <div class="meta">
          ${st.subject ? subjectChip(st.subject) : ''}
          <span class="badge">${t('Step')}</span>
          <span class="for-parent" title="${esc(st.project.title)}">${t('of {project}', { project: esc(st.project.title) })}</span>
          ${showDue ? `<span class="due${late ? ' late' : ''}">${late ? t('Overdue · ') : ''}${dueLabel(st.due_date)}</span>` : ''}
        </div>
      </div>
      <div class="side"></div>
    </div>`;
}
const rowHtml = (x, opts) => (x.step ? stepHtml(x, opts) : itemHtml(x, opts));

// ---------- rendering ----------
function render() {
  renderSubjects();
  renderWeekBadge();
  renderTermBadge();
  renderNowBar();
  renderQuickAdd();
  renderExamStrip();
  renderFilter();
  renderList();
  renderCalendar();
  if (state.view === 'stats') renderStats();
  if (state.view === 'subject') renderSubjectPage();
  if (state.view === 'timetable') renderTimetableView();
  renderOfflineBadge();
}

function renderSubjects() {
  const sel = $('#qa-subject');
  fillSubjectSelect(sel, sel.value, t('Subject'));
}
function renderWeekBadge() {
  const b = $('#week-badge');
  const a = state.settings?.week_anchor;
  b.hidden = !(abWeeks() && a && a.date && hasTimetable());
  if (!b.hidden) { const h = holidayOn(todayStr()); b.textContent = h ? `🏖 ${h.name}` : t('Week {letter}', { letter: weekLetter(todayStr()) }); }
}

// "42 school days left · Autumn break in 5 days"
function renderTermBadge() {
  const b = $('#term-badge');
  const today = todayStr();
  const parts = [];
  const hol = holidayOn(today);
  if (hol) {
    parts.push(t('back {when}', { when: dueLabel(addDays(hol.to, 1)).toLowerCase() }));
  } else {
    const next = (state.settings?.holidays || []).filter(h => h.from > today).sort((a, b) => a.from.localeCompare(b.from))[0];
    if (next && dayDiff(today, next.from) <= 45) { const d = dayDiff(today, next.from); parts.push(t(d === 1 ? '{name} in 1 day' : '{name} in {n} days', { name: next.name, n: d })); }
    const cur = currentTerm();
    if (cur) { const n = schoolDaysLeft(cur); parts.push(t(n === 1 ? '1 school day left' : '{n} school days left', { n }) + (terms().length > 1 ? ` ${t('in {term}', { term: cur.name })}` : '')); }
  }
  b.hidden = !parts.length;
  b.textContent = parts.join(' · ');
  updateDayBar();
}
function updateDayBar() { $('#day-bar').hidden = $('#now-bar').hidden && $('#term-badge').hidden; }

// "Math · 23 min left · next Bio at 10:15" (needs times in the timetable)
function renderNowBar() {
  const el = $('#now-bar');
  const classes = hasTimetable() ? classesOn(todayStr()) : [];
  const timed = classes.filter(c => c.time);
  if (!timed.length) { el.hidden = true; updateDayBar(); return; }
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const startOf = startOfClass;
  const idx = currentClassIndex(classes, now);
  let html = '';
  if (idx >= 0) {
    const cur = classes[idx];
    const next = classes.slice(idx + 1).find(c => c.time);
    const end = classEnd(classes, idx);
    html = `<b style="--subj:${colorFor(cur.subject)}"><span class="dot"></span>${esc(cur.subject)}</b> · ${t('{n} min left', { n: end - mins })}${next ? ` · ${t('next {subject} at {time}', { subject: esc(next.subject), time: fmtTime(next.time) })}` : ` · ${t('last lesson')}`}`;
  } else {
    const next = timed.find(c => startOf(c) > mins);
    if (!next) { el.hidden = true; updateDayBar(); return; }
    const wait = startOf(next) - mins;
    html = `${t('Next:')} <b style="--subj:${colorFor(next.subject)}"><span class="dot"></span>${esc(next.subject)}</b> ${t('at {time}', { time: fmtTime(next.time) })}${wait <= 90 ? ` · ${t('in {n} min', { n: wait })}` : ''}`;
  }
  el.hidden = false;
  el.innerHTML = html;
  updateDayBar();
}

function subjectChip(subject) {
  return `<button type="button" class="subject colored" style="--subj:${colorFor(subject)}" data-subject="${esc(subject)}" title="${t('Open {subject}', { subject: esc(subject) })}">${esc(subject)}</button>`;
}

function itemHtml(it, { showDue = true } = {}) {
  const late = !it.done && dayDiff(todayStr(), it.due_date) < 0;
  const grade = (it.type === 'test' || it.type === 'quiz') ? gradeForAssignment(it.id) : null;
  const subs = it.type === 'project' ? it.subtasks || [] : [];
  const doneSubs = subs.filter(s => s.done).length;
  const isTest = it.type === 'test' || it.type === 'quiz';
  const sessions = isTest ? state.items.filter(s => s.parent_id === it.id && s.type === 'study') : [];
  const parent = it.parent_id ? state.items.find(p => p.id === it.parent_id) : null;
  const today = todayStr();
  const nl = !it.done ? nextLesson(it.subject) : null;
  // postpone choices: school days only (study sessions may land on a weekend)
  const snap = it.type === 'study' ? (d => d) : schoolDayOnOrAfter;
  const base = it.due_date < today ? today : it.due_date;
  const pp = [];
  const ppAdd = (label, date) => { if (date && date !== it.due_date && !pp.some(o => o.date === date)) pp.push({ label, date }); };
  if (it.due_date < today) ppAdd(t('Today'), today);
  const t1 = snap(addDays(today, 1)); ppAdd(dayName(t1), t1);
  const n1 = snap(addDays(base, 1)); ppAdd(dayName(n1), n1);
  ppAdd(t('+1 week'), snap(addDays(base, 7)));
  ppAdd(t('Next Mon'), nextWeekday(1));
  if (nl) ppAdd(t('Next {subject}', { subject: it.subject }), nl);
  return `
    <div class="item type-${it.type}${it.done ? ' done' : ''}${it.starred ? ' starred' : ''}${it.pending ? ' pending' : ''}" data-id="${it.id}">
      <input type="checkbox" ${it.done ? 'checked' : ''} aria-label="${t('Mark done')}">
      <div class="body">
        <div class="title">${it.starred ? '<span class="star-mark">★</span> ' : ''}${esc(it.title)}${it.pending ? ` <span class="pending-mark" title="${t('Waiting to sync')}">⏳</span>` : ''}</div>
        <div class="meta">
          ${it.subject ? subjectChip(it.subject) : ''}
          <span class="badge">${typeLabel(it.type)}</span>
          ${showDue ? `<span class="due${late ? ' late' : ''}">${late ? t('Overdue · ') : ''}${dueLabel(it.due_date)}${it.due_time ? ` · ${fmtTime(it.due_time)}` : ''}${it.recurring_id ? ` <span class="repeat" title="${t('Repeats')}"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7a4 4 0 0 1 4-4h4M9 1l2 2-2 2M13 9a4 4 0 0 1-4 4H5M7 15l-2-2 2-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>` : ''}</span>` : `${it.due_time ? `<span class="due">${fmtTime(it.due_time)}</span>` : ''}${it.recurring_id ? `<span class="repeat" title="${t('Repeats')}"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7a4 4 0 0 1 4-4h4M9 1l2 2-2 2M13 9a4 4 0 0 1-4 4H5M7 15l-2-2 2-2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>` : ''}`}
          ${grade ? `<span class="grade-badge">${esc(grade.grade)}</span>` : ''}
          ${parent ? `<span class="for-parent" title="${esc(parent.title)}">${t('for {title}', { title: esc(parent.title) })}</span>` : ''}
          ${sessions.length ? `<span class="sessions" title="${sessions.map(s => dueLabel(s.due_date)).join(', ')}">${t('{done}/{total} study', { done: sessions.filter(s => s.done).length, total: sessions.length })}</span>` : ''}
        </div>
        ${!it.done || (!grade && isTest) ? `<div class="actions">
          ${!grade && it.done && isTest ? `<button class="act add-grade"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13.5V2.5h10v11l-5-2.6z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>${t('Add grade')}</button>` : ''}
          ${isTest && !it.done ? `<button class="act add-study"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.2c1.8-.6 3.6-.4 5.5.8 1.9-1.2 3.7-1.4 5.5-.8v9.4c-1.8-.6-3.6-.4-5.5.8-1.9-1.2-3.7-1.4-5.5-.8z M8 4v9.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>${t('Study session')}</button>` : ''}
          ${!it.done ? `<button class="act postpone"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>${t('Postpone')}</button>` : ''}
        </div>` : ''}
        ${isTest && !it.done ? `<div class="picker study-picker" hidden>${t('Study on:')}
          <button type="button" data-when="${today}">${t('Today')}</button>
          <button type="button" data-when="${addDays(today, 1)}">${t('Tomorrow')}</button>
          ${dayDiff(today, addDays(it.due_date, -1)) > 1 ? `<button type="button" data-when="${addDays(it.due_date, -1)}">${t('Day before')}</button>` : ''}
          <input type="date" max="${it.due_date}" aria-label="${t('Pick a date')}">
        </div>` : ''}
        ${!it.done ? `<div class="picker postpone-picker" hidden>${t('Move to:')}
          ${pp.map(o => `<button type="button" data-when="${o.date}" title="${esc(dueLabel(o.date))}">${esc(o.label)}</button>`).join('')}
          <input type="date" aria-label="${t('Pick a date')}">
        </div>` : ''}
        ${it.notes ? `<div class="notes">${esc(it.notes)}</div>` : ''}
        ${subs.length ? `
          <div class="progress" title="${t('{done}/{total} steps', { done: doneSubs, total: subs.length })}"><i style="width:${Math.round(100 * doneSubs / subs.length)}%"></i></div>
          <div class="subtasks">${subs.map(s => `
            <label class="subtask${s.done ? ' done' : ''}"><input type="checkbox" data-sub="${s.id}" ${s.done ? 'checked' : ''}><span>${esc(s.title)}</span>${s.due_date ? `<small class="sdate${!s.done && s.due_date < today ? ' late' : ''}">${dueLabel(s.due_date)}</small>` : ''}</label>`).join('')}
          </div>` : ''}
      </div>
      <div class="side">
        <button class="star-btn${it.starred ? ' on' : ''}" aria-label="${t('Star')}" title="${it.starred ? t('Unstar') : t('Star')}">${it.starred ? '★' : '☆'}</button>
      </div>
    </div>`;
}

function sortItems(a, b) {
  return (b.starred ? 1 : 0) - (a.starred ? 1 : 0)
    || a.due_date.localeCompare(b.due_date)
    || (a.due_time || '99').localeCompare(b.due_time || '99')
    || TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
    || a.id - b.id;
}
function sortByDate(a, b) {
  return a.due_date.localeCompare(b.due_date) || (a.due_time || '99').localeCompare(b.due_time || '99') || TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.id - b.id;
}

function matchesFilter(it) {
  const f = state.filter;
  if (f.subject && it.subject !== f.subject) return false;
  if (f.search) {
    const s = f.search.toLowerCase();
    if (![it.title, it.subject, it.notes].some(v => (v || '').toLowerCase().includes(s))) return false;
  }
  return true;
}

function renderFilter() {
  // only subjects that still have something open
  const subjects = [...new Set(state.items.filter(i => !i.done).map(i => i.subject).filter(Boolean))].sort();
  if (state.filter.subject && !subjects.includes(state.filter.subject)) state.filter.subject = '';
  const el = $('#subject-filter');
  if (subjects.length < 2) { el.innerHTML = ''; if (state.filter.subject) state.filter.subject = ''; return; }
  el.innerHTML = `<button data-subject="" class="${state.filter.subject ? '' : 'active'}">${t('All')}</button>` +
    subjects.map(s => `<button data-subject="${esc(s)}" class="${state.filter.subject === s ? 'active' : ''}" style="--subj:${colorFor(s)}"><span class="dot"></span>${esc(s)}</button>`).join('');
}

function renderExamStrip() {
  const today = todayStr();
  const soon = state.items
    .filter(i => !i.done && (i.type === 'test' || i.type === 'quiz') && dayDiff(today, i.due_date) >= 0 && dayDiff(today, i.due_date) <= 30)
    .sort(sortByDate).slice(0, 6);
  const el = $('#exam-strip');
  el.hidden = !soon.length;
  el.innerHTML = soon.map(i => {
    const d = dayDiff(today, i.due_date);
    return `<button data-id="${i.id}" class="${d <= 2 ? 'urgent' : ''}" style="--subj:${colorFor(i.subject)}"><span class="dot"></span><b>${esc(i.subject || typeLabel(i.type))}</b> ${typeLabel(i.type).toLowerCase()} · ${d === 0 ? t('today') : d === 1 ? t('tomorrow') : t('in {n} days', { n: d })}</button>`;
  }).join('');
}

function groupHtml(key, title, arr, extra = '') {
  return `<div class="group ${key}"><h3>${title} <span class="count">${arr.length}</span>${extra}</h3>${arr.map(i => rowHtml(i)).join('')}</div>`;
}

function renderList() {
  const today = todayStr();
  const nextSchool = nextSchoolDay(today);   // e.g. Monday, when seen on a Friday
  const groups = { overdue: [], today: [], tomorrow: [], nextschool: [], week: [], later: [] };
  const done = [];
  const filtering = state.filter.search || state.filter.subject;
  const weekStart = mondayOf(today);
  let olderDone = 0;
  for (const it of [...state.items, ...stepRows()].sort(sortItems)) {
    if (!matchesFilter(it)) continue;
    if (it.done) {
      // Completed shows this week only; at the end of the week (Sunday night) they drop off.
      // Search still finds them, and Stats keep counting them.
      if (!filtering && (isoDateOf(it.completed_at) || '') < weekStart) { olderDone++; continue; }
      done.push(it); continue;
    }
    const d = dayDiff(today, it.due_date);
    if (d < 0) groups.overdue.push(it);
    else if (d === 0) groups.today.push(it);
    else if (d === 1) groups.tomorrow.push(it);
    else if (it.due_date === nextSchool) groups.nextschool.push(it);
    else if (d <= 7) groups.week.push(it);
    else groups.later.push(it);
  }
  const titles = { overdue: t('Overdue'), today: t('Today'), tomorrow: t('Tomorrow'), nextschool: dayName(nextSchool, { heading: true }), week: t('Next 7 days'), later: t('Later') };
  const moveTo = schoolDayOnOrAfter(addDays(today, 1));
  let html = '';
  for (const key of Object.keys(groups)) {
    const arr = groups[key];
    if (!arr.length) continue;
    const extra = key === 'overdue' ? ` <button class="link-btn bulk-move" data-when="${today}">${t('Move all to today')}</button> <button class="link-btn bulk-move" data-when="${moveTo}">${t('to {day}', { day: esc(dayName(moveTo).toLowerCase()) })}</button>` : '';
    html += groupHtml(key, titles[key], arr, extra);
  }
  if (!html) {
    html = filtering
      ? `<div class="empty">${t('Nothing matches.')}</div>`
      : `<div class="empty"><div class="big">🎉</div>${t('Nothing to do. Add homework above when you get it in class.')}</div>`;
  }
  if (done.length) {
    done.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
    html += `<details class="completed group"${filtering ? ' open' : ''}><summary><h3>${t('Completed')} <span class="count">${done.length}</span></h3></summary>${done.map(i => itemHtml(i)).join('')}${olderDone ? `<p class="muted">${t(olderDone === 1 ? 'Cleared every Sunday night — 1 older one not shown (search finds it, Stats still count it).' : 'Cleared every Sunday night — {n} older ones not shown (search finds them, Stats still count them).', { n: olderDone })}</p>` : ''}</details>`;
  }
  html += trashHtml();
  $('#list').innerHTML = html;
}

function agoLabel(iso) {
  const d = dayDiff(isoDateOf(iso) || todayStr(), todayStr());
  return d <= 0 ? t('today') : d === 1 ? t('yesterday') : t('{n} days ago', { n: d });
}
function trashHtml() {
  const list = state.trash;
  if (!list.length) return '';
  return `<details class="completed group trash"><summary><h3>${t('Recently deleted')} <span class="count">${list.length}</span></h3></summary>
    <p class="muted">${t('Kept for 30 days, then removed for good.')}</p>
    ${list.map(x => `<div class="item type-${x.type} trashed" data-tid="${x.id}">
      <div class="body">
        <div class="title">${esc(x.title)}</div>
        <div class="meta">${x.subject ? `<span class="subject">${esc(x.subject)}</span>` : ''}<span class="badge">${typeLabel(x.type)}</span><span class="due">${dueLabel(x.due_date)}</span><span>${t('deleted {when}', { when: agoLabel(x.deleted_at) })}</span></div>
      </div>
      <div class="side trash-actions"><button class="ghost small restore">${t('Restore')}</button><button class="danger small forever">${t('Delete forever')}</button></div>
    </div>`).join('')}
    <button class="danger small empty-trash">${t('Empty')}</button>
  </details>`;
}
document.addEventListener('click', async e => {
  if (e.target.closest('.empty-trash')) {
    if (!confirm(t('Remove everything in Recently deleted for good?'))) return;
    try { await api('/api/trash', { method: 'DELETE' }); loadTrash(); } catch (err) { toast(err.message); }
    return;
  }
  const row = e.target.closest('.trashed'); if (!row) return;
  const id = Number(row.dataset.tid);
  try {
    if (e.target.closest('.restore')) { await api(`/api/trash/${id}/restore`, { method: 'POST' }); toast(t('Restored')); loadItems(); loadTrash(); }
    else if (e.target.closest('.forever')) { await api(`/api/trash/${id}`, { method: 'DELETE' }); loadTrash(); }
  } catch (err) { toast(err.message); }
});
// Undo for a delete: take it back out of the trash (or out of the offline queue)
async function undelete(id, it) {
  const queued = outbox.findIndex(o => o.op === 'delete' && o.id === id);
  if (queued >= 0) { outbox.splice(queued, 1); saveOutbox(); state.items.push(it); render(); return; }
  if (id < 0) { await createItem({ title: it.title, subject: it.subject, type: it.type, due_date: it.due_date, due_time: it.due_time, notes: it.notes, starred: it.starred, parent_id: it.parent_id }); return; }
  await api(`/api/trash/${id}/restore`, { method: 'POST' });
  loadItems(); loadTrash();
}

// ----- quick add -----
const qaDate = $('#qa-date');
function dateChipOptions() {
  const subject = $('#qa-subject').value.trim();
  const today = todayStr();
  const chips = [];
  const add = (label, date) => { if (!chips.some(c => c.date === date)) chips.push({ label, date }); };
  const nl = nextLesson(subject);
  if (nl) add(t('Next {subject}', { subject }), nl);
  const d1 = nextSchoolDay(today), d2 = nextSchoolDay(today, 2);
  add(dayName(d1), d1);                                            // Tomorrow, or Monday on a Friday
  add(dayDiff(today, d2) === 2 ? t('In 2 days') : dayName(d2), d2);
  add(t('Next Mon'), nextWeekday(1));
  add(t('Next week'), schoolDayOnOrAfter(addDays(today, 7)));
  return chips;
}
// In a lesson right now? Then the add box starts on that subject (and its next lesson as the
// date), until you pick something else yourself. The next lesson takes over again.
let qaAutoClass = null;   // subject the app last picked by itself
function autoPickSubject(now = new Date()) {
  const sel = $('#qa-subject');
  const classes = hasTimetable() ? classesOn(todayStr()) : [];
  const idx = currentClassIndex(classes, now);
  const current = idx >= 0 ? classes[idx].subject : '';
  if (current !== qaAutoClass) { qaAutoClass = current; sel.dataset.touched = ''; }   // a new lesson: start fresh
  if (sel.dataset.touched) return;
  const want = current ? subjectOptions().find(s => s.toLowerCase() === current.toLowerCase()) || '' : '';
  if (subjectOf(sel) === want) return;
  sel.value = want; sel.dataset.prev = want;
  qaDate.value = (want && nextLesson(want)) || nextSchoolDay();
}
function renderQuickAdd() {
  autoPickSubject();
  const chips = dateChipOptions();
  $('#qa-chips').innerHTML = chips.map(c => `<button type="button" data-date="${c.date}" class="${c.date === qaDate.value ? 'active' : ''}">${esc(c.label)}</button>`).join('');
  const wrap = $('#qa-classes');
  const classes = hasTimetable() ? classesOn(todayStr()) : [];
  wrap.hidden = !classes.length;
  if (classes.length) {
    const now = currentClassIndex(classes);
    const cur = $('#qa-subject').value.trim().toLowerCase();
    const seen = new Set();
    wrap.innerHTML = classes.filter(c => !seen.has(c.subject.toLowerCase()) && seen.add(c.subject.toLowerCase())).map(c => {
      const idx = classes.indexOf(c);
      return `<button type="button" data-subject="${esc(c.subject)}" class="${c.subject.toLowerCase() === cur ? 'active' : ''}" style="--subj:${colorFor(c.subject)}"><span class="dot"></span>${esc(c.subject)}${idx === now ? `<span class="now">${t('· now')}</span>` : ''}</button>`;
    }).join('');
  }
}
function setQaDate(s) { qaDate.value = s; renderQuickAdd(); }
function pickSubject(subject) {
  $('#qa-subject').value = subject;
  const nl = nextLesson(subject);
  setQaDate(nl || nextSchoolDay());
}
qaDate.value = nextSchoolDay();
qaDate.addEventListener('change', () => renderQuickAdd());
$('#qa-subject').addEventListener('change', () => { const sel = $('#qa-subject'); sel.dataset.touched = subjectOf(sel) === (qaAutoClass || '') ? '' : '1'; const nl = nextLesson(subjectOf(sel)); if (nl) setQaDate(nl); else renderQuickAdd(); });
$('#qa-chips').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setQaDate(b.dataset.date); });
$('#qa-classes').addEventListener('click', e => { const b = e.target.closest('button'); if (b) pickSubject(b.dataset.subject); });
let adding = false;
$('#quick-add').addEventListener('submit', async e => {
  e.preventDefault();
  if (adding) return;
  const fields = {
    title: $('#qa-title').value.trim(),
    subject: subjectOf($('#qa-subject')),
    type: $('#qa-type').value,
    due_date: qaDate.value,
  };
  const repeat = $('#qa-repeat').value;
  if (repeat) fields.repeat = repeat;
  if (!fields.title || !fields.due_date) return;
  adding = true;
  try {
    const created = await createItem(fields);
    // everything back to the starting state (the lesson you are in, if any, is picked again)
    $('#qa-title').value = '';
    $('#qa-repeat').value = '';
    $('#qa-type').value = 'homework';
    const sel = $('#qa-subject'); sel.value = ''; sel.dataset.prev = ''; sel.dataset.touched = '';
    qaAutoClass = null;
    qaDate.value = nextSchoolDay();
    renderQuickAdd();
    $('#qa-title').focus();
    if (!created.pending) toast(repeat ? t('Added — repeats automatically') : t('Added'));
    if (repeat) loadRecurring();
  } catch (err) { toast(err.message); }
  finally { adding = false; }
});

// ----- filter -----
$('#search').addEventListener('input', e => { state.filter.search = e.target.value.trim(); renderList(); });
$('#subject-filter').addEventListener('click', e => {
  const b = e.target.closest('button[data-subject]'); if (!b) return;
  state.filter.subject = b.dataset.subject; renderFilter(); renderList();
});
$('#exam-strip').addEventListener('click', e => {
  const b = e.target.closest('button[data-id]'); if (!b) return;
  const it = state.items.find(i => i.id === Number(b.dataset.id));
  if (it) openEdit(it);
});

// ----- item interactions (delegated) -----
document.addEventListener('click', async e => {
  const bulk = e.target.closest('.bulk-move');
  if (bulk) {
    const when = bulk.dataset.when;
    const overdue = state.items.filter(i => !i.done && i.due_date < todayStr() && matchesFilter(i));
    const steps = stepRows().filter(st => st.due_date < todayStr() && matchesFilter(st));
    const before = overdue.map(i => [i.id, i.due_date]);
    const beforeSteps = steps.map(st => [st.sid, st.due_date]);
    const moveSteps = async pairs => { for (const [sid, d] of pairs) await api(`/api/subtasks/${sid}`, { method: 'PATCH', body: { due_date: d } }).catch(err => toast(err.message)); if (pairs.length) loadItems(); };
    for (const i of overdue) await updateItem(i.id, { due_date: when });
    await moveSteps(steps.map(st => [st.sid, when]));
    const n = overdue.length + steps.length;
    toast(t(n === 1 ? 'Moved 1 item to {when}' : 'Moved {n} items to {when}', { n, when: dueLabel(when).toLowerCase() }), async () => { for (const [id, d] of before) await updateItem(id, { due_date: d }); await moveSteps(beforeSteps); });
    return;
  }
  const subj = e.target.closest('button.subject[data-subject]');
  if (subj) { openSubject(subj.dataset.subject); return; }
  const item = e.target.closest('.item');
  if (!item) return;
  const id = Number(item.dataset.id);
  const it = state.items.find(i => i.id === id);
  if (!it) return;
  if (e.target.matches('input[data-sub]')) {
    const sid = Number(e.target.dataset.sub), done = e.target.checked;
    try {
      await api(`/api/subtasks/${sid}`, { method: 'PATCH', body: { done } });
      loadItems();
      if (item.classList.contains('step')) toast(done ? t('Step done ✓') : t('Step not done'), () => api(`/api/subtasks/${sid}`, { method: 'PATCH', body: { done: !done } }).then(loadItems));
    } catch (err) { e.target.checked = !done; toast(err.message); }
    return;
  }
  if (e.target.matches('.item > input[type=checkbox]')) {
    const done = e.target.checked;
    try {
      await updateItem(id, { done });
      toast(done ? t('Done ✓') : t('Marked not done'), () => updateItem(id, { done: !done }));
    } catch (err) { e.target.checked = !done; toast(err.message); }
    return;
  }
  if (e.target.closest('.star-btn')) {
    try { await updateItem(id, { starred: !it.starred }); } catch (err) { toast(err.message); }
    return;
  }
  if (e.target.closest('.add-grade')) { openEdit(it); $('#e-grade-value').focus(); return; }
  if (e.target.closest('.add-study')) { const p = item.querySelector('.study-picker'); p.hidden = !p.hidden; item.querySelector('.postpone-picker')?.setAttribute('hidden', ''); return; }
  if (e.target.closest('.postpone')) { const p = item.querySelector('.postpone-picker'); p.hidden = !p.hidden; item.querySelector('.study-picker')?.setAttribute('hidden', ''); return; }
  if (e.target.closest('.study-picker')) {
    const b = e.target.closest('button[data-when]');
    if (b) addStudySession(it, b.dataset.when);
    return;
  }
  if (e.target.closest('.postpone-picker')) {
    const b = e.target.closest('button[data-when]');
    if (b) postpone(it, b.dataset.when);
    return;
  }
  if (e.target.closest('.subtask')) return;
  if (e.target.closest('.body') || e.target.closest('.edit')) openEdit(it);
});
document.addEventListener('change', e => {
  if (!e.target.matches('.picker input[type=date]') || !e.target.value) return;
  const item = e.target.closest('.item');
  const it = state.items.find(i => i.id === Number(item.dataset.id));
  if (!it) return;
  if (e.target.closest('.study-picker')) addStudySession(it, e.target.value);
  else postpone(it, e.target.value);
});
async function addStudySession(test, date) {
  try {
    const created = await createItem({ title: t('Study for {title}', { title: test.title }), subject: test.subject, type: 'study', due_date: date, parent_id: test.id });
    if (!created.pending) toast(t('Study session added for {when}', { when: dueLabel(date) }), () => deleteItem(created.id));
  } catch (err) { toast(err.message); }
}
async function postpone(it, date) {
  const before = it.due_date;
  try {
    await updateItem(it.id, { due_date: date });
    toast(t('Moved to {when}', { when: dueLabel(date) }), () => updateItem(it.id, { due_date: before }));
  } catch (err) { toast(err.message); }
}

// ---------- calendar ----------
function heatOf(items) {
  const w = { test: 3, project: 2, quiz: 2, homework: 1, study: 1, other: 1 };
  const sum = items.filter(i => !i.done).reduce((a, i) => a + (i.step ? 1 : w[i.type] || 1), 0);
  return Math.min(45, sum * 9);
}
function pillStyle(it) { return it.subject ? `style="--pill:${colorFor(it.subject)}"` : ''; }

function renderCalendar() {
  const byDate = {};
  for (const it of [...state.items, ...stepRows()].sort(sortByDate)) (byDate[it.due_date] ||= []).push(it);
  $('#cal-month').hidden = state.calMode !== 'month';
  $('#cal-week').hidden = state.calMode !== 'week';
  if (state.calMode === 'month') renderMonth(byDate); else renderWeek(byDate);
  renderCalDay(byDate[state.selectedDay] || []);
}

function renderMonth(byDate) {
  const y = state.calMonth.getFullYear(), m = state.calMonth.getMonth();
  $('#cal-title').textContent = cap(fmtDate(state.calMonth, { month: 'long', year: 'numeric' }));
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const start = new Date(y, m, 1 - lead);
  const today = todayStr();
  let html = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const s = dateStr(d);
    const items = byDate[s] || [];
    const hol = holidayOn(s);
    const cls = ['cal-cell'];
    if (d.getMonth() !== m) cls.push('other');
    if (s === today) cls.push('today');
    if (s === state.selectedDay) cls.push('selected');
    if (hol) cls.push('holiday');
    if (dowIndex(s) >= 5) cls.push('weekend');
    const shown = items.slice(0, 3);
    const more = items.length - shown.length;
    html += `<div class="${cls.join(' ')}" data-date="${s}" style="--heat:${heatOf(items)}"${hol ? ` title="${esc(hol.name)}"` : ''}>
      <span class="num">${d.getDate()}</span>
      ${shown.map(it => `<span class="pill type-${it.type}${it.done ? ' done' : ''}" ${pillStyle(it)} title="${esc(it.title)}">${esc(it.subject || it.title)}</span>`).join('')}
      ${more > 0 ? `<span class="pill more">${t('+{n} more', { n: more })}</span>` : ''}
    </div>`;
  }
  $('#cal-grid').innerHTML = html;
}

function renderWeek(byDate) {
  const start = state.weekStart, end = addDays(start, 6);
  const fmt = s => fmtDate(parseDate(s), { day: 'numeric', month: 'short' });
  const hol = weekIsHoliday(start) ? holidayOn(start) : null;
  $('#cal-title').textContent = `${fmt(start)} – ${fmt(end)}${hol ? ` · 🏖 ${hol.name}` : abWeeks() && hasTimetable() && state.settings.week_anchor.date ? ` · ${t('Week {letter}', { letter: weekLetter(start) })}` : ''}`;
  const today = todayStr();
  let html = '';
  for (let i = 0; i < 7; i++) {
    const s = addDays(start, i);
    const items = byDate[s] || [];
    const h = holidayOn(s);
    const classes = hasTimetable() ? classesOn(s) : [];
    const cls = ['wday'];
    if (s === today) cls.push('today');
    if (s === state.selectedDay) cls.push('selected');
    if (h) cls.push('holiday');
    if (dowIndex(s) >= 5) cls.push('weekend');
    html += `<div class="${cls.join(' ')}" data-date="${s}">
      <h4>${cap(fmtDate(parseDate(s), { weekday: 'short' }))}<b>${parseDate(s).getDate()}</b></h4>
      ${items.map(it => `<div class="wpill type-${it.type}${it.done ? ' done' : ''}${it.step ? ' step' : ''}" ${pillStyle(it)}>${esc(it.subject ? it.subject : it.step ? t('Step') : typeLabel(it.type))}${it.due_time ? ` <small class="t">${fmtTime(it.due_time)}</small>` : ''}<small>${esc(it.title)}</small></div>`).join('')}
      ${h ? `<div class="classes">🏖 ${esc(h.name)}</div>` : classes.length ? `<div class="classes">${classes.map(c => esc(c.subject)).join(' · ')}</div>` : ''}
    </div>`;
  }
  $('#cal-week').innerHTML = html;
}

function renderCalDay(items) {
  const s = state.selectedDay;
  const draft = $('#cal-day').dataset.day === s ? draftOf(['ma-title', 'ma-subject', 'ma-type']) : {};
  const d = dayDiff(todayStr(), s);
  const rel = d === 0 ? t('Today') : d === 1 ? t('Tomorrow') : d === -1 ? t('Yesterday') : d > 0 ? t('in {n} days', { n: d }) : t('{n} days ago', { n: -d });
  const hol = holidayOn(s);
  const classes = hasTimetable() ? classesOn(s) : [];
  $('#cal-day').innerHTML = `
    <h2>${longDate(s)} <span class="muted" style="margin:0;font-weight:500">· ${rel}</span></h2>
    ${hol ? `<p class="classes">🏖 ${esc(hol.name)}</p>` : classes.length ? `<p class="classes">${t('Classes:')} ${classes.map(c => (c.time ? `${c.time} ` : '') + esc(c.subject)).join(' · ')}</p>` : ''}
    ${items.length ? items.map(i => rowHtml(i, { showDue: false })).join('') : `<p class="muted">${t('Nothing due this day.')}</p>`}
    <form class="mini-add" id="mini-add" autocomplete="off">
      <input type="text" id="ma-title" placeholder="${t('Add something for this day…')}" required>
      ${subjectSelectHtml('ma-subject', '', t('Subject'), 'style="flex:1 1 110px"')}
      <select id="ma-type">${TYPES.map(ty => `<option value="${ty}">${typeLabel(ty)}</option>`).join('')}</select>
      <button type="submit" class="primary">${t('Add')}</button>
    </form>`;
  $('#cal-day').dataset.day = s;
  restoreDraft(draft);
}

function calShift(n) {
  if (state.calMode === 'month') state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + n, 1);
  else state.weekStart = addDays(state.weekStart, 7 * n);
  renderCalendar();
}
$('#cal-prev').addEventListener('click', () => calShift(-1));
$('#cal-next').addEventListener('click', () => calShift(1));
$('#cal-today').addEventListener('click', () => {
  state.calMonth = startOfMonth(new Date()); state.weekStart = mondayOf(todayStr()); state.selectedDay = todayStr(); renderCalendar();
});
function setCalMode(mode) {
  state.calMode = mode;
  $$('#cal-mode button').forEach(x => x.classList.toggle('active', x.dataset.mode === mode));
  if (mode === 'week') state.weekStart = mondayOf(state.selectedDay);
  else state.calMonth = startOfMonth(parseDate(state.selectedDay));
  renderCalendar();
}
$('#cal-mode').addEventListener('click', e => {
  const b = e.target.closest('button[data-mode]'); if (!b) return;
  setCalMode(b.dataset.mode);
});
function selectDay(s) {
  state.selectedDay = s;
  const d = parseDate(s);
  if (state.calMode === 'month' && d.getMonth() !== state.calMonth.getMonth()) state.calMonth = startOfMonth(d);
  renderCalendar();
}
$('#cal-grid').addEventListener('click', e => { const c = e.target.closest('.cal-cell'); if (c) selectDay(c.dataset.date); });
$('#cal-week').addEventListener('click', e => { const c = e.target.closest('.wday'); if (c) selectDay(c.dataset.date); });
$('#cal-day').addEventListener('submit', async e => {
  if (e.target.id !== 'mini-add') return;
  e.preventDefault();
  const fields = { title: $('#ma-title').value.trim(), subject: subjectOf($('#ma-subject')), type: $('#ma-type').value, due_date: state.selectedDay };
  if (!fields.title) return;
  try { const c = await createItem(fields); if (!c.pending) toast(t('Added')); } catch (err) { toast(err.message); }
});

// ---------- stats ----------
function gradeRowsBySubject(grades) {
  const bySubject = {};
  for (const g of grades) (bySubject[g.subject || t('(no subject)')] ||= []).push(g);
  return Object.entries(bySubject).map(([subject, gs]) => {
    const sorted = [...gs].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    const pts = sorted.map(g => gradePoints(g.grade)).filter(p => p !== null);
    const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
    return { subject, count: gs.length, avg, letter: formatAvg(avg), pts, latest: sorted[sorted.length - 1] };
  }).sort((a, b) => a.subject.localeCompare(b.subject));
}

function renderStats() {
  const today = todayStr();
  const items = state.items;
  const weekStart = mondayOf(today), weekEnd = addDays(weekStart, 6);
  const inRange = (s, a, b) => s >= a && s <= b;

  const completedThisWeek = items.filter(i => i.done && inRange(isoDateOf(i.completed_at) || '', weekStart, weekEnd)).length;
  const dueThisWeek = items.filter(i => inRange(i.due_date, weekStart, weekEnd));
  const dueThisWeekDone = dueThisWeek.filter(i => i.done).length;

  // On time, last 30 days: everything completed in that window counts (on time if finished
  // by its due date), plus unfinished items whose due date has passed (missed).
  const since30 = addDays(today, -30);
  const recent = items.filter(i => (i.done ? inRange(isoDateOf(i.completed_at) || '', since30, today) : i.due_date < today && i.due_date >= since30));
  const onTime = recent.filter(i => i.done && (isoDateOf(i.completed_at) || '9999') <= i.due_date).length;
  const onTimeRate = recent.length ? Math.round(100 * onTime / recent.length) : null;

  const missed = items.filter(i => i.due_date < today && (!i.done || (isoDateOf(i.completed_at) || '9999') > i.due_date)).map(i => i.due_date).sort();
  const firstDay = items.map(i => (i.created_at || '').slice(0, 10)).filter(Boolean).sort()[0];
  const streakFrom = missed.length ? missed[missed.length - 1] : firstDay;
  const streak = streakFrom ? Math.max(0, dayDiff(streakFrom, today)) : 0;

  const weeks = [];
  for (let w = 7; w >= 0; w--) {
    const ws = addDays(weekStart, -7 * w), we = addDays(ws, 6);
    weeks.push({ start: ws, count: items.filter(i => i.done && inRange(isoDateOf(i.completed_at) || '', ws, we)).length });
  }
  const load = [];
  const withSteps = [...items, ...stepRows()];
  for (let i = 0; i < 28; i++) {
    const s = addDays(today, i);
    const dayItems = withSteps.filter(it => it.due_date === s);
    load.push({ date: s, heat: heatOf(dayItems), n: dayItems.filter(i => !i.done).length, hol: holidayOn(s), weekend: dowIndex(s) >= 5 });
  }

  const grades = state.grades.filter(g => inTerm(g.date));
  const gradeRows = gradeRowsBySubject(grades);
  const allPts = grades.map(g => gradePoints(g.grade)).filter(p => p !== null);
  const overall = allPts.length ? formatAvg(allPts.reduce((a, b) => a + b, 0) / allPts.length) : null;
  const termDone = items.filter(i => i.done && inTerm(i.due_date)).length;

  const draft = draftOf(['ga-subject', 'ga-title', 'ga-grade', 'ga-date']);
  $('#stats').innerHTML = `
    ${termChips()}
    <div class="stat-grid">
      <div class="stat"><div class="label">${t('This week')}</div><div class="value">${completedThisWeek}</div><div class="sub">${t("completed · {a}/{b} of this week's due", { a: dueThisWeekDone, b: dueThisWeek.length })}</div></div>
      <div class="stat"><div class="label">${t('On time')}</div><div class="value">${onTimeRate === null ? '–' : onTimeRate + '%'}</div><div class="sub">${t('last 30 days')}${recent.length ? ` · ${onTime}/${recent.length}` : ''}</div></div>
      <div class="stat"><div class="label">${t('Streak')}</div><div class="value">${streak}</div><div class="sub">${t(streak === 1 ? 'day without a missed deadline' : 'days without a missed deadline')}</div></div>
      <div class="stat"><div class="label">${t('Grade average')}</div><div class="value">${overall || '–'}</div><div class="sub">${t(grades.length === 1 ? '1 grade' : '{n} grades', { n: grades.length })} · ${termLabel()}</div></div>
      ${terms().length ? `<div class="stat"><div class="label">${t('Completed')}</div><div class="value">${termDone}</div><div class="sub">${termLabel()}</div></div>` : ''}
    </div>

    <div class="card">
      <h2>${t('Next 4 weeks')}</h2>
      <p class="muted">${t('How much is due each day — darker is busier. Tests count triple, projects and quizzes double.')}</p>
      <div class="heat-strip">${load.map(l => `<div style="--heat:${l.heat}" class="${l.date === today ? 'today' : ''}${l.hol ? ' holiday' : ''}${l.weekend ? ' weekend' : ''}" data-tip="${t('{date}: {n} due', { date: esc(dueLabel(l.date)), n: l.n })}${l.hol ? ` · ${esc(l.hol.name)}` : ''}">${parseDate(l.date).getDate()}</div>`).join('')}</div>
    </div>

    <div class="card">
      <h2>${t('Completed per week')}</h2>
      ${barChart(weeks.map(w => ({ label: shortDate(w.start), value: w.count, dim: w.start !== weekStart })))}
    </div>

    <div class="card">
      <h2>${t('Grades')}${terms().length ? ` <span class="muted" style="margin:0;font-weight:500">· ${esc(termLabel())}</span>` : ''}</h2>
      ${gradeRows.length ? `
      <div style="overflow-x:auto"><table class="grade-table">
        <thead><tr><th>${t('Subject')}</th><th>${t('Average')}</th><th>${t('Trend')}</th><th>${t('Latest')}</th><th></th></tr></thead>
        <tbody>${gradeRows.map(r => `<tr>
          <td>${subjectChip(r.subject)}</td>
          <td><span class="avg">${r.letter}</span>${gradeScale() === 'letters' ? ` <span class="muted" style="margin:0">(${r.avg.toFixed(2)})</span>` : ''}</td>
          <td>${sparkline(r.pts)}</td>
          <td>${esc(r.latest.grade)} <span class="muted" style="margin:0">${shortDate(r.latest.date)}</span></td>
          <td class="muted" style="margin:0">${r.count}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : `<p class="muted">${t('No grades yet. Tick off a test and tap "Add grade", or add one below.')}</p>`}
      <form class="grade-add" id="grade-add" autocomplete="off">
        ${subjectSelectHtml('ga-subject', '', t('Subject'), 'required')}
        <input type="text" id="ga-title" placeholder="${t('What was it? (optional)')}">
        ${gradeFieldHtml('ga-grade', '', { required: true })}
        <input type="date" id="ga-date" value="${today}">
        <button type="submit" class="primary">${t('Add grade')}</button>
      </form>
      ${grades.length ? `<div class="grade-list" style="margin-top:12px">${grades.map(g => gradeRowHtml(g)).join('')}</div>` : ''}
    </div>`;
  restoreDraft(draft);
}
function gradeRowHtml(g) {
  return `<div class="g" data-gid="${g.id}">
    <span class="letter">${esc(g.grade)}</span>
    <div class="what">${g.subject ? subjectChip(g.subject) : ''} ${esc(g.title || '')}<small>${shortDate(g.date)}</small></div>
    <button class="danger small del-grade">${t('Delete')}</button>
  </div>`;
}

function barChart(data) {
  const W = Math.max(320, Math.min(600, ($('#stats').clientWidth || 600) - 34)), H = 160, padL = 28, padB = 24, padT = 12;
  const max = Math.max(1, ...data.map(d => d.value));
  const n = data.length, slot = (W - padL) / n, bw = Math.min(40, slot * 0.6);
  const yOf = v => padT + (H - padT - padB) * (1 - v / max);
  const ticks = max <= 4 ? [...Array(max + 1).keys()] : [0, Math.round(max / 2), max];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Completed items per week')}">
    ${ticks.map(t => `<line class="grid" x1="${padL}" x2="${W}" y1="${yOf(t)}" y2="${yOf(t)}"/><text x="${padL - 6}" y="${yOf(t) + 4}" text-anchor="end">${t}</text>`).join('')}
    ${data.map((d, i) => {
      const x = padL + slot * i + (slot - bw) / 2, y = yOf(d.value), h = H - padB - y;
      return `<g>
        <rect class="hit" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${H - padT - padB}" data-tip="${t('Week of {date}: {n} completed', { date: esc(d.label), n: d.value })}"/>
        <rect class="bar${d.dim ? ' dim' : ''}" x="${x}" y="${d.value ? y : H - padB - 2}" width="${bw}" height="${d.value ? h : 2}" rx="3" pointer-events="none"/>
        ${d.value ? `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" pointer-events="none">${d.value}</text>` : ''}
        <text x="${padL + slot * i + slot / 2}" y="${H - 6}" text-anchor="middle">${esc(d.label)}</text>
      </g>`;
    }).join('')}
  </svg>`;
}

function sparkline(pts) {
  if (!pts.length) return '';
  const W = 120, H = 28, p = 4;
  const [lo, hi] = gradeRange();
  const xs = pts.length === 1 ? [W / 2] : pts.map((_, i) => p + (W - 2 * p) * i / (pts.length - 1));
  const ys = pts.map(v => p + (H - 2 * p) * (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)));
  const d = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true">${pts.length > 1 ? `<path d="${d}"/>` : ''}${xs.map((x, i) => `<circle cx="${x.toFixed(1)}" cy="${ys[i].toFixed(1)}" r="3"/>`).join('')}</svg>`;
}

document.addEventListener('submit', async e => {
  if (e.target.id !== 'grade-add') return;
  e.preventDefault();
  try {
    await api('/api/grades', { method: 'POST', body: { subject: subjectOf($('#ga-subject', e.target)), title: $('#ga-title', e.target).value.trim(), grade: $('#ga-grade', e.target).value, date: $('#ga-date', e.target).value } });
    e.target.reset(); toast(t('Grade added')); loadGrades();
  } catch (err) { toast(err.message); }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('.del-grade'); if (!b) return;
  const gid = Number(b.closest('.g').dataset.gid);
  const g = state.grades.find(x => x.id === gid);
  try {
    await api(`/api/grades/${gid}`, { method: 'DELETE' });
    toast(t('Grade deleted'), () => api('/api/grades', { method: 'POST', body: { subject: g.subject, title: g.title, grade: g.grade, date: g.date, notes: g.notes, assignment_id: g.assignment_id } }).then(loadGrades));
    loadGrades();
  } catch (err) { toast(err.message); }
});

// tooltip for data-tip elements
const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; document.body.appendChild(tip);
document.addEventListener('mousemove', e => {
  const el = e.target.closest?.('[data-tip]');
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip; tip.hidden = false;
  tip.style.left = `${e.clientX}px`; tip.style.top = `${e.clientY}px`;
});

// ---------- subject page ----------
function openSubject(name) {
  state.subjectView = name;
  switchView('subject');
}
function renderSubjectPage() {
  const name = state.subjectView; if (!name) return;
  const items = state.items.filter(i => i.subject === name);
  const pending = [...items.filter(i => !i.done), ...stepRows(items)].sort(sortByDate);
  const done = items.filter(i => i.done && inTerm(i.due_date)).sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
  const grades = state.grades.filter(g => g.subject === name && inTerm(g.date)).sort((a, b) => b.date.localeCompare(a.date));
  const row = gradeRowsBySubject(grades)[0];
  const nl = nextLesson(name);
  const nlClasses = nl ? classesOn(nl).find(c => c.subject.toLowerCase() === name.toLowerCase()) : null;
  const tests = pending.filter(i => i.type === 'test' || i.type === 'quiz');
  const draft = $('#subject-page').dataset.subject === name ? draftOf(['ga-title', 'ga-grade', 'ga-date']) : {};
  $('#subject-page').innerHTML = `
    <div class="subject-head" style="--subj:${colorFor(name)}">
      <span class="big-dot"></span>
      <h2>${esc(name)}</h2>
      <span class="muted" style="margin:0">${nl ? `${t('Next lesson {when}', { when: dueLabel(nl) })}${nlClasses?.time ? ` ${t('at {time}', { time: fmtTime(nlClasses.time) })}` : ''}` : ''}</span>
    </div>
    ${termChips()}
    <div class="stat-grid">
      <div class="stat"><div class="label">${t('To do')}</div><div class="value">${pending.length}</div><div class="sub">${tests.length ? t(tests.length === 1 ? '1 test coming' : '{n} tests coming', { n: tests.length }) : t('no tests coming')}</div></div>
      <div class="stat"><div class="label">${t('Completed')}</div><div class="value">${done.length}</div><div class="sub">${termLabel()}</div></div>
      <div class="stat"><div class="label">${t('Average')}</div><div class="value">${row ? row.letter : '–'}</div><div class="sub">${t(grades.length === 1 ? '1 grade' : '{n} grades', { n: grades.length })}${row && gradeScale() === 'letters' ? ` · ${row.avg.toFixed(2)}` : ''}</div></div>
      <div class="stat"><div class="label">${t('Trend')}</div><div class="value">${row ? sparkline(row.pts) : '–'}</div><div class="sub">${t('oldest → newest')}</div></div>
    </div>
    <div class="card">
      <h2>${t('Upcoming')}</h2>
      ${pending.length ? pending.map(i => rowHtml(i)).join('') : `<p class="muted">${t('Nothing to do for this subject.')}</p>`}
    </div>
    <div class="card">
      <h2>${t('Grades')}</h2>
      ${grades.length ? `<div class="grade-list">${grades.map(g => gradeRowHtml(g)).join('')}</div>` : `<p class="muted">${t('No grades yet.')}</p>`}
      <form class="grade-add" id="grade-add" autocomplete="off">
        <input type="hidden" id="ga-subject" value="${esc(name)}">
        <input type="text" id="ga-title" placeholder="${t('What was it? (optional)')}">
        ${gradeFieldHtml('ga-grade', '', { required: true })}
        <input type="date" id="ga-date" value="${todayStr()}">
        <button type="submit" class="primary">${t('Add grade')}</button>
      </form>
    </div>
    ${done.length ? `<details class="completed group"><summary><h3>${t('Completed')} <span class="count">${done.length}</span></h3></summary>${done.slice(0, 30).map(i => itemHtml(i)).join('')}</details>` : ''}`;
  $('#subject-page').dataset.subject = name;
  restoreDraft(draft);
}
$('#subject-back').addEventListener('click', () => switchView('list'));

// ---------- edit dialog ----------
const dialog = $('#edit-dialog');
function renderSubtaskEditor(it) {
  const subs = it?.subtasks || [];
  $('#e-subtask-list').innerHTML = subs.length ? subs.map(s => `
    <div class="subtask${s.done ? ' done' : ''}" data-sid="${s.id}"><input type="checkbox" ${s.done ? 'checked' : ''}><span>${esc(s.title)}</span><input type="date" class="sub-date" value="${s.due_date || ''}" title="${t('Due date for this step (optional)')}"><button type="button" class="rm" aria-label="${t('Remove')}">✕</button></div>`).join('')
    : `<p class="muted">${t('Break the project into steps. Give a step its own date and it shows up in the checklist and calendar.')}</p>`;
}
function updateEditVisibility() {
  const t = $('#e-type').value;
  $('#e-subtasks').hidden = t !== 'project' || state.editingId < 0;
  $('#e-grade').hidden = !(t === 'test' || t === 'quiz');
}
function openEdit(it) {
  if (dialog.open) dialog.close();
  state.editingId = it.id;
  $('#edit-heading').textContent = it.title;
  $('#e-title').value = it.title;
  fillSubjectSelect($('#e-subject'), it.subject);
  $('#e-type').value = it.type;
  $('#e-date').value = it.due_date;
  $('#e-time').value = it.due_time || '';
  $('#e-notes').value = it.notes;
  $('#e-done').checked = it.done;
  $('#e-starred').checked = !!it.starred;
  const g = gradeForAssignment(it.id);
  $('#e-grade-field').innerHTML = gradeFieldHtml('e-grade-value', g ? g.grade : '', { empty: true });
  renderSubtaskEditor(it);
  const note = $('#e-recurring-note');
  const rec = it.recurring_id ? state.recurring.find(r => r.id === it.recurring_id) : null;
  note.hidden = !it.recurring_id;
  if (it.recurring_id) note.innerHTML = `🔁 ${t('Part of a repeating series')}${rec ? ` (${everyLabel(rec.interval_weeks)})` : ''}. ${t('Changes here affect only this one.')} <button type="button" class="link-btn" id="e-open-series">${t('Edit the series')}</button>`;
  updateEditVisibility();
  dialog.showModal();
}
for (const dlg of [dialog, $('#rec-dialog')]) dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
$('#e-type').addEventListener('change', updateEditVisibility);
$('#e-cancel').addEventListener('click', () => dialog.close());
$('#e-recurring-note').addEventListener('click', e => {
  if (e.target.id !== 'e-open-series') return;
  const it = state.items.find(i => i.id === state.editingId);
  const rec = state.recurring.find(r => r.id === it?.recurring_id);
  if (rec) { dialog.close(); openRec(rec); }
});
$('#edit-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = state.editingId;
  const before = state.items.find(i => i.id === id);
  const fields = {
    title: $('#e-title').value.trim(),
    subject: subjectOf($('#e-subject')),
    type: $('#e-type').value,
    due_date: $('#e-date').value,
    due_time: $('#e-time').value || null,
    notes: $('#e-notes').value,
    done: $('#e-done').checked,
    starred: $('#e-starred').checked,
  };
  try {
    await updateItem(id, fields);
    if ((fields.type === 'test' || fields.type === 'quiz') && id > 0) {
      const val = $('#e-grade-value').value;
      const existing = gradeForAssignment(id);
      try {
        if (val && !existing) await api('/api/grades', { method: 'POST', body: { assignment_id: id, subject: fields.subject, title: fields.title, grade: val, date: fields.due_date } });
        else if (val && existing && (existing.grade !== val || existing.subject !== fields.subject)) await api(`/api/grades/${existing.id}`, { method: 'PATCH', body: { grade: val, subject: fields.subject, title: fields.title } });
        else if (!val && existing) await api(`/api/grades/${existing.id}`, { method: 'DELETE' });
        loadGrades();
      } catch (err) { if (!err.offline) throw err; toast(t('Grade not saved while offline')); }
    }
    dialog.close();
    const snapshot = { title: before.title, subject: before.subject, type: before.type, due_date: before.due_date, due_time: before.due_time, notes: before.notes, done: before.done, starred: before.starred };
    toast(t('Saved'), () => updateItem(id, snapshot));
  } catch (err) { toast(err.message); }
});
$('#e-delete').addEventListener('click', async () => {
  const id = state.editingId;
  const it = state.items.find(i => i.id === id);
  if (!it) return;
  try {
    await deleteItem(id);
    dialog.close();
    if (id > 0 && !state.offline) loadTrash();
    toast(t('Deleted'), () => undelete(id, it));
  } catch (err) { toast(err.message); }
});
// Duplicate: same thing again for the next lesson of that subject (or next week)
$('#e-duplicate').addEventListener('click', async () => {
  const it = state.items.find(i => i.id === state.editingId);
  if (!it) return;
  const from = it.due_date < todayStr() ? todayStr() : it.due_date;
  const date = nextLesson(it.subject, from) || addDays(from, 7);
  try {
    const created = await createItem({ title: it.title, subject: it.subject, type: it.type, due_date: date, due_time: it.due_time, notes: it.notes, parent_id: it.parent_id });
    if (created.id > 0) for (const st of it.subtasks || []) await api(`/api/assignments/${created.id}/subtasks`, { method: 'POST', body: { title: st.title } });
    dialog.close();
    if (created.pending) return;
    toast(t('Copied to {when}', { when: dueLabel(date) }), () => deleteItem(created.id));
    loadItems();
  } catch (err) { toast(err.message); }
});
$('#e-subtask-add').addEventListener('click', addSubtaskFromDialog);
$('#e-subtask-new').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSubtaskFromDialog(); } });
async function addSubtaskFromDialog() {
  const title = $('#e-subtask-new').value.trim(); if (!title) return;
  const id = state.editingId;
  if ($('#e-type').value !== 'project') return;
  try {
    const it = state.items.find(i => i.id === id);
    if (it.type !== 'project') await updateItem(id, { type: 'project' });
    await api(`/api/assignments/${id}/subtasks`, { method: 'POST', body: { title, due_date: $('#e-subtask-date').value || null } });
    $('#e-subtask-new').value = '';
    $('#e-subtask-date').value = '';
    await loadItems();
    renderSubtaskEditor(state.items.find(i => i.id === id));
  } catch (err) { toast(err.message); }
}
$('#e-subtask-list').addEventListener('click', async e => {
  const row = e.target.closest('.subtask'); if (!row) return;
  const sid = Number(row.dataset.sid);
  try {
    if (e.target.matches('input[type=checkbox]')) await api(`/api/subtasks/${sid}`, { method: 'PATCH', body: { done: e.target.checked } });
    else if (e.target.closest('.rm')) await api(`/api/subtasks/${sid}`, { method: 'DELETE' });
    else return;
    await loadItems();
    renderSubtaskEditor(state.items.find(i => i.id === state.editingId));
  } catch (err) { toast(err.message); }
});
$('#e-subtask-list').addEventListener('change', async e => {
  if (!e.target.matches('.sub-date')) return;
  const sid = Number(e.target.closest('.subtask').dataset.sid);
  try {
    await api(`/api/subtasks/${sid}`, { method: 'PATCH', body: { due_date: e.target.value || null } });
    await loadItems();
    renderSubtaskEditor(state.items.find(i => i.id === state.editingId));
  } catch (err) { toast(err.message); }
});

// ---------- recurring dialog ----------
const recDialog = $('#rec-dialog');
function openRec(r) {
  state.editingRec = r.id;
  $('#r-title').value = r.title; fillSubjectSelect($('#r-subject'), r.subject); $('#r-type').value = r.type;
  $('#r-interval').value = String(r.interval_weeks); $('#r-anchor').value = r.anchor_date;
  $('#r-notes').value = r.notes; $('#r-active').checked = r.active;
  recDialog.showModal();
}
$('#r-cancel').addEventListener('click', () => recDialog.close());
$('#rec-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api(`/api/recurring/${state.editingRec}`, { method: 'PATCH', body: {
      title: $('#r-title').value.trim(), subject: subjectOf($('#r-subject')), type: $('#r-type').value,
      interval_weeks: Number($('#r-interval').value), notes: $('#r-notes').value, active: $('#r-active').checked,
    } });
    recDialog.close(); toast(t('Series saved')); loadRecurring(); loadItems();
  } catch (err) { toast(err.message); }
});
$('#r-delete').addEventListener('click', async () => {
  if (!confirm(t('Delete this repeating series and its upcoming items? Past and completed ones are kept.'))) return;
  try { await api(`/api/recurring/${state.editingRec}`, { method: 'DELETE' }); recDialog.close(); toast(t('Series deleted')); loadRecurring(); loadItems(); }
  catch (err) { toast(err.message); }
});
const everyLabel = n => (n === 1 ? t('every week') : t('every {n} weeks', { n }));
function renderRecurringList() {
  const el = $('#recurring-list');
  if (!state.recurring.length) { el.innerHTML = `<p class="muted">${t('Nothing repeating yet.')}</p>`; return; }
  el.innerHTML = state.recurring.map(r => `
    <div class="rec${r.active ? '' : ' inactive'}" data-rid="${r.id}">
      <div class="what">${r.subject ? subjectChip(r.subject) + ' ' : ''}${esc(r.title)}
        <small>${typeLabel(r.type)} · ${everyLabel(r.interval_weeks)} ${t('on {day}', { day: t(DAY_LABEL[DAYS[dowIndex(r.anchor_date)]]) })}${r.active ? '' : ` ${t('· stopped')}`}</small></div>
      <button class="ghost small edit-rec">${t('Edit')}</button>
    </div>`).join('');
}
$('#recurring-list').addEventListener('click', e => {
  const b = e.target.closest('.edit-rec'); if (!b) return;
  const r = state.recurring.find(x => x.id === Number(b.closest('.rec').dataset.rid));
  if (r) openRec(r);
});

// ---------- settings ----------
function hourOptions(sel, value) {
  sel.innerHTML = Array.from({ length: 24 }, (_, h) => {
    const label = fmtClock(h, 0);
    return `<option value="${h}" ${h === value ? 'selected' : ''}>${label}</option>`;
  }).join('');
}
function renderTimetableEditor() {
  const s = state.settings; if (!s) return;
  const n = Number($('#tt-days').value);
  const ab = abWeeks();
  $('#tt-mode').value = ab ? 'ab' : 'single';
  $('#tt-this-week-label').hidden = !ab;
  $('#tt-copy').hidden = !ab;
  $('#tt-week-B').hidden = !ab;
  $('#tt-week-A h3').hidden = !ab;
  for (const w of ['A', 'B']) {
    $(`#tt-${w}`).innerHTML = DAYS.slice(0, n).map(d => `<label>${t(DAY_LABEL[d])}<textarea data-week="${w}" data-day="${d}" placeholder="${t('08:00 Math&#10;09:00 English')}">${esc(s.timetable[w][d])}</textarea></label>`).join('');
  }
  $('#tt-this-week').value = weekLetter(todayStr());
  $('#tt-lesson').value = lessonMinutes();
  $$('#tt-A textarea, #tt-B textarea').forEach(autoGrow);
}
function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = `${Math.max(84, ta.scrollHeight + 2)}px`; }
document.addEventListener('input', e => { if (e.target.matches('.tt-grid textarea')) autoGrow(e.target); });
function readTimetableEditor() {
  const tt = { A: {}, B: {} };
  $$('#tt-A textarea, #tt-B textarea').forEach(t => { tt[t.dataset.week][t.dataset.day] = t.value; });
  for (const w of ['A', 'B']) for (const d of DAYS) if (tt[w][d] === undefined) tt[w][d] = state.settings.timetable[w][d];
  return tt;
}
function renderHolidays() {
  const list = state.settings?.holidays || [];
  $('#holiday-list').innerHTML = list.map((h, i) => holidayRow(h, i)).join('') || `<p class="muted" id="holiday-empty">${t('No holidays yet.')}</p>`;
}
function holidayRow(h = { name: '', from: '', to: '' }, i = Date.now()) {
  return `<div class="holiday-row" data-i="${i}">
    <input type="text" class="h-name" placeholder="${t('Name (e.g. Winter break)')}" value="${esc(h.name)}">
    <input type="date" class="h-from" value="${h.from}">
    <input type="date" class="h-to" value="${h.to}">
    <button type="button" class="danger small h-remove" aria-label="${t('Remove')}">✕</button>
  </div>`;
}
function readHolidays() {
  return $$('#holiday-list .holiday-row').map(r => ({ name: $('.h-name', r).value.trim() || t('Holiday'), from: $('.h-from', r).value, to: $('.h-to', r).value })).filter(h => h.from && h.to);
}
function renderTerms() {
  const list = terms();
  $('#term-list').innerHTML = list.map((term, i) => termRow(term, i)).join('') || `<p class="muted" id="term-empty">${t('No terms yet.')}</p>`;
}
function termRow(term = { name: '', from: '', to: '' }, i = Date.now()) {
  return `<div class="holiday-row term-row" data-i="${i}">
    <input type="text" class="t-name" placeholder="${t('Name (e.g. Term 1)')}" value="${esc(term.name)}">
    <input type="date" class="t-from" value="${term.from}">
    <input type="date" class="t-to" value="${term.to}">
    <button type="button" class="danger small t-remove" aria-label="${t('Remove')}">✕</button>
  </div>`;
}
function readTerms() {
  return $$('#term-list .term-row').map(r => ({ name: $('.t-name', r).value.trim() || t('Term'), from: $('.t-from', r).value, to: $('.t-to', r).value })).filter(t => t.from && t.to);
}
function renderSubjectList() {
  const list = state.settings?.subjects || [];
  $('#subject-list').innerHTML = list.length
    ? list.map(s => `<div class="subject-row" data-subject="${esc(s)}">
        <input type="color" value="${colorFor(s)}" aria-label="${t('Colour')}" title="${t('Colour')}">
        <span class="name">${esc(s)}</span>
        <button type="button" class="danger small s-remove" aria-label="${t('Remove')}">✕</button>
      </div>`).join('')
    : `<p class="muted">${t('No subjects yet — add your first one below.')}</p>`;
}
$('#subject-add').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('#subject-new');
  const name = input.value.trim().replace(/\s+/g, ' ');
  if (!name) return;
  const list = state.settings?.subjects || [];
  const hit = list.find(s => s.toLowerCase() === name.toLowerCase());
  if (hit) return setStatus('#subject-status', t('{subject} is already in the list.', { subject: hit }), false);
  if (await saveSettings({ subjects: [...list, name] }, '#subject-status')) { input.value = ''; renderSubjectList(); }
  input.focus();
});
$('#subject-list').addEventListener('click', async e => {
  const b = e.target.closest('.s-remove'); if (!b) return;
  const name = b.closest('.subject-row').dataset.subject;
  if (await saveSettings({ subjects: (state.settings?.subjects || []).filter(s => s !== name) }, '#subject-status')) renderSubjectList();
});
$('#subject-list').addEventListener('change', e => {
  const input = e.target.closest('input[type=color]'); if (!input) return;
  const name = input.closest('.subject-row').dataset.subject;
  saveSettings({ subject_colors: { ...(state.settings?.subject_colors || {}), [name]: input.value } }, '#subject-status');
});
// ----- admin: people and the invite code -----
async function renderAdmin() {
  try {
    const [users, inv] = await Promise.all([api('/api/admin/users'), api('/api/admin/invite')]);
    $('#invite-code').textContent = inv.code;
    const me = state.settings?.user?.id;
    $('#user-list').innerHTML = users.map(u => `<div class="user-row" data-uid="${u.id}">
        <div class="who"><b>${esc(u.name)}</b>${u.admin ? ` <span class="badge">${t('admin')}</span>` : ''}<small>${t('{n} items', { n: u.items })} · ${u.last_seen ? t('last seen {when}', { when: agoLabel(u.last_seen) }) : t('never signed in')}</small></div>
        ${u.id === me ? '' : `<button type="button" class="ghost small u-rename">${t('Rename')}</button><button type="button" class="ghost small u-reset">${t('Reset password')}</button><button type="button" class="danger small u-remove" aria-label="${t('Remove')}">✕</button>`}
      </div>`).join('');
  } catch (err) { setStatus('#admin-status', err.message, false); }
}
$('#invite-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#invite-code').textContent); setStatus('#admin-status', t('Invite code copied.'), true); }
  catch { setStatus('#admin-status', $('#invite-code').textContent, true); }
});
$('#invite-new').addEventListener('click', async () => {
  if (!confirm(t('Make a new invite code? The old one stops working.'))) return;
  try { const r = await api('/api/admin/invite', { method: 'POST' }); $('#invite-code').textContent = r.code; setStatus('#admin-status', t('New invite code: {code}', { code: r.code }), true); }
  catch (err) { setStatus('#admin-status', err.message, false); }
});
$('#user-add').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const u = await api('/api/admin/users', { method: 'POST', body: { name: $('#ua-name').value, password: $('#ua-pw').value } });
    setStatus('#admin-status', t('Account for {name} created. Tell them their first password; they can change it in Settings.', { name: u.name }), true);
    $('#ua-name').value = ''; $('#ua-pw').value = '';
    renderAdmin();
  } catch (err) { setStatus('#admin-status', err.message, false); }
});
$('#user-list').addEventListener('click', async e => {
  const row = e.target.closest('.user-row'); if (!row) return;
  const uid = Number(row.dataset.uid), name = $('.who b', row).textContent;
  try {
    if (e.target.closest('.u-rename')) {
      const n = prompt(t('New first name for {name}:', { name }), name); if (n === null) return;
      await api(`/api/admin/users/${uid}`, { method: 'PATCH', body: { name: n } });
      setStatus('#admin-status', t('Renamed.'), true); renderAdmin();
    } else if (e.target.closest('.u-reset')) {
      const pw = prompt(t('New password for {name} (at least 6 characters). They sign in with it and can change it afterwards.', { name })); if (pw === null) return;
      await api(`/api/admin/users/${uid}`, { method: 'PATCH', body: { password: pw } });
      setStatus('#admin-status', t('Password for {name} reset. Their other devices will need to sign in again.', { name }), true);
    } else if (e.target.closest('.u-remove')) {
      if (!confirm(t('Remove {name} and everything they have entered? This cannot be undone.', { name }))) return;
      await api(`/api/admin/users/${uid}`, { method: 'DELETE' });
      setStatus('#admin-status', t('{name} removed.', { name }), true); renderAdmin();
    }
  } catch (err) { setStatus('#admin-status', err.message, false); }
});
$('#ui-go').addEventListener('click', async () => {
  const file = $('#ui-file').files[0], name = $('#ui-name').value.trim();
  if (!name || !file) return setStatus('#admin-status', t('Give the first name and choose the .db file.'), false);
  setStatus('#admin-status', t('Importing…'), true);
  try {
    const res = await apiFetch(`/api/admin/import?name=${encodeURIComponent(name)}`, { method: 'POST', body: file, headers: apiHeaders({ 'Content-Type': 'application/octet-stream' }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || t('Request failed ({status})', { status: res.status }));
    setStatus('#admin-status', t('Imported {name}: {items} items, {grades} grades. They sign in with the password from their old copy.', { name: d.user.name, items: d.counts.assignments, grades: d.counts.grades }), true);
    $('#ui-name').value = ''; $('#ui-file').value = '';
    renderAdmin();
  } catch (err) { setStatus('#admin-status', err.message, false); }
});

async function renderBackups() {
  try {
    const b = await api('/api/backups');
    if (!b.dir) { $('#backup-list').innerHTML = ''; return; }
    $('#backup-list').innerHTML = b.backups.length
      ? `<li><small>${t('Folder on the server: {dir}', { dir: esc(b.dir) })}</small></li>` + b.backups.slice(0, 5).map(x => `<li>${esc(x.file)} <small>(${Math.round(x.size / 1024)} KB)</small></li>`).join('')
      : `<li><small>${t('No backups yet — the first one is made a few seconds after the app starts. Folder: {dir}', { dir: esc(b.dir) })}</small></li>`;
  } catch { /* ignore */ }
}

async function loadSettings({ full = false } = {}) {
  try {
    state.settings = await api('/api/settings');
    LS.set('hw_settings', state.settings);
    applyTheme();
  } catch (err) {
    if (err.offline) { state.settings = state.settings || LS.get('hw_settings', null); applyTheme(); setOnline(false); }
    else toast(t('Could not load settings: {err}', { err: err.message }));
    if (!state.settings) return;
  }
  if (!full) return;
  const s = state.settings;
  const me = s.user || {};
  $$('.admin-only').forEach(el => { el.hidden = !me.admin; });
  $('#s-whoami').textContent = me.name ? (me.admin ? t('Signed in as {name} (admin).', { name: me.name }) : t('Signed in as {name}.', { name: me.name })) : '';
  if (me.admin) renderAdmin();
  $('#s-topic').value = s.ntfy_topic;
  $('#s-server').value = s.ntfy_server;
  hourOptions($('#s-remind-hour'), s.remind_hour);
  hourOptions($('#s-summary-hour'), s.daily_summary_hour);
  hourOptions($('#s-digest-hour'), s.weekly_digest_hour);
  $('#s-summary').checked = s.daily_summary;
  $('#s-digest').checked = s.weekly_digest;
  hourOptions($('#s-pack-hour'), s.pack_hour);
  $('#s-pack').checked = s.pack_reminder;
  $('#s-digest-day').value = String(s.weekly_digest_day);
  for (const t of TYPES) { const el = $(`#s-days-${t}`); if (el) el.value = (s.remind_days[t] || []).join(', '); }
  $('#s-theme').value = s.theme; $('#s-accent').value = s.accent;
  $('#s-grade-scale').value = gradeScale();
  $('#s-language').value = LANG;
  $('#s-backup-dir').value = s.backup_dir;
  renderTimetableEditor();
  renderHolidays();
  renderTerms();
  renderSubjectList();
  renderBackups();
  loadRecurring();
  try {
    const info = await api('/api/info');
    const rows = [];
    if (info.public_url) rows.push(`<li><b>${esc(info.public_url)}</b> <small>${t('(from anywhere)')}</small></li>`);
    for (const a of info.addresses) rows.push(`<li>http://${a.address}:${info.port} <small>(${esc(a.name)})</small></li>`);
    $('#s-addresses').innerHTML = rows.length ? rows.join('') : `<li>${t('No network address found — is it connected to the network?')}</li>`;
  } catch { /* ignore */ }
}
const statusTimers = {};
function setStatus(sel, msg, ok) {
  const el = $(sel); el.textContent = msg; el.className = `status ${ok ? 'ok' : 'err'}`;
  clearTimeout(statusTimers[sel]);
  if (ok) statusTimers[sel] = setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 5000);   // success notes fade out
}
async function saveSettings(body, statusSel) {
  try {
    state.settings = await api('/api/settings', { method: 'PUT', body });
    LS.set('hw_settings', state.settings);
    applyTheme(); render();
    if (statusSel) setStatus(statusSel, t('Saved.'), true);
    return true;
  } catch (err) { if (statusSel) setStatus(statusSel, err.message, false); return false; }
}

$('#tt-days').addEventListener('change', () => { const tt = readTimetableEditor(); state.settings.timetable = tt; renderTimetableEditor(); });
$('#tt-copy').addEventListener('click', () => { $$('#tt-A textarea').forEach(t => { const b = $(`#tt-B textarea[data-day="${t.dataset.day}"]`); if (b) b.value = t.value; }); });
$('#tt-mode').addEventListener('change', () => { state.settings.timetable = readTimetableEditor(); state.settings.week_mode = $('#tt-mode').value; renderTimetableEditor(); });
$('#tt-save').addEventListener('click', async () => {
  const body = { timetable: readTimetableEditor(), week_mode: $('#tt-mode').value, lesson_minutes: Math.min(180, Math.max(10, Math.round(Number($('#tt-lesson').value) || 45))) };
  if (body.week_mode === 'ab') body.week_anchor = { date: mondayOf(todayStr()), letter: $('#tt-this-week').value };
  await saveSettings(body, '#tt-status');
  renderSubjectList();
});
$('#s-save-grades').addEventListener('click', () => saveSettings({ grade_scale: $('#s-grade-scale').value }, '#s-grades-status'));
$('#s-save-language').addEventListener('click', async () => {
  const language = $('#s-language').value;
  if (await saveSettings({ language }, '#s-language-status')) { setLang(language); location.reload(); }
});
$('#holiday-add').addEventListener('click', () => {
  $('#holiday-empty')?.remove();
  $('#holiday-list').insertAdjacentHTML('beforeend', holidayRow());
  $('#holiday-list .holiday-row:last-child .h-name').focus();
});
$('#holiday-list').addEventListener('click', e => { const b = e.target.closest('.h-remove'); if (b) { b.closest('.holiday-row').remove(); if (!$('#holiday-list .holiday-row')) renderHolidays(); } });
$('#holiday-save').addEventListener('click', async () => { if (await saveSettings({ holidays: readHolidays() }, '#holiday-status')) renderHolidays(); });
$('#term-add').addEventListener('click', () => {
  $('#term-empty')?.remove();
  const existing = readTerms();
  const last = existing[existing.length - 1];
  const from = last && last.to >= todayStr() ? addDays(last.to, 1) : todayStr();
  const to = dateStr(new Date(parseDate(from).getFullYear(), parseDate(from).getMonth() + 4, parseDate(from).getDate()));
  $('#term-list').insertAdjacentHTML('beforeend', termRow({ name: t('Term {n}', { n: existing.length + 1 }), from, to }));
  $('#term-list .term-row:last-child .t-name').focus();
});
$('#term-list').addEventListener('click', e => { const b = e.target.closest('.t-remove'); if (b) { b.closest('.term-row').remove(); if (!$('#term-list .term-row')) renderTerms(); } });
$('#term-save').addEventListener('click', async () => { if (await saveSettings({ terms: readTerms() }, '#term-status')) { state.term = null; renderTerms(); } });
$('#s-save-appearance').addEventListener('click', () => saveSettings({ theme: $('#s-theme').value, accent: $('#s-accent').value }, '#s-appearance-status'));
$('#s-theme').addEventListener('change', () => { state.settings.theme = $('#s-theme').value; applyTheme(); });
$('#s-accent').addEventListener('input', () => { state.settings.accent = $('#s-accent').value; applyTheme(); });
$('#s-save-ntfy').addEventListener('click', () => saveSettings({ ntfy_topic: $('#s-topic').value, ntfy_server: $('#s-server').value }, '#s-ntfy-status'));
$('#s-test').addEventListener('click', async () => {
  setStatus('#s-ntfy-status', t('Sending…'), true);
  if (!await saveSettings({ ntfy_topic: $('#s-topic').value, ntfy_server: $('#s-server').value })) return setStatus('#s-ntfy-status', t('Could not save settings'), false);
  try { await api('/api/notify/test', { method: 'POST' }); setStatus('#s-ntfy-status', t('Sent! Check your phone.'), true); }
  catch (err) { setStatus('#s-ntfy-status', err.message, false); }
});
$('#s-save-reminders').addEventListener('click', async () => {
  const parseDays = v => v.split(/[\s,]+/).filter(Boolean).map(Number).filter(n => Number.isInteger(n) && n >= 0);
  const body = {
    remind_hour: Number($('#s-remind-hour').value),
    daily_summary: $('#s-summary').checked, daily_summary_hour: Number($('#s-summary-hour').value),
    weekly_digest: $('#s-digest').checked, weekly_digest_day: Number($('#s-digest-day').value), weekly_digest_hour: Number($('#s-digest-hour').value),
    pack_reminder: $('#s-pack').checked, pack_hour: Number($('#s-pack-hour').value),
    remind_days: {},
  };
  for (const t of TYPES) body.remind_days[t] = parseDays($(`#s-days-${t}`).value);
  if (await saveSettings(body, '#s-reminder-status')) for (const t of TYPES) $(`#s-days-${t}`).value = state.settings.remind_days[t].join(', ');
});
$('#s-save-backup').addEventListener('click', async () => { await saveSettings({ backup_dir: $('#s-backup-dir').value }, '#s-backup-status'); renderBackups(); });
$('#s-backup-now').addEventListener('click', async () => {
  await saveSettings({ backup_dir: $('#s-backup-dir').value });
  try { const r = await api('/api/backups', { method: 'POST' }); setStatus('#s-backup-status', t('Backed up to {file}', { file: r.file }), true); renderBackups(); }
  catch (err) { setStatus('#s-backup-status', err.message, false); }
});
// fetched rather than a plain link so it also works from the fixed link (token in the header)
$('#s-backup-download').addEventListener('click', async e => {
  e.preventDefault();
  try {
    const res = await apiFetch('/api/backups/download', { headers: apiHeaders(), cache: 'no-store' });
    if (!res.ok) throw new Error(t('Request failed ({status})', { status: res.status }));
    const name = (/filename="?([^";]+)/.exec(res.headers.get('content-disposition') || '') || [])[1] || `homework-${todayStr()}.db`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob()); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  } catch (err) { setStatus('#s-backup-status', err.message, false); }
});
$('#s-restore').addEventListener('click', async () => {
  const file = $('#s-restore-file').files[0];
  if (!file) return setStatus('#s-restore-status', t('Choose a backup file first (a .db file from Download backup or the OneDrive folder).'), false);
  if (!confirm(`${t('Replace everything with "{name}"?', { name: file.name })}\n\n${t("All homework, grades and settings on the server will be swapped for what's in this file. A safety copy of the current data is saved first. Your password stays the same.")}`)) return;
  setStatus('#s-restore-status', t('Restoring…'), true);
  try {
    const res = await apiFetch('/api/backups/restore', { method: 'POST', body: file, headers: apiHeaders({ 'Content-Type': 'application/octet-stream' }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('Restore failed ({status})', { status: res.status }));
    const c = data.counts || {};
    setStatus('#s-restore-status', t('Restored {items} items and {grades} grades. Previous data saved as {file}.', { items: c.assignments ?? 0, grades: c.grades ?? 0, file: data.safety.split(/[\\/]/).pop() }), true);
    $('#s-restore-file').value = '';
    await loadSettings({ full: true });
    await Promise.all([loadItems(), loadGrades(), loadRecurring(), loadTrash()]);
    render();
  } catch (err) { setStatus('#s-restore-status', err.offline ? t('You are offline.') : err.message, false); }
});
$('#s-change-pw').addEventListener('click', async () => {
  const current = $('#s-pw-current').value, password = $('#s-pw-new').value, again = $('#s-pw-again').value;
  if (password !== again) return setStatus('#s-pw-status', t('New passwords don\'t match.'), false);
  try {
    await api('/api/password', { method: 'POST', body: { current, password } });
    $('#s-pw-current').value = $('#s-pw-new').value = $('#s-pw-again').value = '';
    setStatus('#s-pw-status', t('Password changed. Other devices will need to sign in again.'), true);
  } catch (err) { setStatus('#s-pw-status', err.message, false); }
});
$('#s-logout').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch { /* ignore */ }
  goLogin();
});

// ---------- views ----------
function switchView(view) {
  state.view = view;
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(v => { v.hidden = v.id !== `view-${view}`; });
  if (view === 'settings') loadSettings({ full: true });
  if (view === 'stats') renderStats();
  if (view === 'timetable') renderTimetableView();
  if (view === 'subject') renderSubjectPage();
  window.scrollTo(0, 0);
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) switchView(b.dataset.view); });

// ---------- live sync (long-polling) ----------
// Ask the server "anything new since #seq?"; it answers as soon as something
// changes (or after ~25s with nothing). Works through any proxy or tunnel.
let liveSeq = -1;
let liveAbort = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function liveLoop() {
  while (true) {
    liveAbort = new AbortController();
    try {
      const res = await apiFetch(`/api/changes?since=${liveSeq}`, { signal: liveAbort.signal, cache: 'no-store', headers: apiHeaders() });
      if (res.status === 401) { goLogin(); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const r = await res.json();
      const first = liveSeq < 0;
      liveSeq = r.seq;
      setOnline(true);
      if (outbox.length) flushOutbox();
      if (!first) {
        if (r.kinds.includes('changed')) { await loadItems(); loadTrash(); }
        if (r.kinds.includes('grades')) await loadGrades();
        if (r.kinds.includes('settings')) {
          await loadSettings({ full: state.view === 'settings' });
          const wanted = state.settings?.language === 'sq' ? 'sq' : 'en';
          if (wanted !== LANG) { setLang(wanted); location.reload(); return; }
          render();
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') { await sleep(200); continue; }
      setOnline(false);
      await sleep(3000);
    }
  }
}
function nudgeLive() { if (liveAbort) liveAbort.abort(); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  loadItems();
  nudgeLive();
});
window.addEventListener('online', () => { loadItems(); nudgeLive(); });

let lastDay = todayStr();
setInterval(() => {
  if (todayStr() !== lastDay) { lastDay = todayStr(); render(); }
  else if (state.view === 'list') { renderQuickAdd(); renderExamStrip(); renderNowBar(); }
  else if (state.view === 'timetable') renderTimetableView();
}, 60 * 1000);

// ---------- timetable view ----------
// The week as a table: periods down, days across, subjects in their colours, double
// lessons merged, today's column and the lesson running right now highlighted.
state.ttWeek = 'this';   // 'this' | 'next'
const DAY_SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
function renderTimetableView() {
  const el = $('#tt-page');
  if (!hasTimetable()) {
    el.innerHTML = `<div class="card empty">${t('No timetable yet.')} <a href="#settings">${t('Add it in Settings → Timetable.')}</a></div>`;
    return;
  }
  const today = todayStr();
  const monday = addDays(mondayOf(today), state.ttWeek === 'next' ? 7 : 0);
  const letter = weekLetter(monday);
  const tt = state.settings.timetable[letter];
  const days = DAYS.filter((d, i) => i < 5 || weeksInUse().some(w => state.settings.timetable[w][d].trim()));
  const cols = days.map((d, i) => {
    const date = addDays(monday, DAYS.indexOf(d));
    const hol = holidayOn(date);
    return { d, date, hol, classes: hol ? [] : parseDay(tt[d]) };
  });
  const rows = Math.max(0, ...cols.map(c => c.classes.length));
  // one time column when every day starts its periods at the same times, else times inside the cells
  const rowTime = [];
  for (let i = 0; i < rows; i++) {
    const times = [...new Set(cols.map(c => c.classes[i]?.time).filter(Boolean))];
    rowTime.push(times.length === 1 ? times[0] : null);
  }
  const uniform = rowTime.every((x, i) => x || cols.every(c => !c.classes[i]));
  const now = new Date();
  const nowIdx = state.ttWeek === 'this' ? currentClassIndex(classesOn(today), now) : -1;
  const hhmm = mins => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  const endOf = (classes, i) => (classes[i].time && Number.isFinite(classEnd(classes, i)) ? hhmm(classEnd(classes, i)) : '');

  const head = `<tr><th class="time">${uniform ? t('Time') : ''}</th>${cols.map(c => {
    const isToday = c.date === today;
    return `<th class="${isToday ? 'today' : ''}${c.hol ? ' hol' : ''}"><span class="dn">${t(DAY_SHORT[c.d])}</span><span class="dd">${isToday ? t('Today') : shortDate(c.date)}</span></th>`;
  }).join('')}</tr>`;

  const body = [];
  const skip = cols.map(() => 0);   // rows still covered by a merged cell above
  for (let i = 0; i < rows; i++) {
    const cells = cols.map((c, ci) => {
      if (skip[ci] > 0) { skip[ci]--; return ''; }
      if (c.hol) return i === 0 ? `<td class="holiday" rowspan="${rows}"><div class="les hol"><span>🏖</span>${esc(c.hol.name)}</div></td>` : '';
      const cls = c.classes[i];
      if (!cls) return `<td class="empty">·</td>`;
      let span = 1;
      while (c.classes[i + span] && c.classes[i + span].subject.toLowerCase() === cls.subject.toLowerCase()) span++;
      skip[ci] = span - 1;
      const isNow = c.date === today && nowIdx >= i && nowIdx < i + span;
      const timeIn = !uniform && cls.time ? `<small>${cls.time}</small>` : '';
      return `<td${span > 1 ? ` rowspan="${span}"` : ''}><button type="button" class="les${isNow ? ' now' : ''}${span > 1 ? ' dbl' : ''}" style="--subj:${colorFor(cls.subject)}" data-subject="${esc(cls.subject)}"><span class="dot"></span><span class="nm">${esc(cls.subject)}</span>${timeIn}${isNow ? `<span class="now-tag">${t('now')}</span>` : ''}</button></td>`;
    }).join('');
    const ref = uniform && rowTime[i] ? cols.find(c => c.classes[i]?.time) : null;
    const end = ref ? endOf(ref.classes, i) : '';
    const timeCell = `<td class="time"><b>${ref ? rowTime[i] : i + 1}</b>${end ? `<span>${end}</span>` : ''}</td>`;
    body.push(`<tr>${timeCell}${cells}</tr>`);
  }

  const weekHol = weekIsHoliday(monday) ? holidayOn(monday) : null;
  el.innerHTML = `
    <div class="tt-head">
      <div>
        <h2>${t('Timetable')}${abWeeks() ? ` <span class="tt-letter">${t('Week {letter}', { letter })}</span>` : ''}</h2>
        <p class="muted">${shortDate(monday)} – ${shortDate(addDays(monday, days.length - 1))}${weekHol ? ` · 🏖 ${esc(weekHol.name)}` : ''}</p>
      </div>
      <div class="seg" id="tt-week-seg">
        <button type="button" data-week="this" class="${state.ttWeek === 'this' ? 'active' : ''}">${t('This week')}</button>
        <button type="button" data-week="next" class="${state.ttWeek === 'next' ? 'active' : ''}">${t('Next week')}</button>
      </div>
    </div>
    <div class="tt-table-wrap"><table class="tt-table"><thead>${head}</thead><tbody>${body.join('')}</tbody></table></div>
    ${abWeeks() ? `<p class="muted tt-foot">${t('Weeks alternate A/B; the letter above is this table\'s week.')}</p>` : ''}`;
  // on a phone the table scrolls sideways: start on today's column
  const wrap = $('.tt-table-wrap', el), th = $('th.today', el);
  if (wrap && th && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = Math.max(0, th.offsetLeft - 70);
}
$('#tt-page').addEventListener('click', e => {
  const seg = e.target.closest('#tt-week-seg button');
  if (seg) { state.ttWeek = seg.dataset.week; renderTimetableView(); return; }
  const les = e.target.closest('button.les[data-subject]');
  if (les) openSubject(les.dataset.subject);
});

// ---------- links from notifications ----------
// A tap on a phone notification opens e.g. /#item/12, /#day/2026-09-18, /#week/2026-09-21
// or /#calendar. Handled once, then the hash is removed so a reload doesn't repeat it.
function handleHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (dialog.open) dialog.close();
  if (recDialog.open) recDialog.close();
  let m;
  if ((m = h.match(/^item\/(\d+)$/))) {
    const it = state.items.find(i => i.id === Number(m[1]));
    switchView('list');
    if (!it) { toast(t('That item is no longer there')); return; }
    openEdit(it);
    const row = $(`.item[data-id="${it.id}"]`);
    if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 3000); }
  } else if ((m = h.match(/^(day|week)\/(\d{4}-\d{2}-\d{2})$/))) {
    state.selectedDay = m[2];
    setCalMode(m[1]);
    switchView('calendar');
  } else if (h === 'add') {              // "Add homework" in the Windows taskbar menu
    switchView('list');
    $('#qa-title').focus();
  } else if (['list', 'calendar', 'timetable', 'stats', 'settings'].includes(h)) {
    switchView(h);
  }
}
window.addEventListener('hashchange', handleHash);

// ---------- boot ----------
applyLanguage();
(async () => {
  await initSite();
  if (HOSTED && !API_BASE && !LS.get('hw_settings', null)) { location.replace(loginUrl()); return; }   // first visit and the Pi can't be found: say so
  await loadSettings();
  const wanted = state.settings?.language === 'sq' ? 'sq' : 'en';
  if (wanted !== LANG) { setLang(wanted); applyLanguage(); }
  if (!$('#qa-title').value) qaDate.value = nextSchoolDay();
  await Promise.all([loadItems(), loadGrades(), loadRecurring(), loadTrash()]);
  render();
  handleHash();
  liveLoop();
})();
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
