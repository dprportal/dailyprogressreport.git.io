/* =============================================
   THEME MODULE
   Dark / Light toggle — persisted in localStorage.
   The actual color swap is pure CSS (html[data-theme="dark"]
   token overrides in style.css); this module just flips the
   attribute, remembers the choice, and nudges Chart.js (used on
   the Dashboard) to redraw in matching colors.
   The <head> also carries a tiny inline copy of the "read saved
   theme" step so the correct theme applies before first paint —
   this module takes over from there for all later changes.
   ============================================= */

const STORAGE_KEY = 'dpr-theme';

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

// Chart.js reads its color defaults at chart-creation time, so this only
// needs to run before a chart is (re)built — dashboard.js listens for
// "theme:changed" and re-renders its charts right after this fires.
function syncChartDefaults(theme) {
  if (typeof window.Chart === 'undefined') return;
  const ink = theme === 'dark' ? '#E9F3F0' : '#142625';
  const line = theme === 'dark' ? '#23372F' : '#DCE6E2';
  window.Chart.defaults.color = ink;
  window.Chart.defaults.borderColor = line;
}

function applyTheme(theme, persist) {
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* storage unavailable — theme still applies for this session */ }
  }
  syncChartDefaults(theme);
  window.dispatchEvent(new CustomEvent('theme:changed', { detail: { theme } }));
}

function toggleTheme() {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
}

function init() {
  // Sync Chart.js defaults with whatever the inline head-script already
  // applied, so the very first dashboard render (before any toggle) matches.
  syncChartDefaults(currentTheme());

  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.addEventListener('click', toggleTheme);

  // Follow the OS theme automatically for anyone who hasn't chosen one yet.
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = (e) => {
      let saved = null;
      try { saved = localStorage.getItem(STORAGE_KEY); } catch (err) { /* ignore */ }
      if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    };
    if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
  }
}

init();

export { applyTheme, toggleTheme, currentTheme };
