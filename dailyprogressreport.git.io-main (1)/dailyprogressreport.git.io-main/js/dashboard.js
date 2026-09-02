/* =============================================
   DASHBOARD MODULE
   Statistics | Chart.js Charts | Progress Bars
   ============================================= */

import { State } from './auth.js?v=15';
import { AppUtils } from './app.js?v=15';

/* =============================================
   CHART INSTANCES
   ============================================= */
let chartDaily = null;
let chartContractor = null;
let chartWorkType = null;

/* metres of progress for a record, across any work type */
function primaryLen(r) {
  return parseFloat(r.layingLength || r.restoredLength || r.testedLength || 0) || 0;
}
/* local YYYY-MM-DD (matches AppUtils.todayISO) */
function toLocalISO(d) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}
function aggregateByPrimaryLen(key, recs) {
  const agg = {};
  recs.forEach(r => {
    const val = r[key];
    if (val !== undefined && val !== null && val !== '') {
      agg[val] = (agg[val] || 0) + primaryLen(r);
    }
  });
  return Object.entries(agg).sort((a, b) => b[1] - a[1]);
}

/* =============================================
   STATISTICS CALCULATION
   ============================================= */
function calculateStats() {
  const recs = State.dprs || [];
  const today = AppUtils.todayISO();
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const inMonth = r => {
    const d = new Date(r.date + 'T00:00:00');
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  };

  // last-7-days cutoff (inclusive of today)
  const wk = new Date(); wk.setDate(wk.getDate() - 6);
  const wkISO = toLocalISO(wk);

  return {
    // progress in metres (primary metric)
    todayM: recs.filter(r => r.date === today).reduce((s, r) => s + primaryLen(r), 0),
    monthM: recs.filter(inMonth).reduce((s, r) => s + primaryLen(r), 0),
    last7M: recs.filter(r => r.date >= wkISO).reduce((s, r) => s + primaryLen(r), 0),
    totalM: recs.reduce((s, r) => s + primaryLen(r), 0),
    // kept for any internal use
    totalManpower: recs.reduce((s, r) => s + (parseInt(r.manpower) || 0), 0)
  };
}

/* =============================================
   AGGREGATION HELPERS
   ============================================= */
function aggregateBy(key, recs) {
  const agg = {};
  recs.forEach(r => {
    const val = r[key];
    if (val !== undefined && val !== null && val !== '') {
      agg[val] = (agg[val] || 0) + 1;
    }
  });
  return Object.entries(agg).sort((a, b) => b[1] - a[1]);
}

function aggregateByLength(key, recs) {
  const agg = {};
  recs.forEach(r => {
    const val = r[key];
    if (val !== undefined && val !== null && val !== '') {
      agg[val] = (agg[val] || 0) + (parseFloat(r.layingLength) || 0);
    }
  });
  return Object.entries(agg).sort((a, b) => b[1] - a[1]);
}

/* =============================================
   RENDER STATS CARDS
   ============================================= */
function renderStats() {
  const stats = calculateStats();
  const container = document.getElementById('dashStats');
  if (!container) return;
  const fmt = v => Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 });

  container.innerHTML = [
    ["Today's Progress (m)", fmt(stats.todayM)],
    ["This Month (m)", fmt(stats.monthM)],
    ["Last 7 Days (m)", fmt(stats.last7M)],
    ["Total Recorded (m)", fmt(stats.totalM)]
  ].map(([l, v]) => `
    <div class="dstat">
      <div class="v">${AppUtils.esc(v)}</div>
      <div class="l">${AppUtils.esc(l)}</div>
    </div>
  `).join('');
}

/* =============================================
   RENDER PROGRESS BARS
   ============================================= */
function renderProgressBars(containerId, entries, total, colorVar) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (entries.length === 0) {
    container.innerHTML = '<p style="color:var(--app-muted);font-size:12.5px;">No data yet.</p>';
    return;
  }

  const max = Math.max(...entries.map(e => e[1]), 1);
  container.innerHTML = entries.map(([label, val]) => `
    <div class="bar-row">
      <div class="lbl" title="${AppUtils.esc(label)}">${AppUtils.esc(label)}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(val / max * 100).toFixed(1)}%;background:${colorVar};"></div>
      </div>
      <div class="val">${typeof val === "number" && val % 1 !== 0 ? val.toFixed(1) : val}</div>
    </div>
  `).join('');
}

