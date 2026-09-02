/* =============================================
   APP MODULE - Main Application Shell
   Navigation | Utilities | Toast | Modals | Initialization
   ============================================= */

import { DataService, COLLECTIONS } from './firebase.js?v=15';
import { State, Utils } from './auth.js?v=15';

// How many most-recent DPR records to load on boot. Keeps Firestore reads
// bounded (and load fast) no matter how many years of data accumulate.
// Older records are fetched on demand from the Reports screen.
const RECENT_DPR_LIMIT = 500;

/* =============================================
   SHARED STATE
   ============================================= */
// Ensure state is global for inline handlers
window.AppState = State;

/* =============================================
   MASTER DATA
   ============================================= */
const MASTER_DATA = [
  {"p":1,"zn":3,"z":"Dhalli","d":3},{"p":1,"zn":3,"z":"Dhalli","d":2},
  {"p":1,"zn":3,"z":"Dhalli","d":1},{"p":1,"zn":2,"z":"Mashobra","d":2},
  {"p":1,"zn":2,"z":"Mashobra","d":1},{"p":1,"zn":1,"z":"Craignano","d":1},
  {"p":10,"zn":49,"z":"Bhimakali Temple","d":3},{"p":10,"zn":49,"z":"Bhimakali Temple","d":2},
  {"p":10,"zn":49,"z":"Bhimakali Temple","d":1},{"p":10,"zn":48,"z":"Baluganj Hari Nagar-NEW Tank","d":2},
  {"p":10,"zn":48,"z":"Baluganj Hari Nagar-NEW Tank","d":1},{"p":10,"zn":52,"z":"Summer Hill Bazar-New Tank","d":1},
  {"p":10,"zn":51,"z":"Kamnadevi Temple","d":1},{"p":10,"zn":41,"z":"Chakkar/Sandal","d":1},
  {"p":10,"zn":47,"z":"Adv Study Steel","d":1},{"p":10,"zn":50,"z":"IIA Summerhill","d":1},
  {"p":10,"zn":42,"z":"Kamna Devi-New Tank","d":1},{"p":2,"zn":8,"z":"Sanjauli Tank","d":2},
  {"p":2,"zn":8,"z":"Sanjauli Tank","d":1},{"p":2,"zn":7,"z":"Dhingodevi-4-NEW Tank","d":1},
  {"p":2,"zn":12,"z":"North Oak-1-New Tank","d":1},{"p":2,"zn":5,"z":"Dhingodevi_2","d":1},
  {"p":2,"zn":4,"z":"Dhingodevi_1","d":1},{"p":2,"zn":6,"z":"Dhingodevi_3","d":1},
  {"p":3,"zn":53,"z":"Tapping Point Near Navbahar Chauk","d":1},{"p":3,"zn":11,"z":"Navbahar-New Tank","d":1},
  {"p":3,"zn":9,"z":"Jakhu Tank","d":1},{"p":3,"zn":10,"z":"Jakhu-Tank (UC)","d":2},
  {"p":3,"zn":10,"z":"Jakhu-Tank (UC)","d":1},{"p":4,"zn":16,"z":"Tara Hall-New Tank","d":2},
  {"p":4,"zn":15,"z":"Kelestone1-OHT","d":1},{"p":4,"zn":14,"z":"Kelston-2/Bharari","d":1},
  {"p":4,"zn":13,"z":"Tapping Point Near Ridge","d":1},{"p":4,"zn":16,"z":"Tara Hall-New Tank","d":1},
  {"p":4,"zn":13,"z":"Tapping Point Near Ridge","d":3},{"p":4,"zn":13,"z":"Tapping Point Near Ridge","d":2},
  {"p":5,"zn":22,"z":"Panthaghati-New Tank","d":2},{"p":5,"zn":18,"z":"IAS Colony-2-New Tank","d":1},
  {"p":5,"zn":22,"z":"Panthaghati-New Tank","d":1},{"p":5,"zn":17,"z":"Vasant Vihar-New Tank","d":1},
  {"p":5,"zn":20,"z":"Kasumpti-New Tank","d":1},{"p":5,"zn":20,"z":"Kasumpti-New Tank","d":2},
  {"p":5,"zn":21,"z":"HP PWD-OHT","d":1},{"p":5,"zn":23,"z":"Vasant Vihar-1","d":1},
  {"p":6,"zn":24,"z":"Vidhan Sabha-New Tank","d":1},{"p":6,"zn":25,"z":"Shanti Vihar","d":1},
  {"p":6,"zn":24,"z":"Vidhan Sabha-New Tank","d":2},{"p":6,"zn":27,"z":"Ark-New Tank","d":1},
  {"p":6,"zn":27,"z":"Ark-New Tank","d":2},{"p":6,"zn":26,"z":"Chotta-1,2,3-New Tank","d":1},
  {"p":7,"zn":29,"z":"Lichu-Krishna Nagar","d":1},{"p":7,"zn":30,"z":"HIMLAND-BCS","d":1},
  {"p":7,"zn":30,"z":"HIMLAND-BCS","d":2},{"p":7,"zn":28,"z":"Shimla East-Nabha","d":1},
  {"p":7,"zn":28,"z":"Shimla East-Nabha","d":2},{"p":7,"zn":31,"z":"Lichu-New Tank","d":1},
  {"p":7,"zn":29,"z":"Lichu-Krishna Nagar","d":2},{"p":8,"zn":33,"z":"Boileauganj-1,2,3","d":1},
  {"p":8,"zn":34,"z":"Kashyap-Nagar","d":1},{"p":8,"zn":34,"z":"Kashyap-Nagar","d":2},
  {"p":8,"zn":32,"z":"New Shivalik-1,2","d":1},{"p":8,"zn":33,"z":"Boileauganj-1,2,3","d":2},
  {"p":8,"zn":32,"z":"New Shivalik-1,2","d":2},{"p":9,"zn":37,"z":"Mehli-Gumma","d":1},
  {"p":9,"zn":36,"z":"Gumma-Knolls","d":1},{"p":9,"zn":37,"z":"Mehli-Gumma","d":2},
  {"p":9,"zn":35,"z":"Kashyap-Nagar","d":1},{"p":9,"zn":38,"z":"Upper Kalyan-New Tank","d":1},
  {"p":9,"zn":38,"z":"Upper Kalyan-New Tank","d":2},{"p":9,"zn":36,"z":"Gumma-Knolls","d":2},
  {"p":10,"zn":40,"z":"Panthaghati UC","d":1},{"p":10,"zn":43,"z":"Baluganj UC","d":1},
  {"p":10,"zn":44,"z":"VikasNagar UC","d":1},{"p":10,"zn":39,"z":"Lower Kalyan UC","d":1},
  {"p":10,"zn":45,"z":"Craignano UC","d":1},{"p":10,"zn":46,"z":"Panthaghati-2 UC","d":1}
];

