/* =============================================
   DASHBOARD MODULE
   Statistics | Chart.js Charts | Progress Bars
   ============================================= */

import { State } from './auth.js?v=22';
import { AppUtils } from './app.js?v=22';
import { getScope } from './scope.js?v=22';

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
   PIPE LAYING SUMMARY CARDS
   (Distribution / Transmission / HSC progress, excavation,
   joints, HSC materials, and manpower resources)
   ============================================= */
function renderPipeLayingSummary() {
  const recs = (State.dprs || []).filter(r => r.workType === 'Pipe Laying');
  const fmt = v => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const sumBy = (pred, key) => recs.filter(pred).reduce((s, r) => s + (parseFloat(r[key]) || 0), 0);

  const distM = sumBy(r => r.layingWork === 'Distribution Main', 'layingLength');
  const transM = sumBy(r => r.layingWork === 'Transmission Main', 'layingLength');
  const hscM = sumBy(r => r.layingWork === 'House Service Connection', 'layingLength');
  const totalM = recs.reduce((s, r) => s + (parseFloat(r.layingLength) || 0), 0);

  const cards = (containerId, items) => {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = items.map(([l, v]) => `
      <div class="dstat">
        <div class="v">${AppUtils.esc(v)}</div>
        <div class="l">${AppUtils.esc(l)}</div>
      </div>
    `).join('');
  };

  cards('dashPipeLaying', [
    ['Distribution Main (m)', fmt(distM)],
    ['Transmission Main (m)', fmt(transM)],
    ['HSC (m)', fmt(hscM)],
    ['Total Pipe Laying (m)', fmt(totalM)]
  ]);

  const totalJoints = recs.reduce((s, r) => s + (parseInt(r.joints) || 0), 0);
  const totalExcav = recs.reduce((s, r) => s + (parseFloat(r.excavVolume) || 0), 0);
  cards('dashWorkQty', [
    ['Total Joints', totalJoints.toLocaleString()],
    ['Total Excavation (m³)', fmt(totalExcav)]
  ]);

  const hscRecs = recs.filter(r => r.layingWork === 'House Service Connection');
  const sumField = (list, key) => list.reduce((s, r) => s + (parseFloat(r[key]) || 0), 0);
  cards('dashHscMaterials', [
    ['Total Ferrules', sumField(hscRecs, 'ferrule').toLocaleString()],
    ['Total Ball Valves', sumField(hscRecs, 'ballValve').toLocaleString()],
    ['Total Meter Boxes', sumField(hscRecs, 'meterBox').toLocaleString()],
    ['Total Water Meters', sumField(hscRecs, 'waterMeter').toLocaleString()]
  ]);

  cards('dashResources', [
    ['Total Teams', sumField(recs, 'noOfTeam').toLocaleString()],
    ['Total Welders', sumField(recs, 'welder').toLocaleString()],
    ['Total Fitters', sumField(recs, 'fitter').toLocaleString()],
    ['Total Unskilled Labour', sumField(recs, 'unskilledLabour').toLocaleString()],
    ['Total Working Manpower', sumField(recs, 'manpower').toLocaleString()]
  ]);
}

/* =============================================
   PACKAGE & ZONE PROGRESS (Distribution / Transmission / HSC
   done vs the scope set in Admin -> Settings -> Package & Zone Scope)
   ============================================= */
function renderPackageZoneProgress() {
  const container = document.getElementById('dashPackageZoneProgress');
  if (!container) return;

  const recs = (State.dprs || []).filter(r => r.workType === 'Pipe Laying' && r.packageNo && r.zoneNo);

  // Group by package -> zone
  const groups = {}; // packageNo -> { zoneNo -> { zoneName, dist, trans, hsc } }
  recs.forEach(r => {
    const p = r.packageNo, z = r.zoneNo;
    groups[p] = groups[p] || {};
    const g = (groups[p][z] = groups[p][z] || { zoneName: r.zoneName || `Zone ${z}`, dist: 0, trans: 0, hsc: 0 });
    if (r.layingWork === 'Distribution Main') g.dist += parseFloat(r.layingLength) || 0;
    else if (r.layingWork === 'Transmission Main') g.trans += parseFloat(r.layingLength) || 0;
    else if (r.layingWork === 'House Service Connection') g.hsc += parseFloat(r.waterMeter) || 0;
  });

  const packages = Object.keys(groups).sort((a, b) => a - b);
  if (packages.length === 0) {
    container.innerHTML = '<p class="hint">No Pipe Laying entries with Package/Zone yet.</p>';
    return;
  }

  const bar = (label, done, scope, unit) => {
    const hasScope = scope > 0;
    const pct = hasScope ? Math.min(100, Math.round((done / scope) * 100)) : 0;
    const pending = hasScope ? Math.max(0, scope - done) : 0;
    const fmt = v => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
    return `
      <div class="pz-metric">
        <div class="pz-metric-head">
          <span class="pz-metric-label">${AppUtils.esc(label)}</span>
          <span class="pz-metric-value">${fmt(done)}${hasScope ? ' / ' + fmt(scope) : ''} ${AppUtils.esc(unit)}</span>
        </div>
        <div class="pz-bar"><div class="pz-bar-fill" style="width:${hasScope ? pct : (done > 0 ? 100 : 0)}%"></div></div>
        <div class="pz-metric-foot">${hasScope ? `${pct}% done &middot; ${fmt(pending)} ${AppUtils.esc(unit)} pending` : 'No scope set'}</div>
      </div>`;
  };

  container.innerHTML = packages.map(p => {
    const zones = groups[p];
    const zoneKeys = Object.keys(zones).sort((a, b) => zones[a].zoneName.localeCompare(zones[b].zoneName));
    const zoneCards = zoneKeys.map(z => {
      const g = zones[z];
      const scope = getScope(p, z);
      return `
        <div class="pz-zone-card">
          <div class="pz-zone-title">${AppUtils.esc(g.zoneName)}</div>
          ${bar('Distribution Main', g.dist, scope.distributionScope, 'm')}
          ${bar('Transmission Main', g.trans, scope.transmissionScope, 'm')}
          ${bar('House Service Connection', g.hsc, scope.hscScope, 'conn.')}
        </div>`;
    }).join('');

    return `
      <div class="pz-package-block">
        <div class="pz-package-title">Package ${AppUtils.esc(p)}</div>
        <div class="pz-zone-grid">${zoneCards}</div>
      </div>`;
  }).join('');
}

/* =============================================
   RENDER ALL DASHBOARD
   ============================================= */
function render() {
  const recs = State.dprs || [];

  // Stats cards (metres)
  renderStats();

  // Pipe laying progress cards (Distribution / Transmission / HSC, excavation, resources)
  renderPipeLayingSummary();

  // Package + Zone progress, broken out by Distribution / Transmission / HSC vs scope
  renderPackageZoneProgress();

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

  // Re-render so Chart.js text/grid colors pick up the new theme
  // (theme.js updates Chart.defaults.color/borderColor right before this fires).
  window.addEventListener('theme:changed', () => {
    if (State.currentPage === 'dash') {
      render();
    }
  });

  // Scope targets loaded (async, after app:boot) or edited in Settings —
  // refresh the Package & Zone Progress bars so they reflect Done vs Pending.
  window.addEventListener('scope:changed', () => {
    if (State.currentPage === 'dash') {
      renderPackageZoneProgress();
    }
  });
}

init();

/* =============================================
   EXPORTS
   ============================================= */
export { render, calculateStats };
