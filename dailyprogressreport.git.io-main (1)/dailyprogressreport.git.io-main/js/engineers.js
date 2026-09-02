/* =============================================
   ENGINEERS MODULE
   CRUD | Validation | Auto-refresh | Statistics
   ============================================= */

import { DataService, COLLECTIONS } from './firebase.js?v=15';
import { State, Utils } from './auth.js?v=15';
import { AppUtils } from './app.js?v=15';

/* =============================================
   ENGINEER STATS
   ============================================= */
function getEngineerStats(engineerId) {
  const dprs = (State.dprs || []).filter(d => d.engineerId === engineerId || d.createdBy === engineerId);
  const totalLength = dprs.reduce((s, d) => s + (parseFloat(d.layingLength) || 0), 0);
  const totalManHrs = dprs.reduce((s, d) => s + (parseInt(d.manpower) || 0) * (parseFloat(d.workTime) || 0), 0);
  return { count: dprs.length, totalLength, totalManHrs };
}

/* =============================================
   ADD ENGINEER
   ============================================= */
async function addEngineer(e) {
  e.preventDefault();

  const errEl = document.getElementById('ue_err');
  errEl.classList.remove('show');
  errEl.textContent = '';

  const name = document.getElementById('ue_name').value.trim();
  const empId = document.getElementById('ue_empId').value.trim();
  const loginPassword = document.getElementById('ue_loginPassword').value.trim();
  const phone = document.getElementById('ue_phone').value.trim();
  const location = document.getElementById('ue_location').value.trim();
  const status = document.getElementById('ue_status').value;
  const notes = document.getElementById('ue_notes').value.trim();

  // Validation
  if (!name || !empId) {
    errEl.textContent = 'Name and Employee ID are required.';
    errEl.classList.add('show');
    return;
  }
  if (!loginPassword) {
    errEl.textContent = 'Numeric PIN is required.';
    errEl.classList.add('show');
    return;
  }
  if (!AppUtils.isNumericPin(loginPassword)) {
    errEl.textContent = 'PIN must be 4-10 digits.';
    errEl.classList.add('show');
    return;
  }

  const existing = (State.engineers || []).find(e => e.empId === empId);
  if (existing) {
    errEl.textContent = `Employee ID "${empId}" already exists.`;
    errEl.classList.add('show');
    return;
  }

  const btn = document.getElementById('ue_submit');
  AppUtils.setButtonLoading(btn, true);
  AppUtils.showBusy('Saving engineer…');

  try {
    const data = { name, empId, loginPassword, phone, location, status, notes };
    const docRef = await DataService.add(COLLECTIONS.ENGINEERS, data);
    State.engineers.push({ id: docRef.id, ...data });
    AppUtils.toast('Engineer profile created.');
    document.getElementById('addEngineerForm').reset();
    renderEngineerGrid();
  } catch (e) {
    console.error('Add engineer error:', e);
    errEl.textContent = 'Could not create profile. Try again.';
    errEl.classList.add('show');
  } finally {
    AppUtils.setButtonLoading(btn, false);
    AppUtils.hideBusy();
  }
}

/* =============================================
   RENDER ENGINEER GRID
   ============================================= */
function renderEngineerGrid() {
  const grid = document.getElementById('engineerGrid');
  if (!grid) return;

  const engineers = [...(State.engineers || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (engineers.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--app-muted);"><p>No engineer profiles yet.</p></div>';
    return;
  }

  grid.innerHTML = engineers.map(e => {
    const stats = getEngineerStats(e.id);
    const statusBadge = e.status === 'active'
      ? '<span class="badge badge-success"><i class="fa-solid fa-circle" style="font-size:6px"></i> Active</span>'
      : '<span class="badge badge-muted"><i class="fa-solid fa-circle" style="font-size:6px"></i> Inactive</span>';

    const isAdmin = State.currentRole === 'admin';

    return `
      <div class="eng-card" data-engineer-id="${e.id}">
        <div class="eng-card-header">
          <div class="eng-avatar">${e.name[0].toUpperCase()}</div>
          <div class="eng-info">
            <div class="eng-name">${AppUtils.esc(e.name)}</div>
            <div class="eng-meta">${AppUtils.esc(e.empId)} &middot; ${statusBadge}</div>
          </div>
        </div>
        <div class="eng-stats">
          <div class="eng-stat">
            <div class="es-val">${stats.count}</div>
            <div class="es-label">DPRs</div>
          </div>
          <div class="eng-stat">
            <div class="es-val">${stats.totalLength.toFixed(0)}m</div>
            <div class="es-label">Meters</div>
          </div>
          <div class="eng-stat">
            <div class="es-val">${stats.totalManHrs.toFixed(0)}h</div>
            <div class="es-label">Man-Hrs</div>
          </div>
        </div>
        ${isAdmin ? `
        <div class="eng-card-actions">
          <button class="sw-btn sw-btn-info sw-btn-sm edit-eng-btn" data-id="${e.id}">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button class="sw-btn sw-btn-danger sw-btn-sm delete-eng-btn" data-id="${e.id}">
            <i class="fa-solid fa-trash"></i> Delete
          </button>
        </div>` : ''}
      </div>
    `;
  }).join('');

  // Attach event handlers
  grid.querySelectorAll('.edit-eng-btn').forEach(btn => {
    btn.addEventListener('click', () => editEngineer(btn.dataset.id));
  });

  grid.querySelectorAll('.delete-eng-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteEngineer(btn.dataset.id));
  });
}

