import { describe, test, expect, vi, afterEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { validateBankOrigin, connectionDetails, bankApiUrl, bankSessionStorage } from './bankConnection';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); localStorage.clear(); sessionStorage.clear(); });
describe('mobile bank connection isolation', () => {
  test('web stays same-origin and preserves existing token namespace', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    expect(bankApiUrl('/state')).toBe('/api/bank/state');
    expect(bankSessionStorage().storage).toBe(localStorage);
    expect(bankSessionStorage().key).toBe('unitally.bank.demo.session.v1');
  });
  test('native without explicit HTTPS service fails closed', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true); vi.stubEnv('VITE_BANK_API_ORIGIN', '');
    expect(connectionDetails().ready).toBe(false); expect(() => bankApiUrl('/state')).toThrow(/HTTPS/);
  });
  test('native permits only a public HTTPS origin without private credentials or routing suffix', () => {
    for (const value of ['', 'http://bank.example', 'https://localhost', 'https://127.0.0.1', 'https://bank.example/api', 'https://name:password@bank.example', 'https://bank.example?key=x', 'https://bank.example#secret']) expect(() => validateBankOrigin(value)).toThrow();
    expect(validateBankOrigin('https://demo.bank.example/')).toBe('https://demo.bank.example');
  });
  test('native session tokens are temporary and isolated per backend', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.stubEnv('VITE_BANK_API_ORIGIN', 'https://first.example'); const a = bankSessionStorage(); a.storage.setItem(a.key, 'fake-session-token');
    vi.stubEnv('VITE_BANK_API_ORIGIN', 'https://second.example'); const b = bankSessionStorage();
    expect(a.storage).toBe(sessionStorage); expect(b.storage.getItem(b.key)).toBeNull(); expect(localStorage.length).toBe(0);
  });
  test('API suffix cannot exfiltrate authorization to another endpoint', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    for (const path of ['//evil.example', 'https://evil.example', '/../secret', '/%2f%2fevil.example', '/x\\evil']) expect(() => bankApiUrl(path)).toThrow();
  });
});
