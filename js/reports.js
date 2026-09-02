/* =============================================
   REPORTS LOG MODULE
   Table Rendering | Filters | Search | Dynamic Columns
   ============================================= */

import { DataService, COLLECTIONS } from './firebase.js?v=15';
import { State } from './auth.js?v=15';
import { AppUtils } from './app.js?v=15';
import { enterEditMode } from './dpr.js?v=15';
import { buildDprMessage, whatsappShareUrl, copyTextToClipboard } from './whatsapp-share.js?v=15';

/* =============================================
   GET FILTERED DATA
   ============================================= */
function getFilteredData() {
  const from = document.getElementById('filt_from').value;
  const to = document.getElementById('filt_to').value;
  const pkg = document.getElementById('filt_package').value;
  const zone = document.getElementById('filt_zone').value;
  const dma = document.getElementById('filt_dma').value;
  const con = document.getElementById('filt_contractor').value;
  const eng = document.getElementById('filt_engineer').value;
  const workType = document.getElementById('filt_worktype').value;
  const moduleEl = document.getElementById('filt_module');
  const moduleSel = moduleEl ? moduleEl.value : '';
  const q = document.getElementById('filt_search').value.trim().toLowerCase();

  return (State.dprs || []).filter(r => {
    if (moduleSel && r.workType !== moduleSel) return false;
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    if (pkg && String(r.packageNo) !== String(pkg)) return false;
    if (zone && String(r.zoneNo) !== String(zone)) return false;
    if (dma && String(r.dma) !== String(dma)) return false;
    if (con && r.contractor !== con) return false;
    if (eng && r.engineerId !== eng && r.createdBy !== eng) return false;
    if (workType && r.layingWork !== workType) return false;
    if (q) {
      const hay = [
        r.zoneName,
        'dma ' + r.dma,
        r.remarks,
        r.remark,
        r.transmissionStretch,
        r.stretch,
        r.workType,
        r.layingWork,
        r.contractor,
        r.engineerName,
        r.createdByName
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* =============================================
   RENDER LOG TABLE
   ============================================= */
function render() {
  const tbody = document.getElementById('logBody');
  const table = document.getElementById('logTable');
  const empty = document.getElementById('logEmpty');
  if (!tbody || !table || !empty) return;

  const rows = getFilteredData();
  const esc = AppUtils.esc;
  const mod = (document.getElementById('filt_module') || {}).value || '';
  const numCell = v => (v != null && v !== '') ? Number(v).toLocaleString() : '';

  // ---- Column set per module (so fields never mix) ----
  const cols = [
    { label: 'S.No', cls: 'mono', get: r => esc(r.sno || '') },
    { label: 'Date', cls: '', get: r => esc(AppUtils.fmtDate(r.date)) }
  ];
  if (!mod) cols.push({ label: 'Module', cls: '', get: r => esc(r.workType || '') });
  cols.push(
    { label: 'Package', cls: '', get: r => `<span class="pill">Pkg ${esc(r.packageNo || '')}</span>` },
    { label: 'Zone', cls: '', get: r => esc(r.zoneName || '') },
    { label: 'DMA', cls: 'mono', get: r => 'DMA ' + esc(r.dma || '') }
  );
  if (mod === 'Pipe Laying') {
    cols.push(
      { label: 'Activity', cls: '', get: r => esc(r.layingWork || '') },
      { label: 'Pipe Dia', cls: 'mono', get: r => esc(r.pipeDia || '') },
      { label: 'Length (m)', cls: 'mono', get: r => numCell(r.layingLength) }
    );
  } else if (mod === 'Road Restoration') {
    cols.push(
      { label: 'Surface', cls: '', get: r => esc(r.surfaceType || '') },
      { label: 'Length (m)', cls: 'mono', get: r => numCell(r.restoredLength) },
      { label: 'Width (m)', cls: 'mono', get: r => numCell(r.restoredWidth) },
      { label: 'Area (sqm)', cls: 'mono', get: r => numCell(r.restoredArea) }
    );
  } else if (mod === 'Hydro Test') {
    cols.push(
      { label: 'Pipe Dia', cls: 'mono', get: r => esc(r.pipeDia || '') },
      { label: 'Tested (m)', cls: 'mono', get: r => numCell(r.testedLength) },
      { label: 'Pressure', cls: 'mono', get: r => numCell(r.testPressure) },
      { label: 'Result', cls: '', get: r => esc(r.testResult || '') }
    );
  } else {
    cols.push({ label: 'Activity', cls: '', get: r => esc(r.layingWork || '') });
  }
  cols.push(
    { label: 'Contractor', cls: '', get: r => esc(r.contractor || '') },
    { label: 'By', cls: '', get: r => esc(r.engineerName || r.createdByName || '--') }
  );

  // Summary (length metric adapts to module)
  let lenKey = 'layingLength', lenLabel = 'Total length', lenUnit = ' m';
  if (mod === 'Road Restoration') { lenKey = 'restoredArea'; lenLabel = 'Total area'; lenUnit = ' sqm'; }
  else if (mod === 'Hydro Test') { lenKey = 'testedLength'; lenLabel = 'Total tested'; lenUnit = ' m'; }
  const totalLen = rows.reduce((s, r) => s + (parseFloat(r[lenKey]) || 0), 0);
  const totalMan = rows.reduce((s, r) => s + (parseInt(r.manpower) || 0), 0);

  const summaryEl = document.getElementById('logSummary');
  if (summaryEl) {
    summaryEl.innerHTML = [
      ["Entries", rows.length],
      [lenLabel, totalLen.toLocaleString(undefined, { maximumFractionDigits: 2 }) + lenUnit],
      ["Manpower logged", totalMan.toLocaleString()],
      ["Packages active", new Set(rows.map(r => r.packageNo)).size]
    ].map(([l, v]) => `
      <div class="stat-pill">
        <div class="v">${AppUtils.esc(v)}</div>
        <div class="l">${AppUtils.esc(l)}</div>
      </div>
    `).join("");
  }

  if (rows.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    table.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  table.style.display = 'table';

  // Header (dynamic) + Actions column
  const head = document.getElementById('logTableHead');
  if (head) {
    head.innerHTML = '<tr>' + cols.map(c => `<th>${c.label}</th>`).join('') + '<th>Act</th></tr>';
  }

  // Render table body
  tbody.innerHTML = rows.map(r => {
    const isAdmin = State.currentRole === 'admin';

    const shareBtn = `<button class="icon-btn-sm share share-dpr-btn" data-id="${r.id}" title="Share on WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>`;
    const editBtn = isAdmin
      ? `<button class="icon-btn-sm edit-dpr-btn" data-id="${r.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>`
      : '';
    const delBtn = isAdmin
      ? `<button class="icon-btn-sm del delete-dpr-btn" data-id="${r.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>`
      : '';

    const tds = cols.map(c => `<td class="${c.cls}">${c.get(r)}</td>`).join('');
    return `<tr>${tds}<td><div class="log-actions-cell">${shareBtn}${editBtn}${delBtn}</div></td></tr>`;
  }).join('');

  // Attach event handlers
  tbody.querySelectorAll('.share-dpr-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const record = State.dprs.find(x => x.id === btn.dataset.id);
      if (record) openShareModal(record);
    });
  });

  tbody.querySelectorAll('.edit-dpr-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const record = State.dprs.find(x => x.id === btn.dataset.id);
      if (record) enterEditMode(record);
    });
  });

  tbody.querySelectorAll('.delete-dpr-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id));
  });
}

