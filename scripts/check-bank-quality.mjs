import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const repo = path.resolve(import.meta.dirname, '..');
const run = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const output = path.resolve(repo, '..', 'evidence', 'T003', 'checks', run);
fs.mkdirSync(output, { recursive: true });
const backendTests = fs.readdirSync(path.join(repo, 'backend/test')).filter(f => f.endsWith('.test.js')).map(f => `test/${f}`);
const commands = [
  ['backend-tests', ['--test', ...backendTests], path.join(repo, 'backend')],
  ['bank-types', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.bank.json'], repo],
  ['bank-lint', ['node_modules/eslint/bin/eslint.js', 'src/pages/BankAgent.tsx', 'src/pages/bank', 'src/lib/bankApi.ts'], repo],
  ['frontend-tests', ['node_modules/vitest/vitest.mjs', 'run'], repo],
];
if (process.argv.includes('--build')) commands.push(['production-build', ['node_modules/vite/bin/vite.js', 'build'], repo]);
const results = [];
for (const [name, args, cwd] of commands) {
  const start = performance.now(); const r = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 120000, windowsHide: true });
  const logPath = path.join(output, `${name}.log`); fs.writeFileSync(logPath, `${r.stdout || ''}\n${r.stderr || ''}`);
  const result = { name, exitCode: r.status, elapsedMs: Math.round(performance.now() - start), logPath, error: r.error?.message || null };
  results.push(result); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ run, results }, null, 2)); console.log(JSON.stringify(result));
}
if (results.some(r => r.exitCode !== 0)) process.exitCode = 1;
