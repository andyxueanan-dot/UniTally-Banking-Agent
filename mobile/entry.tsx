import { createRoot } from 'react-dom/client';
import BankAgent from '../src/pages/BankAgent';
import '../src/bank-base.css';
import '../src/mobile/mobile.css';
import { setupMobileRuntime } from '../src/mobile/runtime';

void setupMobileRuntime();
createRoot(document.getElementById('root')!).render(<BankAgent mobile />);