/* =============================================
   RENDER CHARTS
   ============================================= */
function renderDailyChart() {
  const canvas = document.getElementById('chartDaily');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const recs = State.dprs || [];

  // sum metres per date, then plot the last 14 calendar days
  const byDate = {};
  recs.forEach(r => { if (r.date) byDate[r.date] = (byDate[r.date] || 0) + primaryLen(r); });

  const days = 14;
  const labels = [], data = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = toLocalISO(d);
    labels.push(d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
    data.push(Math.round((byDate[iso] || 0) * 100) / 100);
  }

  if (chartDaily) chartDaily.destroy();

  if (!data.some(v => v > 0)) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#5B6C6B';
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('No progress recorded in the last 14 days', canvas.width / 2, canvas.height / 2);
    return;
  }

  chartDaily = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Metres',
        data,
        backgroundColor: '#1782A8',
        borderRadius: 4,
        maxBarThickness: 46
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.parsed.y.toLocaleString()} m` } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { font: { size: 10 } }, title: { display: true, text: 'metres' } },
        x: { ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 0 }, grid: { display: false } }
      }
    }
  });
}

function renderContractorChart() {
  const canvas = document.getElementById('chartContractor');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const recs = State.dprs || [];
  const byContractor = aggregateByPrimaryLen('contractor', recs).slice(0, 8);

  if (chartContractor) chartContractor.destroy();

  if (byContractor.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#5B6C6B';
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', canvas.width / 2, canvas.height / 2);
    return;
  }

  chartContractor = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: byContractor.map(([k]) => k),
      datasets: [{
        label: 'Metres',
        data: byContractor.map(([, v]) => Math.round(v * 100) / 100),
        backgroundColor: '#0C6B9A',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.parsed.y.toLocaleString()} m` } }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { font: { size: 10 } }
        },
        x: {
          ticks: { font: { size: 9 }, maxRotation: 45 }
        }
      }
    }
  });
}

function renderWorkTypeChart() {
  const canvas = document.getElementById('chartWorkType');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const recs = State.dprs || [];
  const byWorkType = aggregateByPrimaryLen('layingWork', recs);

  if (chartWorkType) chartWorkType.destroy();

  if (byWorkType.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#5B6C6B';
    ctx.font = '12px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', canvas.width / 2, canvas.height / 2);
    return;
  }

  const colors = {
    'Distribution Main': '#0E6B66',
    'Transmission Main': '#2E7DA6',
    'House Service Connection': '#427A4C',
    'Restoration': '#C97A1F'
  };

  chartWorkType = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: byWorkType.map(([k]) => k),
      datasets: [{
        data: byWorkType.map(([, v]) => v),
        backgroundColor: byWorkType.map(([k]) => colors[k] || '#5C6770'),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 10 }, padding: 8 }
        }
      }
    }
  });
}

/* =============================================
   RENDER ALL DASHBOARD
   ============================================= */
function render() {
  const recs = State.dprs || [];

  // Stats cards (metres)
  renderStats();

  // Daily progress in metres (headline chart)
  renderDailyChart();

  // Progress bars — metres by package / zone / DMA
  const byPackage = aggregateByPrimaryLen('packageNo', recs);
  renderProgressBars('byPackage', byPackage.map(([k, v]) => [`Package ${k}`, v]), 1, "var(--app-sky)");

  const byZone = aggregateByPrimaryLen('zoneName', recs);
  renderProgressBars('byZone', byZone, 1, "var(--app-teal)");

  const byDMA = aggregateByPrimaryLen('dma', recs).slice(0, 20);
  renderProgressBars('byDMA', byDMA.map(([k, v]) => [`DMA ${k}`, v]), 1, "var(--app-moss)");

  // Charts
  renderContractorChart();
  renderWorkTypeChart();
}

/* =============================================
   EVENT LISTENERS
   ============================================= */
function init() {
  window.addEventListener('app:navigate', (e) => {
    if (e.detail.page === 'dash') {
      render();
    }
  });

  window.addEventListener('dpr:changed', () => {
    if (State.currentPage === 'dash') {
      render();
    }
  });

  window.addEventListener('app:boot', () => {
    // Pre-render if dashboard is default
    if (State.currentPage === 'dash') {
      render();
    }
  });
}

init();

/* =============================================
   EXPORTS
   ============================================= */
export { render, calculateStats };
