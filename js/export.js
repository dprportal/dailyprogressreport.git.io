/* =============================================
   EXPORT MODULE
   CSV Export | Excel Export with SheetJS | Dynamic Columns
   ============================================= */

import { State } from './auth.js?v=15';
import { AppUtils } from './app.js?v=15';

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
   CSV FIELD ESCAPING
   ============================================= */
function csvField(v) {
  const s = String(v == null ? "" : v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/* =============================================
   GET DYNAMIC COLUMN DEFINITIONS
   ============================================= */
function getColumnDefinitions() {
  const moduleEl = document.getElementById('filt_module');
  const mod = moduleEl ? moduleEl.value : '';
  const allMods = !mod;

  const columns = [
    { key: 'sno', label: 'S.No', width: 8 },
    { key: 'date', label: 'Date', width: 12 },
    { key: 'month', label: 'Month', width: 15 }
  ];
  if (allMods) columns.push({ key: 'workType', label: 'Work Type', width: 15 });
  columns.push({ key: 'layingWork', label: 'Laying Work', width: 18 });

  // Add conditional columns based on field definitions
  const fieldDefs = State.fieldDefs || [];

  // Location fields
  const hasLocation = fieldDefs.find(f => f.fieldId === 'package');
  if (hasLocation && hasLocation.visible !== false) {
    columns.push({ key: 'packageNo', label: 'Package No.', width: 12 });
    columns.push({ key: 'zoneName', label: 'Zone', width: 20 });
    columns.push({ key: 'dma', label: 'DMA No.', width: 10 });
  }

  // Transmission stretch
  const hasStretch = fieldDefs.find(f => f.fieldId === 'stretch');
  if (hasStretch && hasStretch.visible !== false) {
    columns.push({ key: 'stretch', label: 'Transmission Stretch', width: 30 });
  }

  // Pipe fields (Pipe Laying / Hydro Test only)
  const hasPipe = fieldDefs.find(f => f.fieldId === 'pipeDia');
  if (hasPipe && hasPipe.visible !== false && (allMods || mod === 'Pipe Laying' || mod === 'Hydro Test')) {
    columns.push({ key: 'pipeDia', label: 'Pipe Dia (mm)', width: 14 });
    columns.push({ key: 'layingLength', label: 'Laying Length (m)', width: 16 });
  }

  // Road restoration fields (Road Restoration only)
  const hasRestoration = fieldDefs.find(f => f.fieldId === 'restoredLength');
  if (hasRestoration && hasRestoration.visible !== false && (allMods || mod === 'Road Restoration')) {
    columns.push({ key: 'restoredLength', label: 'Restored Length (m)', width: 16 });
    columns.push({ key: 'restoredWidth', label: 'Restored Width (m)', width: 16 });
    columns.push({ key: 'restoredArea', label: 'Restored Area (sqm)', width: 16 });
    columns.push({ key: 'surfaceType', label: 'Surface Type', width: 16 });
  }

  // Hydro test fields (Hydro Test only)
  if (allMods || mod === 'Hydro Test') {
    columns.push({ key: 'testedLength', label: 'Tested Length (m)', width: 16 });
    columns.push({ key: 'testPressure', label: 'Test Pressure (Bar)', width: 16 });
    columns.push({ key: 'startTime', label: 'Start Time', width: 12 });
    columns.push({ key: 'endTime', label: 'End Time', width: 12 });
    columns.push({ key: 'testResult', label: 'Test Result', width: 16 });
  }

  // Fittings fields (Pipe Laying only)
  const hasFittings = fieldDefs.find(f => f.fieldId === 'ferrule');
  if (hasFittings && hasFittings.visible !== false && (allMods || mod === 'Pipe Laying')) {
    columns.push({ key: 'ferrule', label: 'Ferrule', width: 10 });
    columns.push({ key: 'ballValve', label: 'Ball Valve', width: 11 });
    columns.push({ key: 'meterBox', label: 'Meter Box', width: 11 });
    columns.push({ key: 'waterMeter', label: 'Water Meter', width: 12 });
  }

  // Manpower
  const hasManpower = fieldDefs.find(f => f.fieldId === 'noOfTeam');
  if (hasManpower && hasManpower.visible !== false) {
    columns.push({ key: 'noOfTeam', label: 'No of Team', width: 11 });
    columns.push({ key: 'manpower', label: 'Manpower', width: 11 });
    columns.push({ key: 'workTime', label: 'Work Time (hrs)', width: 14 });
  }

  // Contractor
  const hasContractor = fieldDefs.find(f => f.fieldId === 'contractor');
  if (hasContractor && hasContractor.visible !== false) {
    columns.push({ key: 'contractor', label: 'Contractor', width: 18 });
  }

  // Remarks
  const hasRemark = fieldDefs.find(f => f.fieldId === 'remark');
  if (hasRemark && hasRemark.visible !== false) {
    columns.push({ key: 'remark', label: 'Remark', width: 30 });
  }

  // Custom admin fields
  const customFields = fieldDefs.filter(f => !f.system && f.visible !== false);
  customFields.forEach(f => {
    columns.push({
      key: f.fieldId,
      label: f.label,
      width: 18,
      custom: true
    });
  });

  // Metadata columns
  columns.push({ key: 'engineerName', label: 'Submitted By', width: 18 });
  columns.push({ key: 'createdAt', label: 'Submitted At', width: 18 });

  // Honour admin-renamed labels for built-in columns
  const FIELDID_BY_COLKEY = {
    sno: 'sno', date: 'date', month: 'month', workType: 'worktype', layingWork: 'layingWork',
    packageNo: 'package', zoneName: 'zone', dma: 'dma', stretch: 'stretch',
    pipeDia: 'pipeDia', layingLength: 'layingLength',
    restoredLength: 'restoredLength', restoredWidth: 'restoredWidth',
    ferrule: 'ferrule', ballValve: 'ballValve', meterBox: 'meterBox', waterMeter: 'waterMeter',
    noOfTeam: 'noOfTeam', manpower: 'manpower', workTime: 'workTime',
    contractor: 'contractor', remark: 'remark'
  };
  columns.forEach(c => {
    if (c.custom) return;
    const fid = FIELDID_BY_COLKEY[c.key];
    if (!fid) return;
    const def = fieldDefs.find(f => f.fieldId === fid);
    if (def && def.label) c.label = def.label;
  });

  return columns;
}

/* =============================================
   VALUE EXTRACTION
   ============================================= */
function fmtTimestamp(ts) {
  if (!ts) return '';
  try {
    if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
    if (ts.seconds != null) return new Date(ts.seconds * 1000).toLocaleString();
  } catch (_) {}
  return typeof ts === 'string' ? ts : '';
}

function cellValue(col, r) {
  let val;
  if (col.custom) {
    val = (r.customFields && r.customFields[col.key] != null)
      ? r.customFields[col.key]
      : (r[col.key] != null ? r[col.key] : '');
  } else if (col.key === 'engineerName') {
    val = r.engineerName || r.createdByName || '';
  } else if (col.key === 'createdAt') {
    val = fmtTimestamp(r.createdAt);
  } else {
    val = r[col.key];
    if (val === undefined || val === null) val = '';
  }
  return val;
}

/* =============================================
   EXPORT CSV
   ============================================= */
function exportCSV() {
  const rows = getFilteredData();
  if (rows.length === 0) {
    AppUtils.toast('Nothing to export with current filters.', true);
    return;
  }

  const columns = getColumnDefinitions();

  // Header
  const header = columns.map(c => csvField(c.label));
  const lines = [header.join(",")];

  // Data
  for (const r of rows) {
    const line = columns.map(col => csvField(cellValue(col, r)));
    lines.push(line.join(','));
  }

  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "DPR_export_" + AppUtils.todayISO() + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  AppUtils.toast(`Exported ${rows.length} rows to CSV.`);
}

/* =============================================
   EXPORT EXCEL
   ============================================= */
function exportExcel() {
  const rows = getFilteredData();
  if (rows.length === 0) {
    AppUtils.toast('Nothing to export with current filters.', true);
    return;
  }

  // Check if XLSX is available
  if (typeof XLSX === 'undefined') {
    AppUtils.toast('Excel library not loaded. Try CSV export.', true);
    return;
  }

  const columns = getColumnDefinitions();

  // Build data array
  const data = [];

  // Header row
  const header = columns.map(c => c.label);
  data.push(header);

  // Data rows
  for (const r of rows) {
    const row = columns.map(col => cellValue(col, r));
    data.push(row);
  }

  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  const wscols = columns.map(c => ({ wch: c.width || 15 }));
  ws['!cols'] = wscols;

  // Style header (first row)
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
    if (ws[cellRef]) {
      ws[cellRef].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "0E6B66" } },
        alignment: { horizontal: "center" }
      };
    }
  }

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };

  XLSX.utils.book_append_sheet(wb, ws, "DPR Entries");

  // Generate file
  const fileName = "DPR_export_" + AppUtils.todayISO() + ".xlsx";
  XLSX.writeFile(wb, fileName);

  AppUtils.toast(`Exported ${rows.length} rows to Excel.`);
}

