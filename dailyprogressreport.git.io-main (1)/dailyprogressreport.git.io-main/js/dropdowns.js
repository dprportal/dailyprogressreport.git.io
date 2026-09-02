/* =============================================
   DROPDOWN OPTIONS MANAGER  (Admin)
   Lets the admin add / rename / remove the choices
   shown in the form's dropdowns (Contractor, Pipe
   Diameter, Activity, Surface Type, Test Result).
   Lists are stored in Firestore (settings/dropdowns)
   so every user gets the same options.
   ============================================= */
import { DataService, COLLECTIONS } from './firebase.js?v=15';
import { State } from './auth.js?v=15';
import { AppUtils } from './app.js?v=15';

const DOC_ID = 'dropdowns';

/* Built-in defaults — used to seed Firestore the first time,
   and as a fallback if the database can't be reached. */
const DEFAULTS = {
  contractor: ["SAI", "Rohit", "Kulbhushan", "Khajan Singh", "Jarnail Singh", "RK", "Shabdbhaid", "Brij", "Roshan", "Chandresh", "Mahindar", "Ajay Thakur", "Sandeep", "Surendar Hansreta"],
  pipeDia: [15, 20, 25, 32, 40, 50, 63, 75, 80, 90, 100, 110, 125, 140, 150, 160, 180, 200, 225, 250, 280, 300, 315, 350, 400, 450, 500, 600].map(String),
  layingWork: ["Distribution Main", "Transmission Main", "House Service Connection", "Restoration"],
  surfaceType: ["Concrete Road", "Bituminous Road", "Interlocking Pavers", "Earthen Surface", "Footpath"],
  testResult: ["Passed", "Failed", "Leakage Observed", "Retesting Required"]
};

/* Which managed list maps to which <select> elements in the form */
const LISTS = [
  { key: 'contractor',  label: 'Contractor',             selects: ['f_contractor', 'filt_contractor'], sort: 'alpha' },
  { key: 'pipeDia',     label: 'Pipe Diameter (mm)',     selects: ['f_pipeDia'], sort: 'num', suffix: ' mm', numeric: true },
  { key: 'layingWork',  label: 'Activity (Laying Work)', selects: ['f_laying'] },
  { key: 'surfaceType', label: 'Surface Type',           selects: ['f_surfaceType'] },
  { key: 'testResult',  label: 'Test Result',            selects: ['f_testResult'] }
];

let currentKey = 'contractor';
let editingValue = null;
let confirmingValue = null;

const cfgOf = key => LISTS.find(l => l.key === key);

function getOptions(key) {
  const store = (State.dropdownOptions && State.dropdownOptions[key]) || DEFAULTS[key] || [];
  return store.slice();
}

function sortForDisplay(key, arr) {
  const cfg = cfgOf(key);
  const a = arr.slice();
  if (cfg && cfg.sort === 'alpha') a.sort((x, y) => String(x).localeCompare(String(y)));
  else if (cfg && cfg.sort === 'num') a.sort((x, y) => Number(x) - Number(y));
  return a;
}

/* ---------- Load from Firestore (seed defaults if missing) ---------- */
async function loadDropdownOptions() {
  try {
    const docData = await DataService.getById(COLLECTIONS.SETTINGS, DOC_ID);
    const merged = {};
    let needSeed = !docData;
    for (const l of LISTS) {
      const fromDoc = docData && Array.isArray(docData[l.key]) ? docData[l.key].map(String) : null;
      if (fromDoc && fromDoc.length) {
        merged[l.key] = fromDoc;
      } else {
        merged[l.key] = DEFAULTS[l.key].slice();
        needSeed = true; // this list was missing -> persist a default for it
      }
    }
    State.dropdownOptions = merged;
    if (needSeed && State.currentRole === 'admin') {
      try { await DataService.set(COLLECTIONS.SETTINGS, DOC_ID, merged); } catch (e) { /* non-fatal */ }
    }
  } catch (e) {
    console.error('loadDropdownOptions failed, using built-in defaults', e);
    const merged = {};
    for (const l of LISTS) merged[l.key] = DEFAULTS[l.key].slice();
    State.dropdownOptions = merged;
  }
  applyToForm();
}

