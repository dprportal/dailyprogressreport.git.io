/* =============================================
   FIELD EDITOR MODULE
   Admin Field Management | Drag & Drop | Dynamic Form Generation
   ============================================= */

import { DataService, COLLECTIONS } from './firebase.js?v=15';
import { State } from './auth.js?v=15';
import { AppUtils } from './app.js?v=15';

/* =============================================
   DEFAULT FIELD DEFINITIONS
   ============================================= */
const DEFAULT_FIELD_DEFS = [
  { fieldId: 'sno', label: 'S. No.', type: 'number', required: true, system: true, section: 'work', order: 0, visible: true },
  { fieldId: 'date', label: 'Date', type: 'date', required: true, system: true, section: 'work', order: 1, visible: true },
  { fieldId: 'month', label: 'Month', type: 'text', required: true, system: true, section: 'work', order: 2, visible: true },
  { fieldId: 'worktype', label: 'Work Type', type: 'dropdown', required: true, system: true, section: 'work', order: 3, visible: true },
  { fieldId: 'layingWork', label: 'Laying Work', type: 'dropdown', required: true, system: true, section: 'work', order: 4, visible: true },
  { fieldId: 'package', label: 'Package No.', type: 'dropdown', required: true, system: true, section: 'location', order: 0, visible: true },
  { fieldId: 'zone', label: 'Zone No.', type: 'dropdown', required: true, system: true, section: 'location', order: 1, visible: true },
  { fieldId: 'dma', label: 'DMA No.', type: 'dropdown', required: true, system: true, section: 'location', order: 2, visible: true },
  { fieldId: 'stretch', label: 'Transmission Stretch Name', type: 'text', required: false, system: true, section: 'location', order: 3, visible: true, layingWork: 'Transmission Main' },
  { fieldId: 'pipeDia', label: 'Pipe Dia', type: 'dropdown', required: true, system: true, section: 'pipe', order: 0, visible: true, workType: 'Pipe Laying' },
  { fieldId: 'layingLength', label: 'Laying Length', type: 'number', required: true, system: true, section: 'pipe', order: 1, visible: true },
  { fieldId: 'restoredLength', label: 'Restored Length', type: 'number', required: true, system: true, section: 'restoration', order: 0, visible: true, workType: 'Road Restoration' },
  { fieldId: 'restoredWidth', label: 'Restored Width', type: 'number', required: true, system: true, section: 'restoration', order: 1, visible: true, workType: 'Road Restoration' },
  { fieldId: 'ferrule', label: 'Ferrule', type: 'number', required: false, system: true, section: 'fittings', order: 0, visible: true },
  { fieldId: 'ballValve', label: 'Ball Valve', type: 'number', required: false, system: true, section: 'fittings', order: 1, visible: true },
  { fieldId: 'meterBox', label: 'Meter Box', type: 'number', required: false, system: true, section: 'fittings', order: 2, visible: true },
  { fieldId: 'waterMeter', label: 'Water Meter', type: 'number', required: false, system: true, section: 'fittings', order: 3, visible: true },
  { fieldId: 'noOfTeam', label: 'No of Team', type: 'number', required: true, system: true, section: 'manpower', order: 0, visible: true },
  { fieldId: 'manpower', label: 'Total Working Manpower', type: 'number', required: true, system: true, section: 'manpower', order: 1, visible: true },
  { fieldId: 'workTime', label: 'Work Time', type: 'number', required: true, system: true, section: 'manpower', order: 2, visible: true },
  { fieldId: 'contractor', label: 'Contractor', type: 'dropdown', required: true, system: true, section: 'contractor', order: 0, visible: true },
  { fieldId: 'remark', label: 'Remark', type: 'textarea', required: false, system: true, section: 'remarks', order: 0, visible: true }
];

/* =============================================
   ENSURE FIELD DEFINITIONS
   Seeds defaults on a fresh DB, and back-fills any newly added
   built-in fields (e.g. restoration) into an existing DB.
   Only an admin writes the schema.
   ============================================= */
