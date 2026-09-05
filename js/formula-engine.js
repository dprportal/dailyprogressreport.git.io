/* =============================================
   FORMULA ENGINE
   A tiny, safe (no eval / no Function()) parser + evaluator
   for admin-defined calculated field formulas.
   Supports: + - * / ( ) with standard precedence, numeric
   literals, and field references (bare identifiers that map
   to another field's fieldId, e.g. "ballValve + meterBox").
   ============================================= */

// --- Tokenizer ---------------------------------------------------------
const TOKEN_RE = /\s*(?:([0-9]+(?:\.[0-9]+)?)|([A-Za-z_][A-Za-z0-9_]*)|([+\-*/()]))\s*/g;

export function tokenizeFormula(str) {
  const src = String(str || '');
  const tokens = [];
  let idx = 0;
  TOKEN_RE.lastIndex = 0;
  let m;
  while (idx < src.length) {
    TOKEN_RE.lastIndex = idx;
    m = TOKEN_RE.exec(src);
    if (!m || m.index !== idx) {
      throw new Error(`Unexpected character at position ${idx}: "${src.slice(idx, idx + 1)}"`);
    }
    if (m[1] !== undefined) tokens.push({ type: 'num', value: parseFloat(m[1]) });
    else if (m[2] !== undefined) tokens.push({ type: 'ref', id: m[2] });
    else if (m[3] !== undefined) tokens.push({ type: 'op', value: m[3] });
    idx = TOKEN_RE.lastIndex;
  }
  return tokens;
}

// --- Recursive-descent parser -> AST ------------------------------------
// expr    := term (('+' | '-') term)*
// term    := factor (('*' | '/') factor)*
// factor  := number | ref | '(' expr ')' | '-' factor
export function parseFormula(str) {
  const tokens = tokenizeFormula(str);
  if (tokens.length === 0) throw new Error('Formula is empty.');
  let pos = 0;

  function peek() { return tokens[pos]; }
  function next() { return tokens[pos++]; }

  function parseExpr() {
    let node = parseTerm();
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value;
      const right = parseTerm();
      node = { type: 'bin', op, left: node, right };
    }
    return node;
  }

  function parseTerm() {
    let node = parseFactor();
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/')) {
      const op = next().value;
      const right = parseFactor();
      node = { type: 'bin', op, left: node, right };
    }
    return node;
  }

  function parseFactor() {
    const t = peek();
    if (!t) throw new Error('Unexpected end of formula.');
    if (t.type === 'op' && t.value === '-') { next(); return { type: 'neg', expr: parseFactor() }; }
    if (t.type === 'op' && t.value === '(') {
      next();
      const node = parseExpr();
      const close = next();
      if (!close || close.type !== 'op' || close.value !== ')') throw new Error('Missing closing parenthesis.');
      return node;
    }
    if (t.type === 'num') { next(); return { type: 'num', value: t.value }; }
    if (t.type === 'ref') { next(); return { type: 'ref', id: t.id }; }
    throw new Error(`Unexpected token "${t.value !== undefined ? t.value : t.id}".`);
  }

  const ast = parseExpr();
  if (pos !== tokens.length) throw new Error(`Unexpected token near "${tokens[pos].value !== undefined ? tokens[pos].value : tokens[pos].id}".`);
  return ast;
}

// --- Evaluator -----------------------------------------------------------
// values: fieldId -> number (already cleaned). Missing/blank source fields
// are treated as 0, matching the existing built-in auto-calc fields
// (Restored Area, Excavation Volume, Total Manpower). Division by zero
// yields null (rendered as a blank result, never NaN/Infinity).
export function evaluateAst(ast, values) {
  switch (ast.type) {
    case 'num': return ast.value;
    case 'ref': {
      // Plain property read (not a hasOwnProperty gate) so a Proxy-backed
      // `values` object — used by the live DPR form to pull field values
      // on demand — works the same as a plain lookup object.
      const v = values ? values[ast.id] : undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    }
    case 'neg': {
      const v = evaluateAst(ast.expr, values);
      return v === null ? null : -v;
    }
    case 'bin': {
      const l = evaluateAst(ast.left, values);
      const r = evaluateAst(ast.right, values);
      if (l === null || r === null) return null;
      switch (ast.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return r === 0 ? null : l / r;
        default: return null;
      }
    }
    default: return null;
  }
}

export function evaluateFormula(formula, values) {
  try {
    const ast = parseFormula(formula);
    return evaluateAst(ast, values);
  } catch (e) {
    return null;
  }
}

// --- Inline arithmetic (typed directly into a number field) --------------
// Lets a user type e.g. "1.2*0.6*0.9" straight into any number field (to
// work out an m3 / area figure on the spot) instead of only via an admin
// "calculated field" formula. Deliberately rejects any field-reference
// token (bare word) — a raw entry field must be pure arithmetic, never a
// formula referencing other fields — so something like "abc" or a stray
// field id typed by mistake safely returns null instead of silently
// evaluating to 0.
export function evaluateArithmetic(str) {
  const s = String(str == null ? '' : str).trim();
  if (!s) return null;
  try {
    const tokens = tokenizeFormula(s);
    if (!tokens.length || tokens.some(t => t.type === 'ref')) return null;
    const ast = parseFormula(s);
    const result = evaluateAst(ast, {});
    return (result === null || !Number.isFinite(result)) ? null : result;
  } catch (e) {
    return null;
  }
}

// Collects every field id referenced by a formula (for validation,
// circular-dependency checks, and formula-builder round-tripping).
export function extractRefs(ast, out) {
  out = out || new Set();
  if (!ast) return out;
  if (ast.type === 'ref') out.add(ast.id);
  else if (ast.type === 'neg') extractRefs(ast.expr, out);
  else if (ast.type === 'bin') { extractRefs(ast.left, out); extractRefs(ast.right, out); }
  return out;
}

// Validates a formula string: must parse, and every referenced id must be
// in `allowedIds` (the set of eligible number/calculated fieldIds).
export function validateFormula(formula, allowedIds) {
  let ast;
  try {
    ast = parseFormula(formula);
  } catch (e) {
    return { valid: false, error: e.message || 'Invalid formula.' };
  }
  const refs = Array.from(extractRefs(ast));
  if (refs.length === 0) {
    return { valid: false, error: 'Formula must reference at least one field.' };
  }
  const unknown = refs.filter(id => !allowedIds || !allowedIds.has(id));
  if (unknown.length) {
    return { valid: false, error: `Unknown or ineligible field reference: ${unknown.join(', ')}` };
  }
  return { valid: true, ast, refs };
}

// Detects whether assigning `formula` to `fieldId` would create a circular
// dependency, given all other calculated fields' formulas (a map of
// fieldId -> formula string). Uses DFS over the reference graph.
export function wouldCreateCircularDependency(fieldId, formula, formulaById) {
  let refs;
  try {
    refs = Array.from(extractRefs(parseFormula(formula)));
  } catch (e) {
    return false; // invalid formula is caught separately by validateFormula
  }

  const visited = new Set();
  function dfs(id) {
    if (id === fieldId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    const f = formulaById[id];
    if (!f) return false;
    let subRefs;
    try { subRefs = Array.from(extractRefs(parseFormula(f))); } catch (e) { return false; }
    return subRefs.some(dfs);
  }

  return refs.some(dfs);
}
