/* =============================================
   DPR MODULE
   Dynamic Form | Field Visibility | CRUD | S.No Auto-increment
   ============================================= */

import { DataService, COLLECTIONS } from './firebase.js?v=15';
import { State } from './auth.js?v=15';
import { AppUtils, MASTER_DATA, navigateTo } from './app.js?v=15';

/* =============================================
   FIELD VISIBILITY CONFIG  (driven by WORK TYPE)
   Pipe Laying / Hydro Test  -> pipe details
   Road Restoration          -> restored length & width (no pipe)
   ============================================= */
const WORKTYPE_CONFIG = {
  'Pipe Laying': {
    'card-location': true, 'card-pipe': true, 'card-restoration': false, 'card-hydro': false,
    'card-fittings': true, 'card-manpower': true, 'card-contractor': true, 'card-remarks': true
  },
  'Hydro Test': {
    'card-location': true, 'card-pipe': true, 'card-restoration': false, 'card-hydro': true,
    'card-fittings': false, 'card-manpower': true, 'card-contractor': true, 'card-remarks': true
  },
  'Road Restoration': {
    'card-location': true, 'card-pipe': false, 'card-restoration': true, 'card-hydro': false,
    'card-fittings': false, 'card-manpower': true, 'card-contractor': true, 'card-remarks': true
  }
};

// Inputs that live inside each card (f_zone / f_dma are owned by the cascade, f_stretch handled separately)
const CARD_INPUTS = {
  'card-location': ['f_package', 'f_zone', 'f_dma'],
  'card-pipe': ['f_pipeDia', 'f_layingLength'],
  'card-restoration': ['f_restoredLength', 'f_restoredWidth', 'f_surfaceType', 'f_restoredArea'],
  'card-hydro': ['f_testedLength', 'f_testPressure', 'f_startTime', 'f_endTime', 'f_testResult'],
  'card-fittings': ['f_ferrule', 'f_ballValve', 'f_meterBox', 'f_waterMeter'],
  'card-manpower': ['f_noOfTeam', 'f_manpower', 'f_workTime'],
  'card-contractor': ['f_contractor'],
  'card-remarks': ['f_remark']
};

// Fields that are required when their card is visible
const BASE_REQUIRED = new Set([
  'f_package', 'f_zone', 'f_dma',
  'f_pipeDia', 'f_layingLength',
  'f_restoredLength', 'f_restoredWidth', 'f_surfaceType',
  'f_testedLength', 'f_testPressure', 'f_startTime', 'f_endTime', 'f_testResult',
  'f_noOfTeam', 'f_manpower', 'f_workTime',
  'f_contractor'
]);

// Cascade owns the disabled state of these (must not be force-enabled here)
const CASCADE_FIELDS = new Set(['f_zone', 'f_dma']);

/* =============================================
   SYSTEM FIELD <-> DOM MAPPING
   Lets the admin field editor control built-in fields too
   ============================================= */
const SYS_FIELD_WRAP = {
  package: 'field-package', zone: 'field-zone', dma: 'field-dma', stretch: 'field-stretch',
  pipeDia: 'field-pipeDia', layingLength: 'field-layingLength',
  restoredLength: 'field-restoredLength', restoredWidth: 'field-restoredWidth',
  ferrule: 'field-ferrule', ballValve: 'field-ballValve', meterBox: 'field-meterBox', waterMeter: 'field-waterMeter',
  noOfTeam: 'field-noOfTeam', manpower: 'field-manpower', workTime: 'field-workTime',
  contractor: 'field-contractor', remark: 'field-remark'
};
const SYS_FIELD_INPUT = {
  package: 'f_package', zone: 'f_zone', dma: 'f_dma', stretch: 'f_stretch',
  pipeDia: 'f_pipeDia', layingLength: 'f_layingLength',
  restoredLength: 'f_restoredLength', restoredWidth: 'f_restoredWidth',
  ferrule: 'f_ferrule', ballValve: 'f_ballValve', meterBox: 'f_meterBox', waterMeter: 'f_waterMeter',
  noOfTeam: 'f_noOfTeam', manpower: 'f_manpower', workTime: 'f_workTime',
  contractor: 'f_contractor', remark: 'f_remark'
};