async function ensureFieldDefs() {
  try {
    if (!State.fieldDefs || State.fieldDefs.length === 0) {
      State.fieldDefs = await DataService.getAll(COLLECTIONS.FIELD_DEFS);
    }

    // Only admins may create/modify the schema (rules block engineers anyway)
    if (State.currentRole !== 'admin') return;

    const wasEmpty = State.fieldDefs.length === 0;
    const existingIds = new Set(State.fieldDefs.map(f => f.fieldId));
    const missing = DEFAULT_FIELD_DEFS.filter(d => !existingIds.has(d.fieldId));
    if (missing.length === 0) return;

    for (const def of missing) {
      const ref = await DataService.add(COLLECTIONS.FIELD_DEFS, def);
      State.fieldDefs.push({ id: ref.id, ...def });
    }

    renderFieldList();
    window.dispatchEvent(new CustomEvent('fielddefs:changed'));
    AppUtils.toast(wasEmpty ? 'Default fields initialized.' : 'New fields added to the form.');
  } catch (e) {
    console.error('ensureFieldDefs error:', e);
  }
}

/* =============================================
   ADD CUSTOM FIELD
   ============================================= */
async function addCustomField(e) {
  e.preventDefault();

  const label = document.getElementById('af_label').value.trim();
  let fieldId = document.getElementById('af_fieldId').value.trim();
  const type = document.getElementById('af_type').value;
  const workType = document.getElementById('af_workType').value;
  const layingWork = document.getElementById('af_layingWork').value;
  const section = document.getElementById('af_section').value;
  const order = parseInt(document.getElementById('af_order').value) || 0;
  const required = document.getElementById('af_required').checked;
  const options = document.getElementById('af_options').value.trim();

  if (!label || !fieldId || !type) {
    AppUtils.toast('Please fill in all required fields.', true);
    return;
  }

  // Auto-generate fieldId from label if not provided
  if (!fieldId) {
    fieldId = label.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  // Check for duplicate fieldId
  const existing = (State.fieldDefs || []).find(f => f.fieldId === fieldId);
  if (existing) {
    AppUtils.toast(`Field ID "${fieldId}" already exists.`, true);
    return;
  }

  const fieldDef = {
    fieldId,
    label,
    type,
    required,
    system: false,
    section,
    order,
    visible: true,
    createdAt: new Date().toISOString()
  };

  if (workType) fieldDef.workType = workType;
  if (layingWork) fieldDef.layingWork = layingWork;
  if (type === 'dropdown' && options) fieldDef.options = options;

  AppUtils.showBusy('Adding field…');
  try {
    const docRef = await DataService.add(COLLECTIONS.FIELD_DEFS, fieldDef);
    fieldDef.id = docRef.id;
    State.fieldDefs.push(fieldDef);

    AppUtils.toast(`Field "${label}" added successfully.`);
    document.getElementById('addFieldForm').reset();
    document.getElementById('af_optionsRow').style.display = 'none';
    renderFieldList();

    // Notify other modules
    window.dispatchEvent(new CustomEvent('fielddefs:changed'));
  } catch (e) {
    console.error('Error adding field:', e);
    AppUtils.toast('Could not add field. Try again.', true);
  } finally {
    AppUtils.hideBusy();
  }
}

/* =============================================
   RENDER FIELD LIST
   ============================================= */
function renderFieldList() {
  const container = document.getElementById('field-definitions-list');
  if (!container) return;

  const fieldDefs = [...(State.fieldDefs || [])].sort((a, b) => (a.order || 0) - (b.order || 0));

  if (fieldDefs.length === 0) {
    container.innerHTML = `
      <div class="field-list-empty">
        <i class="fa-solid fa-layer-group"></i>
        <p>No field definitions yet. Add your first custom field above.</p>
      </div>`;
    return;
  }

  container.innerHTML = fieldDefs.map((f, index) => {
    const isSystem = f.system === true;
    const isHidden = f.visible === false;
    const typeClass = `type-${f.type}`;
    const sectionClass = `section-${f.section || 'custom'}`;
    const sectionLabels = {
      work: 'Work', location: 'Location', pipe: 'Pipe', restoration: 'Restoration',
      fittings: 'Fittings', manpower: 'Manpower',
      contractor: 'Contractor', remarks: 'Remarks', custom: 'Custom'
    };
    const key = f.id || f.fieldId;

    return `
      <div class="field-def-item ${isSystem ? 'system-field' : ''} ${isHidden ? 'is-hidden-field' : ''}" data-field-id="${key}" data-index="${index}" draggable="true">
        <div class="field-def-drag-handle" title="Drag to reorder">
          <i class="fa-solid fa-grip-vertical"></i>
        </div>
        <div class="field-def-info">
          <div class="fd-label">
            ${AppUtils.esc(f.label)}
            ${f.required ? '<span class="fd-required-badge">Required</span>' : ''}
            ${f.workType ? `<span class="laying-filter-badge worktype-badge">${AppUtils.esc(f.workType)}</span>` : ''}
            ${f.layingWork ? `<span class="laying-filter-badge">${AppUtils.esc(f.layingWork)}</span>` : ''}
            ${isHidden ? '<span class="fd-hidden-badge">Hidden</span>' : ''}
          </div>
          <div class="fd-meta">
            <span class="section-badge ${sectionClass}">${sectionLabels[f.section] || f.section}</span>
            <span style="margin-left:6px; color:var(--app-muted-2);">ID: ${AppUtils.esc(f.fieldId)}</span>
          </div>
        </div>
        <div class="field-def-type-badge ${typeClass}">${f.type}</div>
        <div class="field-def-actions">
          <button class="edit" data-id="${key}" title="Edit field">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="visibility-toggle" data-id="${key}" title="${isHidden ? 'Show in form' : 'Hide from form'}">
            <i class="fa-solid ${isHidden ? 'fa-eye-slash' : 'fa-eye'}"></i>
          </button>
          ${!isSystem
            ? `<button class="delete" data-id="${key}" title="Delete field"><i class="fa-solid fa-trash"></i></button>`
            : `<span class="fd-system-tag" title="Built-in field — can be edited &amp; hidden, but not deleted">SYS</span>`}
        </div>
      </div>
    `;
  }).join('');

  // Drag-and-drop reorder (all fields, including system)
  setupDragAndDrop();

  // Action handlers
  container.querySelectorAll('.field-def-actions .edit').forEach(btn => {
    btn.addEventListener('click', () => openFieldEditor(btn.dataset.id));
  });
  container.querySelectorAll('.field-def-actions .visibility-toggle').forEach(btn => {
    btn.addEventListener('click', () => toggleFieldVisibility(btn.dataset.id));
  });
  container.querySelectorAll('.field-def-actions .delete').forEach(btn => {
    btn.addEventListener('click', () => deleteField(btn.dataset.id));
  });
}

/* =============================================
   DRAG AND DROP
   ============================================= */
let dragSrcEl = null;

function setupDragAndDrop() {
  const items = document.querySelectorAll('.field-def-item');

  items.forEach(item => {
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragenter', handleDragEnter);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('dragleave', handleDragLeave);
    item.addEventListener('drop', handleDrop);
    item.addEventListener('dragend', handleDragEnd);
  });
}

function handleDragStart(e) {
  dragSrcEl = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) {
  this.classList.add('drag-over');
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  e.stopPropagation();

  if (dragSrcEl !== this) {
    const container = document.getElementById('field-definitions-list');
    const items = [...container.querySelectorAll('.field-def-item')];
    const srcIndex = items.indexOf(dragSrcEl);
    const targetIndex = items.indexOf(this);

    // Reorder in state
    const fieldDefs = [...State.fieldDefs].sort((a, b) => (a.order || 0) - (b.order || 0));
    const [moved] = fieldDefs.splice(srcIndex, 1);
    fieldDefs.splice(targetIndex, 0, moved);

    // Update orders
    fieldDefs.forEach((f, i) => {
      f.order = i;
    });

    State.fieldDefs = fieldDefs;

    // Save to Firebase
    saveFieldOrder(fieldDefs);

    // Re-render
    renderFieldList();

    AppUtils.toast('Field order updated.');
  }

  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.field-def-item').forEach(item => {
    item.classList.remove('drag-over');
  });
}

