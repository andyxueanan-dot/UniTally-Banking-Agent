import { Capacitor } from '@capacitor/core';

export async function setupMobileRuntime() {
  const viewport = window.visualViewport;
  const resize = () => {
    const height = viewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--bank-viewport-height', `${height}px`);
    document.documentElement.classList.toggle('bank-keyboard-open', window.innerHeight - height > 120);
  };
  resize(); viewport?.addEventListener('resize', resize);
  window.addEventListener('resize', resize);
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('backButton', () => {
      const unhandled = window.dispatchEvent(new Event('bank-mobile-back', { cancelable: true }));
      if (unhandled) void App.minimizeApp();
    });
    await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) window.dispatchEvent(new Event('bank-mobile-resume'));
    });
    const { Keyboard } = await import('@capacitor/keyboard');
    await Keyboard.addListener('keyboardWillShow', () => document.documentElement.classList.add('bank-keyboard-open'));
    await Keyboard.addListener('keyboardWillHide', () => { document.documentElement.classList.remove('bank-keyboard-open'); resize(); });
  } catch { /* Native capability unavailable: web controls remain available; no fake success. */ }
}
