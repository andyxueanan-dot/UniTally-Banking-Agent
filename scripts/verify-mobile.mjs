import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const output=path.resolve(root,'../evidence/T006-mobile/validation',new Date().toISOString().replaceAll(':','-').replaceAll('.','-'));
fs.mkdirSync(output,{recursive:true});
const jobs=[
  ['types',['node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.mobile.json']],
  ['lint',['node_modules/eslint/bin/eslint.js','src/pages/BankAgent.tsx','src/lib/bankApi.ts','src/lib/bankConnection.ts','src/lib/bankApi.mobile.test.ts','src/mobile','mobile/entry.tsx']],
  ['frontend-tests',['node_modules/vitest/vitest.mjs','run','src/lib/bankConnection.test.ts','src/lib/bankApi.mobile.test.ts','src/lib/walletBalance.test.ts','src/test/example.test.ts','--maxWorkers=1']],
  ['backend-regression',['--test','backend/test/bank.test.js','backend/test/bank-quality.test.js','backend/test/bank-integrated.test.js']],
  ['web-build',['node_modules/vite/bin/vite.js','build']],
  ['mobile-build',['node_modules/vite/bin/vite.js','build','--config','vite.mobile.config.ts','--mode','mobile']],
  ['android-sync',['node_modules/@capacitor/cli/bin/capacitor','sync','android']],
  ['environment',['scripts/mobile-doctor.mjs']],
  ['browser',['scripts/check-mobile-browser.mjs']],
];
const report={startedAt:new Date().toISOString(),results:[],scope:'Browser and generated Android project only; no APK or real device claim'};
for(const [name,args]of jobs){const start=performance.now();const r=spawnSync(process.execPath,args,{cwd:root,windowsHide:true,encoding:'utf8',timeout:180000});const log=path.join(output,`${name}.log`);fs.writeFileSync(log,(r.stdout||'')+'\n'+(r.stderr||''));const result={name,exitCode:r.status,elapsedMs:Math.round(performance.now()-start),log};report.results.push(result);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(result));if(r.status!==0 && !(name==='environment' && r.status===2)){process.exitCode=1;break;}}
report.sourceHashes=Object.fromEntries(['src/lib/bankApi.ts','src/lib/bankConnection.ts','src/pages/BankAgent.tsx','src/mobile/MobileTransferSheet.tsx','src/mobile/mobile.css','src/mobile/runtime.ts','capacitor.config.ts'].map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
report.completedAt=new Date().toISOString();report.passed=report.results.length===jobs.length&&!process.exitCode;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,passed:report.passed}));