async function saveFieldOrder(fieldDefs) {
  AppUtils.showBusy('Saving order…');
  try {
    const promises = fieldDefs.map(f => {
      if (f.id) {
        return DataService.update(COLLECTIONS.FIELD_DEFS, f.id, { order: f.order });
      }
      return Promise.resolve();
    });
    await Promise.all(promises);
  } catch (e) {
    console.error('Error saving field order:', e);
  } finally {
    AppUtils.hideBusy();
  }
}

/* =============================================
   TOGGLE FIELD VISIBILITY
   ============================================= */
async function toggleFieldVisibility(fieldId) {
  const idx = State.fieldDefs.findIndex(f => (f.id || f.fieldId) === fieldId);
  if (idx === -1) return;

  const field = State.fieldDefs[idx];
  const newVisible = field.visible === false ? true : false;

  AppUtils.showBusy(newVisible ? 'Showing field…' : 'Hiding field…');
  try {
    if (field.id) {
      await DataService.update(COLLECTIONS.FIELD_DEFS, field.id, { visible: newVisible });
    }
    State.fieldDefs[idx].visible = newVisible;
    renderFieldList();
    window.dispatchEvent(new CustomEvent('fielddefs:changed'));
    AppUtils.toast(`Field "${field.label}" ${newVisible ? 'visible' : 'hidden'}.`);
  } catch (e) {
    console.error('Error toggling visibility:', e);
    AppUtils.toast('Could not update visibility.', true);
  } finally {
    AppUtils.hideBusy();
  }
}