/* ---------- Apply options to the real <select> elements ---------- */
function fillSelect(selId, values, suffix) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const prev = sel.value;
  while (sel.options.length > 1) sel.remove(1); // keep the first (placeholder) option
  values.forEach(v => {
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = String(v) + (suffix || '');
    sel.appendChild(o);
  });
  if (prev && values.map(String).includes(prev)) sel.value = prev;
}

function applyToForm() {
  for (const l of LISTS) {
    const vals = sortForDisplay(l.key, getOptions(l.key));
    l.selects.forEach(selId => fillSelect(selId, vals, l.suffix));
  }
}

/* ---------- Save a list to Firestore ---------- */
async function saveList(key, arr) {
  State.dropdownOptions = State.dropdownOptions || {};
  const prev = (State.dropdownOptions[key] || []).slice();
  State.dropdownOptions[key] = arr.slice();
  AppUtils.showBusy('Saving…');
  try {
    await DataService.set(COLLECTIONS.SETTINGS, DOC_ID, { [key]: arr.slice() });
    applyToForm();
    return true;
  } catch (e) {
    console.error('saveList failed', e);
    State.dropdownOptions[key] = prev; // roll back in memory
    AppUtils.toast('Could not save. Check your connection.', true);
    return false;
  } finally {
    AppUtils.hideBusy();
  }
}

