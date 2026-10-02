import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.unitally.bankingdemo',
  appName: 'UniTally 银行演示',
  webDir: 'dist-mobile',
  server: { hostname: 'localhost', androidScheme: 'https', cleartext: false },
  android: { allowMixedContent: false },
  plugins: { Keyboard: { resizeOnFullScreen: true } },
};
export default config;
