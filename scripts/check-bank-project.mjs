import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const repo = path.resolve(import.meta.dirname, '..');
const output = path.resolve(repo, '..', 'evidence', 'T002');
fs.mkdirSync(output, { recursive: true });
const commands = [
  ['backend-tests', process.execPath, ['--test', 'test/bank.test.js', 'test/tuition.test.js'], path.join(repo, 'backend')],
  ['frontend-tests', process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], repo],
  ['bank-types', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.bank.json'], repo],
  ['bank-lint', process.execPath, ['node_modules/eslint/bin/eslint.js', 'src/pages/BankAgent.tsx', 'src/lib/bankApi.ts', 'src/main.tsx'], repo],
  ['full-types-existing-limitations', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.app.json'], repo],
  ['production-build', process.execPath, ['node_modules/vite/bin/vite.js', 'build'], repo],
];
const results = [];
for (const [name, command, args, cwd] of commands) {
  const start = performance.now(); const r = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 120000, windowsHide: true });
  const log = `${r.stdout || ''}\n${r.stderr || ''}`;
  fs.writeFileSync(path.join(output, `${name}.log`), log);
  const result = { name, command: [command, ...args], exitCode: r.status, elapsedMs: Math.round(performance.now() - start), log: path.join(output, `${name}.log`) };
  results.push(result); console.log(JSON.stringify(result));
}
fs.writeFileSync(path.join(output, 'project-validation.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
if (results.some(r => r.exitCode !== 0 && r.name !== 'full-types-existing-limitations')) process.exitCode = 1;