/* =============================================
   WHATSAPP SHARE MODAL
   ============================================= */
let _shareText = '';

function openShareModal(record) {
  _shareText = buildDprMessage(record);
  const preview = document.getElementById('share-preview');
  if (preview) preview.textContent = _shareText;
  openModal('modal-share');
}

function initShare() {
  const copyBtn = document.getElementById('share-copy-btn');
  const waBtn = document.getElementById('share-wa-btn');
  const closeBtn = document.getElementById('share-close-btn');

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const ok = await copyTextToClipboard(_shareText);
      AppUtils.toast(ok ? 'Report copied to clipboard.' : 'Could not copy. Select and copy manually.', !ok);
    });
  }
  if (waBtn) {
    waBtn.addEventListener('click', () => {
      window.open(whatsappShareUrl(_shareText), '_blank');
    });
  }
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeModal('modal-share'));
  }
}
initShare();

/* =============================================
   DELETE DPR
   ============================================= */
function confirmDelete(id) {
  document.getElementById('confirm-msg').textContent = 'Are you sure you want to delete this DPR entry? This action cannot be undone.';
  document.getElementById('modal-confirm-title').textContent = 'Delete DPR Entry';

  const confirmBtn = document.getElementById('confirm-btn');
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

  newConfirmBtn.addEventListener('click', async () => {
    closeModal('modal-confirm');
    AppUtils.showBusy('Deleting entry…');
    try {
      await DataService.delete(COLLECTIONS.DPR, id);
      State.dprs = State.dprs.filter(r => r.id !== id);
      render();
      window.dispatchEvent(new CustomEvent('dpr:changed'));
      AppUtils.toast('Entry deleted.');
    } catch (err) {
      console.error('Delete error:', err);
      AppUtils.toast('Could not delete entry.', true);
    } finally {
      AppUtils.hideBusy();
    }
  });

  openModal('modal-confirm');
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
   POPULATE ZONE/DMA FILTERS
   ============================================= */
function populateZoneFilter() {
  const sel = document.getElementById('filt_zone');
  if (!sel) return;

  // Get unique zones from DPRs
  const zones = [...new Set((State.dprs || []).map(r => r.zoneNo).filter(Boolean))].sort((a, b) => a - b);

  const firstOption = sel.options[0];
  sel.innerHTML = '';
  sel.appendChild(firstOption);

  zones.forEach(z => {
    const zoneData = State.dprs.find(r => r.zoneNo === z);
    const opt = document.createElement('option');
    opt.value = z;
    opt.textContent = zoneData ? zoneData.zoneName : 'Zone ' + z;
    sel.appendChild(opt);
  });
}

function populateDMAFilter() {
  const sel = document.getElementById('filt_dma');
  if (!sel) return;

  const dmas = [...new Set((State.dprs || []).map(r => r.dma).filter(Boolean))].sort((a, b) => a - b);

  const firstOption = sel.options[0];
  sel.innerHTML = '';
  sel.appendChild(firstOption);

  dmas.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = 'DMA ' + d;
    sel.appendChild(opt);
  });
}

