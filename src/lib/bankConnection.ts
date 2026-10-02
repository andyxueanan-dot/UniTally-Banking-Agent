import { Capacitor } from '@capacitor/core';

export function validateBankOrigin(value: string): string {
  if (!value.trim()) throw new Error('手机安装版尚未配置测试服务地址，请联系技术队友配置 HTTPS 银行后台；手机上的 localhost 不是电脑。');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('银行测试服务地址格式无效。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(url.hostname)) {
    throw new Error('手机安装版只接受明确的 HTTPS 服务来源，不接受密码、路径、查询参数或本机回环地址。');
  }
  return url.origin;
}
export function connectionDetails(native = Capacitor.isNativePlatform(), configured = import.meta.env.VITE_BANK_API_ORIGIN || '') {
  if (!native) return { native: false, apiBase: '/api/bank', origin: window.location.origin, ready: true, message: '浏览器使用同来源后台；当前仅为模拟资金。' };
  try {
    const origin = validateBankOrigin(configured);
    return { native: true, apiBase: `${origin}/api/bank`, origin, ready: true, message: '已配置测试服务地址；仍需服务器授权该手机来源，设备验证另需真机适配。' };
  } catch (error) {
    return { native: true, apiBase: '', origin: '', ready: false, message: error instanceof Error ? error.message : '连接未配置。' };
  }
}
export function bankApiUrl(route: string): string {
  if (!/^\/[a-z0-9/_-]*(?:\?[a-z0-9_=&%-]*)?$/i.test(route) || route.includes('//') || route.includes('..')) throw new Error('银行接口路径不合法。');
  const connection = connectionDetails();
  if (!connection.ready) throw new Error(connection.message);
  return connection.apiBase + route;
}
const WEB_TOKEN_KEY = 'unitally.bank.demo.session.v1';
export function bankSessionStorage() {
  const connection = connectionDetails();
  // Native prototype keeps only a per-WebView session token, never an API key.
  // Persisting authenticated credentials requires a future audited secure-storage plugin.
  return connection.native
    ? { storage: sessionStorage, key: `unitally.bank.native.session.v1:${connection.origin || 'unconfigured'}` }
    : { storage: localStorage, key: WEB_TOKEN_KEY };
}
