/* =============================================
   WHATSAPP SHARE
   Builds a clean, professional DPR text report and
   provides WhatsApp share + clipboard copy helpers.
   The message adapts to whichever fields are present,
   so Pipe Laying / Road Restoration / Hydro Test all
   format correctly without merging fields.
   ============================================= */

function fmtDateDMY(iso) {
  if (!iso) return '';
  const d = new Date(String(iso) + 'T00:00:00');
  if (isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function isNumericLike(v) {
  return /^\d+(\.\d+)?$/.test(String(v).trim());
}

/**
 * Build the formatted DPR message for sharing.
 * @param {object} r - a DPR record
 * @returns {string}
 */
export function buildDprMessage(r) {
  const eng = r.engineerName || r.createdByName || '';
  const segments = [];

  // value -> "Label: value unit" (skips empty strings and zero numbers)
  const val = (label, v, unit) => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') {
      if (!v) return '';
      return `${label}: ${v}${unit ? ' ' + unit : ''}`;
    }
    const s = String(v).trim();
    if (!s) return '';
    return `${label}: ${s}${unit ? ' ' + unit : ''}`;
  };

  // push a section (array of lines) only if it has content
  const section = (arr) => {
    const filled = arr.filter(Boolean);
    if (filled.length) segments.push(filled.join('\n'));
  };

  // Header
  segments.push('*DAILY PROGRESS REPORT*\nShimla 24x7 Water Supply Project');

  // Meta
  section([
    val('Date', fmtDateDMY(r.date)),
    val('S.No', r.sno),
    val('Engineer', eng),
  ]);

  // Work classification
  section([
    val('Work Type', r.workType),
    val('Activity', r.layingWork),
  ]);

  // Location
  const zone = r.zoneName ? `${r.zoneNo ? r.zoneNo + ' - ' : ''}${r.zoneName}` : r.zoneNo;
  section([
    val('Package', r.packageNo),
    val('Zone', zone),
    val('DMA', r.dma),
    val('Stretch', r.stretch),
  ]);

  // Work-specific (pipe laying / restoration / hydro / fittings)
  section([
    val('Pipe Dia', r.pipeDia, isNumericLike(r.pipeDia) ? 'mm' : ''),
    val('Laying Length', r.layingLength, 'm'),
    val('Restored Length', r.restoredLength, 'm'),
    val('Restored Width', r.restoredWidth, 'm'),
    val('Restored Area', r.restoredArea, 'sqm'),
    val('Surface Type', r.surfaceType),
    val('Tested Length', r.testedLength, 'm'),
    val('Test Pressure', r.testPressure, 'Bar'),
    val('Start Time', r.startTime),
    val('End Time', r.endTime),
    val('Test Result', r.testResult),
    val('Ferrule', r.ferrule),
    val('Ball Valve', r.ballValve),
    val('Meter Box', r.meterBox),
    val('Water Meter', r.waterMeter),
  ]);

  // Manpower & time
  section([
    val('Teams', r.noOfTeam),
    val('Manpower', r.manpower),
    val('Work Time', r.workTime, 'hrs'),
  ]);

  // Any custom admin fields
  if (r.customFields && typeof r.customFields === 'object') {
    const custom = Object.keys(r.customFields)
      .map(k => val(k, r.customFields[k]))
      .filter(Boolean);
    section(custom);
  }

  // Contractor + remarks
  section([
    val('Contractor', r.contractor),
    val('Remarks', r.remark),
  ]);

  return segments.join('\n\n');
}

/**
 * WhatsApp share URL (works on mobile app and WhatsApp Web).
 */
export function whatsappShareUrl(text) {
  return 'https://wa.me/?text=' + encodeURIComponent(text);
}

/**
 * Copy text to clipboard with a legacy fallback. Returns true on success.
 */
export async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through to legacy path */ }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}
