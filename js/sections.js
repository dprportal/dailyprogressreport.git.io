/* =============================================
   SECTION MANAGEMENT  (Admin -> Settings)
   Lets the admin add / rename / delete / reorder the sections
   that group fields on the DPR form, and move fields between
   them. Built-in sections map to the app's existing fixed cards;
   admin-added sections get their own dynamically-created card.
   Stored in Firestore at settings/sections so every user sees
   the same layout & order. Broadcasts "sections:changed" so
   dpr.js (form layout) and field-editor.js (section pickers)
   stay in sync.
   ============================================= */
import { DataService, COLLECTIONS } from './firebase.js?v=22';
import { State } from './auth.js?v=22';
import { AppUtils } from './app.js?v=22';

const DOC_ID = 'sections';

// Built-in sections — id must match SECTION_CONTAINER_SELECTOR keys in dpr.js
const DEFAULT_SECTIONS = [
  { id: 'location',    label: 'Location',                    order: 0,  builtIn: true },
  { id: 'pipe',        label: 'Pipe Specification',          order: 1,  builtIn: true },
  { id: 'joints',      label: 'Joints, Welding & Testing',   order: 2,  builtIn: true },
  { id: 'excavation',  label: 'Excavation Details',          order: 3,  builtIn: true },
  { id: 'restoration', label: 'Restoration',                 order: 4,  builtIn: true },
  { id: 'hydro',       label: 'Hydro Test',                  order: 5,  builtIn: true },
  { id: 'fittings',    label: 'Fittings & Meters',           order: 6,  builtIn: true },
  { id: 'manpower',    label: 'Manpower & Time',              order: 7,  builtIn: true },
  { id: 'contractor',  label: 'Contractor',                  order: 8,  builtIn: true },
  { id: 'remarks',     label: 'Remarks',                     order: 9,  builtIn: true },
  { id: 'custom',      label: 'Custom Section',              order: 10, builtIn: true }
];

let confirmingId = null;
let editingId = null;

function slugify(label) {
  const base = String(label).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  let id = 'sec-' + (base || 'section');
  let n = 1;
  const taken = new Set((State.sections || []).map(s => s.id));
  while (taken.has(id)) { id = 'sec-' + (base || 'section') + '-' + (++n); }
  return id;
}

function getSections() {
  return (State.sections && State.sections.length ? State.sections : DEFAULT_SECTIONS).slice().sort((a, b) => a.order - b.order);
}

async function loadSections() {
  try {
    const doc = await DataService.getById(COLLECTIONS.SETTINGS, DOC_ID);
    if (doc && Array.isArray(doc.list) && doc.list.length) {
      State.sections = doc.list;
    } else {
      State.sections = DEFAULT_SECTIONS.slice();
      if (State.currentRole === 'admin') {
        try { await DataService.set(COLLECTIONS.SETTINGS, DOC_ID, { list: State.sections }); } catch (e) { /* non-fatal */ }
      }
    }
  } catch (e) {
    console.error('loadSections failed, using built-in defaults', e);
    State.sections = DEFAULT_SECTIONS.slice();
  }
  window.dispatchEvent(new CustomEvent('sections:changed'));
}

async function persist(list) {
  State.sections = list;
  try {
    await DataService.set(COLLECTIONS.SETTINGS, DOC_ID, { list });
    window.dispatchEvent(new CustomEvent('sections:changed'));
    return true;
  } catch (e) {
    console.error('saveSections failed', e);
    AppUtils.toast('Could not save. Check your connection.', true);
    return false;
  }
}

async function addSection(label) {
  const list = getSections();
  const id = slugify(label);
  const maxOrder = list.reduce((m, s) => Math.max(m, s.order), -1);
  list.push({ id, label: label.trim(), order: maxOrder + 1, builtIn: false });
  AppUtils.showBusy('Adding section…');
  const ok = await persist(list);
  AppUtils.hideBusy();
  return ok;
}

async function renameSection(id, newLabel) {
  const list = getSections();
  const sec = list.find(s => s.id === id);
  if (!sec) return false;
  sec.label = newLabel.trim();
  AppUtils.showBusy('Saving…');
  const ok = await persist(list);
  AppUtils.hideBusy();
  return ok;
}

async function deleteSection(id) {
  const list = getSections().filter(s => s.id !== id);
  AppUtils.showBusy('Removing section…');
  try {
    // Reassign any field (built-in or custom) using this section to the fallback "custom" section
    const affected = (State.fieldDefs || []).filter(f => f.section === id);
    for (const f of affected) {
      await DataService.update(COLLECTIONS.FIELD_DEFS, f.id, { section: 'custom' });
      f.section = 'custom';
    }
    if (affected.length) window.dispatchEvent(new CustomEvent('fielddefs:changed'));
  } catch (e) {
    console.error('Could not reassign fields off deleted section', e);
  }
  const ok = await persist(list);
  AppUtils.hideBusy();
  return ok;
}

async function moveSection(id, dir) {
  const list = getSections();
  const idx = list.findIndex(s => s.id === id);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return false;
  const a = list[idx].order, b = list[swapIdx].order;
  list[idx].order = b; list[swapIdx].order = a;
  return persist(list);
}

