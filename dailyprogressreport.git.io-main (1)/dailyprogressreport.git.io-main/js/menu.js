/* =============================================
   NAVIGATION DRAWER (Hamburger Menu)
   Drives the existing view engine + module forms.
   - data-nav   -> navigateTo(page)
   - data-module-> openModule(workType)  (locked module form)
   ============================================= */

import { navigateTo } from './app.js?v=15';
import { openModule } from './dpr.js?v=15';
import { State } from './auth.js?v=15';

const drawer = document.getElementById('navDrawer');
const backdrop = document.getElementById('drawerBackdrop');

function openDrawer() {
  if (!drawer) return;
  drawer.classList.add('open');
  if (backdrop) backdrop.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  if (!drawer) return;
  drawer.classList.remove('open');
  if (backdrop) backdrop.classList.remove('show');
  document.body.style.overflow = '';
}

function setActive({ nav, module }) {
  document.querySelectorAll('.drawer-item').forEach(b => b.classList.remove('active'));
  if (module) {
    const el = document.querySelector(`.drawer-item[data-module="${module}"]`);
    if (el) el.classList.add('active');
  } else if (nav) {
    const el = document.querySelector(`.drawer-item[data-nav="${nav}"]`);
    if (el) el.classList.add('active');
  }
}

function updateRoleVisibility() {
  const isAdmin = State.currentRole === 'admin';
  document.querySelectorAll('.drawer-admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : '';
    el.classList.toggle('hidden', !isAdmin);
  });
}

function init() {
  const toggle = document.getElementById('menuToggle');
  const closeBtn = document.getElementById('drawerClose');
  const logoutItem = document.getElementById('drawerLogout');

  if (toggle) toggle.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  // Menu item clicks
  document.querySelectorAll('.drawer-item').forEach(btn => {
    if (btn.id === 'drawerLogout') return;
    btn.addEventListener('click', () => {
      const page = btn.dataset.nav;
      const module = btn.dataset.module;
      if (module) {
        openModule(module);
        setActive({ module });
      } else if (page) {
        navigateTo(page);
        setActive({ nav: page });
      }
      closeDrawer();
    });
  });

  // Logout reuses the existing wired handler
  if (logoutItem) {
    logoutItem.addEventListener('click', () => {
      closeDrawer();
      const lb = document.getElementById('logoutBtn');
      if (lb) lb.click();
    });
  }

  // Keep highlight in sync with programmatic navigation
  window.addEventListener('app:navigate', (e) => {
    const page = e.detail && e.detail.page;
    if (page && page !== 'entry') setActive({ nav: page });
  });
  window.addEventListener('module:active', (e) => {
    const m = e.detail && e.detail.module;
    if (m) setActive({ module: m });
  });

  // Role-based items
  window.addEventListener('auth:login', updateRoleVisibility);
  window.addEventListener('app:boot', updateRoleVisibility);

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });
}

init();

export { openDrawer, closeDrawer };