/* =============================================
   APPLY ADMIN FIELD DEFINITIONS TO THE FORM
   Hides admin-hidden system fields, applies required + label overrides.
   Composes on top of the laying-work visibility logic.
   ============================================= */
function applyFieldDefsToForm() {
  const defs = State.fieldDefs || [];
  defs.forEach(def => {
    if (!def.system) return;
    const wrapId = SYS_FIELD_WRAP[def.fieldId];
    if (!wrapId) return;
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const input = document.getElementById(SYS_FIELD_INPUT[def.fieldId]);
    const adminHidden = def.visible === false;

    // Admin-hidden always wins: remove from form + exclude from submit/validation
    wrap.classList.toggle('admin-hidden', adminHidden);
    if (input && adminHidden) {
      input.disabled = true;
      input.required = false;
    }

    // Stretch keeps its own (laying-work dependent) required + marker logic
    if (def.fieldId === 'stretch') return;

    // For fields currently shown & enabled by laying-work, honour admin "required"
    if (!adminHidden && input && !input.disabled) {
      input.required = !!def.required;
    }

    // Honour admin label rename in the form
    const label = wrap.querySelector('label');
    if (label) {
      const marker = def.required
        ? '<span class="req">*</span>'
        : '<span class="opt">optional</span>';
      label.innerHTML = AppUtils.esc(def.label) + ' ' + marker;
    }
  });
}

/* =============================================
   S.NO COUNTER
   ============================================= */
async function getNextSNo() {
  try {
    // Get all DPRs to find max S.No
    const dprs = State.dprs || [];
    let maxSNo = 0;
    dprs.forEach(d => {
      const sno = parseInt(d.sno);
      if (!isNaN(sno) && sno > maxSNo) maxSNo = sno;
    });

    // Check settings for starting S.No
    const startSNo = State.settings?.snoStart || 1;
    const nextSNo = Math.max(maxSNo + 1, startSNo);

    return nextSNo;
  } catch (e) {
    console.error('Error getting next S.No:', e);
    return (State.dprs?.length || 0) + 1;
  }
}

/* =============================================
   CASCADING DROPDOWNS (Package > Zone > DMA)
   ============================================= */
function populateZones() {
  const pkg = document.getElementById('f_package').value;
  const zoneSel = document.getElementById('f_zone');
  const dmaSel = document.getElementById('f_dma');

  if (!zoneSel || !dmaSel) return;

  zoneSel.innerHTML = '';
  dmaSel.innerHTML = '<option value="" disabled selected>Select zone first</option>';
  dmaSel.disabled = true;

  if (!pkg) {
    zoneSel.innerHTML = '<option value="" disabled selected>Select package first</option>';
    zoneSel.disabled = true;
    return;
  }

  const zones = [];
  const seen = new Set();
  for (const r of MASTER_DATA) {
    if (String(r.p) === String(pkg) && !seen.has(r.zn)) {
      seen.add(r.zn);
      zones.push({ zn: r.zn, z: r.z });
    }
  }
  zones.sort((a, b) => a.z.localeCompare(b.z));

  zoneSel.appendChild(new Option('Select zone', '', true, true));
  zoneSel.firstChild.disabled = true;
  zones.forEach(z => zoneSel.appendChild(new Option(z.z, z.zn)));
  zoneSel.disabled = false;
}

function populateDMAs() {
  const pkg = document.getElementById('f_package').value;
  const zn = document.getElementById('f_zone').value;
  const dmaSel = document.getElementById('f_dma');

  if (!dmaSel) return;

  dmaSel.innerHTML = '';
  if (!pkg || !zn) {
    dmaSel.innerHTML = '<option value="" disabled selected>Select zone first</option>';
    dmaSel.disabled = true;
    return;
  }

  const dmas = [...new Set(
    MASTER_DATA
      .filter(r => String(r.p) === String(pkg) && String(r.zn) === String(zn))
      .map(r => r.d)
  )].sort((a, b) => a - b);

  dmaSel.appendChild(new Option('Select DMA', '', true, true));
  dmaSel.firstChild.disabled = true;
  dmas.forEach(d => dmaSel.appendChild(new Option('DMA ' + d, d)));
  dmaSel.disabled = false;
}

