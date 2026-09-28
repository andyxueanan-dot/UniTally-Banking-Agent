# T001 cross-border tuition sandbox

> 历史学费沙箱资料，不是当前银行原型入口。请看 [新版首页](../../README.md)。下方命令以仓库根目录为工作目录。

This is a local, fictional-money competition demo built on UniTally. It demonstrates auditable payment planning, explicit confirmation, idempotent submission, receipt reconciliation, persistence and session isolation. It does not connect to a bank, move real money, or claim a validated user need.

## Start locally

Prerequisite: Node.js 18 or newer.

Install frontend dependencies from the repository root:

```powershell
npm ci
```

Install backend dependencies:

```powershell
npm --prefix backend ci
```

Start the backend in terminal 1:

```powershell
npm --prefix backend start
```

Start the frontend in terminal 2:

```powershell
npm run dev
```

Open [http://127.0.0.1:8080/tuition-sandbox](http://127.0.0.1:8080/tuition-sandbox). The login page also links to the sandbox. Both services are intentionally bound to the local machine.

Stop each foreground service with `Ctrl+C` in its own terminal.

## Fixed demonstration case

- Student balances: 10,000 CNY and 2,000 MYR.
- Tuition: 5,000 MYR.
- Protected living reserve: 1,000 MYR.
- Deterministic fictional quote: 1 CNY = 0.5 MYR.
- Fee: 10 CNY, debited separately.
- Expected result: convert 8,000 CNY to cover the 4,000 MYR gap; debit 8,010 CNY in total; finish with 1,990 CNY and 1,000 MYR; credit the fictional school with 5,000 MYR.

The page also exposes insufficient-funds, missing-quote and processor-timeout presets. A missing quote never falls back to a 1:1 rate. A timeout remains `PENDING_RECONCILIATION` and does not create a success receipt.

## Verification

Frontend and wallet-transfer regression tests:

```powershell
npm test
```

Backend financial-state tests:

```powershell
npm --prefix backend test
```

Production build and lint:

```powershell
npm run build
```

```powershell
npm run lint
```

Live HTTP acceptance while the services are running:

```powershell
node backend/scripts/run-t001-api-acceptance.js http://127.0.0.1:5000 ..\evidence\T001\api-acceptance.json
```

Real Chrome flow and screenshot:

```powershell
node scripts/run-t001-browser-check.mjs http://127.0.0.1:8080/tuition-sandbox ..\evidence\T001\tuition-success.png ..\evidence\T001\browser-acceptance.json
```

Isolated process-restart recovery:

```powershell
node backend/scripts/run-t001-restart-acceptance.js ..\evidence\T001\restart-acceptance.json
```

## AI status and product boundary

No authorized model provider or external budget was configured for T001. `/api/tuition/ai/status` therefore reports `connected: false`, and the natural-language entry refuses to fabricate a model response. The structured tool contract is present for later integration.

T001 validates an engineering mechanism, not the value of the tuition scenario. Ordinary card-network currency conversion and calculator-style balance planning may already cover much of this user journey. User research and comparison against existing payment methods are required before presenting tuition planning as a meaningful AI advantage.