/* =============================================
   INITIALIZATION
   ============================================= */
function init() {
  // Filter inputs
  ['filt_from', 'filt_to', 'filt_package', 'filt_zone', 'filt_dma',
   'filt_contractor', 'filt_engineer', 'filt_worktype', 'filt_search'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', AppUtils.debounce(() => render(), 150));
      el.addEventListener('change', () => render());
    }
  });

  // Module filter chips (separate per-module reports + exports)
  document.querySelectorAll('#moduleFilterBar .mod-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#moduleFilterBar .mod-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const hidden = document.getElementById('filt_module');
      if (hidden) hidden.value = chip.dataset.mod || '';
      render();
    });
  });

  // Load older records on demand (keeps the default boot load small & fast)
  const loadHistoryBtn = document.getElementById('loadHistoryBtn');
  if (loadHistoryBtn) {
    loadHistoryBtn.addEventListener('click', async () => {
      if (State.dprsFullyLoaded) {
        AppUtils.toast('All records are already loaded.');
        return;
      }
      AppUtils.showBusy('Loading older records…');
      try {
        const all = await DataService.getAll(COLLECTIONS.DPR, { orderBy: 'date', orderDir: 'desc' });
        State.dprs = all;
        State.dprsFullyLoaded = true;
        populateZoneFilter();
        populateDMAFilter();
        render();
        AppUtils.toast(`Loaded ${all.length} total records.`);
        loadHistoryBtn.style.display = 'none';
      } catch (e) {
        console.error('Load history error:', e);
        AppUtils.toast('Could not load older records.', true);
      } finally {
        AppUtils.hideBusy();
      }
    });
  }

  // Navigation
  window.addEventListener('app:navigate', (e) => {
    if (e.detail.page === 'log') {
      render();
      populateZoneFilter();
      populateDMAFilter();
    }
  });

  // Render event
  window.addEventListener('log:render', () => render());

  // DPR changed
  window.addEventListener('dpr:changed', () => {
    if (State.currentPage === 'log') render();
  });

  // Boot
  window.addEventListener('app:boot', () => {
    if (State.currentPage === 'log') render();
  });
}

init();

/* =============================================
   EXPORTS
   ============================================= */
export { render, getFilteredData };
