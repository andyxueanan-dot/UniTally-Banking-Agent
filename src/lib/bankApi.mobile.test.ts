import { test, expect, vi, afterEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { bankRequest } from './bankApi';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
test('an unconfigured mobile shell never dispatches requests or credentials', async () => {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true); vi.stubEnv('VITE_BANK_API_ORIGIN', '');
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(bankRequest('/state', 'fictional-session')).rejects.toMatchObject({ code: 'CONNECTION_NOT_CONFIGURED' });
  expect(fetcher).not.toHaveBeenCalled();
});
test('configured mobile request refuses redirects and targets only its approved server', async () => {
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true); vi.stubEnv('VITE_BANK_API_ORIGIN', 'https://test.example');
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }); vi.stubGlobal('fetch', fetcher);
  await bankRequest('/tasks/test/confirm', 'fictional-session', { confirmed: true });
  expect(fetcher).toHaveBeenCalledWith('https://test.example/api/bank/tasks/test/confirm', expect.objectContaining({ redirect: 'error', method: 'POST' }));
});
