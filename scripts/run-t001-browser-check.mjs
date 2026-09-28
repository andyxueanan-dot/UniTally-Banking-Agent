import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://127.0.0.1:8080/tuition-sandbox';
const screenshotPath = path.resolve(process.argv[3] || 't001-success.png');
const resultPath = path.resolve(process.argv[4] || 't001-browser.json');
const executablePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const consoleErrors = [];
const pageErrors = [];
const startedAt = new Date().toISOString();
const browser = await chromium.launch({ executablePath, headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Apply balances & clear this session' }).click();
  await page.getByText('Sandbox balances applied and prior session orders cleared.').waitFor();
  await page.getByRole('button', { name: 'Get auditable quote' }).click();
  await page.getByText('All checks passed').waitFor();
  await page.getByRole('button', { name: 'Confirm recipient, amount & quote' }).click();
  await page.getByRole('button', { name: 'Confirmation locked' }).waitFor();
  await page.getByRole('button', { name: 'Pay tuition in sandbox' }).click();
  await page.getByText('Payment reconciled', { exact: true }).first().waitFor();
  await page.getByText(/1,990\.00/, { exact: true }).first().waitFor();
  await page.getByText(/1,000\.00/, { exact: true }).first().waitFor();
  await page.getByText(/5,000\.00/, { exact: true }).first().waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Payment reconciled', { exact: true }).first().waitFor();
  await page.getByText('Receipt & ledger proof', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ask assistant' }).click();
  await page.getByText('No answer generated. AI is not configured; the app did not fake one.').waitFor();

  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const bodyText = await page.locator('body').innerText();
  const unexpectedConsoleErrors = consoleErrors.filter((message) => !message.includes('status of 503'));
  const result = {
    taskId: 'T001',
    kind: 'real-browser-flow',
    url,
    startedAt,
    completedAt: new Date().toISOString(),
    passed: unexpectedConsoleErrors.length === 0 && pageErrors.length === 0,
    assertions: {
      paymentReconciled: bodyText.includes('Payment reconciled'),
      finalCny1990: bodyText.includes('CNY 1,990.00') || bodyText.includes('CN¥1,990.00'),
      finalMyr1000: bodyText.includes('RM 1,000.00') || bodyText.includes('RM 1,000.00'),
      recipientMyr5000: bodyText.includes('RM 5,000.00') || bodyText.includes('RM 5,000.00'),
      refreshRecoveredReceipt: bodyText.includes('Receipt & ledger proof'),
      aiTruthfullyUnavailable: bodyText.includes('No answer generated. AI is not configured; the app did not fake one.'),
      sandboxDisclosure: bodyText.includes('SANDBOX · NO REAL MONEY'),
    },
    consoleErrors,
    unexpectedConsoleErrors,
    pageErrors,
    screenshotPath,
    pageTitle: await page.title(),
  };
  result.passed = result.passed && Object.values(result.assertions).every(Boolean);
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
} finally {
  await browser.close();
}
