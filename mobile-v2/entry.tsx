import { createRoot } from 'react-dom/client';
import '../src/bank-base.css';
import BankAgent from '../src/pages/BankAgentV3';
import { setupMobileRuntime } from '../src/mobile/runtime';

// V3 (bank flavour) preview on top of V2; production mobile/entry.tsx still renders V2. Same backend, same business logic; only the presentation layer differs.
// bank-base.css is imported first so the V2 stylesheet wins the cascade.
// The original mobile entry (mobile/entry.tsx) is untouched.
void setupMobileRuntime();
createRoot(document.getElementById('root')!).render(<BankAgent mobile />);