/* =============================================
   DYNAMIC FIELD VISIBILITY
   ============================================= */
function updateFieldVisibility() {
  const workType = document.getElementById('f_worktype').value;
  const layingWork = document.getElementById('f_laying').value;
  const config = WORKTYPE_CONFIG[workType];

  // Show/hide each card and enable/disable its inputs.
  // Before a work type is chosen, hide the restoration card and show the rest.
  Object.keys(CARD_INPUTS).forEach(cardId => {
    const show = config ? !!config[cardId] : (cardId !== 'card-restoration');
    const card = document.getElementById(cardId);
    if (card) card.classList.toggle('hidden', !show);

    CARD_INPUTS[cardId].forEach(inputId => {
      const el = document.getElementById(inputId);
      if (!el) return;
      if (show) {
        if (!CASCADE_FIELDS.has(inputId)) el.disabled = false; // cascade owns zone/dma disabled state
        el.required = BASE_REQUIRED.has(inputId);
      } else {
        el.disabled = true;
        el.required = false;
      }
    });
  });

  // Transmission Stretch — only when the Location card is shown AND laying work is Transmission Main
  const locationShown = config ? !!config['card-location'] : true;
  const showStretch = locationShown && layingWork === 'Transmission Main';
  const stretchField = document.getElementById('field-stretch');
  const stretchInput = document.getElementById('f_stretch');
  const stretchReqMark = document.getElementById('stretchReqMark');

  if (stretchField) stretchField.style.display = showStretch ? 'block' : 'none';
  if (stretchInput) {
    stretchInput.disabled = !showStretch;
    stretchInput.required = showStretch;
  }
  if (stretchReqMark) {
    stretchReqMark.innerHTML = showStretch ? '*' : 'optional';
    stretchReqMark.className = showStretch ? 'req' : 'opt';
  }

  // Custom admin fields (filtered by work type + laying work)
  updateCustomFieldsVisibility(workType, layingWork);

  // Honour admin field-editor visibility/required/labels (composes on top)
  applyFieldDefsToForm();

  // Hydro Test uses Tested Length + Start/End Time instead of Laying Length / Work Time
  const hideForHydro = ['layingLength', 'workTime'];
  hideForHydro.forEach(name => {
    const wrap = document.getElementById('field-' + name);
    const input = document.getElementById('f_' + name);
    if (workType === 'Hydro Test') {
      if (wrap) { wrap.style.display = 'none'; wrap.dataset.hydroHidden = '1'; }
      if (input) { input.disabled = true; input.required = false; }
    } else if (wrap && wrap.dataset.hydroHidden === '1') {
      wrap.style.display = '';
      delete wrap.dataset.hydroHidden;
    }
  });
}

/* =============================================
   CUSTOM ADMIN FIELDS
   ============================================= */