/* ---------- Admin UI ---------- */
function render() {
  const wrap = document.getElementById('dropdown-manager');
  if (!wrap) return;
  const cfg = cfgOf(currentKey);
  const values = sortForDisplay(currentKey, getOptions(currentKey));
  const esc = AppUtils.esc;

  const tabs = LISTS.map(l =>
    `<button class="dd-tab ${l.key === currentKey ? 'active' : ''}" data-ddkey="${l.key}">${esc(l.label)}</button>`
  ).join('');

  const rows = values.map(v => {
    const val = String(v);
    if (editingValue === val) {
      return `<div class="dd-row editing">
        <input type="${cfg.numeric ? 'number' : 'text'}" class="sw-input dd-edit-input" value="${esc(val)}" ${cfg.numeric ? 'step="any" min="0"' : ''}>
        <div class="dd-row-actions">
          <button class="icon-btn-sm dd-edit-save" data-val="${esc(val)}" title="Save"><i class="fa-solid fa-check"></i></button>
          <button class="icon-btn-sm dd-edit-cancel" title="Cancel"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>`;
    }
    if (confirmingValue === val) {
      return `<div class="dd-row confirming">
        <span class="dd-val">Remove “${esc(val)}”?</span>
        <div class="dd-row-actions">
          <button class="icon-btn-sm del dd-del-yes" data-val="${esc(val)}" title="Yes, remove"><i class="fa-solid fa-check"></i></button>
          <button class="icon-btn-sm dd-del-no" title="Keep"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>`;
    }
    return `<div class="dd-row">
      <span class="dd-val">${esc(val)}${cfg.suffix ? `<span class="dd-suffix">${esc(cfg.suffix.trim())}</span>` : ''}</span>
      <div class="dd-row-actions">
        <button class="icon-btn-sm dd-edit" data-val="${esc(val)}" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn-sm del dd-del" data-val="${esc(val)}" title="Remove"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="dd-tabs">${tabs}</div>
    <div class="dd-add">
      <input type="${cfg.numeric ? 'number' : 'text'}" id="dd-new-input" class="sw-input"
             placeholder="Add new ${esc(cfg.label.toLowerCase())}…" ${cfg.numeric ? 'step="any" min="0"' : ''}>
      <button class="sw-btn sw-btn-primary" id="dd-add-btn"><i class="fa-solid fa-plus"></i> Add</button>
    </div>
    <div class="dd-count">${values.length} option${values.length === 1 ? '' : 's'} · changes apply to everyone</div>
    <div class="dd-list">${rows || '<p class="hint">No options yet — add one above.</p>'}</div>
  `;
  bind();
}

function bind() {
  const wrap = document.getElementById('dropdown-manager');
  if (!wrap) return;

  wrap.querySelectorAll('.dd-tab').forEach(b => b.addEventListener('click', () => {
    currentKey = b.dataset.ddkey; editingValue = null; confirmingValue = null; render();
  }));

  const addInput = wrap.querySelector('#dd-new-input');
  const doAdd = async () => {
    const cfg = cfgOf(currentKey);
    let v = (addInput.value || '').trim();
    if (!v) { addInput.focus(); return; }
    if (cfg.numeric && isNaN(Number(v))) { AppUtils.toast('Enter a valid number.', true); return; }
    const arr = getOptions(currentKey);
    if (arr.map(x => String(x).toLowerCase()).includes(v.toLowerCase())) { AppUtils.toast('That option already exists.', true); return; }
    arr.push(v);
    if (await saveList(currentKey, arr)) { AppUtils.toast('Option added.'); addInput.value = ''; render(); }
  };
  const addBtn = wrap.querySelector('#dd-add-btn');
  if (addBtn) addBtn.addEventListener('click', doAdd);
  if (addInput) addInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });

  wrap.querySelectorAll('.dd-edit').forEach(b => b.addEventListener('click', () => {
    editingValue = b.dataset.val; confirmingValue = null; render();
    const i = wrap.querySelector('.dd-edit-input'); if (i) { i.focus(); i.select(); }
  }));
  wrap.querySelectorAll('.dd-edit-cancel').forEach(b => b.addEventListener('click', () => { editingValue = null; render(); }));
  wrap.querySelectorAll('.dd-edit-save').forEach(b => b.addEventListener('click', async () => {
    const cfg = cfgOf(currentKey);
    const oldVal = b.dataset.val;
    const input = wrap.querySelector('.dd-edit-input');
    let nv = (input.value || '').trim();
    if (!nv) { input.focus(); return; }
    if (cfg.numeric && isNaN(Number(nv))) { AppUtils.toast('Enter a valid number.', true); return; }
    const arr = getOptions(currentKey);
    if (nv !== oldVal && arr.map(x => String(x).toLowerCase()).includes(nv.toLowerCase())) { AppUtils.toast('That option already exists.', true); return; }
    const idx = arr.findIndex(x => String(x) === oldVal);
    if (idx >= 0) arr[idx] = nv;
    if (await saveList(currentKey, arr)) { AppUtils.toast('Option updated.'); editingValue = null; render(); }
  }));

  wrap.querySelectorAll('.dd-del').forEach(b => b.addEventListener('click', () => { confirmingValue = b.dataset.val; editingValue = null; render(); }));
  wrap.querySelectorAll('.dd-del-no').forEach(b => b.addEventListener('click', () => { confirmingValue = null; render(); }));
  wrap.querySelectorAll('.dd-del-yes').forEach(b => b.addEventListener('click', async () => {
    const val = b.dataset.val;
    const arr = getOptions(currentKey).filter(x => String(x) !== val);
    if (await saveList(currentKey, arr)) { AppUtils.toast('Option removed.'); confirmingValue = null; render(); }
  }));
}

/* ---------- Init ---------- */
function init() {
  window.addEventListener('app:boot', async () => { await loadDropdownOptions(); });
  window.addEventListener('app:navigate', (e) => {
    if (e.detail && e.detail.page === 'admin') { editingValue = null; confirmingValue = null; render(); }
  });
  // keep selects populated if data is refreshed
  window.addEventListener('app:refresh', () => applyToForm());
}
init();

export { loadDropdownOptions, applyToForm };