/* =============================================
   DELETE FIELD
   ============================================= */
async function deleteField(fieldId) {
  const field = State.fieldDefs.find(f => (f.id || f.fieldId) === fieldId);
  if (!field) return;

  if (field.system) {
    AppUtils.toast('System fields cannot be deleted.', true);
    return;
  }

  // Set up confirm modal
  document.getElementById('confirm-msg').textContent = `Delete custom field "${field.label}"? This will remove it from all DPR forms.`;
  document.getElementById('modal-confirm-title').textContent = 'Delete Field';

  const confirmBtn = document.getElementById('confirm-btn');
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

  newConfirmBtn.addEventListener('click', async () => {
    closeModal('modal-confirm');
    AppUtils.showBusy('Deleting field…');
    try {
      if (field.id) {
        await DataService.delete(COLLECTIONS.FIELD_DEFS, field.id);
      }
      State.fieldDefs = State.fieldDefs.filter(f => (f.id || f.fieldId) !== fieldId);
      renderFieldList();
      window.dispatchEvent(new CustomEvent('fielddefs:changed'));
      AppUtils.toast(`Field "${field.label}" deleted.`);
    } catch (e) {
      console.error('Error deleting field:', e);
      AppUtils.toast('Could not delete field.', true);
    } finally {
      AppUtils.hideBusy();
    }
  });

  openModal('modal-confirm');
}

/* =============================================
   EDIT FIELD  (admin full control over existing fields)
   ============================================= */
let editingFieldKey = null;

function openFieldEditor(key) {
  const f = (State.fieldDefs || []).find(x => (x.id || x.fieldId) === key);
  if (!f) return;
  editingFieldKey = key;

  document.getElementById('modal-field-edit-title').textContent = f.system ? 'Edit Built-in Field' : 'Edit Field';
  document.getElementById('fe_label').value = f.label || '';
  document.getElementById('fe_fieldId').value = f.fieldId || '';
  document.getElementById('fe_fieldId').disabled = true;          // ID locked — changing it would orphan saved data

  const typeSel = document.getElementById('fe_type');
  typeSel.value = f.type || 'text';
  typeSel.disabled = !!f.system;                                  // built-in inputs are hard-coded in the form

  document.getElementById('fe_section').value = f.section || 'custom';
  document.getElementById('fe_workType').value = f.workType || '';
  document.getElementById('fe_layingWork').value = f.layingWork || '';
  document.getElementById('fe_order').value = (f.order != null ? f.order : 0);
  document.getElementById('fe_required').checked = !!f.required;
  document.getElementById('fe_visible').checked = f.visible !== false;
  document.getElementById('fe_options').value = f.options || '';

  toggleEditOptionsRow();
  openModal('modal-field-edit');
}

function toggleEditOptionsRow() {
  const row = document.getElementById('fe_optionsRow');
  if (!row) return;
  row.style.display = document.getElementById('fe_type').value === 'dropdown' ? 'block' : 'none';
}

async function saveFieldEdit(e) {
  if (e) e.preventDefault();
  if (!editingFieldKey) return;

  const idx = (State.fieldDefs || []).findIndex(x => (x.id || x.fieldId) === editingFieldKey);
  if (idx === -1) return;
  const f = State.fieldDefs[idx];

  const label = document.getElementById('fe_label').value.trim();
  if (!label) { AppUtils.toast('Field label is required.', true); return; }

  const updates = {
    label,
    section: document.getElementById('fe_section').value,
    order: parseInt(document.getElementById('fe_order').value) || 0,
    required: document.getElementById('fe_required').checked,
    visible: document.getElementById('fe_visible').checked,
    layingWork: document.getElementById('fe_layingWork').value || '',
    workType: document.getElementById('fe_workType').value || ''
  };

  // Type + options are editable for custom fields only
  if (!f.system) {
    updates.type = document.getElementById('fe_type').value;
    updates.options = updates.type === 'dropdown'
      ? document.getElementById('fe_options').value.trim()
      : '';
  } else if (f.type === 'dropdown') {
    updates.options = document.getElementById('fe_options').value.trim();
  }

  const btn = document.getElementById('fe_save');
  AppUtils.setButtonLoading(btn, true);
  AppUtils.showBusy('Saving field…');
  try {
    if (f.id) await DataService.update(COLLECTIONS.FIELD_DEFS, f.id, updates);
    State.fieldDefs[idx] = Object.assign({}, f, updates);
    closeModal('modal-field-edit');
    renderFieldList();
    window.dispatchEvent(new CustomEvent('fielddefs:changed'));
    AppUtils.toast(`Field "${label}" updated.`);
  } catch (err) {
    console.error('Edit field error:', err);
    AppUtils.toast('Could not update field. Try again.', true);
  } finally {
    AppUtils.setButtonLoading(btn, false);
    AppUtils.hideBusy();
    editingFieldKey = null;
  }
}

