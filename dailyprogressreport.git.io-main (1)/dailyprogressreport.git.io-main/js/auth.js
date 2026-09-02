/* =============================================
   AUTH MODULE
   Admin Login | Engineer Selection | PIN Auth | Logout
   ============================================= */

import {
  auth,
  onAuthStateChanged,
  signOut,
  db,
  COLLECTIONS,
  DataService
} from './firebase.js?v=15';

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

/* =============================================
   STATE
   ============================================= */
const State = window.AppState || {
  currentUser: null,
  currentRole: null,
  currentEngineer: null,
  pendingEngineerId: null,
  dataLoaded: false,
  engineers: [],
  dprs: [],
  fieldDefs: [],
  editingRecordId: null,
  settings: { snoStart: 1 }
};

if (!window.AppState) window.AppState = State;

/* =============================================
   CONSTANTS
   ============================================= */
const EMAIL_DOMAIN = "@sml.com";
const ADMIN_USERNAME = "admin";
const ADMIN_BOOTSTRAP_PASSWORD = "admin@54321";

/* =============================================
   UTILITIES
   ============================================= */
const Utils = {
  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  },

  usernameToEmail(u) {
    return u.trim().toLowerCase().replace(/\s+/g, "") + EMAIL_DOMAIN;
  },

  isNumericPin(pin) {
    return /^\d{4,10}$/.test(pin);
  },

  toast(title, isErr = false) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.innerHTML = `<i class="fa-solid ${isErr ? 'fa-circle-exclamation' : 'fa-check'}"></i><span>${Utils.esc(title)}</span>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3200);
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

  // Full-screen overlay that blocks taps during async work
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
  }
};

/* =============================================
   UI HELPERS
   ============================================= */
const UI = {
  openModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('open');
      document.body.style.overflow = '';
    }
  },

  showLoading() {
    const ls = document.getElementById('loading-screen');
    if (!ls) return;
    ls.style.display = 'flex';
    ls.style.opacity = '1';
  },

  hideLoading() {
    const ls = document.getElementById('loading-screen');
    if (!ls) return;
    ls.style.transition = 'opacity 0.2s ease';
    ls.style.opacity = '0';
    setTimeout(() => { ls.style.display = 'none'; }, 220);
  },

  showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('eng-select-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    const isAdmin = State.currentRole === 'admin';
    document.getElementById('engineersTabBtn').style.display = isAdmin ? '' : 'none';
    document.getElementById('adminTabBtn').style.display = isAdmin ? '' : 'none';
    this.updateWhoami();
  },

  showLogin() {
    document.getElementById('app').style.display = 'none';
    document.getElementById('eng-select-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'block';
  },

  showEngSelect() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'none';
    document.getElementById('eng-select-screen').style.display = 'block';
    const searchInput = document.getElementById('eng-select-search-input');
    if (searchInput) searchInput.value = '';
    Auth.renderEngSelect();
  },

  updateWhoami() {
    const el = document.getElementById('whoami');
    if (!el) return;
    if (State.currentRole === 'admin') {
      el.innerHTML = Utils.esc(State.currentUser?.email?.split('@')[0] || 'Admin') + '<span class="role-tag">Admin</span>';
    } else if (State.currentRole === 'engineer' && State.currentEngineer) {
      el.innerHTML = Utils.esc(State.currentEngineer.name) + '<span class="role-tag">Engineer</span>';
    } else {
      el.textContent = '--';
    }
  }
};

/* =============================================
   AUTH MODULE
   ============================================= */
const Auth = {
  /* ---- Admin Login ---- */
  async adminLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    errorEl.classList.remove('show');

    if (!username || !password) {
      document.getElementById('login-error-msg').textContent = 'Please enter your User ID and password.';
      errorEl.classList.add('show');
      return;
    }

    const email = Utils.usernameToEmail(username);
    Utils.setButtonLoading(btn, true);
    Utils.showBusy('Signing in…');

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const isBootstrap = username.toLowerCase() === ADMIN_USERNAME && password === ADMIN_BOOTSTRAP_PASSWORD;
      if (isBootstrap) {
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          await setDoc(doc(db, COLLECTIONS.USERS, cred.user.uid), {
            uid: cred.user.uid,
            username: ADMIN_USERNAME,
            role: "admin",
            createdAt: new Date().toISOString()
          });
        } catch (createErr) {
          if (createErr.code === "auth/email-already-in-use") {
            document.getElementById('login-error-msg').textContent = 'Incorrect password.';
          } else {
            document.getElementById('login-error-msg').textContent = 'Could not sign in. Please try again.';
          }
          errorEl.classList.add('show');
        }
      } else {
        document.getElementById('login-error-msg').textContent = Auth.errorMessage(err);
        errorEl.classList.add('show');
      }
    } finally {
      Utils.setButtonLoading(btn, false);
      Utils.hideBusy();
    }
  },

  errorMessage(err) {
    const code = (err && err.code) || "";
    if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"].includes(code))
      return "Incorrect User ID or password.";
    if (code === "auth/too-many-requests") return "Too many attempts. Please wait.";
    if (code === "auth/network-request-failed") return "Network error. Check connection.";
    return "Could not sign in. Please try again.";
  },

  togglePassword() {
    const input = document.getElementById('login-password');
    const icon = document.getElementById('pw-toggle-icon');
    if (input.type === 'password') {
      input.type = 'text';
      icon.className = 'fa-solid fa-eye';
    } else {
      input.type = 'password';
      icon.className = 'fa-solid fa-eye-slash';
    }
  },

  /* ---- Engineer Selection ---- */
  async renderEngSelect() {
    const grid = document.getElementById('eng-select-grid');
    if (!grid) return;

    if (State.engineers.length === 0) {
      try {
        const snap = await DataService.getAll(COLLECTIONS.ENGINEERS, { orderBy: 'name' });
        State.engineers = snap;
      } catch (e) {
        grid.innerHTML = `<div class="eng-select-no-results"><p>Error loading engineers.</p></div>`;
        return;
      }
    }

    const filterInput = document.getElementById('eng-select-search-input');
    const filter = filterInput ? filterInput.value.toLowerCase().trim() : '';
    let active = State.engineers.filter(e => e.status === 'active');

    if (filter) {
      active = active.filter(e =>
        e.name.toLowerCase().includes(filter) ||
        (e.empId || '').toLowerCase().includes(filter)
      );
    }

    if (!active.length) {
      grid.innerHTML = `
        <div class="eng-select-no-results">
          <i class="fa-solid fa-search" style="font-size: 32px; margin-bottom: 12px; display: block; opacity: 0.5;"></i>
          <h3 style="font-size: 16px; margin-bottom: 8px;">No engineers found</h3>
          <p>${filter ? 'Try a different search term' : 'Contact admin to add engineer profiles.'}</p>
        </div>`;
      return;
    }

    grid.innerHTML = active.map(e => `
      <div class="eng-select-item" data-eng-id="${e.id}">
        <div class="esi-avatar">${e.name[0].toUpperCase()}</div>
        <div class="esi-name">${Utils.esc(e.name)}</div>
        <div class="esi-id">${Utils.esc(e.empId || '--')}</div>
        <div class="esi-status">
          <span class="badge badge-success"><i class="fa-solid fa-circle" style="font-size:6px"></i> Active</span>
        </div>
      </div>
    `).join('');

    // Attach click handlers
    grid.querySelectorAll('.eng-select-item').forEach(item => {
      item.addEventListener('click', () => {
        const engId = item.dataset.engId;
        Auth.promptEngineerPassword(engId);
      });
    });
  },

  filterEngSelect() {
    this.renderEngSelect();
  },

  /* ---- Engineer PIN Entry ---- */
  promptEngineerPassword(engineerId) {
    const engineer = State.engineers.find(e => e.id === engineerId);
    if (!engineer) { Utils.toast('Engineer not found', true); return; }

    State.pendingEngineerId = engineerId;
    document.getElementById('eng-password-avatar').textContent = engineer.name[0].toUpperCase();
    document.getElementById('eng-password-name').textContent = engineer.name;
    document.getElementById('eng-password-empId').textContent = engineer.empId || '--';
    document.getElementById('eng-password-input').value = '';
    document.getElementById('eng-password-error').classList.remove('show');
    UI.openModal('eng-password-modal');
    setTimeout(() => document.getElementById('eng-password-input').focus(), 100);
  },

  cancelPasswordEntry() {
    State.pendingEngineerId = null;
  },

  async verifyEngineerPassword() {
    const password = document.getElementById('eng-password-input').value.trim();
    const errorEl = document.getElementById('eng-password-error');
    errorEl.classList.remove('show');

    if (!password) { errorEl.textContent = 'Please enter your PIN.'; errorEl.classList.add('show'); return; }
    if (!Utils.isNumericPin(password)) { errorEl.textContent = 'PIN must be 4-10 digits.'; errorEl.classList.add('show'); return; }

    const engineerId = State.pendingEngineerId;
    const engineer = State.engineers.find(e => e.id === engineerId);
    if (!engineer) { Utils.toast('Error', true); return; }

    Utils.showBusy('Signing in…');
    try {
      const snap = await DataService.getById(COLLECTIONS.ENGINEERS, engineerId);
      if (!snap) { errorEl.textContent = 'Profile not found.'; errorEl.classList.add('show'); return; }
      if (snap.loginPassword !== password) {
        errorEl.textContent = 'Incorrect PIN. Please try again.';
        errorEl.classList.add('show');
        document.getElementById('eng-password-input').value = '';
        document.getElementById('eng-password-input').focus();
        return;
      }
      UI.closeModal('eng-password-modal');
      State.currentRole = 'engineer';
      State.currentEngineer = { id: engineerId, ...snap };
      State.pendingEngineerId = null;

      // Remember this engineer on this device so they stay signed in
      try { localStorage.setItem('dpr_eng_session', engineerId); } catch (e) { /* storage unavailable */ }

      // Dispatch event for app.js
      window.dispatchEvent(new CustomEvent('auth:login', { detail: { role: 'engineer' } }));
    } catch (e) {
      errorEl.textContent = 'Verification failed. Try again.';
      errorEl.classList.add('show');
    } finally {
      Utils.hideBusy();
    }
  },

  /* ---- Logout ---- */
  async logout() {
    if (State.currentRole === 'admin') {
      try { await signOut(auth); } catch (e) { /* ignore */ }
    }
    // Forget any saved engineer session on this device
    try { localStorage.removeItem('dpr_eng_session'); } catch (e) { /* ignore */ }
    State.currentUser = null;
    State.currentRole = null;
    State.currentEngineer = null;
    State.pendingEngineerId = null;
    State.dataLoaded = false;
    State.dprs = [];
    State.editingRecordId = null;
    UI.showLogin();
  },

  /* ---- Restore a previously saved engineer session (this device) ---- */
  async restoreEngineerSession() {
    let savedId = null;
    try { savedId = localStorage.getItem('dpr_eng_session'); } catch (e) { /* ignore */ }
    if (!savedId) return false;

    State.sessionRestoreInProgress = true;
    try {
      const eng = await Promise.race([
        DataService.getById(COLLECTIONS.ENGINEERS, savedId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('restore-timeout')), 4000))
      ]);
      if (!eng) {
        // Profile was deleted — drop the stale session
        try { localStorage.removeItem('dpr_eng_session'); } catch (e) { /* ignore */ }
        return false;
      }
      State.currentRole = 'engineer';
      State.currentEngineer = { id: savedId, ...eng };
      State.pendingEngineerId = null;
      window.dispatchEvent(new CustomEvent('auth:login', { detail: { role: 'engineer', restored: true } }));
      return true;
    } catch (e) {
      // Network/other error — fall back to manual login, keep the saved id for next time
      console.warn('Engineer session restore failed:', e);
      return false;
    } finally {
      State.sessionRestoreInProgress = false;
    }
  },

  /* ---- Auth State Handler ---- */
  init() {
    // Signals the inline failsafe that the app's scripts loaded and are running
    window.__appReady = true;

    // Failsafe: never get stuck on the loading screen. If auth resolution
    // stalls (slow network, blocked requests, an unauthorized domain, etc.),
    // fall back to the login screen so the user can act.
    setTimeout(() => {
      if (State.currentRole) return;             // already logged in / booting
      const ls = document.getElementById('loading-screen');
      if (ls && getComputedStyle(ls).display !== 'none') {
        State.sessionRestoreInProgress = false;
        UI.hideLoading();
        UI.showLogin();
      }
    }, 7000);

    // Admin login form
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.adminLogin(e));
    }

    // Password toggle
    const pwToggle = document.getElementById('pw-toggle-btn');
    if (pwToggle) {
      pwToggle.addEventListener('click', () => this.togglePassword());
    }

    // Show engineer selection
    const showEngBtn = document.getElementById('show-eng-btn');
    if (showEngBtn) {
      showEngBtn.addEventListener('click', () => UI.showEngSelect());
    }

    // Back to login
    const backToLogin = document.getElementById('back-to-login-btn');
    if (backToLogin) {
      backToLogin.addEventListener('click', () => UI.showLogin());
    }

    // Engineer search
    const engSearch = document.getElementById('eng-select-search-input');
    if (engSearch) {
      engSearch.addEventListener('input', () => this.filterEngSelect());
    }

    // Password modal handlers
    const engPasswordClose = document.getElementById('eng-password-close');
    if (engPasswordClose) {
      engPasswordClose.addEventListener('click', () => {
        UI.closeModal('eng-password-modal');
        this.cancelPasswordEntry();
      });
    }

    const engPasswordCancel = document.getElementById('eng-password-cancel');
    if (engPasswordCancel) {
      engPasswordCancel.addEventListener('click', () => {
        UI.closeModal('eng-password-modal');
        this.cancelPasswordEntry();
      });
    }

    const engPasswordVerify = document.getElementById('eng-password-verify');
    if (engPasswordVerify) {
      engPasswordVerify.addEventListener('click', () => this.verifyEngineerPassword());
    }

    // Enter key on password input
    const engPasswordInput = document.getElementById('eng-password-input');
    if (engPasswordInput) {
      engPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.verifyEngineerPassword();
      });
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }

    // Firebase auth state listener
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // An engineer who just signed in via PIN has no Firebase user — leave them be
        if (State.currentRole === 'engineer') { UI.hideLoading(); return; }

        // Try to silently restore a saved engineer session on this device
        const restored = await Auth.restoreEngineerSession();
        if (restored) return; // auth:login dispatched -> app boots

        UI.hideLoading();
        UI.showLogin();
        return;
      }

      try {
        const roleSnap = await DataService.getById(COLLECTIONS.USERS, user.uid);
        if (!roleSnap || roleSnap.role !== 'admin') {
          Utils.toast('Account has no admin role.', true);
          await signOut(auth);
          return;
        }
        // An admin is signing in — drop any saved engineer session
        try { localStorage.removeItem('dpr_eng_session'); } catch (e) { /* ignore */ }
        State.currentUser = user;
        State.currentRole = 'admin';
        window.dispatchEvent(new CustomEvent('auth:login', { detail: { role: 'admin' } }));
      } catch (err) {
        Utils.toast('Could not verify account.', true);
        await signOut(auth);
      }
    });
  }
};

/* =============================================
   INITIALIZE
   ============================================= */
Auth.init();

/* =============================================
   EXPORTS
   ============================================= */
export { Auth, State, Utils, UI };
