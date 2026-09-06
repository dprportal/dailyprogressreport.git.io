/* =============================================
   SCOPE MANAGEMENT  (Admin -> Settings)
   Editable Distribution Main / Transmission Main scope-length
   targets for every Package and Zone. Stored in Firestore at
   settings/scope so the Dashboard can compute Total Scope,
   Completed Length, Pending Length and Progress % automatically.
   ============================================= */
import { DataService, COLLECTIONS } from './firebase.js?v=22';
import { State } from './auth.js?v=22';
import { AppUtils, MASTER_DATA } from './app.js?v=22';

const DOC_ID = 'scope';

function emptyScope() { return { packages: {}, zones: {} }; }

function getScopeStore() {
  return State.scope || emptyScope();
}

async function loadScope() {
  try {
    const doc = await DataService.getById(COLLECTIONS.SETTINGS, DOC_ID);
    State.scope = { packages: (doc && doc.packages) || {}, zones: (doc && doc.zones) || {} };
  } catch (e) {
    console.error('loadScope failed', e);
    State.scope = emptyScope();
  }
  window.dispatchEvent(new CustomEvent('scope:changed'));
}

async function saveScope(store) {
  State.scope = store;
  try {
    await DataService.set(COLLECTIONS.SETTINGS, DOC_ID, store);
    window.dispatchEvent(new CustomEvent('scope:changed'));
    return true;
  } catch (e) {
    console.error('saveScope failed', e);
    AppUtils.toast('Could not save scope. Check your connection.', true);
    return false;
  }
}

/* Public getters used by the dashboard */
function packageScope(pkgNo) {
  const s = (getScopeStore().packages || {})[String(pkgNo)] || {};
  return { distributionScope: Number(s.distributionScope) || 0, transmissionScope: Number(s.transmissionScope) || 0 };
}
function zoneScope(zoneNo) {
  const s = (getScopeStore().zones || {})[String(zoneNo)] || {};
  return { distributionScope: Number(s.distributionScope) || 0, transmissionScope: Number(s.transmissionScope) || 0 };
}

/* ---------- Package / Zone lists derived from MASTER_DATA ---------- */
function listPackages() {
  return [...new Set(MASTER_DATA.map(r => r.p))].sort((a, b) => a - b);
}
function listZones() {
  const seen = new Map();
  MASTER_DATA.forEach(r => { if (!seen.has(r.zn)) seen.set(r.zn, { zn: r.zn, z: r.z, p: r.p }); });
  return [...seen.values()].sort((a, b) => a.p - b.p || a.z.localeCompare(b.z));
}

/* ---------- Admin UI ---------- */
let currentTab = 'packages';

function row(kind, id, label, scope) {
  const esc = AppUtils.esc;
  return `
    <div class="dd-row scope-row">
      <span class="dd-val">${esc(label)}</span>
      <div class="scope-inputs">
        <label class="scope-input-lbl">Distribution (m)
          <input type="number" min="0" step="any" class="sw-input scope-input" data-kind="${kind}" data-id="${esc(id)}" data-field="distributionScope" value="${scope.distributionScope || ''}" placeholder="0">
        </label>
        <label class="scope-input-lbl">Transmission (m)
          <input type="number" min="0" step="any" class="sw-input scope-input" data-kind="${kind}" data-id="${esc(id)}" data-field="transmissionScope" value="${scope.transmissionScope || ''}" placeholder="0">
        </label>
      </div>
    </div>`;
}

function render() {
  const wrap = document.getElementById('scope-manager');
  if (!wrap) return;

  const tabs = `
    <div class="dd-tabs">
      <button class="dd-tab ${currentTab === 'packages' ? 'active' : ''}" data-scopetab="packages">By Package</button>
      <button class="dd-tab ${currentTab === 'zones' ? 'active' : ''}" data-scopetab="zones">By Zone</button>
    </div>`;

  let rows;
  if (currentTab === 'packages') {
    rows = listPackages().map(p => row('package', p, 'Package ' + p, packageScope(p))).join('');
  } else {
    rows = listZones().map(z => row('zone', z.zn, `${z.z} (Package ${z.p})`, zoneScope(z.zn))).join('');
  }

  wrap.innerHTML = `
    ${tabs}
    <p class="hint" style="margin:10px 0;">Enter scope lengths, then Save. The Dashboard uses these to compute Total Scope, Completed, Pending and Progress %.</p>
    <div class="dd-list scope-list">${rows}</div>
    <div style="margin-top:14px;">
      <button class="sw-btn sw-btn-primary" id="scope-save-btn"><i class="fa-solid fa-save"></i> Save Scope</button>
    </div>
  `;
  bind();
}

function bind() {
  const wrap = document.getElementById('scope-manager');
  if (!wrap) return;

  wrap.querySelectorAll('[data-scopetab]').forEach(b => b.addEventListener('click', () => {
    currentTab = b.dataset.scopetab; render();
  }));

  const saveBtn = wrap.querySelector('#scope-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const store = getScopeStore();
    store.packages = store.packages || {};
    store.zones = store.zones || {};
    wrap.querySelectorAll('.scope-input').forEach(input => {
      const kind = input.dataset.kind, id = input.dataset.id, field = input.dataset.field;
      const bucket = kind === 'package' ? store.packages : store.zones;
      bucket[id] = bucket[id] || {};
      bucket[id][field] = parseFloat(input.value) || 0;
    });
    AppUtils.showBusy('Saving scope…');
    const ok = await saveScope(store);
    AppUtils.hideBusy();
    if (ok) AppUtils.toast('Scope saved.');
  });
}

/* ---------- Init ---------- */
function init() {
  window.addEventListener('app:boot', async () => { await loadScope(); });
  window.addEventListener('app:navigate', (e) => {
    if (e.detail && e.detail.page === 'admin') render();
  });
}
init();

export { loadScope, packageScope, zoneScope, listPackages, listZones };