function renderCustomFields() {
  const container = document.getElementById('admin-custom-fields-container');
  if (!container) return;

  const customFields = (State.fieldDefs || []).filter(f => !f.system && f.visible !== false);

  if (customFields.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Group by section
  const sections = {};
  customFields.forEach(f => {
    const section = f.section || 'custom';
    if (!sections[section]) sections[section] = [];
    sections[section].push(f);
  });

  let html = '';
  for (const [sectionName, fields] of Object.entries(sections)) {
    html += `<div class="sw-card custom-field-card" data-custom-section="${sectionName}">`;
    html += `<div class="sw-card-head" style="--accent: var(--app-sky); --accent-light: var(--app-sky-light);">`;
    html += `<div class="ic"><i class="fa-solid fa-sliders"></i></div>`;
    html += `<div><h2>${AppUtils.esc(sectionName.charAt(0).toUpperCase() + sectionName.slice(1))} Fields</h2></div>`;
    html += `</div>`;
    html += `<div class="sw-card-body">`;

    fields.forEach(f => {
      html += renderCustomField(f);
    });

    html += `</div></div>`;
  }

  container.innerHTML = html;

  // Setup dropdown options for custom dropdown fields
  customFields.forEach(f => {
    if (f.type === 'dropdown' && f.options) {
      const sel = document.getElementById('custom_' + f.fieldId);
      if (sel) {
        f.options.split(',').forEach(opt => {
          const trimmed = opt.trim();
          if (trimmed) {
            const option = document.createElement('option');
            option.value = trimmed;
            option.textContent = trimmed;
            sel.appendChild(option);
          }
        });
      }
    }
  });
}

function renderCustomField(fieldDef) {
  const fieldId = 'custom_' + fieldDef.fieldId;
  const required = fieldDef.required ? '<span class="req">*</span>' : '<span class="opt">optional</span>';
  const requiredAttr = fieldDef.required ? 'required' : '';
  const layingClass = fieldDef.layingWork ? `field-laying-${fieldDef.layingWork.replace(/\s+/g, '-')}` : '';

  let inputHtml = '';
  switch (fieldDef.type) {
    case 'text':
      inputHtml = `<input type="text" id="${fieldId}" class="sw-input" placeholder="Enter ${AppUtils.esc(fieldDef.label)}" ${requiredAttr}>`;
      break;
    case 'number':
      inputHtml = `<input type="number" id="${fieldId}" class="sw-input" min="0" step="1" inputmode="numeric" placeholder="0" ${requiredAttr}>`;
      break;
    case 'dropdown':
      inputHtml = `<select id="${fieldId}" class="sw-select" ${requiredAttr}><option value="" disabled selected>Select ${AppUtils.esc(fieldDef.label)}</option></select>`;
      break;
    case 'date':
      inputHtml = `<input type="date" id="${fieldId}" class="sw-input" ${requiredAttr}>`;
      break;
    case 'textarea':
      inputHtml = `<textarea id="${fieldId}" class="sw-textarea" rows="2" placeholder="Enter ${AppUtils.esc(fieldDef.label)}" ${requiredAttr}></textarea>`;
      break;
    default:
      inputHtml = `<input type="text" id="${fieldId}" class="sw-input" placeholder="Enter ${AppUtils.esc(fieldDef.label)}">`;
  }

  return `
    <div class="field ${layingClass}" data-laying="${AppUtils.esc(fieldDef.layingWork || '')}" data-worktype="${AppUtils.esc(fieldDef.workType || '')}">
      <label for="${fieldId}">${AppUtils.esc(fieldDef.label)} ${required}</label>
      ${inputHtml}
    </div>
  `;
}

function updateCustomFieldsVisibility(workType, layingWork) {
  document.querySelectorAll('#admin-custom-fields-container .field').forEach(el => {
    const fieldLaying = el.dataset.laying || '';
    const fieldWorkType = el.dataset.worktype || '';
    const layingMismatch = fieldLaying && fieldLaying !== layingWork;
    const workTypeMismatch = fieldWorkType && fieldWorkType !== workType;
    const hide = layingMismatch || workTypeMismatch;
    el.classList.toggle('field-hidden', hide);
    const input = el.querySelector('input, select, textarea');
    if (input) input.disabled = hide;
  });
}

function gatherCustomFieldsData() {
  const data = {};
  (State.fieldDefs || []).forEach(f => {
    if (!f.system) {
      const el = document.getElementById('custom_' + f.fieldId);
      if (el && !el.disabled) {
        data[f.fieldId] = el.value;
      }
    }
  });
  return data;
}

function loadCustomFieldsIntoForm(record) {
  (State.fieldDefs || []).forEach(f => {
    if (!f.system && record[f.fieldId] !== undefined) {
      const el = document.getElementById('custom_' + f.fieldId);
      if (el) el.value = record[f.fieldId];
    }
  });
}

/* =============================================
   FORM DATA GATHERING
   Produces the canonical record shape used across reports,
   dashboard and export (packageNo / zoneNo / zoneName / dma / …).
   Only includes fields that are currently visible & enabled.
   ============================================= */
function gatherFormData() {
  const layingWork = document.getElementById('f_laying').value;
  const enabled = id => { const el = document.getElementById(id); return !!(el && !el.disabled); };
  const text = id => { const el = document.getElementById(id); return el && !el.disabled ? String(el.value).trim() : ''; };
  const num = id => { const el = document.getElementById(id); return el && !el.disabled ? AppUtils.cleanNum(el.value) : 0; };

  const packageNo = text('f_package');
  const zoneNo = text('f_zone');
  const dma = text('f_dma');

  // Resolve human-readable zone name from master data
  let zoneName = '';
  if (packageNo && zoneNo) {
    const match = MASTER_DATA.find(r => String(r.p) === String(packageNo) && String(r.zn) === String(zoneNo));
    if (match) zoneName = match.z;
  }

  const data = {
    sno: document.getElementById('f_sno').value,
    date: document.getElementById('f_date').value,
    month: document.getElementById('f_month').value,
    workType: document.getElementById('f_worktype').value,
    layingWork: layingWork,
    remark: enabled('f_remark') ? text('f_remark') : '',
    customFields: {}
  };

  // Location
  if (enabled('f_package')) data.packageNo = packageNo;
  if (enabled('f_zone')) data.zoneNo = zoneNo;
  if (zoneName) data.zoneName = zoneName;
  if (enabled('f_dma')) data.dma = dma;
  if (enabled('f_stretch')) data.stretch = text('f_stretch');

  // Pipe specification
  if (enabled('f_pipeDia')) data.pipeDia = text('f_pipeDia');
  if (enabled('f_layingLength')) data.layingLength = num('f_layingLength');

  // Road restoration
  if (enabled('f_restoredLength')) data.restoredLength = num('f_restoredLength');
  if (enabled('f_restoredWidth')) data.restoredWidth = num('f_restoredWidth');
  if (enabled('f_surfaceType')) data.surfaceType = text('f_surfaceType');
  if (enabled('f_restoredArea')) data.restoredArea = num('f_restoredArea');

  // Hydro test
  if (enabled('f_testedLength')) data.testedLength = num('f_testedLength');
  if (enabled('f_testPressure')) data.testPressure = num('f_testPressure');
  if (enabled('f_startTime')) data.startTime = text('f_startTime');
  if (enabled('f_endTime')) data.endTime = text('f_endTime');
  if (enabled('f_testResult')) data.testResult = text('f_testResult');

  // Fittings & meters
  if (enabled('f_ferrule')) data.ferrule = num('f_ferrule');
  if (enabled('f_ballValve')) data.ballValve = num('f_ballValve');
  if (enabled('f_meterBox')) data.meterBox = num('f_meterBox');
  if (enabled('f_waterMeter')) data.waterMeter = num('f_waterMeter');

  // Manpower & time
  if (enabled('f_noOfTeam')) data.noOfTeam = num('f_noOfTeam');
  if (enabled('f_manpower')) data.manpower = num('f_manpower');
  if (enabled('f_workTime')) data.workTime = num('f_workTime');

  // Contractor
  if (enabled('f_contractor')) data.contractor = text('f_contractor');

  // Custom admin fields — store both nested (for export) and top-level (for edit reload)
  data.customFields = gatherCustomFieldsData();
  Object.assign(data, data.customFields);

  return data;
}

/* =============================================
   FORM SUBMISSION
   ============================================= */
async function onSubmit(e) {
  e.preventDefault();

  const form = document.getElementById('dprForm');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const btn = document.getElementById('submitBtn');
  AppUtils.setButtonLoading(btn, true);
  AppUtils.showBusy(State.editingRecordId ? 'Updating report…' : 'Saving report…');

  try {
    const record = gatherFormData();

    if (State.editingRecordId) {
      // Update existing
      const existing = State.dprs.find(r => r.id === State.editingRecordId);
      if (State.currentRole !== 'admin' && existing && existing.createdBy !== (State.currentUser?.uid || State.currentEngineer?.id)) {
        throw Object.assign(new Error('Not permitted'), { code: 'perm-denied' });
      }

      await DataService.update(COLLECTIONS.DPR, State.editingRecordId, record);
      const idx = State.dprs.findIndex(r => r.id === State.editingRecordId);
      if (idx > -1) {
        State.dprs[idx] = Object.assign({}, State.dprs[idx], record);
      }
      AppUtils.toast('Daily progress report updated.');
      cancelEdit();
    } else {
      // Create new
      if (State.currentRole === 'engineer' && State.currentEngineer) {
        record.engineerId = State.currentEngineer.id;
        record.engineerName = State.currentEngineer.name;
        record.createdBy = State.currentEngineer.id;
        record.createdByName = State.currentEngineer.name;
      } else {
        record.createdBy = State.currentUser?.uid || 'admin';
        record.createdByName = State.currentUser?.email?.split('@')[0] || 'Admin';
      }

      const ref = await DataService.add(COLLECTIONS.DPR, record);
      State.dprs.unshift(Object.assign({ id: ref.id }, record));
      AppUtils.toast('Daily progress report saved.');
      softReset();
    }

    // Refresh S.No
    refreshSNo();

    // Notify other modules
    window.dispatchEvent(new CustomEvent('dpr:changed'));
  } catch (err) {
    if (err && err.code === 'perm-denied') {
      AppUtils.toast('You can only edit your own entries.', true);
    } else {
      console.error('Save error:', err);
      AppUtils.toast('Could not save. Check connection and try again.', true);
    }
  } finally {
    AppUtils.setButtonLoading(btn, false);
    AppUtils.hideBusy();
  }
}

/* =============================================
   EDIT MODE
   ============================================= */
async function loadRecordIntoForm(record) {
  // Basic fields
  document.getElementById('f_sno').value = record.sno || '';
  document.getElementById('f_date').value = record.date || '';
  document.getElementById('f_month').value = record.month || '';
  document.getElementById('f_worktype').value = record.workType || '';
  document.getElementById('f_laying').value = record.layingWork || '';

  // Update visibility first
  updateFieldVisibility();

  // Location fields
  if (record.packageNo) {
    document.getElementById('f_package').value = record.packageNo;
    populateZones();
    if (record.zoneNo) {
      setTimeout(() => {
        document.getElementById('f_zone').value = record.zoneNo;
        populateDMAs();
        if (record.dma) {
          setTimeout(() => {
            document.getElementById('f_dma').value = record.dma;
          }, 50);
        }
      }, 50);
    }
  }

  // Pipe fields
  if (record.pipeDia) document.getElementById('f_pipeDia').value = record.pipeDia;
  if (record.layingLength !== undefined) document.getElementById('f_layingLength').value = record.layingLength;

  // Restoration fields
  if (record.restoredLength !== undefined) document.getElementById('f_restoredLength').value = record.restoredLength;
  if (record.restoredWidth !== undefined) document.getElementById('f_restoredWidth').value = record.restoredWidth;
  if (record.surfaceType) document.getElementById('f_surfaceType').value = record.surfaceType;
  if (record.restoredArea !== undefined) document.getElementById('f_restoredArea').value = record.restoredArea;

  // Hydro test
  if (record.testedLength !== undefined) document.getElementById('f_testedLength').value = record.testedLength;
  if (record.testPressure !== undefined) document.getElementById('f_testPressure').value = record.testPressure;
  if (record.startTime) document.getElementById('f_startTime').value = record.startTime;
  if (record.endTime) document.getElementById('f_endTime').value = record.endTime;
  if (record.testResult) document.getElementById('f_testResult').value = record.testResult;

  // Stretch
  if (record.stretch !== undefined) document.getElementById('f_stretch').value = record.stretch;

  // Fittings
  if (record.ferrule !== undefined) document.getElementById('f_ferrule').value = record.ferrule;
  if (record.ballValve !== undefined) document.getElementById('f_ballValve').value = record.ballValve;
  if (record.meterBox !== undefined) document.getElementById('f_meterBox').value = record.meterBox;
  if (record.waterMeter !== undefined) document.getElementById('f_waterMeter').value = record.waterMeter;

  // Manpower
  if (record.noOfTeam !== undefined) document.getElementById('f_noOfTeam').value = record.noOfTeam;
  if (record.manpower !== undefined) document.getElementById('f_manpower').value = record.manpower;
  if (record.workTime !== undefined) document.getElementById('f_workTime').value = record.workTime;

  // Contractor
  if (record.contractor) document.getElementById('f_contractor').value = record.contractor;

  // Remarks
  if (record.remark !== undefined) document.getElementById('f_remark').value = record.remark;

  // Custom fields
  loadCustomFieldsIntoForm(record);
}

function enterEditMode(record) {
  if (State.currentRole !== 'admin') {
    AppUtils.toast('Only an admin can edit a submitted report.', true);
    return;
  }

  State.editingRecordId = record.id;
  loadRecordIntoForm(record);

  document.getElementById('editingBanner').classList.add('show');
  document.getElementById('cancelEditBtn').style.display = 'inline-flex';
  document.getElementById('submitBtn').innerHTML = '<i class="fa-solid fa-check"></i> Update Daily Progress Report';

  // Admin editing = full form: reveal the work-type selector, hide the module banner
  const wtField = document.getElementById('worktypeField');
  if (wtField) wtField.style.display = '';
  const banner = document.getElementById('moduleBanner');
  if (banner) banner.style.display = 'none';

  // Switch to the entry view (activates the tab + view, then re-renders)
  navigateTo('entry');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
  State.editingRecordId = null;
  document.getElementById('editingBanner').classList.remove('show');
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.getElementById('submitBtn').innerHTML = '<i class="fa-solid fa-check"></i> Save Daily Progress Report';
}

/* =============================================
   FORM RESET
   ============================================= */
async function refreshSNo() {
  const sno = await getNextSNo();
  document.getElementById('f_sno').value = sno;
}

function fullReset() {
  document.getElementById('dprForm').reset();
  document.getElementById('f_date').value = AppUtils.todayISO();
  document.getElementById('f_month').value = AppUtils.monthLabel(AppUtils.todayISO());
  populateZones();
  updateFieldVisibility();
  cancelEdit();
  refreshSNo();
}

function softReset() {
  // Keep date, reset other fields
  document.getElementById('f_pipeDia').selectedIndex = 0;
  document.getElementById('f_layingLength').value = '';
  document.getElementById('f_restoredLength').value = '';
  document.getElementById('f_restoredWidth').value = '';
  const _sa = document.getElementById('f_restoredArea'); if (_sa) _sa.value = '';
  const _st = document.getElementById('f_surfaceType'); if (_st) _st.selectedIndex = 0;
  const _tl = document.getElementById('f_testedLength'); if (_tl) _tl.value = '';
  const _tp = document.getElementById('f_testPressure'); if (_tp) _tp.value = '';
  const _sti = document.getElementById('f_startTime'); if (_sti) _sti.value = '';
  const _eti = document.getElementById('f_endTime'); if (_eti) _eti.value = '';
  const _tr = document.getElementById('f_testResult'); if (_tr) _tr.selectedIndex = 0;
  document.getElementById('f_ferrule').value = '';
  document.getElementById('f_ballValve').value = '';
  document.getElementById('f_meterBox').value = '';
  document.getElementById('f_waterMeter').value = '';
  document.getElementById('f_stretch').value = '';
  document.getElementById('f_noOfTeam').value = '';
  document.getElementById('f_manpower').value = '';
  document.getElementById('f_workTime').value = '';
  document.getElementById('f_remark').value = '';
  refreshSNo();
}

/* =============================================
   DATE/MONTH AUTO-GENERATION
   ============================================= */
function setupDateLogic() {
  const dateInput = document.getElementById('f_date');
  const monthInput = document.getElementById('f_month');

  if (dateInput) {
    dateInput.value = AppUtils.todayISO();
    dateInput.addEventListener('change', () => {
      if (monthInput) monthInput.value = AppUtils.monthLabel(dateInput.value);
    });
  }

  if (monthInput) {
    monthInput.value = AppUtils.monthLabel(AppUtils.todayISO());
  }
}

/* =============================================
   WORK TYPE / LAYING WORK CHANGE HANDLERS
   ============================================= */
function setupLayingWorkHandler() {
  const workTypeSelect = document.getElementById('f_worktype');
  if (workTypeSelect) {
    workTypeSelect.addEventListener('change', () => {
      updateFieldVisibility();
    });
  }
  const layingSelect = document.getElementById('f_laying');
  if (layingSelect) {
    layingSelect.addEventListener('change', () => {
      updateFieldVisibility();
    });
  }

  // Restored Area = Restored Length × Restored Width (auto)
  const rl = document.getElementById('f_restoredLength');
  const rw = document.getElementById('f_restoredWidth');
  const recalcArea = () => {
    const area = (AppUtils.cleanNum(rl ? rl.value : 0) * AppUtils.cleanNum(rw ? rw.value : 0));
    const out = document.getElementById('f_restoredArea');
    if (out) out.value = area ? area.toFixed(2) : '';
  };
  if (rl) rl.addEventListener('input', recalcArea);
  if (rw) rw.addEventListener('input', recalcArea);
}

/* =============================================
   INITIALIZATION
   ============================================= */
async function init() {
  // Setup date logic
  setupDateLogic();

  // Setup cascading dropdowns
  const packageSel = document.getElementById('f_package');
  const zoneSel = document.getElementById('f_zone');
  if (packageSel) packageSel.addEventListener('change', populateZones);
  if (zoneSel) zoneSel.addEventListener('change', populateDMAs);

  // Setup laying work handler
  setupLayingWorkHandler();

  // Form submission
  const form = document.getElementById('dprForm');
  if (form) form.addEventListener('submit', onSubmit);

  // Cancel edit
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEdit);

  // Reset
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) resetBtn.addEventListener('click', fullReset);

  // Numeric guards
  ["f_layingLength", "f_restoredLength", "f_restoredWidth", "f_noOfTeam", "f_manpower", "f_workTime", "f_ferrule", "f_ballValve", "f_meterBox", "f_waterMeter"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", AppUtils.clampNonNegative);
      el.addEventListener("keydown", AppUtils.preventMinus);
    }
  });

  // Listen for boot
  window.addEventListener('app:boot', async () => {
    populateZones();
    renderCustomFields();
    updateFieldVisibility();
    applyFieldDefsToForm();
    await refreshSNo();
  });

  // Listen for field definition changes
  window.addEventListener('fielddefs:changed', () => {
    renderCustomFields();
    updateFieldVisibility();
    applyFieldDefsToForm();
  });

  // Listen for navigation
  window.addEventListener('app:navigate', (e) => {
    const page = e.detail.page;
    if (page === 'entry' && !State.editingRecordId) {
      refreshSNo();
    }
  });

  // Default landing: open the Pipe Laying module form
  window.addEventListener('app:boot', () => {
    openModule('Pipe Laying');
  });
}

