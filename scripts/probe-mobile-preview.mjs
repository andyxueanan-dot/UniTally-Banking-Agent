try {
  const response = await fetch('http://127.0.0.1:8091/', { signal: AbortSignal.timeout(1500) });
  const html = await response.text();
  if (!response.ok || !html.includes('UniTally') || !html.includes('手机银行助手')) process.exitCode = 1;
} catch { process.exitCode = 1; }