const PIPE_DIAMETERS = [15,20,25,32,40,50,63,75,80,90,100,110,125,140,150,160,180,200,225,250,280,300,315,350,400,450,500,600];
const CONTRACTORS = ["SAI","Rohit","Kulbhushan","Khajan Singh","Jarnail Singh","RK","Shabdbhaid","Brij","Roshan","Chandresh","Mahindar","Ajay Thakur","Sandeep","Surendar Hansreta"];

/* =============================================
   UTILITY FUNCTIONS
   ============================================= */
const AppUtils = {
  todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  },

  monthLabel(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  },

  fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  },

  clampNonNegative(e) {
    const el = e.target;
    if (el.value !== "" && Number(el.value) < 0) el.value = "0";
  },

  preventMinus(e) {
    if (e.key === "-" || e.key === "+") e.preventDefault();
  },

  cleanNum(v) {
    const n = Number(v);
    return isNaN(n) ? 0 : Math.max(0, n);
  },

  debounce(fn, delay) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); };
  },

  csvField(v) {
    const s = String(v == null ? "" : v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  },

  setButtonLoading(btn, loading, originalHtml) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    } else {
      btn.innerHTML = btn.dataset.originalHtml || originalHtml || btn.innerHTML;
    }
  },

  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },

  // Validate a numeric PIN (4-10 digits) — used by engineer create/update + login
  isNumericPin(pin) {
    return /^\d{4,10}$/.test(String(pin || ''));
  },

  // Full-screen busy overlay that blocks taps during async work
  showBusy(text) {
    const o = document.getElementById('busy-overlay');
    if (!o) return;
    const t = document.getElementById('busy-text');
    if (t && text) t.textContent = text;
    o.__busy = (o.__busy || 0) + 1;
    o.classList.add('show');
    o.setAttribute('aria-hidden', 'false');
  },

  hideBusy() {
    const o = document.getElementById('busy-overlay');
    if (!o) return;
    o.__busy = Math.max(0, (o.__busy || 0) - 1);
    if (o.__busy > 0) return;
    o.classList.remove('show');
    o.setAttribute('aria-hidden', 'true');
  },

  toast(title, isErr = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.innerHTML = `<i class="fa-solid ${isErr ? 'fa-circle-exclamation' : 'fa-check'}"></i><span>${this.esc(title)}</span>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
};

// Make utils globally available
window.AppUtils = AppUtils;

/* =============================================
   NAVIGATION
   ============================================= */
function setActiveTab(page) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const btn = document.querySelector(`.tab-btn[data-tab="${page}"]`);
  if (btn) btn.classList.add('active');
  const view = document.getElementById(`view-${page}`);
  if (view) view.classList.add('active');
}

function navigateTo(page) {
  if (page === 'engineers' && State.currentRole !== 'admin') return;
  if (page === 'admin' && State.currentRole !== 'admin') return;

  State.currentPage = page;
  setActiveTab(page);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Dispatch navigation event for other modules
  window.dispatchEvent(new CustomEvent('app:navigate', { detail: { page } }));
}

/* =============================================
   MODAL HANDLING
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
   LOADING SCREEN
   ============================================= */
function hideLoading() {
  const ls = document.getElementById('loading-screen');
  if (!ls) return;
  ls.style.transition = 'opacity 0.2s ease';
  ls.style.opacity = '0';
  setTimeout(() => { ls.style.display = 'none'; }, 220);
}

/* =============================================
   POPULATE STATIC DROPDOWNS
   ============================================= */
function populateStaticSelects() {
  // Package dropdown
  const packageSel = document.getElementById('f_package');
  if (packageSel && packageSel.options.length <= 1) {
    const packages = [...new Set(MASTER_DATA.map(r => r.p))].sort((a, b) => a - b);
    packages.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = 'Package ' + p;
      packageSel.appendChild(opt);
    });
  }

  // Pipe diameter dropdown
  const pipeDiaSel = document.getElementById('f_pipeDia');
  if (pipeDiaSel && pipeDiaSel.options.length <= 1) {
    PIPE_DIAMETERS.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d + ' mm';
      pipeDiaSel.appendChild(opt);
    });
  }

  // Contractor dropdown
  const contractorSel = document.getElementById('f_contractor');
  if (contractorSel && contractorSel.options.length <= 1) {
    CONTRACTORS.slice().sort((a, b) => a.localeCompare(b)).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      contractorSel.appendChild(opt);
    });
  }

  // Filter dropdowns
  const filtPackage = document.getElementById('filt_package');
  if (filtPackage && filtPackage.options.length <= 1) {
    const packages = [...new Set(MASTER_DATA.map(r => r.p))].sort((a, b) => a - b);
    packages.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = 'Package ' + p;
      filtPackage.appendChild(opt);
    });
  }

  const filtContractor = document.getElementById('filt_contractor');
  if (filtContractor && filtContractor.options.length <= 1) {
    CONTRACTORS.slice().sort((a, b) => a.localeCompare(b)).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      filtContractor.appendChild(opt);
    });
  }
}

/* =============================================
   EVENT LISTENERS
   ============================================= */
function setupEventListeners() {
  // Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.tab;
      if (page) navigateTo(page);
    });
  });

  // Refresh button
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      AppUtils.toast('Refreshing data...');
      window.dispatchEvent(new CustomEvent('app:refresh'));
    });
  }

  // Confirm modal
  const modalConfirm = document.getElementById('modal-confirm');
  if (modalConfirm) {
    modalConfirm.addEventListener('click', (e) => {
      if (e.target === modalConfirm) closeModal('modal-confirm');
    });
  }

  const modalConfirmClose = document.getElementById('modal-confirm-close');
  if (modalConfirmClose) {
    modalConfirmClose.addEventListener('click', () => closeModal('modal-confirm'));
  }

  const confirmCancel = document.getElementById('confirm-cancel');
  if (confirmCancel) {
    confirmCancel.addEventListener('click', () => closeModal('modal-confirm'));
  }
}

/* =============================================
   APP BOOT
   ============================================= */
async function loadAllData() {
  // Small collections load normally (they're tiny and needed before first render)
  const [engineers, fieldDefs, settingsArr] = await Promise.all([
    DataService.getAll(COLLECTIONS.ENGINEERS, { orderBy: 'name' }),
    DataService.getAll(COLLECTIONS.FIELD_DEFS, { orderBy: 'order' }),
    DataService.getAll(COLLECTIONS.SETTINGS)
  ]);

  State.engineers = engineers || [];
  State.fieldDefs = fieldDefs || [];

  // Process settings
  if (settingsArr && settingsArr.length > 0) {
    const s = settingsArr[0];
    State.settings = {
      snoStart: s.snoStart || 1,
      pageSize: s.pageSize || 50
    };
  }

  // DPRs load cache-first: instant on restart, then refreshed from the server
  // in the background. Keeps the app responsive instead of waiting on the network.
  const dprs = await DataService.getAllFast(
    COLLECTIONS.DPR,
    { orderBy: 'date', orderDir: 'desc', limit: RECENT_DPR_LIMIT },
    (fresh) => {
      State.dprs = fresh;                  // newest-first
      State.dprsFullyLoaded = false;
      window.dispatchEvent(new CustomEvent('dpr:changed'));
    }
  );
  State.dprs = dprs || [];                 // already newest-first (date desc)
  State.dprsFullyLoaded = false;

  State.dataLoaded = true;
}

async function bootApp() {
  AppUtils.showBusy('Loading your workspace…');
  try {
    await loadAllData();

    // Show app
    hideLoading();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('eng-select-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';

    const isAdmin = State.currentRole === 'admin';
    document.getElementById('engineersTabBtn').style.display = isAdmin ? '' : 'none';
    document.getElementById('adminTabBtn').style.display = isAdmin ? '' : 'none';

    // Update whoami
    const whoami = document.getElementById('whoami');
    if (whoami) {
      if (State.currentRole === 'admin') {
        whoami.innerHTML = AppUtils.esc(State.currentUser?.email?.split('@')[0] || 'Admin') + '<span class="role-tag">Admin</span>';
      } else if (State.currentRole === 'engineer' && State.currentEngineer) {
        whoami.innerHTML = AppUtils.esc(State.currentEngineer.name) + '<span class="role-tag">Engineer</span>';
      }
    }

    // Populate static dropdowns
    populateStaticSelects();

    // Navigate to entry
    navigateTo('entry');

    // Dispatch boot event
    window.dispatchEvent(new CustomEvent('app:boot'));

    AppUtils.toast('Welcome! Data loaded successfully.');
  } catch (e) {
    console.error('Boot error:', e);
    AppUtils.toast('Failed to load data. Please refresh.', true);
    hideLoading();
  } finally {
    AppUtils.hideBusy();
  }
}

/* =============================================
   AUTH + REFRESH LISTENERS
   ============================================= */
window.addEventListener('auth:login', () => {
  bootApp();
});

// Refresh button now actually reloads from Firebase and re-renders
window.addEventListener('app:refresh', async () => {
  if (!State.currentRole) return;
  AppUtils.showBusy('Refreshing data…');
  try {
    await loadAllData();
    window.dispatchEvent(new CustomEvent('fielddefs:changed'));
    window.dispatchEvent(new CustomEvent('dpr:changed'));
    navigateTo(State.currentPage || 'entry');
    AppUtils.toast('Data refreshed.');
  } catch (e) {
    console.error('Refresh error:', e);
    AppUtils.toast('Could not refresh data.', true);
  } finally {
    AppUtils.hideBusy();
  }
});

/* =============================================
   INITIALIZATION
   ============================================= */
function init() {
  setupEventListeners();

  // Show login after brief loading (fallback if auth state is slow)
  setTimeout(() => {
    if (!State.currentRole && !State.sessionRestoreInProgress &&
        document.getElementById('loading-screen').style.display !== 'none') {
      hideLoading();
      document.getElementById('login-screen').style.display = 'block';
    }
  }, 250);
}

// Initialize
init();

/* =============================================
   EXPORTS
   ============================================= */
export {
  AppUtils,
  MASTER_DATA,
  PIPE_DIAMETERS,
  CONTRACTORS,
  navigateTo,
  openModal,
  closeModal,
  hideLoading,
  setActiveTab
};
