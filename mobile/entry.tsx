import { createRoot } from 'react-dom/client';
import '../src/bank-base.css';
import BankAgent from '../src/pages/BankAgentV3';
import { setupMobileRuntime } from '../src/mobile/runtime';

// 2026-10-07: the mobile entry renders V3 (V2 + bank flavour, see docs/development/UI_V2_PREVIEW.md).
// 2026-10-06: the mobile entry now renders the V2 interface (white paper, hairlines, no tinted
// panels), tuned against design/reference-library. bank-base.css is imported first so the V2
// stylesheet wins the cascade; the legacy mobile.css is no longer loaded here.
void setupMobileRuntime();
createRoot(document.getElementById('root')!).render(<BankAgent mobile />);
