import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";

// Keep the standalone banking sandbox independent from legacy login/Firebase providers.
const App = lazy(async () => {
  if (window.location.pathname.replace(/\/+$/, '') === '/mobile') {
    await import('./bank-base.css');
    await import('./mobile/mobile.css');
    const { setupMobileRuntime } = await import('./mobile/runtime');
    void setupMobileRuntime();
    const { default: BankAgent } = await import('./pages/BankAgent');
    return { default: () => <BankAgent mobile /> };
  }
  if (window.location.pathname.replace(/\/+$/, '') === '/bank-agent') {
    await import('./bank-base.css');
    return import('./pages/BankAgent');
  }
  await import('./index.css');
  return import('./App');
});
createRoot(document.getElementById("root")!).render(<Suspense fallback={<div style={{ padding: 40 }}>正在加载工作台…</div>}><App /></Suspense>);
