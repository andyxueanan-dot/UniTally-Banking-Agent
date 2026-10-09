// 沙箱条款："生成的代码在受限、可监控的逻辑隔离环境中运行".
// The model may write a small arithmetic program (integers in 分, + - * / % and parentheses) for things
// like AA splits or budget shares. We never eval it: it is parsed by a strict grammar, compiled to a
// WebAssembly module with no imports, and executed in the existing Wasmtime worker (fuel, memory,
// time and process limits). The result is advice shown to the user and is never written to the ledger.
const { createHash } = require('node:crypto');
const { runWasmCalculation } = require('./code-sandbox');

const MAX_CHARS = 200; const MAX_TOKENS = 80; const MAX_DEPTH = 16; const MAX_LITERAL = 10n ** 12n;
const OPS = { '+': 'i64.add', '-': 'i64.sub', '*': 'i64.mul', '/': 'i64.div_s', '%': 'i64.rem_s' };
class CodeError extends Error { constructor(message) { super(message); this.code = 'GENERATED_CODE_REJECTED'; } }

function tokenize(src) {
  if (typeof src !== 'string' || !src.trim() || src.length > MAX_CHARS) throw new CodeError(`计算式必须是 1～${MAX_CHARS} 个字符。`);
  const tokens = []; const re = /\s*(?:(\d+)|([-+*/%()]))/y; let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i += 1; continue; }
    re.lastIndex = i; const m = re.exec(src);
    if (!m) throw new CodeError(`计算式第 ${i + 1} 个字符"${src[i]}"不被允许；只能使用整数、+ - * / % 和括号。`);
    tokens.push(m[1] !== undefined ? { kind: 'num', value: BigInt(m[1]) } : { kind: 'op', value: m[2] });
    i = re.lastIndex;
  }
  if (tokens.length > MAX_TOKENS) throw new CodeError('计算式过长。');
  return tokens;
}
function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos]; const take = () => tokens[pos++];
  const expr = depth => {
    if (depth > MAX_DEPTH) throw new CodeError('括号嵌套过深。');
    let node = term(depth);
    while (peek() && (peek().value === '+' || peek().value === '-')) node = { op: take().value, left: node, right: term(depth) };
    return node;
  };
  const term = depth => {
    let node = factor(depth);
    while (peek() && ['*', '/', '%'].includes(peek().value)) node = { op: take().value, left: node, right: factor(depth) };
    return node;
  };
  const factor = depth => {
    const t = take();
    if (!t) throw new CodeError('计算式不完整。');
    if (t.kind === 'num') { if (t.value > MAX_LITERAL) throw new CodeError('数值过大。'); return { num: t.value }; }
    if (t.value === '-') return { op: '-', left: { num: 0n }, right: factor(depth) };
    if (t.value === '(') { const inner = expr(depth + 1); if (take()?.value !== ')') throw new CodeError('括号不匹配。'); return inner; }
    throw new CodeError(`这里不应出现"${t.value}"。`);
  };
  const tree = expr(0);
  if (pos !== tokens.length) throw new CodeError('计算式末尾有多余内容。');
  return tree;
}
function emit(node, out) {
  if (node.num !== undefined) { out.push(`i64.const ${node.num}`); return; }
  emit(node.left, out); emit(node.right, out); out.push(OPS[node.op]);
}
/** Compile the model's expression to a self-contained WAT module (no imports, one export). */
function compile(expression) {
  const body = []; emit(parse(tokenize(expression)), body);
  return `(module (func (export "calculate") (param i64 i64) (result i64)\n  ${body.join('\n  ')}))`;
}
async function runGenerated(expression, { run = runWasmCalculation } = {}) {
  let wat;
  try { wat = compile(expression); }
  catch (error) { return { ok: false, stage: 'compile', expression, error: { code: error.code || 'GENERATED_CODE_REJECTED', message: error.message } }; }
  const codeHash = createHash('sha256').update(wat).digest('hex');
  const calculation = await run({ wat, inputs: [0, 0] });
  return { ok: calculation.ok, stage: 'sandbox', expression, wat, codeHash, result: calculation.result, error: calculation.error, metrics: calculation.metrics };
}
module.exports = { compile, runGenerated, tokenize, parse, MAX_CHARS };