/* =============================================
   CLEAR FILTERS
   ============================================= */
function clearFilters() {
  document.getElementById('filt_from').value = '';
  document.getElementById('filt_to').value = '';
  document.getElementById('filt_package').value = '';
  document.getElementById('filt_zone').value = '';
  document.getElementById('filt_dma').value = '';
  document.getElementById('filt_contractor').value = '';
  document.getElementById('filt_engineer').value = '';
  document.getElementById('filt_worktype').value = '';
  document.getElementById('filt_search').value = '';
  window.dispatchEvent(new CustomEvent('log:render'));
}

/* =============================================
   POPULATE ENGINEER FILTER
   ============================================= */
function populateEngineerFilter() {
  const sel = document.getElementById('filt_engineer');
  if (!sel) return;

  // Keep first option
  const firstOption = sel.options[0];
  sel.innerHTML = '';
  sel.appendChild(firstOption);

  const engineers = [...(State.engineers || [])].sort((a, b) => a.name.localeCompare(b.name));
  engineers.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id;
    opt.textContent = `${e.name} (${e.empId})`;
    sel.appendChild(opt);
  });
}

/* =============================================
   INITIALIZATION
   ============================================= */
function init() {
  // CSV export
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', exportCSV);
  }

  // Excel export
  const exportExcelBtn = document.getElementById('exportExcelBtn');
  if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', exportExcel);
  }

  // Clear filters
  const clearFiltersBtn = document.getElementById('clearFiltersBtn');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', clearFilters);
  }

  // Print / Save as PDF (uses the browser print dialog)
  const printBtn = document.getElementById('printReportBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      const prevTitle = document.title;
      document.title = 'DPR Report ' + new Date().toISOString().slice(0, 10);
      window.print();
      setTimeout(() => { document.title = prevTitle; }, 500);
    });
  }

  // Populate engineer filter on boot
  window.addEventListener('app:boot', () => {
    populateEngineerFilter();
  });
}

init();

/* =============================================
   EXPORTS
   ============================================= */
export { exportCSV, exportExcel, getFilteredData, getColumnDefinitions, clearFilters };