// Initialize
init();

/* =============================================
   MODULE MODE — open a module-locked entry form
   (Pipe Laying / Road Restoration / Hydro Test)
   ============================================= */
const MODULE_META = {
  'Pipe Laying':      { icon: 'fa-water', label: 'Pipe Laying' },
  'Road Restoration': { icon: 'fa-road',  label: 'Road Restoration' },
  'Hydro Test':       { icon: 'fa-gauge', label: 'Hydro Test' }
};

function applyModuleChrome(workType) {
  const banner = document.getElementById('moduleBanner');
  if (banner) {
    const m = MODULE_META[workType] || { icon: 'fa-file-pen', label: workType };
    banner.innerHTML = `<i class="fa-solid ${m.icon}"></i> <span>${AppUtils.esc(m.label)} — Daily Progress Report</span>`;
    banner.style.display = '';
  }
  const wtField = document.getElementById('worktypeField');
  if (wtField) wtField.style.display = 'none';   // module chosen via the menu
}

function openModule(workType) {
  if (State.editingRecordId) cancelEdit();

  navigateTo('entry');

  // Fresh entry, then lock to the chosen module's work type
  fullReset();
  const sel = document.getElementById('f_worktype');
  if (sel) sel.value = workType;
  updateFieldVisibility();

  applyModuleChrome(workType);

  window.dispatchEvent(new CustomEvent('module:active', { detail: { module: workType } }));
}

/* =============================================
   EXPORTS
   ============================================= */
export {
  enterEditMode,
  loadRecordIntoForm,
  cancelEdit,
  fullReset,
  openModule,
  updateFieldVisibility,
  renderCustomFields,
  gatherCustomFieldsData,
  getNextSNo,
  populateZones,
  populateDMAs
};
