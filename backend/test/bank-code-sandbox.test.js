const { test } = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { runWasmCalculation, createCodeSandbox, LIMITS } = require('../bank/code-sandbox');
const ADD = '(module (func (export "calculate") (param i64 i64) (result i64) local.get 0 local.get 1 i64.add))';

test('single timed sample executes an import-free integer calculation in the actual Wasmtime worker', async t => {
  const started = performance.now(); const result = await runWasmCalculation({ wat: ADD, inputs: [100, 25] });
  t.diagnostic(JSON.stringify({ elapsedMs: Math.round(performance.now() - started), result }));
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.result, '125');
  assert.equal(result.metrics.runtimeVersion, '49.0.0'); assert.equal(result.metrics.importsAllowed, 0);
  assert.equal(result.metrics.trustedForLedger, false); assert.ok(result.metrics.fuelConsumed > 0);
});

test('infinite loop stops on deterministic fuel exhaustion', async () => {
  const wat = '(module (func (export "calculate") (param i64 i64) (result i64) (loop $forever br $forever) i64.const 0))';
  const result = await runWasmCalculation({ wat, inputs: [0, 0] });
  assert.equal(result.ok, false); assert.equal(result.error.code, 'FUEL_EXHAUSTED'); assert.equal(result.metrics.fuelConsumed, LIMITS.fuel);
});
test('all file, network, environment, WASI and imported-memory capabilities are rejected before instantiation', async () => {
  const imports = [
    '(import "wasi_snapshot_preview1" "path_open" (func))',
    '(import "wasi_snapshot_preview1" "fd_write" (func))',
    '(import "wasi_snapshot_preview1" "environ_get" (func))',
    '(import "wasi:sockets/tcp" "create-tcp-socket" (func))',
    '(import "env" "fetch" (func))',
    '(import "env" "memory" (memory 1))',
  ];
  for (const imported of imports) {
    const wat = `(module ${imported} (func (export "calculate") (param i64 i64) (result i64) i64.const 0))`;
    const result = await runWasmCalculation({ wat, inputs: [0, 0] });
    assert.equal(result.error.code, 'IMPORTS_FORBIDDEN', JSON.stringify(result));
  }
});
test('memory growth fails at the configured two-page bound without host allocation privileges', async () => {
  const wat = '(module (memory 1) (func (export "calculate") (param i64 i64) (result i64) i32.const 2 memory.grow i64.extend_i32_s))';
  const result = await runWasmCalculation({ wat, inputs: [0, 0] });
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.result, '-1'); assert.equal(result.metrics.memoryLimitBytes, 131072);
});
test('oversized initial memory and tables fail instead of allocating requested resources', async () => {
  for (const resource of ['(memory 3)', '(table 65 funcref)', '(table 1 funcref) (table 1 funcref)']) {
    const wat = `(module ${resource} (func (export "calculate") (param i64 i64) (result i64) i64.const 0))`;
    const result = await runWasmCalculation({ wat, inputs: [0, 0] });
    assert.equal(result.ok, false); assert.ok(['RESOURCE_LIMIT', 'INVALID_WAT'].includes(result.error.code), JSON.stringify(result));
  }
});
test('the module has exactly the required calculate signature and no extra exports', async () => {
  for (const wat of ['(module)', '(module (func (export "calculate") (param i32 i64) (result i64) i64.const 0))',
    '(module (func (export "calculate") (param i64 i64) (result f64) f64.const 1))',
    '(module (memory (export "memory") 1) (func (export "calculate") (param i64 i64) (result i64) i64.const 0))']) {
    const result = await runWasmCalculation({ wat, inputs: [0, 0] }); assert.equal(result.error.code, 'INVALID_SIGNATURE');
  }
});
test('invalid WAT, division by zero, and recursive stack traps stay inside worker', async () => {
  const invalid = await runWasmCalculation({ wat: '__import__("os").system("not executed")', inputs: [0, 0] }); assert.equal(invalid.error.code, 'INVALID_WAT');
  const zero = await runWasmCalculation({ wat: '(module (func (export "calculate") (param i64 i64) (result i64) local.get 0 local.get 1 i64.div_s))', inputs: [100, 0] });
  assert.equal(zero.error.code, 'EXECUTION_TRAP');
  const recursive = await runWasmCalculation({ wat: '(module (func $f (export "calculate") (param i64 i64) (result i64) local.get 0 local.get 1 call $f))', inputs: [0, 0] });
  assert.ok(['EXECUTION_TRAP', 'FUEL_EXHAUSTED'].includes(recursive.error.code));
});
test('start-function loops are fuel-limited before exported calculation can run', async () => {
  const wat = '(module (func $start (loop $spin br $spin)) (start $start) (func (export "calculate") (param i64 i64) (result i64) i64.const 42))';
  const result = await runWasmCalculation({ wat, inputs: [0, 0] }); assert.equal(result.error.code, 'FUEL_EXHAUSTED');
});
test('i64 endpoints round-trip exactly as strings, with explicit Wasm overflow semantics', async () => {
  for (const value of ['9223372036854775807', '-9223372036854775808', '-100']) {
    const result = await runWasmCalculation({ wat: ADD, inputs: [value, 0] }); assert.equal(result.result, value);
  }
  const overflow = await runWasmCalculation({ wat: ADD, inputs: ['9223372036854775807', 1] });
  assert.equal(overflow.result, '-9223372036854775808'); assert.equal(overflow.metrics.arithmetic, 'signed-i64-wrapping'); assert.equal(overflow.metrics.trustedForLedger, false);
});
test('invalid or oversized requests are refused without spawning a worker', async () => {
  let spawned = 0; const run = createCodeSandbox({ spawnImpl: () => { spawned++; throw Error('must not spawn'); } });
  for (const inputs of [[1], [1, 2, 3], [null, 0], [true, 0], [1.1, 0], [Number.MAX_SAFE_INTEGER + 1, 0], ['01', 0], ['1e2', 0], ['-0', 0], ['9223372036854775808', 0], ['-9223372036854775809', 0]]) {
    assert.equal((await run({ wat: ADD, inputs })).ok, false);
  }
  assert.equal((await run({ wat: 'x'.repeat(8193), inputs: [0, 0] })).error.code, 'INPUT_TOO_LARGE');
  assert.equal((await run({ wat: '界'.repeat(3000), inputs: [0, 0] })).error.code, 'INPUT_TOO_LARGE');
  assert.equal((await run({ wat: ADD, inputs: [0, 0], command: 'powershell' })).error.code, 'INVALID_REQUEST');
  assert.equal(spawned, 0);
});
test('worker unavailable and actual child deadline return explicit non-success errors', async () => {
  const missing = createCodeSandbox({ pythonExecutable: path.resolve(__dirname, 'fixture-not-existing-python.exe') });
  assert.equal((await missing({ wat: ADD, inputs: [0, 0] })).error.code, 'RUNTIME_UNAVAILABLE');
  const deadline = createCodeSandbox({ timeoutMs: 1 }); const result = await deadline({ wat: ADD, inputs: [0, 0] });
  assert.equal(result.error.code, 'SANDBOX_TIMEOUT'); assert.equal(result.result, null);
});
test('deadline closes an already-started worker blocked on IPC, not just a pre-start process', async () => {
  let child;
  const run = createCodeSandbox({ timeoutMs: 500, spawnImpl: (...args) => {
    child = spawn(...args);
    // Test-only transport fault: withhold EOF so fixed worker blocks reading JSON.
    child.stdin.end = () => child.stdin;
    return child;
  } });
  const result = await run({ wat: ADD, inputs: [0, 0] });
  assert.equal(result.error.code, 'SANDBOX_TIMEOUT'); assert.ok(result.metrics.elapsedMs < 3000);
  assert.ok(child.pid); assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
});
function fakeChild() {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { setImmediate(() => child.emit('close', null)); return true; };
  return child;
}
test('concurrency is bounded and slots are released only after worker completion', async () => {
  const children = []; const run = createCodeSandbox({ maxConcurrent: 1, spawnImpl: () => { const child = fakeChild(); children.push(child); return child; } });
  const first = run({ wat: ADD, inputs: [0, 0] }); assert.equal((await run({ wat: ADD, inputs: [0, 0] })).error.code, 'SANDBOX_BUSY');
  children[0].stdout.write(JSON.stringify({ ok: true, result: '0', metrics: {} })); children[0].emit('close', 0); assert.equal((await first).ok, true);
  const next = run({ wat: ADD, inputs: [0, 0] }); children[1].emit('close', 1); assert.equal((await next).error.code, 'WORKER_INTERNAL_ERROR');
});
test('child environment is an explicit OS-minimal allowlist and shell execution is disabled', async () => {
  let observed; const child = fakeChild(); const run = createCodeSandbox({ spawnImpl: (exe, args, options) => { observed = { exe, args, options }; return child; } });
  const executing = run({ wat: ADD, inputs: [0, 0] });
  assert.equal(observed.options.shell, false); assert.equal(observed.options.windowsHide, true); assert.deepEqual(observed.args.slice(0, 2), ['-I', '-B']);
  assert.ok(Object.keys(observed.options.env).every(key => ['SystemRoot', 'SYSTEMROOT', 'WINDIR'].includes(key)));
  assert.equal(Object.hasOwn(observed.options.env, 'DEEPSEEK_API_KEY'), false); assert.equal(Object.hasOwn(observed.options.env, 'PATH'), false);
  child.emit('close', 1); await executing;
});
test('oversized stdout or stderr stops child, with no raw output or error leakage', async () => {
  for (const stream of ['stdout', 'stderr']) {
    const child = fakeChild(); const run = createCodeSandbox({ spawnImpl: () => child }); const executing = run({ wat: ADD, inputs: [0, 0] });
    child[stream].write(Buffer.alloc(LIMITS.outputBytes + 1, 'S')); const result = await executing;
    assert.equal(result.error.code, 'OUTPUT_LIMIT'); assert.ok(!JSON.stringify(result).includes('SSSSSS'));
  }
});
test('unknown worker errors, output schema or untrusted metrics cannot expose local details', async () => {
  for (const reply of ['not json /private/path', JSON.stringify({ ok: false, error: '/private/key' }), JSON.stringify({ ok: true, result: '/private/key' })]) {
    const child = fakeChild(); const run = createCodeSandbox({ spawnImpl: () => child }); const executing = run({ wat: ADD, inputs: [0, 0] });
    child.stdout.write(reply); child.emit('close', 0); const result = await executing;
    assert.equal(result.error.code, 'SANDBOX_PROTOCOL_ERROR'); assert.ok(!JSON.stringify(result).includes('/private'));
  }
  const child = fakeChild(); const run = createCodeSandbox({ spawnImpl: () => child }); const executing = run({ wat: ADD, inputs: [0, 0] });
  child.stdout.write(JSON.stringify({ ok: true, result: '0', metrics: { environment: '/private/key', memoryLimitBytes: Infinity, runtimeVersion: 'spoofed', fuelConsumed: -1 } }));
  child.emit('close', 0); const result = await executing; assert.equal(result.metrics.runtimeVersion, null); assert.equal(result.metrics.fuelConsumed, null); assert.ok(!JSON.stringify(result).includes('/private'));
});