/* =============================================
   MODAL HELPERS
   ============================================= */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('open');
    document.body.style.overflow = '';
  }
}

/* =============================================
   ADMIN NAVIGATION
   ============================================= */
function setupAdminNav() {
  const navBtns = document.querySelectorAll('.admin-nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.adminTab;

      // Update nav
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update subviews
      document.querySelectorAll('.admin-subview').forEach(v => v.classList.remove('active'));
      const subview = document.getElementById(`admin-${tab}`);
      if (subview) subview.classList.add('active');
    });
  });
}

/* =============================================
   FIELD TYPE CHANGE HANDLER
   ============================================= */
function setupFieldTypeHandler() {
  const typeSelect = document.getElementById('af_type');
  const optionsRow = document.getElementById('af_optionsRow');

  if (typeSelect && optionsRow) {
    typeSelect.addEventListener('change', () => {
      if (typeSelect.value === 'dropdown') {
        optionsRow.style.display = 'block';
        document.getElementById('af_options').required = true;
      } else {
        optionsRow.style.display = 'none';
        document.getElementById('af_options').required = false;
      }
    });
  }
}

/* =============================================
   AUTO-GENERATE FIELD ID
   ============================================= */
function setupAutoFieldId() {
  const labelInput = document.getElementById('af_label');
  const fieldIdInput = document.getElementById('af_fieldId');

  if (labelInput && fieldIdInput) {
    labelInput.addEventListener('blur', () => {
      if (!fieldIdInput.value && labelInput.value) {
        fieldIdInput.value = labelInput.value
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');
      }
    });
  }
}

/* =============================================
   SAVE SETTINGS
   ============================================= */
async function saveSettings() {
  const snoStart = parseInt(document.getElementById('setting_sno_start').value) || 1;
  const pageSize = parseInt(document.getElementById('setting_page_size').value) || 50;

  AppUtils.showBusy('Saving settings…');
  try {
    await DataService.set(COLLECTIONS.SETTINGS, 'default', {
      snoStart,
      pageSize,
      updatedAt: new Date().toISOString()
    });

    State.settings = { snoStart, pageSize };
    AppUtils.toast('Settings saved.');
  } catch (e) {
    console.error('Error saving settings:', e);
    AppUtils.toast('Could not save settings.', true);
  } finally {
    AppUtils.hideBusy();
  }
}

/* =============================================
   INITIALIZATION
   ============================================= */
async function init() {
  // Setup handlers
  setupAdminNav();
  setupFieldTypeHandler();
  setupAutoFieldId();

  // Add field form
  const addFieldForm = document.getElementById('addFieldForm');
  if (addFieldForm) {
    addFieldForm.addEventListener('submit', addCustomField);
  }

  // Edit field modal
  const feType = document.getElementById('fe_type');
  if (feType) feType.addEventListener('change', toggleEditOptionsRow);
  const feSave = document.getElementById('fe_save');
  if (feSave) feSave.addEventListener('click', saveFieldEdit);
  const feCancel = document.getElementById('fe_cancel');
  if (feCancel) feCancel.addEventListener('click', () => closeModal('modal-field-edit'));
  const feClose = document.getElementById('fe_close');
  if (feClose) feClose.addEventListener('click', () => closeModal('modal-field-edit'));
  const feOverlay = document.getElementById('modal-field-edit');
  if (feOverlay) feOverlay.addEventListener('click', (e) => { if (e.target === feOverlay) closeModal('modal-field-edit'); });

  // Save settings
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings);
  }

  // Navigation
  window.addEventListener('app:navigate', (e) => {
    if (e.detail.page === 'admin') {
      renderFieldList();
    }
  });

  // Boot
  window.addEventListener('app:boot', async () => {
    await ensureFieldDefs();
    renderFieldList();
  });
}

init();

/* =============================================
   EXPORTS
   ============================================= */
export { renderFieldList, ensureFieldDefs };
