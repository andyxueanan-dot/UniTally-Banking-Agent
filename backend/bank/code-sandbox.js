const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');

const LIMITS = Object.freeze({ watBytes: 8192, outputBytes: 16384, fuel: 50000, memoryBytes: 131072, tableElements: 64, instances: 1, tables: 1, memories: 1, deadlineMs: 2500, concurrent: 2 });
const MIN_I64 = -(1n << 63n); const MAX_I64 = (1n << 63n) - 1n;
const ERRORS = Object.freeze({
  INVALID_REQUEST: '只接受 WAT 文本和两个整数，不接受脚本、命令或其他参数。',
  INPUT_TOO_LARGE: '计算代码超过 8 KiB 上限。',
  INVALID_INTEGER: '输入必须是安全整数或规范十进制整数字符串。',
  INTEGER_OUT_OF_RANGE: '输入超出有符号 64 位整数范围。',
  IMPORTS_FORBIDDEN: '禁止所有外部导入，不能访问文件、网络、WASI 或宿主函数。',
  INVALID_WAT: 'WAT 代码无效或使用了不受支持的能力。',
  INVALID_SIGNATURE: '模块只能导出 calculate(i64, i64) -> i64。',
  RESOURCE_LIMIT: '模块实例、内存或表资源超过限制。',
  FUEL_EXHAUSTED: '计算耗尽指令预算，已停止。',
  EXECUTION_TRAP: '计算触发运行时陷阱，未返回结果。',
  RUNTIME_UNAVAILABLE: '本机隔离计算运行时尚未安装或不可用。',
  WORKER_INTERNAL_ERROR: '受限计算进程异常，未采用任何结果。',
  OUTPUT_LIMIT: '计算进程输出超过上限，已停止。',
  SANDBOX_PROTOCOL_ERROR: '计算进程未返回有效的受控结果。',
  SANDBOX_TIMEOUT: '计算超过进程时限，已终止本次子进程。',
  SANDBOX_BUSY: '本机受限计算已达到并发上限，请稍后重试。',
});
function normalizeInput(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw 'INVALID_INTEGER';
    value = String(value);
  }
  if (typeof value !== 'string' || value.length > 20 || !/^-?(?:0|[1-9]\d*)$/.test(value) || value === '-0') throw 'INVALID_INTEGER';
  const integer = BigInt(value);
  if (integer < MIN_I64 || integer > MAX_I64) throw 'INTEGER_OUT_OF_RANGE';
  return integer.toString();
}
function childEnvironment() {
  const allowed = {};
  for (const key of ['SystemRoot', 'SYSTEMROOT', 'WINDIR']) if (process.env[key]) allowed[key] = process.env[key];
  return allowed;
}
function createCodeSandbox({ spawnImpl = spawn, pythonExecutable = path.resolve(__dirname, '../../.venv-sandbox', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
  timeoutMs = LIMITS.deadlineMs, maxConcurrent = LIMITS.concurrent } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3000 || !Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 2) throw new TypeError('Invalid bounded sandbox configuration');
  let active = 0;
  const worker = path.join(__dirname, 'wasm_worker.py');
  return async function runWasmCalculation(request) {
    const started = performance.now(); let codeHash = null; let inputs;
    const metrics = extra => ({ runtime: 'wasmtime', runtimeVersion: extra?.runtimeVersion === '49.0.0' ? extra.runtimeVersion : null,
      codeHash, elapsedMs: Math.round((performance.now() - started) * 1000) / 1000, fuelLimit: LIMITS.fuel,
      fuelConsumed: Number.isInteger(extra?.fuelConsumed) && extra.fuelConsumed >= 0 && extra.fuelConsumed <= LIMITS.fuel ? extra.fuelConsumed : null,
      memoryLimitBytes: LIMITS.memoryBytes, tableElementLimit: LIMITS.tableElements, instances: 1, importsAllowed: 0,
      deadlineMs: timeoutMs, arithmetic: 'signed-i64-wrapping', trustedForLedger: false });
    const failure = (code, extra) => ({ ok: false, result: null, error: { code, message: ERRORS[code] }, metrics: metrics(extra) });
    if (!request || typeof request !== 'object' || Array.isArray(request) || Object.keys(request).some(key => !['wat', 'inputs'].includes(key)) ||
        typeof request.wat !== 'string' || !request.wat.trim() || !Array.isArray(request.inputs) || request.inputs.length !== 2) return failure('INVALID_REQUEST');
    if (Buffer.byteLength(request.wat, 'utf8') > LIMITS.watBytes) return failure('INPUT_TOO_LARGE');
    codeHash = createHash('sha256').update(request.wat).digest('hex');
    try { inputs = request.inputs.map(normalizeInput); } catch (code) { return failure(ERRORS[code] ? code : 'INVALID_INTEGER'); }
    if (active >= maxConcurrent) return failure('SANDBOX_BUSY');
    active += 1;
    return new Promise(resolve => {
      let child; let completed = false; let timer; let forcedError; let outputBytes = 0; const output = [];
      const finish = value => { if (completed) return; completed = true; clearTimeout(timer); active -= 1; resolve(value); };
      const terminate = code => {
        if (completed || forcedError) return; forcedError = code;
        try { child.kill('SIGKILL'); } catch { /* Still wait for close; never free a live-process slot early. */ }
      };
      try {
        child = spawnImpl(pythonExecutable, ['-I', '-B', worker], { shell: false, windowsHide: true, env: childEnvironment(), cwd: path.dirname(worker), stdio: ['pipe', 'pipe', 'pipe'] });
      } catch { finish(failure('RUNTIME_UNAVAILABLE')); return; }
      timer = setTimeout(() => terminate('SANDBOX_TIMEOUT'), timeoutMs);
      child.once('error', () => { if (!child.pid) finish(failure('RUNTIME_UNAVAILABLE')); else terminate('WORKER_INTERNAL_ERROR'); });
      child.stdout.on('data', chunk => {
        outputBytes += chunk.length;
        if (outputBytes > LIMITS.outputBytes) { terminate('OUTPUT_LIMIT'); return; }
        output.push(chunk);
      });
      child.stderr.on('data', chunk => { outputBytes += chunk.length; if (outputBytes > LIMITS.outputBytes) terminate('OUTPUT_LIMIT'); });
      child.once('close', code => {
        if (forcedError) { finish(failure(forcedError)); return; }
        if (code !== 0) { finish(failure('WORKER_INTERNAL_ERROR')); return; }
        let result;
        try { result = JSON.parse(Buffer.concat(output).toString('utf8')); }
        catch { finish(failure('SANDBOX_PROTOCOL_ERROR')); return; }
        if (!result || typeof result.ok !== 'boolean') { finish(failure('SANDBOX_PROTOCOL_ERROR')); return; }
        if (!result.ok) { finish(failure(ERRORS[result.error] ? result.error : 'SANDBOX_PROTOCOL_ERROR', result.metrics)); return; }
        try {
          const integer = normalizeInput(result.result);
          finish({ ok: true, result: integer, metrics: metrics(result.metrics) });
        } catch { finish(failure('SANDBOX_PROTOCOL_ERROR')); }
      });
      child.stdin.on('error', () => { /* Exit/error handler owns completion; no child error text is exposed. */ });
      try { child.stdin.end(JSON.stringify({ wat: request.wat, inputs })); }
      catch { terminate('SANDBOX_PROTOCOL_ERROR'); }
    });
  };
}
const runWasmCalculation = createCodeSandbox();
module.exports = { runWasmCalculation, createCodeSandbox, LIMITS };
