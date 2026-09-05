/* =============================================
   WHATSAPP SHARE
   Builds the DPR text report from an admin-editable
   template (Settings -> WhatsApp Template). Ships with a
   default template that reproduces the original format,
   so nothing changes until an admin customises it.
   ============================================= */

import { DataService, COLLECTIONS } from './firebase.js?v=22';
import { State } from './auth.js?v=22';
import { AppUtils } from './app.js?v=22';

const TEMPLATE_DOC_ID = 'whatsappTemplate';

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

/* =============================================
   TOKEN DEFINITIONS
   Every {{token}} the admin can use in the template,
   and how to pull + format its value from a DPR record.
   ============================================= */
const TOKENS = {
  date:            { label: 'Date',            get: r => fmtDateDMY(r.date) },
  sno:             { label: 'S.No',             get: r => r.sno },
  engineer:        { label: 'Engineer',         get: r => r.engineerName || r.createdByName || '' },
  workType:        { label: 'Work Type',        get: r => r.workType },
  layingWork:      { label: 'Activity',         get: r => r.layingWork },
  package:         { label: 'Package',          get: r => r.packageNo },
  zone:            { label: 'Zone',             get: r => r.zoneName ? `${r.zoneNo ? r.zoneNo + ' - ' : ''}${r.zoneName}` : r.zoneNo },
  dma:             { label: 'DMA',               get: r => r.dma },
  stretch:         { label: 'Stretch',          get: r => r.stretch },
  pipeDia:         { label: 'Pipe Dia',         get: r => r.pipeDia, unit: r => isNumericLike(r.pipeDia) ? 'mm' : '' },
  layingLength:    { label: 'Laying Length',    get: r => r.layingLength, unit: () => 'm' },
  pipeMaterial:    { label: 'Pipe Material',    get: r => r.pipeMaterial },
  joints:          { label: 'Joints',           get: r => r.joints },
  jointType:       { label: 'Joint Type',       get: r => r.jointType },
  bendQty:         { label: 'Bend',             get: r => r.bendQty },
  teeQty:          { label: 'Tee',              get: r => r.teeQty },
  uclampQty:       { label: 'U-Clamp Fixing',   get: r => r.uclampQty },
  dptJoints:       { label: 'DPT Joints',       get: r => r.dptJoints },
  utJoints:        { label: 'UT Joints',        get: r => r.utJoints },
  fittingsInstalled: { label: 'Fittings Installed', get: r => r.fittingsInstalled },
  restoredLength:  { label: 'Restored Length',  get: r => r.restoredLength, unit: () => 'm' },
  restoredWidth:   { label: 'Restored Width',   get: r => r.restoredWidth, unit: () => 'm' },
  restoredArea:    { label: 'Restored Area',    get: r => r.restoredArea, unit: () => 'sqm' },
  surfaceType:     { label: 'Surface Type',     get: r => r.surfaceType },
  testedLength:    { label: 'Tested Length',    get: r => r.testedLength, unit: () => 'm' },
  testPressure:    { label: 'Test Pressure',    get: r => r.testPressure, unit: () => 'Bar' },
  startTime:       { label: 'Start Time',       get: r => r.startTime },
  endTime:         { label: 'End Time',         get: r => r.endTime },
  testResult:      { label: 'Test Result',      get: r => r.testResult },
  ferrule:         { label: 'Ferrule',          get: r => r.ferrule },
  ballValve:       { label: 'Ball Valve',       get: r => r.ballValve },
  meterBox:        { label: 'Meter Box',        get: r => r.meterBox },
  waterMeter:      { label: 'Water Meter',      get: r => r.waterMeter },
  excavLength:     { label: 'Excavation Length', get: r => r.excavLength, unit: () => 'm' },
  excavWidth:      { label: 'Excavation Width',  get: r => r.excavWidth, unit: () => 'm' },
  excavDepth:      { label: 'Excavation Depth',  get: r => r.excavDepth, unit: () => 'm' },
  excavVolume:     { label: 'Excavation Volume', get: r => r.excavVolume, unit: () => 'm³' },
  noOfTeam:        { label: 'Teams',            get: r => r.noOfTeam },
  welder:          { label: 'Welder',           get: r => r.welder },
  fitter:          { label: 'Fitter',           get: r => r.fitter },
  unskilledLabour: { label: 'Unskilled Labour', get: r => r.unskilledLabour },
  manpower:        { label: 'Manpower',         get: r => r.manpower },
  workTime:        { label: 'Work Time',        get: r => r.workTime, unit: () => 'hrs' },
  contractor:      { label: 'Contractor',       get: r => r.contractor },
  remark:          { label: 'Remarks',          get: r => r.remark }
};

// {{customFields}} is a block token -- resolved separately before line processing
function customFieldsBlock(r) {
  if (!r.customFields || typeof r.customFields !== 'object') return '';
  return Object.keys(r.customFields)
    .map(k => {
      const v = r.customFields[k];
      if (v === undefined || v === null || String(v).trim() === '') return '';
      return `${k}: ${String(v).trim()}`;
    })
    .filter(Boolean)
    .join('\n');
}

/* =============================================
   DEFAULT TEMPLATE
   Reproduces the original built-in report format.
   Any line containing only empty tokens is dropped
   automatically -- no need for manual conditionals.
   ============================================= */
