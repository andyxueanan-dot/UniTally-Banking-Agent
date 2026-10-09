import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.unitally.bankingdemo',
  appName: 'Orbit 演示银行',
  webDir: 'dist-mobile',
  server: { hostname: 'localhost', androidScheme: 'https', cleartext: false },
  android: { allowMixedContent: false },
  plugins: { Keyboard: { resizeOnFullScreen: true } },
};
export default config;
