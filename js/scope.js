/* =============================================
   PACKAGE & ZONE SCOPE (Admin → Settings)
   Lets the admin record how much Distribution Main,
   Transmission Main and House Service Connection work is
   "in scope" for each Package + Zone, so the Dashboard can
   show Done vs Pending progress instead of just raw totals.
   Stored as one document: settings/scopeConfig
   { zones: { "p4_z16": { packageNo, zoneNo, zoneName,
                            distributionScope, transmissionScope, hscScope } } }
   ============================================= */
import { DataService, COLLECTIONS, MASTER_DATA } from './firebase.js?v=22';
import { State } from './auth.js?v=22';
import { AppUtils } from './app.js?v=22';

const DOC_ID = 'scopeConfig';
let scopeMap = {}; // keyed by "p{packageNo}_z{zoneNo}"
let loaded = false;

function keyOf(packageNo, zoneNo) {
  return `p${packageNo}_z${zoneNo}`;
}

/* Unique Package + Zone list, derived from MASTER_DATA (one row per DMA
   collapses to one row per zone), sorted by package then zone name. */
function listPackageZones() {
  const seen = new Map();
  MASTER_DATA.forEach(r => {
    const k = keyOf(r.p, r.zn);
    if (!seen.has(k)) seen.set(k, { packageNo: r.p, zoneNo: r.zn, zoneName: r.z });
  });
  return [...seen.values()].sort((a, b) => (a.packageNo - b.packageNo) || a.zoneName.localeCompare(b.zoneName));
}

async function loadScope() {
  try {
    const doc = await DataService.getById(COLLECTIONS.SETTINGS, DOC_ID);
    scopeMap = (doc && doc.zones) || {};
  } catch (e) {
    console.error('loadScope error:', e);
    scopeMap = {};
  }
  loaded = true;
  return scopeMap;
}

function getScope(packageNo, zoneNo) {
  const rec = scopeMap[keyOf(packageNo, zoneNo)];
  return {
    distributionScope: (rec && Number(rec.distributionScope)) || 0,
    transmissionScope: (rec && Number(rec.transmissionScope)) || 0,
    hscScope: (rec && Number(rec.hscScope)) || 0
  };
}

function getScopeMap() { return scopeMap; }
function isLoaded() { return loaded; }

/* ---------- Settings UI ---------- */
function renderScopeTable() {
  const container = document.getElementById('scopeSettingsTable');
  if (!container) return;

  const items = listPackageZones();
  const byPackage = {};
  items.forEach(it => { (byPackage[it.packageNo] = byPackage[it.packageNo] || []).push(it); });

  const rowsHtml = Object.keys(byPackage).sort((a, b) => a - b).map(pkg => {
    const zoneRows = byPackage[pkg].map(z => {
      const s = getScope(z.packageNo, z.zoneNo);
      const k = keyOf(z.packageNo, z.zoneNo);
      return `
        <tr data-scope-key="${AppUtils.esc(k)}" data-package="${z.packageNo}" data-zone="${z.zoneNo}" data-zone-name="${AppUtils.esc(z.zoneName)}">
          <td class="scope-zone-name">${AppUtils.esc(z.zoneName)}</td>
          <td><input type="number" class="sw-input scope-input" data-field="distributionScope" min="0" step="0.01" value="${s.distributionScope || ''}" placeholder="0"></td>
          <td><input type="number" class="sw-input scope-input" data-field="transmissionScope" min="0" step="0.01" value="${s.transmissionScope || ''}" placeholder="0"></td>
          <td><input type="number" class="sw-input scope-input" data-field="hscScope" min="0" step="1" value="${s.hscScope || ''}" placeholder="0"></td>
        </tr>`;
    }).join('');

    return `
      <div class="scope-package-block">
        <div class="scope-package-title">Package ${pkg}</div>
        <table class="scope-table">
          <thead>
            <tr>
              <th>Zone</th>
              <th>Distribution Main Scope (m)</th>
              <th>Transmission Main Scope (m)</th>
              <th>HSC Scope (connections)</th>
            </tr>
          </thead>
          <tbody>${zoneRows}</tbody>
        </table>
      </div>`;
  }).join('');

  container.innerHTML = rowsHtml || '<p class="hint">No package/zone master data found.</p>';
}

async function saveAllScope() {
  const container = document.getElementById('scopeSettingsTable');
  if (!container) return;
  const rows = container.querySelectorAll('tr[data-scope-key]');
  const zones = { ...scopeMap };

  rows.forEach(row => {
    const key = row.dataset.scopeKey;
    const packageNo = Number(row.dataset.package);
    const zoneNo = Number(row.dataset.zone);
    const zoneName = row.dataset.zoneName;
    const get = field => Number(row.querySelector(`[data-field="${field}"]`).value) || 0;
    zones[key] = {
      packageNo, zoneNo, zoneName,
      distributionScope: get('distributionScope'),
      transmissionScope: get('transmissionScope'),
      hscScope: get('hscScope')
    };
  });

  const btn = document.getElementById('saveScopeBtn');
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'; }
    await DataService.set(COLLECTIONS.SETTINGS, DOC_ID, { zones });
    scopeMap = zones;
    AppUtils.toast('Scope targets saved');
    window.dispatchEvent(new CustomEvent('scope:changed'));
  } catch (e) {
    console.error('saveAllScope error:', e);
    AppUtils.toast('Could not save scope targets', true);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-save"></i> Save Scope Targets'; }
  }
}

function init() {
  window.addEventListener('app:boot', async () => {
    await loadScope();
    window.dispatchEvent(new CustomEvent('scope:changed'));
  });

  window.addEventListener('app:navigate', (e) => {
    if (e.detail.page === 'admin') renderScopeTable();
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('#saveScopeBtn')) saveAllScope();
  });

  document.addEventListener('click', (e) => {
    // admin sub-tab switcher already exists in field-editor.js; just re-render
    // our table whenever the "settings" tab becomes visible.
    const tabBtn = e.target.closest('[data-admin-tab="settings"]');
    if (tabBtn) setTimeout(renderScopeTable, 0);
  });
}

init();

export { getScope, getScopeMap, listPackageZones, isLoaded, loadScope };