/* ---------- Admin UI ---------- */
function render() {
  const wrap = document.getElementById('section-manager');
  if (!wrap) return;
  const esc = AppUtils.esc;
  const list = getSections();

  const rows = list.map((s, i) => {
    if (editingId === s.id) {
      return `<div class="dd-row editing">
        <input type="text" class="sw-input sm-edit-input" value="${esc(s.label)}">
        <div class="dd-row-actions">
          <button class="icon-btn-sm sm-edit-save" data-id="${esc(s.id)}" title="Save"><i class="fa-solid fa-check"></i></button>
          <button class="icon-btn-sm sm-edit-cancel" title="Cancel"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>`;
    }
    if (confirmingId === s.id) {
      return `<div class="dd-row confirming">
        <span class="dd-val">Delete “${esc(s.label)}”? Its fields move to Custom Section.</span>
        <div class="dd-row-actions">
          <button class="icon-btn-sm del sm-del-yes" data-id="${esc(s.id)}" title="Yes, delete"><i class="fa-solid fa-check"></i></button>
          <button class="icon-btn-sm sm-del-no" title="Keep"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>`;
    }
    return `<div class="dd-row">
      <span class="dd-val">${esc(s.label)} ${s.builtIn ? '<span class="dd-suffix">built-in</span>' : '<span class="dd-suffix">custom</span>'}</span>
      <div class="dd-row-actions">
        <button class="icon-btn-sm sm-up" data-id="${esc(s.id)}" title="Move up" ${i === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
        <button class="icon-btn-sm sm-down" data-id="${esc(s.id)}" title="Move down" ${i === list.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
        <button class="icon-btn-sm sm-edit" data-id="${esc(s.id)}" title="Rename"><i class="fa-solid fa-pen"></i></button>
        ${s.builtIn ? '' : `<button class="icon-btn-sm del sm-del" data-id="${esc(s.id)}" title="Delete"><i class="fa-solid fa-trash"></i></button>`}
      </div>
    </div>`;
  }).join('');

  wrap.innerHTML = `
    <div class="dd-add">
      <input type="text" id="sm-new-input" class="sw-input" placeholder="e.g. Safety Compliance">
      <button class="sw-btn sw-btn-primary" id="sm-add-btn"><i class="fa-solid fa-plus"></i> Add Section</button>
    </div>
    <div class="dd-count">${list.length} section${list.length === 1 ? '' : 's'} · order shown here controls the DPR form and WhatsApp template</div>
    <div class="dd-list">${rows}</div>
  `;
  bind();
}

function bind() {
  const wrap = document.getElementById('section-manager');
  if (!wrap) return;

  const addInput = wrap.querySelector('#sm-new-input');
  const doAdd = async () => {
    const v = (addInput.value || '').trim();
    if (!v) { addInput.focus(); return; }
    if (getSections().some(s => s.label.toLowerCase() === v.toLowerCase())) {
      AppUtils.toast('A section with that name already exists.', true); return;
    }
    if (await addSection(v)) { AppUtils.toast('Section added.'); addInput.value = ''; render(); }
  };
  const addBtn = wrap.querySelector('#sm-add-btn');
  if (addBtn) addBtn.addEventListener('click', doAdd);
  if (addInput) addInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });

  wrap.querySelectorAll('.sm-up').forEach(b => b.addEventListener('click', async () => { await moveSection(b.dataset.id, -1); render(); }));
  wrap.querySelectorAll('.sm-down').forEach(b => b.addEventListener('click', async () => { await moveSection(b.dataset.id, 1); render(); }));

  wrap.querySelectorAll('.sm-edit').forEach(b => b.addEventListener('click', () => {
    editingId = b.dataset.id; confirmingId = null; render();
    const i = wrap.querySelector('.sm-edit-input'); if (i) { i.focus(); i.select(); }
  }));
  wrap.querySelectorAll('.sm-edit-cancel').forEach(b => b.addEventListener('click', () => { editingId = null; render(); }));
  wrap.querySelectorAll('.sm-edit-save').forEach(b => b.addEventListener('click', async () => {
    const input = wrap.querySelector('.sm-edit-input');
    const nv = (input.value || '').trim();
    if (!nv) { input.focus(); return; }
    if (await renameSection(b.dataset.id, nv)) { AppUtils.toast('Section renamed.'); editingId = null; render(); }
  }));

  wrap.querySelectorAll('.sm-del').forEach(b => b.addEventListener('click', () => { confirmingId = b.dataset.id; editingId = null; render(); }));
  wrap.querySelectorAll('.sm-del-no').forEach(b => b.addEventListener('click', () => { confirmingId = null; render(); }));
  wrap.querySelectorAll('.sm-del-yes').forEach(b => b.addEventListener('click', async () => {
    if (await deleteSection(b.dataset.id)) { AppUtils.toast('Section deleted.'); confirmingId = null; render(); }
  }));
}

/* ---------- Init ---------- */
function init() {
  window.addEventListener('app:boot', async () => { await loadSections(); });
  window.addEventListener('app:navigate', (e) => {
    if (e.detail && e.detail.page === 'admin') { editingId = null; confirmingId = null; render(); }
  });
}
init();

export { loadSections, getSections };