const DEFAULT_TEMPLATE = `*DAILY PROGRESS REPORT*
Shimla 24x7 Water Supply Project

Date: {{date}}
S.No: {{sno}}
Engineer: {{engineer}}

Work Type: {{workType}}
Activity: {{layingWork}}

Package: {{package}}
Zone: {{zone}}
DMA: {{dma}}
Stretch: {{stretch}}

Pipe Dia: {{pipeDia}}
Laying Length: {{layingLength}}
Pipe Material: {{pipeMaterial}}
Joints: {{joints}}
Joint Type: {{jointType}}
Bend: {{bendQty}}
Tee: {{teeQty}}
U-Clamp Fixing: {{uclampQty}}
DPT Joints: {{dptJoints}}
UT Joints: {{utJoints}}
Fittings Installed: {{fittingsInstalled}}
Restored Length: {{restoredLength}}
Restored Width: {{restoredWidth}}
Restored Area: {{restoredArea}}
Surface Type: {{surfaceType}}
Tested Length: {{testedLength}}
Test Pressure: {{testPressure}}
Start Time: {{startTime}}
End Time: {{endTime}}
Test Result: {{testResult}}
Ferrule: {{ferrule}}
Ball Valve: {{ballValve}}
Meter Box: {{meterBox}}
Water Meter: {{waterMeter}}

Excavation Length: {{excavLength}}
Excavation Width: {{excavWidth}}
Excavation Depth: {{excavDepth}}
Excavation Volume: {{excavVolume}}

Teams: {{noOfTeam}}
Welder: {{welder}}
Fitter: {{fitter}}
Unskilled Labour: {{unskilledLabour}}
Manpower: {{manpower}}
Work Time: {{workTime}}

{{customFields}}

Contractor: {{contractor}}
Remarks: {{remark}}`;

/* =============================================
   TEMPLATE ENGINE
   - {{token}} is substituted with its formatted value.
   - A line containing only token(s) + static label text is
     dropped entirely if every token on that line is empty.
   - {{customFields}} expands to 0+ lines before that pass.
   ============================================= */
function resolveToken(id, r) {
  const t = TOKENS[id];
  if (!t) return null; // unknown token -> leave untouched
  let v = t.get(r);
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') {
    if (!v) return '';
    return `${v}${t.unit ? ' ' + t.unit(r) : ''}`;
  }
  const s = String(v).trim();
  if (!s) return '';
  return `${s}${t.unit ? ' ' + t.unit(r) : ''}`;
}

export function renderTemplate(template, r) {
  // 1) Expand block tokens first (can be multi-line or empty)
  let text = String(template || '').replace(/\{\{\s*customFields\s*\}\}/g, () => customFieldsBlock(r));

  // 2) Line-by-line token substitution with auto-drop for empty lines
  const lines = text.split('\n');
  const kept = [];
  const tokenRe = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

  for (const line of lines) {
    const tokensInLine = [...line.matchAll(tokenRe)].map(m => m[1]);
    if (tokensInLine.length === 0) {
      kept.push(line); // static text / blank line spacer -- always keep
      continue;
    }
    let allEmpty = true;
    const substituted = line.replace(tokenRe, (_, id) => {
      const val = resolveToken(id, r);
      if (val === null) return `{{${id}}}`; // unknown token, leave as-is
      if (val !== '') allEmpty = false;
      return val;
    });
    if (allEmpty) continue; // every token on this line was empty -> drop the line
    kept.push(substituted);
  }

  // 3) Collapse 3+ blank lines down to a single blank line, trim ends
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Build the formatted DPR message for sharing, using the
 * admin's saved template (or the built-in default).
 * @param {object} r - a DPR record
 * @returns {string}
 */
export function buildDprMessage(r) {
  const template = (State.whatsappTemplate && String(State.whatsappTemplate).trim())
    ? State.whatsappTemplate
    : DEFAULT_TEMPLATE;
  return renderTemplate(template, r);
}

/* =============================================
   ADMIN TEMPLATE PERSISTENCE
   ============================================= */
export async function loadWhatsappTemplate() {
  try {
    const doc = await DataService.getById(COLLECTIONS.SETTINGS, TEMPLATE_DOC_ID);
    State.whatsappTemplate = (doc && typeof doc.template === 'string') ? doc.template : '';
  } catch (e) {
    console.error('loadWhatsappTemplate failed', e);
    State.whatsappTemplate = State.whatsappTemplate || '';
  }
  return State.whatsappTemplate;
}

export async function saveWhatsappTemplate(text) {
  const prev = State.whatsappTemplate;
  State.whatsappTemplate = text;
  try {
    await DataService.set(COLLECTIONS.SETTINGS, TEMPLATE_DOC_ID, { template: text });
    return true;
  } catch (e) {
    console.error('saveWhatsappTemplate failed', e);
    State.whatsappTemplate = prev;
    if (AppUtils && AppUtils.toast) AppUtils.toast('Could not save template. Check your connection.', true);
    return false;
  }
}

export function getDefaultTemplate() { return DEFAULT_TEMPLATE; }
export function getAvailableTokens() { return Object.entries(TOKENS).map(([id, t]) => ({ id, label: t.label })); }

function init() {
  window.addEventListener('app:boot', () => { loadWhatsappTemplate(); });
}
init();

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