/* =============================================
   EDIT ENGINEER
   ============================================= */
function editEngineer(id) {
  const e = (State.engineers || []).find(x => x.id === id);
  if (!e) return;

  document.getElementById('ue_name').value = e.name;
  document.getElementById('ue_empId').value = e.empId;
  document.getElementById('ue_loginPassword').value = '';
  document.getElementById('ue_phone').value = e.phone || '';
  document.getElementById('ue_location').value = e.location || '';
  document.getElementById('ue_status').value = e.status || 'active';
  document.getElementById('ue_notes').value = e.notes || '';

  // Store editing ID
  document.getElementById('addEngineerForm').dataset.editingId = id;
  document.getElementById('ue_submit').innerHTML = '<i class="fa-solid fa-save"></i> Update Engineer Profile';

  window.scrollTo({ top: 0, behavior: 'smooth' });
  AppUtils.toast('Edit mode: update fields and click Update');
}

/* =============================================
   UPDATE ENGINEER
   ============================================= */
async function updateEngineer(e) {
  e.preventDefault();

  const editingId = document.getElementById('addEngineerForm').dataset.editingId;
  if (!editingId) return;

  const errEl = document.getElementById('ue_err');
  errEl.classList.remove('show');

  const name = document.getElementById('ue_name').value.trim();
  const empId = document.getElementById('ue_empId').value.trim();
  const loginPassword = document.getElementById('ue_loginPassword').value.trim();
  const phone = document.getElementById('ue_phone').value.trim();
  const location = document.getElementById('ue_location').value.trim();
  const status = document.getElementById('ue_status').value;
  const notes = document.getElementById('ue_notes').value.trim();

  if (!name || !empId) {
    errEl.textContent = 'Name and Employee ID are required.';
    errEl.classList.add('show');
    return;
  }

  const existing = (State.engineers || []).find(en => en.empId === empId && en.id !== editingId);
  if (existing) {
    errEl.textContent = `Employee ID "${empId}" already exists.`;
    errEl.classList.add('show');
    return;
  }

  const btn = document.getElementById('ue_submit');
  AppUtils.setButtonLoading(btn, true);

  try {
    const data = { name, empId, phone, location, status, notes };
    if (loginPassword) {
      if (!AppUtils.isNumericPin(loginPassword)) {
        errEl.textContent = 'PIN must be 4-10 digits.';
        errEl.classList.add('show');
        AppUtils.setButtonLoading(btn, false);
        return;
      }
      data.loginPassword = loginPassword;
    }

    AppUtils.showBusy('Updating engineer…');
    await DataService.update(COLLECTIONS.ENGINEERS, editingId, data);

    const idx = State.engineers.findIndex(en => en.id === editingId);
    if (idx > -1) {
      State.engineers[idx] = Object.assign({}, State.engineers[idx], data);
    }

    AppUtils.toast('Engineer profile updated.');
    document.getElementById('addEngineerForm').reset();
    delete document.getElementById('addEngineerForm').dataset.editingId;
    document.getElementById('ue_submit').innerHTML = '<i class="fa-solid fa-plus"></i> Create Engineer Profile';
    renderEngineerGrid();
  } catch (e) {
    console.error('Update engineer error:', e);
    errEl.textContent = 'Could not update profile. Try again.';
    errEl.classList.add('show');
  } finally {
    AppUtils.setButtonLoading(btn, false);
    AppUtils.hideBusy();
  }
}

/* =============================================
   DELETE ENGINEER
   ============================================= */
async function deleteEngineer(id) {
  const e = (State.engineers || []).find(x => x.id === id);
  if (!e) return;

  // Set up confirm modal
  document.getElementById('confirm-msg').textContent = `Delete engineer "${e.name}" (${e.empId})? Their DPR history will remain but they can no longer sign in.`;
  document.getElementById('modal-confirm-title').textContent = 'Delete Engineer';

  // Handler for confirm
  const confirmBtn = document.getElementById('confirm-btn');
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

  newConfirmBtn.addEventListener('click', async () => {
    closeModal('modal-confirm');
    AppUtils.showBusy('Deleting engineer…');
    try {
      await DataService.delete(COLLECTIONS.ENGINEERS, id);
      State.engineers = State.engineers.filter(en => en.id !== id);
      renderEngineerGrid();
      AppUtils.toast('Engineer profile deleted.');
    } catch (e) {
      console.error('Delete engineer error:', e);
      AppUtils.toast('Could not delete profile.', true);
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
   INITIALIZATION
   ============================================= */
function init() {
  // Add engineer form
  const addEngineerForm = document.getElementById('addEngineerForm');
  if (addEngineerForm) {
    addEngineerForm.addEventListener('submit', (e) => {
      if (addEngineerForm.dataset.editingId) {
        updateEngineer(e);
      } else {
        addEngineer(e);
      }
    });
  }

  // Navigation
  window.addEventListener('app:navigate', (e) => {
    if (e.detail.page === 'engineers') {
      renderEngineerGrid();
    }
  });

  // Boot
  window.addEventListener('app:boot', () => {
    if (State.currentPage === 'engineers') {
      renderEngineerGrid();
    }
  });
}

init();

/* =============================================
   EXPORTS
   ============================================= */
export { renderEngineerGrid, getEngineerStats };
